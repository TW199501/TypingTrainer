# Architecture

## Layers

```
apps/src
├─ views/        one component per route; layout and copy only
├─ components/   shell pieces (sider, top bar, status bar, keyboard, switch)
├─ stores/       Pinia state; the typing engine lives in stores/session.ts
├─ api/          axios client + wire types + mock fixtures
├─ i18n/         en (source of truth), zh-TW, zh-CN
├─ composables/  measurement helpers used by the single-screen layout
└─ data/         engine constants: keyboard geometry, finger map, bopomofo, corpus
```

Views never call `axios` and never hold fixtures: they read stores, stores call
`api`, and `api` decides between the fixture and the endpoint based on
`VITE_USE_MOCK`. Swapping the flag is the only change needed when the backend
lands.

## Repositories and runtimes

The same `apps/` bundle is shipped three ways, which is why `vite.config.ts`
uses a relative `base`:

| Target       | Entry                       | API base                                      |
| ------------ | --------------------------- | --------------------------------------------- |
| Dev          | `npm run dev`               | `VITE_API_BASE_URL` or the fixtures           |
| Web (Docker) | `docker/docker-compose.yml` | `/api`, proxied by nginx to the API container |
| Desktop      | `src-tauri/`                | `VITE_API_BASE_URL`, local SQLite planned     |

`src-tauri` is the stock Tauri layout: `main.rs` is a thin passthrough and every
command lives in `lib.rs`, because the mobile targets generate their own entry
point. Commands must be listed in `generate_handler!` and permissions granted in
`capabilities/default.json` — Tauri 2 denies everything by default.

## Backend (`server/`)

ASP.NET Core 10 minimal APIs over **SqlSugar** on **SQLite**. Two pieces make new
tables cheap:

- `Data/SqlSugarSetup.cs` holds the `Entities` array; CodeFirst creates or
  migrates those tables at start-up.
- `Api/CrudEndpoints.cs` provides `MapCrud<T>(prefix)` — paged list, get, create,
  update, delete — so plumbing routes are one line each.

Endpoints that carry real behaviour are still hand-written: authentication,
session submission with anti-cheat re-scoring, the stats aggregations, the
leaderboard and the error-book scheduler.

Reusable pieces live under `server/framework` as `XiHan.Framework.*` modules,
written to that framework's conventions so they can move there wholesale. The
first one is translation: `.Abstractions` holds the contracts, the main package
routes between providers, and each provider is its own package.

## Translation and locales

Two kinds of text look alike and must not be handled alike:

- **Copy** — the shipped UI chrome (nav, buttons, kind labels) and the seven
  built-in categories. These are translated in the front-end i18n JSON, so
  translations improve with a release and cost nothing at runtime. Built-in
  categories carry an `I18nKey` for this.
- **Catalogue data** — prompt names/descriptions and model notes, which the API
  serves. Seeded into `Translations` from `CatalogueTranslationSeeds` so a
  locale query can resolve them without the front-end bundle.
- **Data** — anything a user creates. A category added today cannot appear in a
  bundle built yesterday, so its translations go in the `Translations` table.

For data, one locale is typed and the rest are derived through
`POST /api/translate/locales`. Chinese script conversion is done offline by
OpenCC — simplified/traditional is a deterministic glyph and vocabulary mapping,
not a translation, and routing it through a paid API would add latency and quota
for a worse result. Everything else goes to a configured provider; when none is
configured the response lists those locales in `failed` rather than pretending
to have translated them.

## Testing

Front-end tests sit beside the file they cover (`analyze.ts` →
`analyze.test.ts`) and run under vitest. The server has its own xUnit project,
`server/TypeLab.Api.Tests`. Both run in CI.

End-to-end tests live in `e2e/` and run under Playwright against a real Chrome.
They exist for what jsdom structurally cannot observe: focus, IME composition,
and browser event ordering. The Chinese input field is the motivating case — it
broke because a toolbar button stole focus, and no unit test could have caught
it. Verified by disabling the fix and confirming the suite goes red.

## Typing engine (`stores/session.ts`)

- Listens on `keydown`, never `input`, so an IME cannot interfere with latin runs.
- Chinese modes route through a hidden **uncontrolled** input. `compositionstart`
  and `compositionupdate` only paint the bopomofo bubble above the current cell;
  the comparison advances on `compositionend`. Binding that field's `value` wipes
  the browser's composition buffer mid-word — do not.
- Bopomofo drills map latin keys through `ZHUYIN` before comparing.
- Scoring splits by language: latin runs report **WPM** (characters / 5), Chinese
  runs report **CPM** (characters), because one Chinese character costs 3–5
  keystrokes. `speedUnitKey` tells the UI which label to show.
- Options that affect scoring: strict mode (block until corrected), count
  punctuation, ignore full-width/half-width differences.
- Every run opens with a 3-2-1 countdown; timed runs (60s) lock at zero.
- Each keystroke is logged as `{ k, t, ok }` and submitted with the run so the
  server can re-verify the score (anti-cheat).

## Error book (spaced repetition)

Misses merge into `session.book` when a run ends and are scheduled on the
`SRS_DAYS` ladder — 1 → 2 → 4 → 7 → 15 → 30 days. The Coach page drills only the
keys due today and promotes each one a box afterwards.

## Single-screen layout

The shell is `100vh`: a 48px top bar, a scrolling content area and a 48px status
bar. Practice must fit one screen at 540–560px window heights, so:

- `useElementSize` measures the real column and toolbar heights with a
  `ResizeObserver`; the keyboard height is derived from them, clamped to
  120–340px, and the text card takes the remainder.
- The keyboard's five rows use `flex: 1 1 0` inside that height, so they share
  whatever space the card gets instead of overflowing.
- Pages that would otherwise scroll (Stats, Progress, Coach, Settings, Library,
  Dictionary) give their cards `flex` shares and scroll _inside_ the card.
- Two-column pages stack once the content area drops below 620px
  (`useGridLayout`).

## i18n

`en.json` is the source of truth; `zh-TW` and `zh-CN` are derived from it and fall
back to English key by key, so a missing translation shows English rather than a
raw key. Keys are semantic (`practice.start`, `library.import.title`). The
interface language picker writes to the settings store, which drives
`i18n.global.locale` and persists the choice in `localStorage`.

Category, topic and text names are **data**, not copy — they come from the API and
stay as the user typed them in every locale.

## Testing

`vitest` covers the parts where a regression would be silent: the typing engine
(scoring, strict mode, punctuation and width options, bopomofo mapping, countdown
lock, keystroke log), the error-book scheduler, and the AI intake rules.

On the server, xUnit covers the model directory resolution (per-OS defaults,
relative paths, Local vs Roaming on Windows), the Chinese conversion provider,
and the provider routing — ordering, skipping unconfigured or unsupported
providers, and falling back when one fails.
