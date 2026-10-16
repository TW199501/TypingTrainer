// Starts a built sidecar the way the desktop shell does and checks the
// handshake: ELF_SIDECAR_PORT within 60 s, GET /api/health -> 200, and a clean
// exit once stdin is closed.
//   node scripts/smoke-sidecar.mjs [path-to-binary] [-- <command prefix...>]
// Anything after `--` is a command prefix (e.g. `arch -x86_64`) the binary is
// launched through. Without a path the host-triple binary is used.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// A handshake slower than the warning threshold is reported but passes; only
// the cap stops the run. It mirrors HANDSHAKE_CAP, the longest the shell's
// api_base_url waits for a live sidecar (src-tauri/src/sidecar.rs).
const HANDSHAKE_WARN_MS = 10_000
const HANDSHAKE_CAP_MS = 60_000
const EXIT_MS = 10_000
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const split = argv.indexOf('--')
const positional = split === -1 ? argv : argv.slice(0, split)
const prefix = split === -1 ? [] : argv.slice(split + 1)

function hostTriple() {
  const result = spawnSync('rustc', ['-vV'], { encoding: 'utf8' })
  const match = /^host:\s*(\S+)/m.exec(result.stdout ?? '')
  if (!match) throw new Error('could not determine the host triple (is rustc installed?)')
  return match[1]
}

function defaultBinary() {
  const triple = process.env.TAURI_ENV_TARGET_TRIPLE || hostTriple()
  const suffix = triple.includes('windows') ? '.exe' : ''
  return join(root, 'src-tauri', 'binaries', `typelab-api-${triple}${suffix}`)
}

const binary = resolve(positional[0] ?? defaultBinary())

let size = 0
try {
  size = statSync(binary).size
} catch {
  console.error(`smoke-sidecar: binary not found: ${binary}`)
  process.exit(1)
}

const dataDir = mkdtempSync(join(tmpdir(), 'typelab-smoke-'))
const workDir = mkdtempSync(join(tmpdir(), 'typelab-smoke-cwd-'))
let child
let finished = false

function finish(code, message) {
  if (finished) return
  finished = true
  if (message) (code === 0 ? console.log : console.error)(message)
  if (child && child.exitCode === null) child.kill('SIGKILL')
  try {
    rmSync(dataDir, { recursive: true, force: true })
    rmSync(workDir, { recursive: true, force: true })
  } catch {
    // The database may still be locked on Windows; the OS temp cleaner owns it.
  }
  // process.exit() while the child's pipes are still closing aborts Node 24.18
  // on the Windows runner ("Assertion failed: !(handle->flags &
  // UV_HANDLE_CLOSING)", src\win\async.c). Let the event loop drain instead;
  // the unref'd timer only fires if something is still holding it open.
  process.exitCode = code
  setTimeout(() => process.exit(code), 5_000).unref()
}

console.log(`smoke-sidecar: ${binary}`)
console.log(`smoke-sidecar: size ${(size / 1024 / 1024).toFixed(1)} MB`)

const [command, ...commandArgs] = prefix.length > 0 ? [...prefix, binary] : [binary]
const started = Date.now()
child = spawn(command, commandArgs, {
  env: { ...process.env, ELF_SIDECAR: '1', TYPELAB_DB_PATH: join(dataDir, 'typelab.db') },
  stdio: ['pipe', 'pipe', 'inherit'],
  // The shell sets no working directory, so the sidecar inherits the app's. Run
  // from a folder that is neither the binary's nor the repo's, so anything that
  // resolves against the working directory fails here too.
  cwd: workDir,
})
child.on('error', (error) => finish(1, `smoke-sidecar: could not start: ${error.message}`))

const handshakeTimer = setTimeout(
  () => finish(1, `smoke-sidecar: no ELF_SIDECAR_PORT within ${HANDSHAKE_CAP_MS / 1000} s`),
  HANDSHAKE_CAP_MS,
)

let buffered = ''
let handshook = false
child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  if (handshook) return
  buffered += chunk
  const lines = buffered.split(/\r?\n/)
  buffered = lines.pop() ?? ''
  for (const line of lines) {
    const error = /^ELF_SIDECAR_ERROR=(.*)$/.exec(line)
    if (error) {
      clearTimeout(handshakeTimer)
      return finish(1, `smoke-sidecar: sidecar reported an error: ${error[1]}`)
    }
    const port = /^ELF_SIDECAR_PORT=(\d+)$/.exec(line)
    if (port) {
      handshook = true
      clearTimeout(handshakeTimer)
      return check(Number(port[1]), Date.now() - started)
    }
  }
})

child.on('exit', (code) => {
  if (!handshook) {
    clearTimeout(handshakeTimer)
    finish(1, `smoke-sidecar: exited with ${code} before the handshake`)
  }
})

async function check(port, handshakeMs) {
  console.log(`smoke-sidecar: handshake on port ${port} after ${handshakeMs} ms`)
  if (handshakeMs > HANDSHAKE_WARN_MS) {
    console.log(
      `::warning::sidecar handshake took ${handshakeMs} ms (over ${HANDSHAKE_WARN_MS / 1000} s; the app gives up at ${HANDSHAKE_CAP_MS / 1000} s)`,
    )
  }
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      // The webview origin on macOS and Linux; Windows uses http://tauri.localhost.
      headers: { Origin: 'tauri://localhost' },
      signal: AbortSignal.timeout(5000),
    })
    console.log(`smoke-sidecar: /api/health -> ${response.status}`)
    if (response.status !== 200) return finish(1, 'smoke-sidecar: health check did not return 200')
    const allowed = response.headers.get('access-control-allow-origin')
    console.log(`smoke-sidecar: Access-Control-Allow-Origin -> ${allowed}`)
    if (allowed !== 'tauri://localhost') {
      return finish(1, 'smoke-sidecar: CORS does not allow tauri://localhost')
    }

    // https://tauri.localhost is in appsettings.json only, not in the in-code
    // fallback, so this passes only if the bundled config was actually loaded.
    const configOrigin = 'https://tauri.localhost'
    const configured = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: configOrigin },
      signal: AbortSignal.timeout(5000),
    })
    const configAllowed = configured.headers.get('access-control-allow-origin')
    console.log(`smoke-sidecar: Access-Control-Allow-Origin for ${configOrigin} -> ${configAllowed}`)
    if (configAllowed !== configOrigin) {
      return finish(1, 'smoke-sidecar: appsettings.json was not loaded (config-only origin not allowed)')
    }
  } catch (error) {
    return finish(1, `smoke-sidecar: health request failed: ${error.message}`)
  }

  const exitTimer = setTimeout(
    () => finish(1, `smoke-sidecar: still running ${EXIT_MS / 1000} s after stdin closed`),
    EXIT_MS,
  )
  child.removeAllListeners('exit')
  child.on('exit', (code, signal) => {
    clearTimeout(exitTimer)
    if (code === 0) finish(0, 'smoke-sidecar: exited cleanly after stdin closed')
    else finish(1, `smoke-sidecar: exit after stdin closed was code=${code} signal=${signal}`)
  })
  child.stdin.end()
}
