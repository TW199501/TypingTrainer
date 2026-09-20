# 收尾發版鏈路 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把三個待提交的變更發成 v0.1.10，並在 Windows 與 macOS 上實測自動更新真的會動——讓「鏈路打通」從推測變成證據，之後不再回頭碰發版基礎設施。

**Architecture:** 不新增任何程式碼。既有的 `version.yml` → `release.yml` 鏈路已經存在，這份計畫只是**第一次完整走完它並留下驗證紀錄**。做法是：同步本機 → 本機全套驗證 → 一個帶 `[release]` 的 commit 觸發 CI → CI 產出草稿 release → 人工發布 → 兩台實機按「檢查更新」。每一步都有明確的「該看到什麼」，看不到就停下來，不要往下猜。

**Tech Stack:** GitHub Actions（`version.yml`、`release.yml`）、`tauri-action`、minisign 更新簽章、Apple Developer ID 簽章與公證、`gh` CLI。

**Spec:** 沒有獨立 spec。約束來自 [CLAUDE.md](../../../CLAUDE.md) 的 **CI and releases** 與 **Desktop signing** 兩節，以及 [docs/signing-and-keys.md](../../signing-and-keys.md)。執行前先讀這兩份——裡面每一條都是已經踩過的坑。

---

## Global Constraints

- **版本號不可手改。** 六個檔案帶版本，只能透過 `scripts/version.mjs` 改。
- **`version.yml` 對每一次 push 到 main 都會 patch 升版。** 目前 `origin/main` 是 `0.1.9`，所以下一個版本必然是 **`v0.1.10`**。不要試圖湊出 `0.2.0`：機器人永遠再加一個 patch，本機設 `0.2.0` 只會變成 `0.2.1`。
- **只有 commit 的「主旨行」裡的 `[release]` 會觸發發版。** 內文提到不算（v0.0.5 就是這樣意外發出去的）。本計畫文件本身含有 `[release]` 字樣，**不影響**。
- **`release.yml` 產出的是草稿。** 最後一定要人工 `gh release edit <tag> --draft=false --latest`，否則 App 端會報 `Could not fetch a valid release JSON from the remote`。
- **`max-parallel: 1` 不可放寬。** 三平台依序跑，整輪約 25 分鐘，耐心等。
- **私鑰不得出現在指令列、commit、對話或專案目錄中。**
- Node `>=24.18`（`engine-strict=true`，不符會直接拒絕安裝）。

---

## 涉及的檔案

| 檔案                                                           | 狀態         | 責任                                                |
| -------------------------------------------------------------- | ------------ | --------------------------------------------------- |
| `.github/workflows/release.yml`                                | 已改，未提交 | `releaseBody` 改為使用者看得懂的下載指引表          |
| `CLAUDE.md`                                                    | 已改，未提交 | 記錄草稿 release 的坑、ARM 取捨、鏈路範圍           |
| `docs/signing-and-keys.md`                                     | 已改，未提交 | Apple secret 狀態更正為已設定；新增 Publishing 一節 |
| `docs/superpowers/plans/2026-09-21-close-the-release-chain.md` | 本檔         | 這份計畫                                            |

沒有程式碼變更，因此 v0.1.10 與 v0.1.9 的 App 行為完全相同。**這是刻意的**——用一個零風險的版本去測更新鏈路，比用一個同時改了功能的版本去測要乾淨得多；更新失敗時不必分辨是更新壞了還是功能壞了。

---

### Task 1: 同步本機並確認起點乾淨

**Files:** 無變更（只同步）

**Interfaces:**

- Produces: 本機 `HEAD == origin/main`，`package.json` 版本為 `0.1.9`，三個待提交檔案仍在

- [ ] **Step 1: 確認落後幾個 commit**

```bash
git fetch origin main
git rev-list --left-right --count HEAD...origin/main
```

預期：`0	1` — 本機超前 0、落後 1。落後的那個是機器人的 `chore(release): v0.1.9 [skip ci]`。

- [ ] **Step 2: 把本機變更暫存起來再同步**

三個檔案還沒提交，直接 rebase 會擋。

```bash
git stash push -m "pending release-notes and docs" .github/workflows/release.yml CLAUDE.md docs/signing-and-keys.md
git pull --rebase origin main
git stash pop
```

預期：`Dropped refs/stash@{0}`，沒有 conflict。

若 `git stash pop` 報 conflict（只可能發生在 `release.yml`），停下來手動解，不要 `--force` 任何東西。

- [ ] **Step 3: 確認版本號與檔案狀態**

```bash
node scripts/version.mjs
git status --short
```

預期：

```
0.1.9
 M .github/workflows/release.yml
 M CLAUDE.md
 M docs/signing-and-keys.md
```

版本若不是 `0.1.9`，代表同步沒成功，回到 Step 1。

---

### Task 2: 本機全套驗證

**Files:** 無變更

**Interfaces:**

- Consumes: Task 1 的乾淨工作區
- Produces: 四條工具鏈都綠的證據；CI 上不該再出現本機就能抓到的錯

不要跳過這一關。CI 一輪 25 分鐘，本機一輪幾分鐘，在本機抓到的每一個錯都省 25 分鐘。

- [ ] **Step 1: 前端**

```bash
npm run verify
```

預期：`format:check`、`lint`、`typecheck`、`test`、`build` 依序通過，最後印出 Vite 的 bundle 大小表。

- [ ] **Step 2: 後端**

```bash
dotnet test server/TypeLab.slnx
```

預期：`Passed!` — 失敗 0。

- [ ] **Step 3: Rust**

```bash
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

預期：`Finished`，無 error。

`--locked` 是關鍵：它會在 `Cargo.lock` 與 `Cargo.toml` 不同步時失敗。`scripts/version.mjs` 會一起改 `Cargo.lock`，但若有人手改過版本號，這裡就會炸——而 CI 上的 `cargo build --locked` 會在第 15 分鐘才炸。

- [ ] **Step 4: 端對端**

```bash
npm run test:e2e
```

預期：6 passed。Playwright 會自己起 dev server。

- [ ] **Step 5: YAML 語法**

`release.yml` 剛改成多行 block scalar，語法錯了 CI 會直接不認得這個 workflow。

```bash
npx prettier --check .github/workflows/release.yml
```

預期：`All matched files use Prettier code style!`

Prettier 解析失敗就會報錯，所以這句通過等於 YAML 可解析。

---

### Task 3: 提交並觸發 v0.1.10

**Files:**

- Commit: `.github/workflows/release.yml`、`CLAUDE.md`、`docs/signing-and-keys.md`、`docs/superpowers/plans/2026-09-21-close-the-release-chain.md`

**Interfaces:**

- Consumes: Task 2 全綠
- Produces: `origin/main` 上一個主旨含 `[release]` 的 commit，隨後機器人推出 `v0.1.10` 標籤

- [ ] **Step 1: 確認要提交的內容就是預期的那些**

```bash
git add -A
git status --short
```

預期恰好四個 `M`/`A`，沒有多餘檔案（特別注意：**不可以有任何金鑰檔**）。

- [ ] **Step 2: 提交**

主旨必須含 `[release]`，且主旨要短。內文說明改了什麼。

```bash
git commit -m "Make the release page legible, and record the chain [release]" -m "The assets list is eight files with names like universal.dmg and
app.tar.gz.sig, and the body said only 'Desktop installers.' — nothing
told a visitor which one to press. Replaced with a per-OS table, and a
collapsed section explaining that the .sig and latest.json are what the
updater fetches rather than anything to download by hand.

CLAUDE.md gains the draft-release trap: releaseDraft: true is deliberate,
but /releases/latest/download/latest.json resolves only against published
releases, so an unpublished one reports as a broken manifest. Also records
why Windows and Linux ARM are not built, and that macOS universal already
covers Apple Silicon.

signing-and-keys.md had the Apple secrets marked as not set up; they are.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: 確認主旨行真的含 marker**

```bash
git log -1 --format=%s
```

預期：`Make the release page legible, and record the chain [release]`

主旨沒有 `[release]` 的話，機器人只會升版不會發版——那不是災難，改一個新 commit 再來即可。

- [ ] **Step 4: 推送**

```bash
git push origin main
```

---

### Task 4: 盯著 CI 跑完

**Files:** 無變更

**Interfaces:**

- Consumes: Task 3 推出去的 commit
- Produces: 一個 draft 狀態的 `v0.1.10` release，資產齊全

- [ ] **Step 1: 確認 bump job 有判定要發版**

```bash
gh run list --workflow=version.yml --limit 1
gh run view --log | grep -E "^Subject:|^Publishing:"
```

預期：

```
Subject: Make the release page legible, and record the chain [release]
Publishing: true
```

`Publishing: false` 代表主旨解析沒中，停下來查 `version.yml` 的 `case` 區塊，不要重推。

- [ ] **Step 2: 等三平台建置**

```bash
gh run watch
```

約 25 分鐘。`max-parallel: 1`，Windows → macOS → Linux 依序。

macOS 那一段最久：除了編譯兩個架構，還要送 Apple 公證並等待回覆。

- [ ] **Step 3: 確認 manifest 檢查通過**

`updater-manifest` job 會斷言四個平台 key 都在。它綠了，代表三個 job 沒有互相覆蓋掉 `latest.json`。

```bash
gh run view --job="verify updater manifest" --log | grep -A12 "latest.json platforms"
```

預期列出至少 `windows-x86_64`、`darwin-aarch64`、`darwin-x86_64`、`linux-x86_64`。

少了任何一個 → 是 read-modify-write 競態，重跑 release workflow，不要手動補 manifest。

- [ ] **Step 4: 確認 Apple 憑證真的有被用到**

```bash
gh run view --log | grep -i "Unsigned macOS build"
```

預期：**沒有輸出**。若出現 `::warning::Unsigned macOS build — missing: …`，代表某個 Apple secret 沒傳進來，macOS 那包不會被 Gatekeeper 接受。這種情況下先修 secret，Task 7 不用做。

---

### Task 5: 發布並確認 App 看得到

**Files:** 無變更

**Interfaces:**

- Consumes: Task 4 的 draft release
- Produces: `v0.1.10` 已發布且被標為 latest；updater endpoint 回 200

這是整條鏈最容易被忘記的一步。CI 全綠不等於使用者拿得到。

- [ ] **Step 1: 發布前先看一眼資產**

```bash
gh release view v0.1.10 --json isDraft,assets --jq '"draft=\(.isDraft)", (.assets[] | "\(.name)  \(.size/1048576|floor)MB")'
```

預期 `draft=true`，並含這些：`_x64-setup.exe`、`_x64_en-US.msi`、`_universal.dmg`、`_universal.app.tar.gz`（+`.sig`）、`_amd64.deb`、`_amd64.AppImage`、`.x86_64.rpm`、`latest.json`。

- [ ] **Step 2: 發布**

```bash
gh release edit v0.1.10 --draft=false --latest
```

- [ ] **Step 3: 驗證 updater endpoint**

```bash
curl -sSL -o /dev/null -w "%{http_code}\n" https://github.com/TW199501/TypingTrainer/releases/latest/download/latest.json
```

預期：`200`。

`404` 代表還是草稿，回 Step 2。

- [ ] **Step 4: 驗證 manifest 內容**

```bash
curl -sSL https://github.com/TW199501/TypingTrainer/releases/latest/download/latest.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s);console.log('version:',m.version);for(const[k,v]of Object.entries(m.platforms))console.log(' ',k.padEnd(24),v.signature?'sig ok':'NO SIG')})"
```

預期：`version: 0.1.10`，每個平台都 `sig ok`。

- [ ] **Step 5: 用一般人的眼睛看一次頁面**

開 `https://github.com/TW199501/TypingTrainer/releases/tag/v0.1.10`。

該看到：一張「你的系統 → 下載哪個檔案」的表，以及一個可摺疊的「其他檔案是什麼」。表沒出現代表 `releaseBody` 的 YAML block scalar 被吃掉了，回頭看 `release.yml`。

---

### Task 6: Windows 實測自動更新

**Files:** 無變更

**Interfaces:**

- Consumes: Task 5 已發布的 `v0.1.10`
- Produces: 更新鏈路在 Windows 上走通的證據

這是整份計畫真正的目的。前面五個 task 都只是在製造這個測試的條件。

- [ ] **Step 1: 確認手上裝的是舊版**

開 App → 設定 → 軟體更新區塊，或看安裝目錄的版本。必須 **低於 0.1.10**（0.1.9 即可）。

已經是 0.1.10 的話這個 task 沒意義——去控制台解安裝，裝 v0.1.9 的 `-setup.exe`，再回來。

- [ ] **Step 2: 按「檢查更新」**

預期：出現有新版本可下載的提示，版本號 `0.1.10`。

**若出現 `Could not fetch a valid release JSON from the remote`** → release 還是草稿，回 Task 5 Step 2。

**若出現簽章相關錯誤**（`signature verification failed` / `invalid signature`）→ 手上這版內建的 pubkey 與 CI 用的私鑰不成對。正式金鑰從 `fa31cf0`（v0.1.0）開始內建，所以只會發生在裝了更舊的版本。解安裝後裝 v0.1.9 再試。

- [ ] **Step 3: 下載並安裝**

按下去，等它下載、驗簽、安裝、重啟。

- [ ] **Step 4: 確認版本真的變了**

App 重啟後回到設定頁，版本應顯示 `0.1.10`。

顯示舊版本代表安裝沒生效——`installMode: "passive"` 會顯示進度但不需互動；若它靜默失敗，改用手動下載 `-setup.exe` 覆蓋安裝確認安裝程式本身沒問題，再回頭查 updater。

---

### Task 7: macOS 實測簽章與更新

**Files:** 無變更

**Interfaces:**

- Consumes: Task 5 已發布的 `v0.1.10`；Task 4 Step 4 確認過 Apple 憑證有生效
- Produces: Gatekeeper 接受的證據，與 Apple Silicon 原生執行的證據

在 ARM Mac（Apple Silicon）上做。`universal.dmg` 是唯一要下載的檔案，沒有另外的 arm64 版本。

- [ ] **Step 1: 裝 v0.1.9，先不要裝 0.1.10**

```bash
curl -LO https://github.com/TW199501/TypingTrainer/releases/download/v0.1.9/TypeLab_0.1.9_universal.dmg
open TypeLab_0.1.9_universal.dmg
```

把 TypeLab 拖進 Applications。

- [ ] **Step 2: 確認 Gatekeeper 接受**

```bash
spctl -a -vvv -t install /Applications/TypeLab.app
```

預期包含這兩行：

```
/Applications/TypeLab.app: accepted
source=Notarized Developer ID
```

`rejected` → 簽章或公證沒成功。
`source=Unnotarized Developer ID` → 簽了但公證沒過，把完整輸出留下來。

- [ ] **Step 3: 確認公證票據已釘在 app 上**

```bash
xcrun stapler validate /Applications/TypeLab.app
```

預期：`The validate action worked!`

這一步失敗但 Step 2 通過，代表公證有效但票據沒釘上——離線時 Gatekeeper 會擋。

- [ ] **Step 4: 確認是原生 arm64**

```bash
lipo -archs /Applications/TypeLab.app/Contents/MacOS/typelab
```

預期：`x86_64 arm64`

兩個都在代表這是 universal binary，Apple Silicon 上跑的是原生 arm64 而非 Rosetta。

- [ ] **Step 5: 雙擊打開**

最直接的驗收：不該出現「無法打開，因為 Apple 無法檢查其是否包含惡意軟體」。

- [ ] **Step 6: 測自動更新**

App 內 → 設定 → 檢查更新。

預期：抓到 `0.1.10`，下載、驗簽、安裝、重啟，版本變成 `0.1.10`。

macOS 的更新走的是 `TypeLab_universal.app.tar.gz` + `.sig`，跟 Windows 不同的路徑，所以 Task 6 通過不代表這裡會通過。要各測一次。

---

### Task 8: 把結果寫回 CLAUDE.md

**Files:**

- Modify: `CLAUDE.md` — **CI and releases** 開頭那段

**Interfaces:**

- Consumes: Task 6、Task 7 的實測結果
- Produces: 一句有日期、有版本號的驗證紀錄，取代目前那句沒有證據的宣稱

目前那段寫「The chain runs end to end as of v0.1.9」，但 v0.1.9 的更新鏈路從來沒被人真的走過一次。改成有實據的說法。

- [ ] **Step 1: 改寫那一段**

把 `CLAUDE.md` 裡這段：

```markdown
The chain runs end to end as of v0.1.9: commit → version bump → tag → three
signed desktop builds → container images → manifest check → published release →
an installed copy updates itself. Everything below is a step that broke on the
way there.
```

換成：

```markdown
The chain was walked end to end on v0.1.10: commit → version bump → tag →
three signed desktop builds → container images → manifest check → published
release → an installed copy on Windows and on an Apple Silicon Mac fetched,
verified and installed it. Everything below is a step that broke on the way
there.
```

任何一個 task 沒過就**不要**寫這句。寫下沒驗證過的宣稱，正是這份計畫要修掉的那個問題。

- [ ] **Step 2: 格式檢查**

```bash
npx prettier --check CLAUDE.md
```

預期：`All matched files use Prettier code style!`

- [ ] **Step 3: 提交（主旨不得含 marker）**

```bash
git add CLAUDE.md
git commit -m "Record that the release chain was walked, not assumed" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
```

機器人會把版本推到 `0.1.11` 但不會發版——`version.yml` 只在主旨含 marker 時打標籤。這是預期行為，不是錯誤。

---

## 做完之後

發版基礎設施到此為止。**下一步回到內容開發**，既有的計畫已經寫好但一行都還沒實作：

- [docs/superpowers/specs/2026-09-20-dictionary-downloads-spec.md](../specs/2026-09-20-dictionary-downloads-spec.md)
- [docs/superpowers/plans/2026-09-20-dictionary-downloads.md](./2026-09-20-dictionary-downloads.md)

那份計畫有九個 task，是純功能開發，不會再碰到 workflow、簽章或 release。

已知但刻意不做的事，不要再花時間：

| 項目                         | 為什麼不做                                                                 |
| ---------------------------- | -------------------------------------------------------------------------- |
| Windows / Linux ARM64 建置   | 每次發版多 16 分鐘，換一個還沒出現的需求。macOS 的 ARM 已由 universal 覆蓋 |
| 湊出 `0.2.0` 這種整數版本    | 機器人永遠再加一個 patch，要湊到就得改機制。版本號只是識別碼               |
| Windows code signing         | 每年 200–400 美元，且新憑證一開始照樣觸發 SmartScreen                      |
| 清掉那四個舊的 draft release | 不影響任何東西；`--latest` 只看已發布的                                    |
