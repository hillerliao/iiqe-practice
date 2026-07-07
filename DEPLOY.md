# 部署到 VPS

本文檔介紹如何把 IIQE App 部署到一台阿里雲 Ubuntu VPS。

架構:
- **宿主 nginx**(已預裝):反向代理 + HTTPS 終結 + certbot 證書管理
- **next-app 容器**:Next.js 16 + Prisma 7 + SQLite,監聽 `127.0.0.1:3001`
- **SQLite** 文件:Docker named volume `iiqe-data`,持久化在宿主

---

## 0. 前置條件

### VPS 端
- 系統:Ubuntu 22.04+ (推薦 24.04)
- 用戶:`ecs-user`(阿里雲 Ubuntu 默認用戶),具備 `sudo` 權限
- 已裝:
  - Docker Engine 24+
  - Docker Compose plugin(`docker compose version` 可用)
  - Git
  - **nginx**(`/etc/nginx/conf.d/` 風格,已有其他站共存)
  - **certbot + nginx 插件**(`apt install certbot python3-certbot-nginx`)

### 網絡
- 域名 A 記錄指向 VPS 公網 IP
- 阿里雲安全組放行 **80 / 443** 端口

---

## 1. 首次部署

### 1.1 SSH 登入 VPS 並確認環境

```bash
ssh ecs-user@<your-vps-ip>

id ecs-user              # 確認 uid(預期 1000)
docker --version
docker compose version
nginx -v                 # 確認 nginx 已裝
certbot --version        # 確認 certbot 已裝
```

### 1.2 拉取代碼

```bash
cd /home/ecs-user
git clone <your-repo-url> iiqe-app
cd iiqe-app
```

### 1.3 配置 `.env.production`

```bash
cp .env.production.example .env.production
$EDITOR .env.production
```

填入:
```ini
DATABASE_URL=file:/data/prod.db
UID=1000
GID=1000
AUTH_SECRET=<隨機 32 字元以上字符串>
```

`DOMAIN` / `LETSENCRYPT_EMAIL` 僅作記錄用,**容器內不讀取**。

### 1.4 安裝 nginx 站點 + 申請證書

```bash
# 1. 把 nginx/iiqe.conf 裡的 your-domain.example.com 改成真實域名
sed -i 's/your-domain.example.com/你的真實域名/g' nginx/iiqe.conf

# 2. 安裝站點(此時只有 HTTP 段,先 reload nginx)
#    連同 snippets/ 一起拷貝,include 才能找到 header 片段
sudo cp nginx/iiqe.conf /etc/nginx/conf.d/iiqe.conf
sudo cp -r nginx/snippets /etc/nginx/
sudo nginx -t && sudo systemctl reload nginx

# 3. 一鍵申請證書 + 自動補上 HTTPS 段 + 80→443 跳轉
sudo certbot --nginx -d 你的真實域名 --email 你的郵箱 --agree-tos --no-eff-email
```

`certbot --nginx` 會自動:
- 申請並部署 Let's Encrypt 證書
- 在 `iiqe.conf` 裡加一個 `server { listen 443 ssl; ... }` 塊(連同 `include snippets/iiqe-headers.conf;` 一起複製)
- 把 80 端口的 `location /` 改成 `301 https://$host$request_uri`

執行後檢查:
```bash
sudo nginx -t
sudo cat /etc/nginx/conf.d/iiqe.conf    # 應該看到 HTTPS 段和 snippets include
```

### 1.5 配置自動續期

certbot 安裝時會自動創建 systemd timer。確認:

```bash
sudo systemctl list-timers | grep certbot
# 應看到 certbot.timer,下次執行時間 < 90 天

# 手動測試續期(不會真的續)
sudo certbot renew --dry-run
```

---

## 1.6 構建並啟動容器

```bash
docker compose up -d --build
```

> 首次構建耗時較長(~5-10 分鐘),因 `better-sqlite3` 需要下載 prebuild 或源碼編譯。後續構建會利用 Docker layer cache,只需數十秒。

### 1.7 執行首次數據庫遷移

```bash
docker compose --profile init run --rm migrate
```

看到類似輸出即成功:
```
3 migrations found in prisma/migrations
Applying migration 20260703082945_init
Applying migration 20260706111741_add_note
All migrations applied successfully.
```

### 1.8 (可選)導入題庫

若首次部署且 SQLite 為空,需導入初始題目。

**模擬題**(`scripts/mock_p1.json`、`scripts/mock_p3.json`)已在鏡像內,可直接導入。
**真題**(`../.cache_paper1.json`、`../_p3_clean.json`)位於專案父目錄,
不在 Docker build context 內,**需手動 cp 進容器**:

```bash
# 1. 把真題 JSON 上傳到 VPS(若尚未上傳)
scp .cache_paper1.json ecs-user@<vps>:/home/ecs-user/iiqe-app/
scp _p3_clean.json ecs-user@<vps>:/home/ecs-user/iiqe-app/

# 2. 複製到容器內(seed.ts 從 /app/../ 即 /app/ 讀取)
docker cp .cache_paper1.json iiqe-app:/app/.cache_paper1.json
docker cp _p3_clean.json iiqe-app:/app/_p3_clean.json

# 3. 執行 seed
docker compose exec next-app npx tsx prisma/seed.ts
```

> seed.ts 找不到檔案時會自動跳過,不影響已有數據。若只導入模擬題,直接執行第 3 步即可。

### 1.9 驗證

```bash
# 查看容器狀態(應為 Up / healthy)
docker compose ps

# 健康檢查(從宿主測容器端口)
curl -s http://127.0.0.1:3001/api/papers | head

# 外部訪問
curl -I https://your-domain.com
```

---

## 2. 升級

```bash
cd /home/ecs-user/iiqe-app
git pull
docker compose up -d --build
# 僅在 schema 變更時:
docker compose --profile init run --rm migrate
```

`iiqe-data` volume 不會被刪除,SQLite 數據保留。

---

## 3. 數據備份與恢復

### 備份

```bash
docker compose exec next-app cp /data/prod.db /data/prod.db.bak
docker cp iiqe-app:/data/prod.db.bak ./prod-$(date +%F).db
docker compose exec next-app rm /data/prod.db.bak
```

### 恢復

```bash
docker compose stop next-app
docker cp ./prod-2026-07-07.db iiqe-app:/data/prod.db
docker compose start next-app
```

### 建議:自動化備份

在 VPS 上加 cron job,每天凌晨把 SQLite 拷貝到對象存儲(OSS / S3)。本文檔不展開。

---

## 4. 故障排查

### 4.1 502 Bad Gateway

**症狀**:訪問 https://your-domain.com 返回 502。

**原因**:nginx 反代的 `127.0.0.1:3001` 沒人接 — `next-app` 容器沒在跑。

**排查**:
```bash
docker compose ps
docker compose logs --tail=200 next-app

# 直接測容器是否監聽
curl -I http://127.0.0.1:3001/api/papers
```

### 4.2 next-app 容器反覆重啟

**症狀**:`docker compose ps` 顯示 `iiqe-app` 狀態為 `Restarting`。

**排查**:
```bash
docker compose logs --tail=200 next-app
```

常見原因:
- `Error: P1001 Can't reach database server`:`/data` volume 未掛載或 DATABASE_URL 路徑錯
- `Error: P3009 migrate found failed migrations`:跳過了 migrate 步驟。執行:
  ```bash
  docker compose --profile init run --rm migrate
  ```

### 4.3 證書過期 / HTTPS 失效

**症狀**:瀏覽器提示證書過期。

**排查**:
```bash
# 證書有效期
sudo certbot certificates

# 手動續期
sudo certbot renew

# 確認 systemd timer 正常
sudo systemctl status certbot.timer
```

### 4.4 certbot 申請失敗

**症狀**:`sudo certbot --nginx -d your-domain.com` 報錯(常見:`Challenge failed for domain`、`Timeout during connect`)。

**排查**:
```bash
# 確認 DNS 解析正確
dig +short your-domain.com

# 確認 80 端口從公網可達,且返回的是這台 nginx(而非默認站)
curl -I http://your-domain.com/

# 看 nginx 錯誤日誌
sudo tail -50 /var/log/nginx/iiqe.error.log

# 手動乾跑,看詳細錯誤
sudo certbot --nginx -d your-domain.com --email your-email --agree-tos --no-eff-email --dry-run
```

常見原因:
- DNS A 記錄尚未生效
- 阿里雲安全組未放行 80
- `nginx -t` 之後忘記 `systemctl reload nginx`,nginx 還在用舊站點

### 4.5 SQLite "database is locked"

**症狀**:API 返回 500,日誌含 `database is locked`。

**原因**:多個進程同時寫 SQLite。當前 docker-compose 設計只跑單個 `next-app` 進程,理論上不會發生。若發生:
- 確認沒有意外啟動了 `migrate` 容器仍在運行(`docker ps`)
- 重啟 `next-app`:`docker compose restart next-app`

### 4.6 volume 權限錯誤

**症狀**:`next-app` 啟動日誌含 `EACCES` 或 `permission denied` 涉及 `/data/prod.db`。

**修復**:
```bash
id ecs-user
# 編輯 .env.production 設 UID/GID 為該值

# 重建容器,並重建 volume(會丟失現有數據,請先備份!)
docker compose down
docker volume rm iiqe-data
docker compose up -d --build
docker compose --profile init run --rm migrate
docker compose exec next-app npx tsx prisma/seed.ts   # 若需要重新導入題庫
```

---

## 5. 卸載

```bash
cd /home/ecs-user/iiqe-app
docker compose down --remove-orphans
docker image rm iiqe-app:latest

# 刪除 SQLite(會丟失數據,請先備份)
docker volume rm iiqe-data

# 刪除 nginx 配置(可選)
sudo rm /etc/nginx/conf.d/iiqe.conf
sudo systemctl reload nginx

# 刪除證書(可選)
sudo certbot delete --cert-name your-domain.example.com

# 刪除代碼
cd /home/ecs-user
rm -rf iiqe-app
```

---

## 6. 安全建議

1. **SSH**:VPS 關閉密碼登錄,僅允許密鑰;必要時改 SSH 端口
2. **防火牆**:阿里雲安全組僅放行 80/443;VPS 本地用 ufw 進一步收緊
3. **自動更新**:Ubuntu 啟用 `unattended-upgrades`
4. **密鑰輪換**:定期更換 `AUTH_SECRET`(目前應用未使用,留作日後)
5. **HTTPS 強制**:已通過 80 → 301 HTTPS 跳轉實現
6. **密鑰管理**:`.env.production` 不進 git;定期從 Vercel 後台清理舊 token

---

## 7. 進階(可選,本文檔不展開)

- CI/CD:GitHub Actions 推送觸發自動部署
- 監控:Prometheus + Grafana + cAdvisor,或 UptimeRobot 外網探活
- 數據庫遷移到 PostgreSQL(若用戶量上升,SQLite 寫入性能成為瓶頸)
- 加 WAF(如 Cloudflare 代理)