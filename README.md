# TypeLab — 打字練習軟體 / Typing Trainer

英文、中文（注音／倉頡）、程式碼與單字練習，最終以 Tauri 包成桌面端。
Typing practice for English, Chinese (bopomofo / cangjie), code and vocabulary,
packaged for the desktop with Tauri.

介面預設英文，繁體中文與简体中文可即時切換（`en.json` 為 source of truth）。

## 結構 / Layout

```
.
├─ apps/
│  └─ web/          Vue 3 + TypeScript 前端（Vite、Pinia、vue-router、vue-i18n、Ant Design Vue）
├─ design/
│  ├─ prototype/    Claude Design 匯出的 HTML 原型（實作的視覺依據，原樣保留）
│  ├─ chats/        設計過程的對話紀錄
│  └─ HANDOFF.md    原始交接說明
├─ docs/
│  ├─ architecture.md   前後端分層、打字引擎、版面規則
│  └─ api-contract.md   後端 API 與 MSSQL 資料表
└─ .github/workflows/ci.yml
```

## 開發 / Getting started

```bash
npm install          # workspace 安裝（Node >= 20.19）
npm run dev          # http://localhost:5173
npm run verify       # format + lint + typecheck + test + build（CI 跑的同一組）
```

預設不需要後端：`VITE_USE_MOCK=true` 時所有資料來自 `apps/web/src/api/mock/fixtures.ts`。
要接真的 API，複製 `apps/web/.env.example` 成 `.env.local`，設定 `VITE_API_BASE_URL` 並把
`VITE_USE_MOCK` 改成 `false`。

| 指令                              | 說明                                    |
| --------------------------------- | --------------------------------------- |
| `npm run dev`                     | 開發伺服器                              |
| `npm run build`                   | 型別檢查後打包到 `apps/web/dist`        |
| `npm run test`                    | Vitest（打字引擎、錯字簿、AI 判讀規則） |
| `npm run lint` / `npm run format` | ESLint / Prettier                       |

## 路線圖 / Roadmap

- [x] 前端打字引擎與單頁練習（英文／中文／注音／單字／程式碼／限時）
- [x] 錯字簿與間隔複習、統計、排行與成績比較、AI 設定、題庫與字典管理
- [x] 前端工程化：i18n、API 層（mock 可切換）、單元測試、CI
- [ ] 後端 ASP.NET Core 8 + MSSQL（`docs/api-contract.md` 已定義介面）
- [ ] Tauri 桌面殼：本機 SQLite、離線可練、全域快捷鍵、視窗最小尺寸 900×640
