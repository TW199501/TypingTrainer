# @typelab/web

Vue 3 + TypeScript front end for TypeLab, built from the Claude Design prototype
in `docs/design/prototype/TypingTrainer.dc.html`. Ant Design (`ant-design-vue`)
themed with the prototype's warm tokens (`#d97757` primary on `#faf9f5`).

```bash
npm run dev        # http://localhost:5173
npm run build      # type-check + build into dist/
npm run test       # vitest
npm run lint
```

Run these from the repository root instead (`npm run dev`, `npm run verify`) if
you want the workspace scripts.

## Layout

```
src/
├─ views/        Practice / Result / Stats / Progress / Coach / Library /
│                Dictionary / Ai / Models / Settings
├─ components/   AppSider · TopBar · StatusBar · VirtualKeyboard · ToggleSwitch
├─ composables/  useElementSize (keyboard budget) · useViewport · useGridLayout
├─ stores/       session (typing engine) · settings · library · dictionary ·
│                stats · progress · coach · ai   (Pinia)
├─ api/          axios client, wire types, and mock/fixtures.ts
├─ i18n/         en.json (source of truth) · zh-TW.json · zh-CN.json
├─ data/         engine constants: keyboard geometry, finger map, bopomofo, corpus
└─ lib/          analyze.ts — local stand-in for the AI intake call
```

`docs/architecture.md` at the repository root explains the typing engine, the
single-screen layout rules and the i18n policy; `docs/api-contract.md` has the
endpoints and the SQLite tables behind them.

## Data

`VITE_USE_MOCK=true` (the default) serves everything from
`src/api/mock/fixtures.ts`, so the app runs with no backend. Set it to `false`
and point `VITE_API_BASE_URL` at the API to switch over — nothing else changes,
because views read stores and stores call `src/api`.

## Notes

- `Ctrl+Enter` start/restart · `Ctrl+N` next text · `Ctrl+B` toggle sidebar ·
  `Ctrl+R` start the due review.
- The build uses a relative `base` and hash routing, so `dist/` also runs from
  `file://` inside a Tauri shell.
- Two labels from the prototype's translation pass were spelled out here:
  `PracticeRuns` → "Practice runs", `TopicCategory` → "Topics".
