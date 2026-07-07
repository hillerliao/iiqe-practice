# 部署到 VPS

本文檔介紹如何把 IIQE App 部署到一台阿里雲 Ubuntu VPS。

架構:
- **宿主 nginx**(已預裝):反向代理 + HTTPS 終結 + certbot 證書管理
- **next-app 容器**:Next.js 16 + Prisma 7 + SQLite,監聽 `127.0.0.1:3000`
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
  - **certbot**(`apt install certbot`)

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

### 1.4 申請 HTTPS 證書(certbot webroot 模式)

```bash
# 1. 創建 webroot 目錄
sudo mkdir -p /var/www/letsencrypt
sudo chown ecs-user:ecs-user /var/www/letsencrypt

# 2. 安裝 nginx 站點配置
#    先把 nginx/iiqe.conf 裡的 your-domain.example.com 改成真實域名
sed -i 's/your-domain.example.com/你的真實域名/g' nginx/iiqe.conf

# 拷貝到 nginx
sudo cp nginx/iiqe.conf /etc/nginx/conf.d/iiqe.conf

# 3. 測試配置(此時還沒證書,可能報錯,先做臨時佔位)
sudo nginx -t
```

若 `nginx -t` 報「無法加載證書」,先用佔位自簽證書讓 nginx 啟動:

```bash
sudo mkdir -p /etc/ssl/private
sudo openssl req -x509 -nodes -days 1 \
    -newkey rsa:2048 \
    -keyout /etc/ssl/private/iiqe-selfsigned.key \
    -out /etc/ssl/private/iiqe-selfsigned.crt \
    -subj "/CN=placeholder"

# 臨時把證書路徑改為自簽證書
sudo sed -i 's|/etc/letsencrypt/live/.*/fullchain.pem|/etc/ssl/private/iiqe-selfsigned.crt|' /etc/nginx/conf.d/iiqe.conf
sudo sed -i 's|/etc/letsencrypt/live/.*/privkey.pem|/etc/ssl/private/iiqe-selfsigned.key|' /etc/nginx/conf.d/iiqe.conf

sudo nginx -t && sudo systemctl reload nginx

# 4. 申請 Let's Encrypt 證書
sudo certbot certonly --webroot \
    -w /var/www/letsencrypt \
    -d 你的真實域名 \
    --email 你的郵箱 \
    --agree-tos \
    --no-eff-email

# 5. 把證書路徑改回 Let's Encrypt 位置
sudo sed -i 's|/etc/ssl/private/iiqe-selfsigned.crt|/etc/letsencrypt/live/你的真實域名/fullchain.pem|' /etc/nginx/conf.d/iiqe.conf
sudo sed -i 's|/etc/ssl/private/iiqe-selfsigned.key|/etc/letsencrypt/live/你的真實域名/privkey.pem|' /etc/nginx/conf.d/iiqe.conf

sudo nginx -t && sudo systemctl reload nginx
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

若首次部署且 SQLite 為空,需導入初始題目:

```bash
# 把題庫 JSON 上傳到 VPS 後(見 README.md「題庫資料來源」章節)
docker compose exec next-app npx tsx prisma/seed.ts
```

### 1.9 驗證

```bash
# 查看容器狀態(應為 Up / healthy)
docker compose ps

# 健康檢查
docker compose exec next-app wget -qO- http://localhost:3000/api/papers | head

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

**原因**:nginx 反代的 `127.0.0.1:3000` 沒人接 — `next-app` 容器沒在跑。

**排查**:
```bash
docker compose ps
docker compose logs --tail=200 next-app

# 直接測容器是否監聽 3000
curl -I http://127.0.0.1:3000/api/papers
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

**症狀**:`certbot certonly --webroot` 報錯。

**排查**:
```bash
# 確認 80 端口從公網可達
curl -I http://your-domain.com/.well-known/acme-challenge/test

# 確認 DNS 解析正確
dig +short your-domain.com

# 確認 webroot 目錄存在且 nginx 用戶可讀
ls -ld /var/www/letsencrypt
```

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