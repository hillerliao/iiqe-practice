# IIQE App 部署到 VPS

> [!IMPORTANT]
> **本项目当前日常发布固定走“本机 build → SCP 上传构建产物 → VPS PM2 重启”路线。**
> 收到“部署 VPS”指令时，必须在本机运行 `npm run build`，确认成功后运行 `powershell.exe -ExecutionPolicy Bypass -File .\deploy-remote.ps1`。**不要改走 GitHub Actions，也不要在 VPS 上 build。** 除非用户明确要求切换部署架构，否则不得自行选择其他路线。

当前发布链路：

```text
本机 npm run build
  → deploy-remote.ps1 打包 .next 与运行时文件
  → SCP 上传至 ecs-user@39.103.59.145
  → VPS deploy-remote.sh 备份数据库、校验并原子替换
  → PM2 重启 iiqe-app
  → 输出部署前后数据库 audit
```

仓库也保留 **PM2 + GitHub Actions** 和 **Docker Compose** 配置，供未来迁移或灾备使用，但它们不是当前日常发布路线。不同路线的代码替换方式和数据库目录约定不同，不得交替执行；切换前必须明确获得用户授权并完成数据库迁移与验证。

---

## A. PM2 + GitHub Actions（推荐的 Git 拉取式发布）

发布链路如下：

```text
push main
  → GitHub Actions
  → SSH 调用 VPS 的 deploy-pm2-from-git.sh <commit-sha>
  → VPS fetch 指定提交、npm ci、Prisma generate、Next.js build
  → 备份 SQLite、同步 schema、seed、verify-storage
  → PM2 重载 iiqe-app，并检查 /api/papers
```

GitHub Actions **不在 Runner 构建应用**。构建发生在 VPS，符合“VPS 拉取代码并 build，再由 PM2 重启”的部署方式。

### A.1 重要前提

- Ubuntu 22.04+，使用普通部署用户，例如 `deploy`。
- Nginx 已将域名反代到 `127.0.0.1:3001`，并由 Certbot 管理 HTTPS。
- VPS 使用 Node.js **22**，与项目的 Docker / Vercel 运行时一致。
- 同一个 SQLite 应用只运行一个 PM2 fork 实例。不可横向扩展多个进程或多个主机。
- 项目当前没有受版本控制的 `prisma/migrations`。发布脚本因此使用 `prisma db push --accept-data-loss=false`：可能丢失数据的 schema 变化会失败而不会自动执行。未来应单独建立、审查并提交 migrations，再改为 `prisma migrate deploy`。

### A.2 VPS 首次初始化

以下命令以部署用户 `deploy` 和目录 `/home/deploy` 为例。替换为你的实际用户名。

```bash
# 1. 安装运行时和原生依赖的构建工具
sudo apt update
sudo apt install -y git curl build-essential python3

# 2. 安装 Node.js 22（也可改用 nvm；重点是 node --version 为 v22.x）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version

# 3. 安装 PM2
sudo npm install --global pm2
pm2 --version

# 4. 让 PM2 在服务器重启后恢复服务
pm2 startup systemd -u deploy --hp /home/deploy
# 按上一条命令输出的 sudo 命令执行一次。
```

为 VPS 创建一把**专用于从 GitHub 只读拉取此仓库**的 Deploy Key。不要复用 GitHub Actions 登录 VPS 的私钥。

```bash
sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/iiqe_github_readonly -C "iiqe-vps-readonly"
sudo -u deploy sh -c 'cat >> ~/.ssh/config <<"EOF"
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/iiqe_github_readonly
  IdentitiesOnly yes
EOF'
sudo -u deploy ssh-keyscan -H github.com >> /home/deploy/.ssh/known_hosts
```

将 `/home/deploy/.ssh/iiqe_github_readonly.pub` 的内容添加到 GitHub 仓库：

`Settings → Deploy keys → Add deploy key`

保持 **Allow write access 未勾选**。随后测试连接并克隆仓库：

```bash
sudo -u deploy ssh -T git@github.com
sudo -u deploy git clone git@github.com:<owner>/<repo>.git /home/deploy/iiqe-app
sudo -u deploy git -C /home/deploy/iiqe-app checkout main
```

创建不受 Git 管理的数据目录。脚本的默认目录与代码同级，分别保存私密环境变量、SQLite 文件、备份与 PM2 日志。

```bash
sudo -u deploy install -d -m 700 \
  /home/deploy/iiqe-shared \
  /home/deploy/iiqe-shared/data \
  /home/deploy/iiqe-shared/backups \
  /home/deploy/iiqe-shared/logs

sudo -u deploy cp /home/deploy/iiqe-app/.env.production.example \
  /home/deploy/iiqe-shared/.env.production
sudo -u deploy chmod 600 /home/deploy/iiqe-shared/.env.production
sudo -u deploy editor /home/deploy/iiqe-shared/.env.production
```

`.env.production` 至少应填入高熵的 `AUTH_SECRET` 和 `ADMIN_TOKEN`。`DATABASE_URL` 在 PM2 发布脚本中会被强制指向 `/home/deploy/iiqe-shared/data/prod.db`，因此不需要也不应将数据库放回仓库的 `prisma/` 目录。

生成密钥示例：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

首次构建与启动可在 VPS 手动执行。请把 `<main-commit-sha>` 改为 `main` 当前的完整 40 位提交 SHA：

```bash
cd /home/deploy/iiqe-app
git fetch origin main
git rev-parse origin/main
bash scripts/deploy-pm2-from-git.sh <main-commit-sha>
pm2 status iiqe-app
curl -fsS http://127.0.0.1:3001/api/papers > /dev/null && echo healthy
```

首次启动后，如需导入题库，发布脚本会执行幂等的 `prisma/seed.ts`。确保依赖的题库 JSON 已被纳入仓库或按该 seed 脚本的读取方式放置；不要把用户数据库存入 Git 工作目录。

### A.3 将已有 PM2 部署切换到此路径

你当前已有 PM2 服务时，先确定它实际使用的端口、工作目录、环境文件和数据库位置：

```bash
pm2 describe iiqe-app
pm2 env 0
pm2 logs iiqe-app --lines 100
```

在切换前停写并备份现有 SQLite 文件。**不要直接复制正在写入的 `.db` 文件**；优先在短暂维护窗口中停止该服务后复制：

```bash
pm2 stop iiqe-app
cp -a /现有/数据库/prod.db /home/deploy/iiqe-shared/data/prod.db
pm2 delete iiqe-app
```

确认新共享数据库路径的拥有者是部署用户，然后运行 A.2 的首次发布命令。Nginx 仍可继续代理 `127.0.0.1:3001`。

> 如果现有服务实际上是 Docker，请不要执行上述步骤。Docker 的命名卷需要先按 Docker 的备份/恢复方式导出，再在维护窗口显式导入 PM2 的共享目录。两种路径数据库位置不同。

### A.4 GitHub Actions 配置

提交的 `.github/workflows/deploy-vps.yml` 会在 `main` 有 push 时自动运行，也可在 `Actions → Deploy VPS → Run workflow` 手动运行。工作流有并发控制：新的 main 发布会取消尚未完成的旧发布。

在仓库 `Settings → Secrets and variables → Actions` 中配置：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Secret | `VPS_HOST` | VPS 域名或 IP 地址 |
| Secret | `VPS_USER` | 部署用户名，例如 `deploy` |
| Secret | `VPS_SSH_PRIVATE_KEY` | GitHub Actions 登录 VPS 的完整私钥 |
| Secret | `VPS_SSH_KNOWN_HOSTS` | VPS 主机公钥行，例如 `ssh-keyscan -H <host>` 的输出 |
| Secret | `VPS_SSH_PORT` | SSH 端口；默认 22 时可留空 |
| Variable（可选） | `VPS_APP_DIR` | VPS Git 工作目录；默认 `/home/<VPS_USER>/iiqe-app` |

为 Actions 单独创建 SSH 密钥，并把其公钥加入 VPS 部署用户的 `~/.ssh/authorized_keys`。建议使用受限 key，仅允许运行发布脚本，例如：

```text
command="/home/deploy/iiqe-app/scripts/deploy-pm2-from-git.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... github-actions-deploy
```

如果使用这个严格的 `command=` 限制，需要将工作流改成不传远程命令，或在 VPS 上包装一个仅接受 SHA 的受限命令。默认工作流会显式调用发布脚本，因此更简单的初始配置是仅限制 SSH 用户与密钥权限，并将该私钥仅用于此仓库的 Actions Secret。

GitHub Actions 到 VPS 的密钥仅负责 SSH 登录；VPS 从 GitHub `git fetch` 使用 A.2 配置的只读 Deploy Key。这两个凭证必须分离。

### A.5 运行机制与安全边界

`scripts/deploy-pm2-from-git.sh` 会：

1. 使用 `flock` 防止并发部署。
2. `git fetch origin main`，验证收到的 SHA 是 `origin/main` 可达提交，再精确 reset 到该 SHA。
3. 执行 `npm ci`、显式 `prisma generate` 和 `npm run build`。任何一步失败，当前 PM2 服务不会被重启。
4. 构建成功后，通过 SQLite 的在线 backup API 备份现有数据库到 `~/iiqe-shared/backups/`，默认保留最近 14 份。
5. 使用不接受数据丢失的 `prisma db push` 同步 schema，随后执行 seed 和 `verify-storage`。
6. 使用 `ecosystem.config.cjs` 的单进程 fork 模式 `pm2 startOrReload --update-env`，并检查本机 `/api/papers`。
7. **部署前后记录 prod.db 快照**：通过 `scripts/deploy-audit.ts` 在 `git reset` 之前与 PM2 reload 之后各采样一次，输出 Paper / Question / Attempt / Answer / Favorite / Note / Feedback 的行数与按 sessionId 的明细，保存到 `$SHARED_DIR/audit/`。post 阶段会与 pre 对比打印 diff。
   - 看到 attempt/answer 行数变化时不必惊慌：deploy 期间用户继续作答属于正常噪音。比对的意义在于「是否出现 row count 跳崖式下跌（数据丢失）」，而不是「数字必须严格一致」。

这不是严格的零停机发布：单个 Next.js/SQLite 进程重载会有极短暂的请求切换。其优先保证是：构建或 schema 校验失败不会中断旧进程；数据不随 Git 代码目录被清理。

### A.6 日常操作、回滚与排障

```bash
# 查看应用和日志
pm2 status iiqe-app
pm2 logs iiqe-app --lines 200
journalctl --user -u pm2-deploy -n 100 --no-pager  # 若系统实际 unit 名称不同，以 pm2 startup 输出为准

# 手动重试部署某个 main 上的提交
cd /home/deploy/iiqe-app
bash scripts/deploy-pm2-from-git.sh <40-character-main-commit-sha>

# 查看当前线上代码提交
cd /home/deploy/iiqe-app
git rev-parse HEAD

# 查看数据库备份
ls -lht /home/deploy/iiqe-shared/backups/

# 查看最近一次 deploy 的 prod.db 快照与 diff
ls -lht /home/deploy/iiqe-shared/audit/
cat /home/deploy/iiqe-shared/audit/last.json
```

回滚应在维护窗口进行：从 GitHub 找到一个仍属于 `main` 历史的已知良好提交，手动用该 SHA 调用发布脚本。脚本拒绝部署不属于当前 `origin/main` 历史的提交。若 schema 或数据已变化，先保留当前数据库备份，再评估是否恢复对应的 SQLite 备份；代码回滚本身不自动回滚数据库 schema。

常见问题：

- **`Permission denied (publickey)`，发生在 `git fetch`**：检查 VPS 上 `/home/deploy/.ssh/config`、Deploy Key、`known_hosts` 和 `sudo -u deploy ssh -T git@github.com`。
- **构建时 native module 失败**：确认 Node 22、`build-essential`、`python3` 和可访问的 npm registry。
- **`database is locked`**：确认只运行一个 `iiqe-app` PM2 实例，且没有同时运行旧 Docker 容器或另一个维护脚本。
- **Nginx 返回 502**：先运行 `pm2 status iiqe-app`、`pm2 logs iiqe-app --lines 200`，然后检查 `curl http://127.0.0.1:3001/api/papers`。
- **工作流 SSH 失败**：重新生成并更新 `VPS_SSH_KNOWN_HOSTS`，不要为了通过部署而关闭 `StrictHostKeyChecking`。

---

## B. Docker Compose（既有容器路径）

若选择 Docker 路径，请遵循本节，且不要配置或运行 A 节的 PM2 服务。

### B.1 前置条件

VPS 需要 Docker Engine 24+、Docker Compose plugin、Git、Nginx、Certbot 和 nginx 插件。域名 A 记录指向 VPS，云安全组/防火墙仅公开 80 和 443。

### B.2 首次部署

```bash
ssh <your-username>@<your-vps-ip>
cd /home/<your-username>
git clone <your-repo-url> iiqe-app
cd iiqe-app
cp .env.production.example .env.production
$EDITOR .env.production
```

填入至少：

```ini
DATABASE_URL=file:/data/prod.db
UID=1000
GID=1000
AUTH_SECRET=<随机 32 字节以上字符串>
ADMIN_TOKEN=<高熵随机值>
```

编辑 `nginx/iiqe.conf`，将 `your-domain.example.com` 改为真实域名，然后：

```bash
sudo cp nginx/iiqe.conf /etc/nginx/conf.d/iiqe.conf
sudo cp -r nginx/snippets /etc/nginx/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <your-domain> --email <your-email> --agree-tos --no-eff-email

docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:3001/api/papers > /dev/null && echo healthy
```

> 当前 Dockerfile 需要显式执行 `prisma generate` 才能从干净 checkout 生成被 Git 忽略的 Prisma client。Docker 路径投入使用前，应先修复并验证该构建步骤；不要因 `DEPLOY.md` 的旧文档而假定 `npm ci` 有 Prisma postinstall。

Docker 的数据在 `iiqe-data` named volume 中。更新代码时：

```bash
cd /home/<your-username>/iiqe-app
git pull
docker compose up -d --build
```

不要因为更新镜像而删除 `iiqe-data` volume；删除前必须完成可恢复备份。

---

## C. 当前日常发布：本机构建并上传

这是当前唯一默认的日常部署路线。除非用户明确要求迁移架构，否则“部署 VPS”始终指本节流程，不指 A 节 GitHub Actions，也不指 B 节 Docker。

### C.1 标准命令

在 Windows 项目根目录执行：

```powershell
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
powershell.exe -ExecutionPolicy Bypass -File .\deploy-remote.ps1
```

不得跳过本机 build，也不得用旧 `.next` 部署。`deploy-remote.ps1` 会将当前工作区的 `.next`、运行时源码、题库数据、Prisma 文件和依赖清单打包上传，因此它可以发布尚未提交的本地修改；执行前应确认这些修改都是本次计划上线的内容。

### C.2 脚本行为与验收

1. `deploy-remote.ps1` 检查 `.next`，打包 `iiqe-runtime-update.tar.gz` 并上传到 `ecs-user@39.103.59.145`。
2. VPS 上的 `deploy-remote.sh` 在替换应用前对 SQLite 做在线一致性备份，并保留上一版运行目录用于回滚。
3. 新运行目录执行 Prisma generate、非破坏性 schema push、幂等 seed、题目去重和 storage verification；任一关键检查失败则不替换线上应用。
4. 校验通过后原子替换目录、重启 `iiqe-app`，并输出 PM2 状态与部署前后数据库 audit。
5. 部署成功必须同时看到 `deploy OK`、PM2 `online` 和 post-flight audit；不能仅以 SCP 上传成功作为完成依据。

### C.3 路线防误用

- **不要触发 `.github/workflows/deploy-vps.yml`**：该流程会让 VPS 从 Git 拉代码并在 VPS build，不是当前路线，也不会包含未提交的本地修改。
- **不要运行 `scripts/deploy-pm2-from-git.sh`**：它会 `git reset --hard` 与 `git clean -ffd`，且使用另一套共享数据库目录约定。
- **不要执行 Docker Compose 部署**：Docker 使用 named volume，数据库位置与当前 PM2 上传路线不同。
- 如果本机 build 失败，停止部署并修复；不得退回旧 `.next`，也不得临时改走 VPS build 绕过错误。
