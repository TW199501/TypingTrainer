# TypeLab — working notes

Things that cost real time to discover. `README.md` covers how to run the
project; this file covers what is not obvious from reading the code, and what
has already gone wrong once.

## Before you start

```bash
npm run verify              # format, lint, typecheck, unit tests, build
dotnet test server/TypeLab.slnx
npm run test:e2e            # needs a dev server; Playwright starts one
```

Green tests are not proof. When fixing a bug, break the fix afterwards and
confirm the test goes red — twice in this repository a test suite passed
against code that was already broken.

## CI and releases

**A called workflow receives no secrets unless the caller passes them.**
`version.yml` invokes `release.yml` with `uses:`, so it needs
`secrets: inherit`. Without it every secret except `GITHUB_TOKEN` arrives
empty. This cost three failed releases: Tauri base64-decodes the signing key
before validating it, so an empty value fails as _"Missing comment in secret
key"_ — which reads like a malformed key, not a missing one. The Docker job
kept succeeding throughout because `GITHUB_TOKEN` is the one secret passed
automatically.

**`git push --follow-tags` only pushes annotated tags.** A lightweight
`git tag v1.2.3` is silently left behind while the workflow reports success.
Use `git tag -a`.

**A tag pushed with `GITHUB_TOKEN` triggers nothing.** GitHub suppresses it to
avoid recursive runs, so `version.yml` calls `release.yml` directly rather than
waiting for a `push` event that never arrives.

**`[release]` is matched against the commit subject only.** Matching the whole
message means any commit that merely mentions the marker — a comment, a doc
change — ships a version nobody asked for. v0.0.5 escaped exactly that way.

**A read-only token cannot see draft releases.** A job that inspects release
assets needs `contents: write`, or it fails with "release not found" while
every asset is present.

**`tauri-action` merges `latest.json` by read-modify-write with no lock.** The
three platform jobs must run `max-parallel: 1`; in parallel the last writer
wins, the other platforms vanish from the manifest, and all three jobs still
report success. The `updater-manifest` job asserts the four platform keys
afterwards rather than trusting the colours.

## Desktop signing

Two unrelated kinds of signature:

|                          | Purpose                                 | Cost                 |
| ------------------------ | --------------------------------------- | -------------------- |
| Tauri updater (minisign) | The app verifies an update came from us | free, self-generated |
| Apple Developer ID       | macOS will open the app at all          | $99/year             |

`createUpdaterArtifacts: true` makes `tauri build` fail outright without a
signing key — deliberate, so an unsigned release cannot slip out. A
**placeholder `pubkey` also fails the build**, at the signing step, with
`failed to decode base64 pubkey`; it does not merely fail at runtime.

After rotating the key, re-store the secret. A mismatched pair passes every
gate — build, publish, manifest check — and only surfaces when a user presses
"download and install".

`docs/signing-and-keys.md` has the full procedure for all three, including the
Apple certificate and notarisation steps.

## Versions

Six files carry the version; `scripts/version.mjs` rewrites all of them.
Never edit one by hand. `Cargo.lock` is included: leaving it to cargo means it
lags behind and `cargo build --locked` fails.

## Typing engine

**The hidden IME field must hold focus for the whole run** in Chinese modes.
The OS composes into whatever is focused, so a toolbar button that takes focus
leaves the IME with nowhere to compose — the candidate window never opens and
no character can be chosen. `PracticeView.vue` hands focus back on every run
reset and on any click in the practice screen. Covered by `e2e/`, because jsdom
cannot observe focus.

**Never bind the IME field's `value`.** It is uncontrolled on purpose; binding
wipes the browser's composition buffer mid-word.

Latin runs read `keydown` directly and have no IME field. Bopomofo drills map
latin keys through `ZHUYIN` — that mode expects the IME to be _off_.

## Backend

**SqlSugar materialises rows through `Activator.CreateInstance`**, which throws
on `required` members. Entities use property defaults instead.

**SQLite has no native `DateTimeOffset`.** Columns are UTC `DateTime`.

**A new entity must be registered in `SqlSugarSetup.Entities`** or its table is
never created. Seeds run in order — rows before the translations that key off
their ids.

**`OpenCCNET` resolves its dictionaries relative to the current directory.**
Tests happen to run from the output directory, so a CWD-dependent bug passes
there and throws under `dotnet run`, whose working directory is the project
root. Initialisation keys off `AppContext.BaseDirectory`.

**`Accept-Language` is ordered by `q`, not by position.** Browsers usually send
the preferred tag first, so position-based parsing agrees with the spec by
accident and fails for anyone else. `q=0` means "not acceptable".

## Conventions

- Front-end tests sit beside the file they cover: `foo.ts` → `foo.test.ts`.
  End-to-end tests live in `e2e/*.spec.ts`.
- Reusable server modules go under `server/framework` as `XiHan.Framework.*`,
  written to that framework's conventions: version header, file-scoped
  namespace, Simplified Chinese XML docs, `.Abstractions` split, one package
  per provider.
- `server/db/schema.sql` is generated (`npm run db:schema`), never hand-edited.
- Chinese script conversion is a deterministic glyph and vocabulary mapping,
  not a translation. It runs offline through OpenCC; routing it to a paid API
  would cost latency and quota for a worse result.
