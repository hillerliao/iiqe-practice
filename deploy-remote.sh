#!/usr/bin/env bash
# VPS 运行时更新脚本:在生产主机上由 deploy-remote.ps1 通过 SSH 拉起。
#
# 设计目标:零停机、零数据丢失、零 schema 破坏。
# 流程:
#   1) 解压本地上传的 iiqe-runtime-update.tar.gz(.next / public / scripts / prisma / 配置)
#   2) 备份现有 prisma/prod.db 到 backups/prod.<timestamp>.db
#   3) 装配 iiqe-app-runtime-new(暂不替换 iiqe-app)
#   4) 切到新目录 → npm ci --omit=dev → prisma generate
#   5) prisma db push(若失败立即 abort 并回滚)
#   6) tsx prisma/seed.ts(从 data/*.json 幂等 upsert Paper/Question)
#   7) 跑 scripts/verify-storage.ts 作为健康检查,失败立即 abort
#   8) 用 iiqe-app-runtime-new 替换 iiqe-app(旧的移到 iiqe-app-prev 留作回滚)
#   9) pm2 restart iiqe-app + pm2 status
#  10) 失败时打印 iiqe-app-prev 路径提示回滚

set -euo pipefail

ROOT="/home/ecs-user"
APP="$ROOT/iiqe-app"
BACKUP_DIR="$ROOT/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

cd "$ROOT"

echo "---[1/9] unpack---"
rm -rf iiqe-update-new
mkdir -p iiqe-update-new
tar -xzf iiqe-runtime-update.tar.gz -C iiqe-update-new
ls -la iiqe-update-new

echo "---[2/9] backup prod.db---"
mkdir -p "$BACKUP_DIR"
if [ -f "$APP/prisma/prod.db" ]; then
  cp -a "$APP/prisma/prod.db" "$BACKUP_DIR/prod.${TIMESTAMP}.db"
  echo "backup: $BACKUP_DIR/prod.${TIMESTAMP}.db"
else
  echo "no existing prod.db; skip backup"
fi

echo "---[3/9] stage runtime-new---"
rm -rf iiqe-app-runtime-new
mkdir -p iiqe-app-runtime-new
# 复制所有必需运行时文件;.next 是构建产物,public 是静态资源,prisma 是 schema 源
for item in .next public scripts prisma data lib app components package.json package-lock.json next.config.ts tsconfig.json; do
  if [ -e "iiqe-update-new/$item" ]; then
    cp -a "iiqe-update-new/$item" "iiqe-app-runtime-new/"
  fi
done
ls -la iiqe-app-runtime-new

# 保留旧 prod.db(node_modules 会随 npm ci 重新装,prod.db 不在 tar 里)
if [ -f "$APP/prisma/prod.db" ]; then
  cp -a "$APP/prisma/prod.db" "iiqe-app-runtime-new/prisma/prod.db"
fi
# 保留 .env.production / .env(VPS 运行时配置)
if [ -f "$APP/.env.production" ]; then
  cp -a "$APP/.env.production" "iiqe-app-runtime-new/.env.production"
fi
if [ -f "$APP/.env" ]; then
  cp -a "$APP/.env" "iiqe-app-runtime-new/.env"
fi

cd iiqe-app-runtime-new

echo "---[4/9] npm ci + prisma generate---"
# --omit=dev 不装 devDeps;生产只需要 next + 运行时依赖
npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -20
npx prisma generate 2>&1 | tail -10

echo "---[5/9] prisma db push (non-destructive)---"
# 关键守门:db push 会先比对 schema 与 DB,如果检测到可能丢数据的破坏性变更,
# 它会要求确认。我们传入 --accept-data-loss=false 让它在破坏性 diff 上失败,
# 让人工介入而不是默认执行。
DATABASE_URL="${DATABASE_URL:-file:./prisma/prod.db}" npx prisma db push --accept-data-loss=false --skip-generate 2>&1 | tail -30

echo "---[6/9] prisma seed (idempotent)---"
DATABASE_URL="${DATABASE_URL:-file:./prisma/prod.db}" npx tsx prisma/seed.ts 2>&1 | tail -20

echo "---[7/9] health check: verify-storage---"
DATABASE_URL="${DATABASE_URL:-file:./prisma/prod.db}" npx tsx scripts/verify-storage.ts 2>&1 | tail -40
VERIFY_EXIT=$?
if [ "$VERIFY_EXIT" -ne 0 ]; then
  echo "!!! verify-storage FAILED (exit=$VERIFY_EXIT); aborting swap. iiqe-app-prev preserved for rollback."
  exit 1
fi

cd "$ROOT"

echo "---[8/9] atomic swap---"
if [ -d "$APP" ]; then
  if [ -d "$APP-prev" ]; then
    rm -rf "$APP-prev"
  fi
  mv "$APP" "$APP-prev"
fi
mv iiqe-app-runtime-new "$APP"
echo "swap done; previous app preserved at $APP-prev"

cd "$APP"

echo "---[9/9] pm2 restart---"
pm2 restart iiqe-app 2>&1 || pm2 start npm --name iiqe-app -- run start -- -p 3001 2>&1
pm2 save
sleep 2
pm2 status iiqe-app

echo "---ok---"
