// Publishes server/TypeLab.Api as a self-contained single-file executable and
// places it where Tauri's bundle.externalBin expects it:
//   src-tauri/binaries/typelab-api-<target-triple>[.exe]
// The triple comes from TAURI_ENV_TARGET_TRIPLE, else the host triple of rustc.
// universal-apple-darwin publishes both macOS RIDs, merges them with lipo, and
// also keeps the per-arch files that Tauri's per-architecture passes look for.
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const project = join(root, 'server', 'TypeLab.Api', 'TypeLab.Api.csproj')
const outDir = join(root, 'src-tauri', 'binaries')

const RIDS = {
  'x86_64-pc-windows-msvc': 'win-x64',
  'x86_64-unknown-linux-gnu': 'linux-x64',
  'aarch64-apple-darwin': 'osx-arm64',
  'x86_64-apple-darwin': 'osx-x64',
}
const UNIVERSAL = 'universal-apple-darwin'
const UNIVERSAL_PARTS = ['aarch64-apple-darwin', 'x86_64-apple-darwin']

function fail(message) {
  console.error(`sidecar:build: ${message}`)
  process.exit(1)
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: root })
  if (result.error) fail(`could not run ${command}: ${result.error.message}`)
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited with ${result.status}`)
}

function hostTriple() {
  const result = spawnSync('rustc', ['-vV'], { encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    fail('TAURI_ENV_TARGET_TRIPLE is not set and `rustc -vV` failed')
  }
  const match = /^host:\s*(\S+)/m.exec(result.stdout)
  if (!match) fail('could not find the host triple in `rustc -vV`')
  return match[1]
}

// Publishes one RID and returns the path of the produced executable.
// The publish properties are passed here rather than set in the csproj, so the
// Docker image (framework-dependent) and plain build/test are unchanged.
function publish(triple, scratch) {
  const rid = RIDS[triple]
  if (!rid) fail(`unsupported target triple "${triple}"`)
  const out = join(scratch, rid)
  run('dotnet', [
    'publish',
    project,
    '-c',
    'Release',
    '-r',
    rid,
    '-o',
    out,
    '-p:PublishSingleFile=true',
    '-p:SelfContained=true',
    '-p:IncludeAllContentForSelfExtract=true',
    '-p:PublishTrimmed=false',
  ])
  const exe = join(out, rid.startsWith('win') ? 'TypeLab.Api.exe' : 'TypeLab.Api')
  if (!existsSync(exe)) fail(`publish did not produce ${exe}`)
  return exe
}

const triple = process.env.TAURI_ENV_TARGET_TRIPLE || hostTriple()
if (triple !== UNIVERSAL && !RIDS[triple]) {
  const known = [...Object.keys(RIDS), UNIVERSAL].join(', ')
  fail(`unsupported target triple "${triple}" (known: ${known})`)
}

const suffix = triple.includes('windows') ? '.exe' : ''
const target = join(outDir, `typelab-api-${triple}${suffix}`)
mkdirSync(outDir, { recursive: true })
const scratch = mkdtempSync(join(tmpdir(), 'typelab-sidecar-'))

try {
  if (triple === UNIVERSAL) {
    const parts = UNIVERSAL_PARTS.map((part) => publish(part, scratch))
    run('lipo', ['-create', '-output', target, ...parts])
    // `tauri build --target universal-apple-darwin` compiles each architecture
    // on its own, and each pass needs its own externalBin file.
    UNIVERSAL_PARTS.forEach((part, i) => {
      const perArch = join(outDir, `typelab-api-${part}`)
      copyFileSync(parts[i], perArch)
      chmodSync(perArch, 0o755)
    })
  } else {
    copyFileSync(publish(triple, scratch), target)
  }
  chmodSync(target, 0o755)
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

console.log(`sidecar:build: wrote ${target}`)
