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
└─ .github/workflows/   ci · claude-review · version · release
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

| 指令                              | 說明                                     |
| --------------------------------- | ---------------------------------------- |
| `npm run dev`                     | 前端開發伺服器                           |
| `npm run build`                   | 型別檢查後打包到 `apps/dist`             |
| `npm run test`                    | Vitest（打字引擎、錯字簿、AI 判讀規則）  |
| `npm run test:e2e`                | Playwright（焦點、IME 組字等瀏覽器行為） |
| `npm run lint` / `npm run format` | ESLint / Prettier                        |
| `npm run api:dev`                 | 後端 API（https://localhost:7001）       |
| `npm run desktop:dev`             | Tauri 桌面殼開發模式（自動帶起前端）     |
| `npm run desktop:build`           | 打包當前平台的安裝檔                     |
| `npm run docker:up`               | 網頁版整套起來（http://localhost:8080）  |

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
隨時可還原預設。顯示用的名稱與說明（以及本機模型的 `Note`）另由
`Data/CatalogueTranslationSeeds.cs` 種進 `Translations`（en / zh-TW / zh-CN）；
`GET /prompts?locale=` 與 `GET /models?locale=` 會依語系回傳。給模型看的
`Content` 維持英文。

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

合併進 `main` 後，`.github/workflows/version.yml` 會自動 patch 升版並提交；
要升 minor／major 就在合併前先手動跑上面的指令。

**打 tag 與打包只在 commit 標題含 `[release]` 時才發生。** 日常提交只推進版號，
不會產生 tag，也不會花二十分鐘打三個平台的安裝檔：

```bash
git commit -m "Add the leaderboard endpoint [release]"
```

只看**標題行**是刻意的：比對整則訊息的話，任何在本文裡提到 `[release]` 的
commit——一句註解、一次文件修改——都會發出沒人要求的版本。v0.0.5 就是這樣跑掉的。

## 發布 / Release

打上 `v*` tag 會觸發 `release.yml`，產出這一版的實際可下載物：

| 產物                                 | 平台        | 去處                   |
| ------------------------------------ | ----------- | ---------------------- |
| `.msi` ／ `.exe`                     | Windows     | GitHub Release（草稿） |
| `.dmg`（Intel + Apple Silicon 通用） | macOS       | GitHub Release（草稿） |
| `.deb` ／ `.AppImage`                | Linux       | GitHub Release（草稿） |
| `api` ／ `web` 容器映像              | linux/amd64 | `ghcr.io/<repo>/…`     |

Release 以**草稿**產生，確認無誤後再手動發佈。已經推過的 tag 可用
`workflow_dispatch` 補跑（填入 tag 名稱）。

本機打包：

```bash
npm run desktop:build      # 產物在 src-tauri/target/release/bundle/
docker compose -f docker/docker-compose.yml build
```

桌面端安裝檔目前**未簽章**：Windows 會顯示 SmartScreen 警告，macOS 會擋下未公證
的應用程式。要消除需要 Windows 程式碼簽章憑證與 Apple Developer ID，並把憑證
放進 repository secrets。

## 桌面自動更新 / Auto-update

已安裝的桌面版可以自己更新：`tauri-plugin-updater` 向 GitHub Releases 上的
`latest.json` 詢問新版，下載並驗證簽章後換上安裝檔。入口在「設定 → 軟體更新」，
**僅桌面版可見**（網頁端沒有東西可安裝，它的更新方式是拉新的容器映像）。

端到端是這樣串起來的：

1. `tauri.conf.json` 的 `bundle.createUpdaterArtifacts` 讓 `tauri build` 為每個
   安裝檔簽出 `.sig`；`plugins.updater.endpoints` 指向
   `…/releases/latest/download/latest.json`。
2. `tauri-action`（`release.yml`）把各平台的簽章合併成同一份 `latest.json` 並上傳。
   合併是「讀取→疊加→刪除→重傳」，沒有鎖，所以三個平台 job 用
   `max-parallel: 1` 依序跑；並行時最後寫入者會蓋掉別的平台條目，而三個 job
   全綠。`updater-manifest` job 會下載該檔並斷言四個平台鍵都在，把這種靜默失敗
   變成響亮失敗。
3. App 內 `check()` 比對版號，`downloadAndInstall()` 下載並驗章，macOS／Linux
   再 `relaunch()`（Windows 由安裝程式接手，進程在啟動安裝時就結束了）。

第一次使用前要做三件事，只做一次：

```bash
npm run tauri signer generate -- -w ~/.tauri/typelab.key
```

- 把 `typelab.key.pub` 的**內容**貼進 `tauri.conf.json` 的 `plugins.updater.pubkey`
  （目前是可辨識的佔位字串）。佔位值不影響啟動，也不影響「檢查更新」，只會在
  真要下載時因驗章失敗而擋下來。
- 私鑰進 repository secrets：`TAURI_SIGNING_PRIVATE_KEY`（有設密碼再加
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`）。沒放金鑰時 `tauri build` 會直接失敗，
  這是刻意的——不該發出未簽章的正式版。本機只想試打包可暫時把
  `createUpdaterArtifacts` 改成 `false`。
- **私鑰遺失 = 已安裝的舊版永遠收不到更新**，請離線備份。

注意 `release.yml` 仍用 `releaseDraft: true`：GitHub 的 `/releases/latest/` 會跳過
草稿，所以更新對使用者來說是在你手動 Publish 之後才生效（這是與「草稿＋人工
發佈」那道閘門取的捨，不是漏掉）。

## CI

| Workflow            | 觸發                                    | 內容                                                |
| ------------------- | --------------------------------------- | --------------------------------------------------- |
| `ci.yml`            | push · PR                               | format、lint、typecheck、test、build                |
| `claude-review.yml` | PR 開啟／更新                           | Claude Code 自動審查，需 `ANTHROPIC_API_KEY` secret |
| `version.yml`       | push 到 main                            | 自動 patch 升版；訊息含 `[release]` 才打 tag 並發布 |
| `release.yml`       | `v*` tag、手動、或由 `version.yml` 呼叫 | 三平台桌面安裝檔 + 容器映像推上 GHCR                |

## 路線圖 / Roadmap

- [x] 前端打字引擎與單頁練習（英文／中文／注音／單字／程式碼／限時）
- [x] 錯字簿與間隔複習、統計、排行與成績比較、AI 設定、題庫與字典管理
- [x] 前端工程化：i18n、API 層（mock 可切換）、單元測試、CI
- [x] 後端骨架：ASP.NET Core 10 + SqlSugar + SQLite，泛型 CRUD 與 OpenAPI
- [x] 網頁版 Docker 部署（nginx + API + compose）
- [x] Tauri 桌面殼骨架：視窗最小尺寸 900×640、全平台圖示
- [ ] 後端實作：認證、成績提交與防作弊重算、統計與排行、錯字簿排程
- [ ] 桌面端：本機 SQLite 離線練習、連線恢復後同步、全域快捷鍵
