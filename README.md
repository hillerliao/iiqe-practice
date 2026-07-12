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
| `ADMIN_ID` | 管理員 sessionId(完整值,需含 `user:` 前綴)。詳見下方「管理員認證」一節 | 空(關閉管理員功能) |

## 管理員認證

本應用沒有登入系統,管理員身份透過 `process.env.ADMIN_ID` 比對識別。**該值只在服務端存在,客戶端永遠拿不到**。

啟用步驟:

1. 在 `.env` / `.env.production` 設定:
   ```
   ADMIN_ID=user:your-secret-handle
   ```
2. 在 `/settings` 把識別碼自訂為同一個值(必須完全一致,含 `user:` 前綴)。
3. 訪問 `/admin/questions`,管理員視圖生效。

UI 不會告訴訪客如何成為管理員;普通使用者只會看到「無權限訪問,請聯繫系統管理員」。

部署到 VPS 前,務必:
- 在 `.env.production` 設定與本地不同的 `ADMIN_ID`(不要把開發環境的值復用上去)
- 若曾以 `vercel env pull` 把 `EDGE_CONFIG` / `VERCEL_OIDC_TOKEN` 拉到本地 `.env.production`,請到 Vercel Dashboard 撤銷並重新生成

## 部署

生產環境以 Docker + nginx + certbot 部署到任意 Linux VPS,支援自動 HTTPS 與零停機升級。

完整部署文檔見 [DEPLOY.md](./DEPLOY.md),涵蓋:
- VPS 前置條件(Docker、DNS、防火牆)
- 首次部署步驟
- 升級流程
- 數據備份與恢復
- 故障排查

快速一覽(完整步驟見 DEPLOY.md):
```bash
git clone <repo-url> iiqe-app && cd iiqe-app
cp .env.production.example .env.production
$EDITOR .env.production

sed -i 's/your-domain.example.com/<your-domain>/g' nginx/iiqe.conf
sudo cp nginx/iiqe.conf /etc/nginx/conf.d/iiqe.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <your-domain> --email <your-email> --agree-tos --no-eff-email

docker compose up -d --build
docker compose --profile init run --rm migrate
curl -I https://<your-domain>
```
