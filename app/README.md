# TypeLab — typing trainer (web)

Vue 3 + TypeScript implementation of `project/TypingTrainer.dc.html`, the Claude Design
prototype in this repo. The layout, palette and behaviour follow the prototype; the
component set is Ant Design (`ant-design-vue`) themed with the warm tokens from the design
(`#d97757` primary on `#faf9f5`).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run typecheck
```

The build uses a relative `base` and hash routing, so `dist/` also runs from `file://`
inside a Tauri shell.

## Layout

```
src/
├─ views/        Practice / Result / Stats / Progress / Coach / Library /
│                Dictionary / Ai / Models / Settings
├─ components/   AppSider · TopBar · StatusBar · VirtualKeyboard · ToggleSwitch
├─ composables/  useElementSize (keyboard budget) · useViewport · useGridLayout
├─ stores/       session · settings · library · dictionary · ai   (Pinia)
├─ data/         constants.ts (layouts, finger map, sample texts, dictionary, trends)
└─ lib/          analyze.ts — local stand-in for the AI intake call
```

## Things worth knowing

**The typing engine lives in `stores/session.ts`.** It listens for `keydown` (never
`input`) so an IME cannot interfere, and Chinese modes go through a hidden, *uncontrolled*
input: composition events only paint the bopomofo bubble above the current cell, and the
comparison advances on `compositionend`. The field is uncontrolled on purpose — binding its
value wipes the browser's composition buffer mid-word.

**Scoring splits by language.** Latin runs report WPM (characters / 5), Chinese runs report
CPM (characters), because one Chinese character costs 3–5 keystrokes. The status bar,
result page, trend chart and leaderboard all switch units with the mode.

**Every run opens with a 3-2-1 countdown**; input is locked until it ends, and timed runs
(60s) lock again the moment the clock hits zero.

**Single-screen lock.** The shell is `100vh` with a fixed top bar and status bar; only the
content area scrolls. On the practice page the keyboard height is computed from the
*measured* column and toolbar heights (`useElementSize`), clamped to 120–340px, with the
text card taking the remainder. That is what keeps all five key rows above the status bar
at 540–560px window heights. Pages that would otherwise scroll (Stats, Progress, Coach,
Settings, Library, Dictionary) give their cards `flex` shares and scroll inside the card.

**Error book / spaced repetition.** Misses merge into `session.book` at the end of a run
and are scheduled on a 1 → 2 → 4 → 7 → 15 → 30 day ladder; the Coach page drills only the
keys due today and promotes them a box afterwards.

**Shortcuts:** `Ctrl+Enter` start/restart · `Ctrl+N` next text · `Ctrl+B` toggle sidebar ·
`Ctrl+R` start the due review.

## Data is still local

Everything is in-memory sample data — texts, dictionary entries, trends, leaderboard,
achievements and AI usage counters. `lib/analyze.ts` fakes the AI intake with keyword rules.
The transcript's plan for the next layer is unchanged:

- `ASP.NET Core` API — `/auth`, `/texts`, `/sessions`, `/stats/{summary,trend,keys}`,
  `/leaderboard`, with MSSQL tables `Users`, `Texts`, `Sessions`, `KeyErrors`,
  `Achievements` / `UserAchievements` (plus `Words`, `WordExamples`, `UserWordMastery`
  for the dictionary import).
- Submit the raw keystroke array with each session so the server can re-verify WPM.
- Tauri wraps this build; local SQLite is the primary store, with sync when online.

## Two wording fixes

The prototype had two run-together labels left over from its translation pass; they are
spelled out here: `PracticeRuns` → "Practice runs" (Progress) and `TopicCategory` →
"Topics" (Dictionary). `Ctrl+R` was listed in the prototype's shortcut table but not
implemented — it is wired up now.
