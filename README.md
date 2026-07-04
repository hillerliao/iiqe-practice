# IIQE 刷題

香港保險業監管局 IIQE 考試考古題與模擬題練習應用。個人複習用。

## 功能

- 卷一（保險原理及實務）/ 卷三（長期保險）真題與模擬題練習
- 計時作答、打亂題序、自選題數
- 即時答對/答錯回饋與解析
- 錯題本（自動彙整答錯的題）
- 收藏題
- 統計表現（總正確率、各章節/卷別表現、近期作答紀錄）

## 技術棧

- Next.js 16 (App Router) + React 19
- Prisma 7 + SQLite (better-sqlite3 driver adapter)
- Tailwind CSS v4 + shadcn/ui

## 快速開始

```bash
# 1. 安裝依賴（postinstall 會自動執行 prisma generate）
npm install

# 2. 複製環境設定
cp .env.example .env

# 3. 執行資料庫 migration
npx prisma migrate dev

# 4. 灌入題庫資料（需備妥題庫 JSON，見下方說明）
npm run db:seed

# 5. 啟動開發伺服器
npm run dev
```

打開 http://localhost:3000

## 題庫資料來源

`npm run db:seed` 會讀取以下檔案（檔案不存在會自動跳過）：

| 卷別 | 來源 | 檔案路徑 |
|------|------|---------|
| P1 真題 | 2021年版 | `../.cache_paper1.json`（專案上層目錄） |
| P1 模擬題 | 2025模擬試題 | `scripts/mock_p1.json` |
| P3 真題 | 2022年版 | `../_p3_clean.json`（專案上層目錄） |
| P3 模擬題 | 2025模擬試題 | `scripts/mock_p3.json` |

PDF 題庫的提取腳本見 `scripts/` 目錄下的 Python 檔。

## 資料模型

- `Paper` — 卷別（P1、P3...）
- `Question` — 題目（歸屬卷別、真題/模擬題來源）
- `Attempt` — 一次作答 session
- `Answer` — 單題作答紀錄
- `Favorite` — 收藏

無登入系統，以瀏覽器 `localStorage` 的 `sessionId` 識別使用者。

## 環境變數

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `DATABASE_URL` | SQLite 資料庫路徑 | `file:./prisma/dev.db` |
