# 分支規範：本 repo 為【第 3 種：自有專案】

> 完整規範：[分支規範：三種 repo 類型](https://linear.app/elf-express/document/分支規範三種-repo-類型貢獻型-fork私有-fork自有專案-128bf6e5e1f9)（Linear）
> 本檔只記錄這個 repo 的設定。人與 AI 動手前請先讀完本檔。

## 本 repo 資訊

| 項目                | 值                                                                               |
| ------------------- | -------------------------------------------------------------------------------- |
| 類型                | 第 3 種：自有專案（沒有上游）                                                    |
| 本 repo（`origin`） | `TW199501/TypingTrainer`（個人帳號，不在 `elf-express` 組織底下）                |
| 部署位置            | GitHub Releases（三平台桌面安裝檔與自動更新清單）、GHCR（`api`、`web` 容器映像） |

## 分支用途

| 分支                                        | 用途                 | 可否提交             | 從哪裡更新    |
| ------------------------------------------- | -------------------- | -------------------- | ------------- |
| `main`                                      | 主庫，只用來同步     | **不提交，只快轉**   | `release`     |
| `dev`                                       | 整合測試（預設分支） | 只能經由開發分支合併 | —             |
| `feat/`、`fix/`、`docs/`、`chore/`、`test/` | 開發                 | 可以                 | 從 `dev` 開出 |
| `release`                                   | 唯一的穩定版，部署用 | **不提交，只快轉**   | 測過的 `dev`  |

開發分支命名 `<類型>/e-<Linear 編號>-<英文短名>`，例如 `feat/e-211-standalone-backend`。

## 常用指令

開發：

```
git fetch origin
git switch -c feat/e-<編號>-<短名> origin/dev
```

發佈（`dev` 測試通過後）：

1. 在開發分支上 `npm run version:patch`（或 `version:minor`、`version:major`），提交 `chore(release): vX.Y.Z`，經 PR 合進 `dev`。
2. 快轉 `release`：

   ```
   git fetch origin
   git log --oneline origin/release..origin/dev   # 先列出會帶進去的提交，給使用者確認
   git switch release
   git merge --ff-only origin/dev
   git push origin release
   ```

3. 確認 `release` 指向的提交 CI 全綠後，在 `release` 上打 annotated tag，由人推送（tag 觸發 `release.yml`）：

   ```
   git tag -a vX.Y.Z -m "TypeLab vX.Y.Z" origin/release
   git push origin vX.Y.Z
   ```

更新主庫：

```
git fetch origin
git log --oneline origin/main..origin/release   # 先列出會帶進去的提交
git switch main
git merge --ff-only origin/release
git push origin main
```

## 分支保護設定

repo 在個人帳號底下，組織 ruleset 套不到，改用 repo 層 ruleset：

- **`main` 與 `release`**：禁止 force push、禁止刪除。**不要**設「必須經過 Pull Request」：這兩條分支是在本機 `merge --ff-only` 後直接 push 的，GitHub 的 PR 合併會產生新提交或新 SHA，無法快轉。
- **`dev`**：禁止 force push、禁止刪除；開發分支一律經 PR 合併，維護者保留直接 push 權限。

## 禁止事項

- 不在 `main`、`release` 上提交，也不 force push。
- 不把 `main` 當穩定版或部署來源；部署一律用 `release`。
- 不直接在 `dev` 上開發。
- 不讓 bot 或 workflow 提交到 `dev`、`release`、`main`，也不由 workflow 推 tag。
- `--ff-only` 失敗或合併有衝突時，停下來回報，不要自行處理。
