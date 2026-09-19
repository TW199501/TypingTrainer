# TypeLab — 打字練習軟體 / Typing Trainer

英文、中文（注音／倉頡）、程式碼與單字練習，網頁版以 Docker 部署，桌面端以 Tauri 打包。
Typing practice for English, Chinese (bopomofo / cangjie), code and vocabulary —
shipped as a Docker web deployment and as a Tauri desktop app.

介面預設英文，繁體中文與简体中文可即時切換（`en.json` 為 source of truth）。

## 結構 / Layout

```
.
├─ apps/            Vue 3 + TypeScript 前端（Vite、Pinia、vue-router、vue-i18n、Ant Design Vue）
├─ src-tauri/       Tauri 2 桌面殼（Rust，Windows／Linux／macOS）
├─ server/          ASP.NET Core 10 後端（SqlSugar + SQLite）
│  ├─ TypeLab.Api/        API 與領域邏輯
│  ├─ TypeLab.Api.Tests/  xUnit 單元測試
│  ├─ db/schema.sql       由實體產生的建表語法
│  └─ framework/          XiHan.Framework.* 可複用模組（翻譯）
├─ docker/          網頁版部署：nginx 前端映像、API 映像、compose
├─ docs/
│  ├─ architecture.md   前後端分層、打字引擎、版面規則
│  ├─ api-contract.md   後端 API 與資料表
│  └─ design/           設計階段產出（HTML 原型、交接說明、對話紀錄）
├─ scripts/         version.mjs — 跨四套工具鏈的版號同步
└─ .github/workflows/   ci · claude-review · version
```

## 開發 / Getting started

```bash
npm install          # workspace 安裝（Node >= 20.19）
npm run dev          # http://localhost:5173
npm run verify       # format + lint + typecheck + test + build（CI 跑的同一組）
```

預設不需要後端：`VITE_USE_MOCK=true` 時所有資料來自 `apps/src/api/mock/fixtures.ts`。
要接真的 API，複製 `apps/.env.example` 成 `.env.local`，設定 `VITE_API_BASE_URL`
並把 `VITE_USE_MOCK` 改成 `false`。

| 指令                              | 說明                                    |
| --------------------------------- | --------------------------------------- |
| `npm run dev`                     | 前端開發伺服器                          |
| `npm run build`                   | 型別檢查後打包到 `apps/dist`            |
| `npm run test`                    | Vitest（打字引擎、錯字簿、AI 判讀規則） |
| `npm run lint` / `npm run format` | ESLint / Prettier                       |
| `npm run api:dev`                 | 後端 API（https://localhost:7001）      |
| `npm run desktop:dev`             | Tauri 桌面殼開發模式（自動帶起前端）    |
| `npm run desktop:build`           | 打包當前平台的安裝檔                    |
| `npm run docker:up`               | 網頁版整套起來（http://localhost:8080） |

### 網頁版 / Docker

```bash
npm run docker:up      # 前端 8080 + 後端，SQLite 存在具名 volume
npm run docker:logs
npm run docker:down
```

nginx 把 `/api` 反向代理到後端容器，因此瀏覽器維持同源、不需要 CORS。
換連接埠設 `WEB_PORT`。

### 桌面端 / Tauri

需要 Rust 工具鏈；Windows 另需 WebView2 與 MSVC build tools，Linux 需
`libwebkit2gtk-4.1-dev` 等相依套件（見 <https://v2.tauri.app/start/prerequisites/>）。

```bash
npm run desktop:dev
npm run desktop:build
```

### 後端 / Server

```bash
dotnet run --project server/TypeLab.Api
```

SqlSugar 以 CodeFirst 在啟動時建立 SQLite 檔與資料表（不需另外安裝資料庫伺服器）；
在 `server/TypeLab.Api/Data/SqlSugarSetup.cs` 的 `Entities` 加一個型別，
下次啟動就會多一張表，再於 `Program.cs` 用 `api.MapCrud<T>("/...")`
就能長出對應的 REST 端點。

建表語法可匯出成可檢視、可版控的 DDL：

```bash
dotnet run --project server/TypeLab.Api   # 先跑一次，建出 app.db
npm run db:schema                         # 匯出 server/db/schema.sql
```

資料表已預留 AI 分詞（`TextSegmentations` ／ `TextSegments`：同一文本可並存多組
不同引擎與模型版本的分詞結果，詞元帶字元位移，供逐詞正確率與注音提示使用）。
AI 提示詞存在後端的 `PromptTemplates`，內建版本由 `Data/PromptSeeds.cs` 在每次
啟動時重新種入——提示詞不需要使用者自己撰寫，改好內建版並遞增 `Revision`
就會推到所有部署；使用者若另存同 `Code` 的版本會優先採用，且內建版永不被覆寫，
隨時可還原預設。

### 多國語 / Translation

介面文案走前端 i18n JSON，但**使用者執行期新增的分類與主題無法走那條路**——
那些 JSON 在建置時就打包好了。因此系統預設分類帶 `I18nKey`（走前端翻譯，
可隨版本更新），使用者自建的則把譯文存進 `Translations` 表。

三種介面語言任選一種輸入，其餘兩種自動補齊：

```bash
curl -X POST http://localhost:5001/api/translate/locales \
  -H 'Content-Type: application/json' \
  -d '{"text":"打字練習軟體","sourceLocale":"zh-TW"}'
# → {"values":{"zh-TW":"打字練習軟體","zh-CN":"打字练习软件","en":"..."},"failed":[]}
```

翻譯本身是可複用模組 `server/framework/XiHan.Framework.Translation*`，依 XiHan
框架慣例撰寫（詳見該目錄 README）。中文簡繁由 OpenCC **離線**完成——那是確定性的
字形與詞彙映射（軟體↔软件、網路↔网络），不需付費 API 也不需網路；英文等其餘語言
才走 Google，未設定 `Translation__Google__ApiKey` 時該服務商會被自動跳過，
結果誠實列在 `failed` 中而不會假裝成功。

## 版本 / Versioning

版號從 `0.0.1` 起算，同時存在於 5 個檔案（root 與 apps 的 `package.json`、
`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`TypeLab.Api.csproj`），
由 `scripts/version.mjs` 統一改寫，避免四套工具鏈各走各的。

```bash
npm run version:show     # 目前版號
npm run version:patch    # 0.0.1 -> 0.0.2
npm run version:minor    # 0.0.2 -> 0.1.0
npm run version:major    # 0.1.0 -> 1.0.0
```

合併進 `main` 後，`.github/workflows/version.yml` 會自動 patch 升版、提交並打上
`v<版號>` tag；要升 minor／major 就在合併前先手動跑上面的指令。

## CI

| Workflow            | 觸發          | 內容                                                |
| ------------------- | ------------- | --------------------------------------------------- |
| `ci.yml`            | push · PR     | format、lint、typecheck、test、build                |
| `claude-review.yml` | PR 開啟／更新 | Claude Code 自動審查，需 `ANTHROPIC_API_KEY` secret |
| `version.yml`       | push 到 main  | 自動 patch 升版並打 tag                             |

## 路線圖 / Roadmap

- [x] 前端打字引擎與單頁練習（英文／中文／注音／單字／程式碼／限時）
- [x] 錯字簿與間隔複習、統計、排行與成績比較、AI 設定、題庫與字典管理
- [x] 前端工程化：i18n、API 層（mock 可切換）、單元測試、CI
- [x] 後端骨架：ASP.NET Core 10 + SqlSugar + SQLite，泛型 CRUD 與 OpenAPI
- [x] 網頁版 Docker 部署（nginx + API + compose）
- [x] Tauri 桌面殼骨架：視窗最小尺寸 900×640、全平台圖示
- [ ] 後端實作：認證、成績提交與防作弊重算、統計與排行、錯字簿排程
- [ ] 桌面端：本機 SQLite 離線練習、連線恢復後同步、全域快捷鍵
