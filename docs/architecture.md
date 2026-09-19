# Architecture

## Layers

```
apps/web
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
