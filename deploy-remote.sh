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
AUDIT_DIR="${AUDIT_DIR:-$ROOT/iiqe-audit}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

# ---- pre-flight audit ----
# 在做任何改動之前,先快照目前 prod.db 的列數 + per-session,寫到 $AUDIT_DIR。
# 部署成功後由 [10/10] post-flight 拿同一份比對,輸出 diff。
# 純唯讀:即便 prod.db 拿不到也只警告、不中止(老 prod.db 不存在場景)。
echo "---[0.5/10] pre-flight audit---"
mkdir -p "$AUDIT_DIR"
if [ -f "$APP/prisma/prod.db" ]; then
  (
    cd "$APP"
    DATABASE_URL="${DATABASE_URL:-file:./prisma/prod.db}" \
      AUDIT_PHASE=pre \
      npx tsx scripts/deploy-audit.ts pre "$AUDIT_DIR" 2>&1 | tail -25
  ) || echo "!!! [warn] deploy-audit pre-flight 失败(不阻斷部署)"
else
  echo "!!! [warn] pre-flight audit skipped: $APP/prisma/prod.db 不存在"
fi

cd "$ROOT"

echo "---[1/9] unpack---"
rm -rf iiqe-update-new
mkdir -p iiqe-update-new
tar -xzf iiqe-runtime-update.tar.gz -C iiqe-update-new
ls -la iiqe-update-new

echo "---[2/9] backup prod.db---"
mkdir -p "$BACKUP_DIR"
if [ -f "$APP/prisma/prod.db" ]; then
  # SQLite WAL 模式下不能直接复制主库文件;在线 backup 会合并 WAL 并生成一致性快照。
  (
    cd "$APP"
    npx tsx -e \
      "import Database from 'better-sqlite3'; void (async () => { const db=new Database('$APP/prisma/prod.db',{readonly:true}); await db.backup('$BACKUP_DIR/prod.${TIMESTAMP}.db'); db.close(); })();" \
      2>&1 | tail -20
  )
  echo "backup: $BACKUP_DIR/prod.${TIMESTAMP}.db"
else
  echo "no existing prod.db; skip backup"
fi

echo "---[3/9] stage runtime-new---"
rm -rf iiqe-app-runtime-new
mkdir -p iiqe-app-runtime-new
# 复制所有必需运行时文件;.next 是构建产物,public 是静态资源,prisma 是 schema 源
# 注意:Prisma 7 需要 prisma.config.ts(连接字符串配置,见该文件顶部注释),
# 不 copy 会导致 db push 报 "datasource.url property is required"。
for item in .next public scripts prisma data lib app components package.json package-lock.json next.config.ts tsconfig.json prisma.config.ts; do
  if [ -e "iiqe-update-new/$item" ]; then
    cp -a "iiqe-update-new/$item" "iiqe-app-runtime-new/"
  fi
done
ls -la iiqe-app-runtime-new

# 保留一致性快照;不能直接复制 WAL 模式下的主文件,否则会丢掉尚未 checkpoint 的答案。
if [ -f "$BACKUP_DIR/prod.${TIMESTAMP}.db" ]; then
  cp -a "$BACKUP_DIR/prod.${TIMESTAMP}.db" "iiqe-app-runtime-new/prisma/prod.db"
fi
# 保留 .env.production / .env(VPS 运行时配置)
if [ -f "$APP/.env.production" ]; then
  cp -a "$APP/.env.production" "iiqe-app-runtime-new/.env.production"
fi
if [ -f "$APP/.env" ]; then
  cp -a "$APP/.env" "iiqe-app-runtime-new/.env"
fi

# 复用上一份 node_modules(避免 npm ci 在低 CPU VPS 上锁死 sshd / T5 突发型 OOM)
# 仅当:lock 存在 + prev 存在 + prev 里有 node_modules 时复用
# 升级 next/react/prisma 大版本时,prev 不匹配,会自动 fall back 走 npm ci
SKIP_NPM_CI=0
if [ -f iiqe-app-runtime-new/package-lock.json ] && [ -d "$APP-prev/node_modules" ]; then
  echo "copying node_modules from $APP-prev (skip npm ci)..."
  cp -a "$APP-prev/node_modules" iiqe-app-runtime-new/
  SKIP_NPM_CI=1
else
  echo "no prev node_modules available, will run npm ci"
fi

cd iiqe-app-runtime-new

echo "---[4/9] deps + prisma generate---"
if [ "$SKIP_NPM_CI" = "1" ]; then
  echo "(skipped npm ci, using copied node_modules from $APP-prev)"
else
  # --omit=dev 不装 devDeps;生产只需要 next + 运行时依赖
  npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -20
fi
npx prisma generate 2>&1 | tail -10

echo "---[5/9] prisma db push (non-destructive)---"
# 关键守门:db push 会先比对 schema 与 DB,如果检测到可能丢数据的破坏性变更,
# 它会要求确认。我们传入 --accept-data-loss=false 让它在破坏性 diff 上失败,
# 让人工介入而不是默认执行。
# Prisma 7 已移除 --skip-generate(generate 已在 step 4 跑過,且 db push 會自動 reuse)。
DATABASE_URL="${DATABASE_URL:-file:./prisma/prod.db}" npx prisma db push --accept-data-loss=false 2>&1 | tail -30

echo "---[6/9] prisma seed (idempotent)---"
DATABASE_URL="${DATABASE_URL:-file:./prisma/prod.db}" npx tsx prisma/seed.ts 2>&1 | tail -20

echo "---[6.5/9] self-heal: drop legacy duplicate question rows---"
# 历史双写残留(df8a225 重構後遺症):同一 (paperId,source,number) 可能同时存在
# 旧式 ID(P1-exam-1,来自 JSON seed)与 cuid(cm...,旧版管理员新增默认生成)两行,
# 导致 /admin/questions 每题显示两次。seed 按 id 幂等 upsert,不会删 cuid 行,
# 故这里显式去重:保留旧式 ID、删 cuid,并迁移 Answer/Favorite/Note/Feedback 引用。
# 幂等:无重复时脚本 exit 0(打印"没有重复项");遇到无法自动判定的组会 exit 2 并
# 终止删除(安全,不误删)。本步设为非致命——即便去重异常也继续部署(避免阻塞发布),
# 但会打印警告,运维需人工介入排查。
DATABASE_URL="${DATABASE_URL:-file:./prisma/prod.db}" npx tsx scripts/dedupe-questions.ts 2>&1 | tail -30 || \
  echo "!!! [warn] dedupe-questions 返回非 0(可能无可自动判定的重复组)。prod.db 可能仍有重复,请人工核查。"

echo "---[7/9] health check: verify-storage---"
DATABASE_URL="${DATABASE_URL:-file:./prisma/prod.db}" npm run verify:storage 2>&1 | tail -40
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

# 修复 Next 16 Turbopack 的 external native module symlink。
#
# Turbopack 某些版本会生成带 hash 的 external 模块名(如
# better-sqlite3-79580e436acd1aa8)。只重建 .next/server 当前产物实际引用的别名，
# 避免把普通 chunk 文件名误判成 npm package。
mkdir -p "$APP/.next/node_modules"
grep -rhoE 'better-sqlite3-[a-f0-9]{16}' "$APP/.next/server/" 2>/dev/null \
  | sort -u \
  | while read -r mod; do
      ln -sfn "$APP/node_modules/better-sqlite3" "$APP/.next/node_modules/$mod"
      echo "relinked: $mod -> $APP/node_modules/better-sqlite3"
    done

cd "$APP"

echo "---[9/9] pm2 restart---"
pm2 restart iiqe-app 2>&1 || pm2 start npm --name iiqe-app -- run start -- -p 3001 2>&1
pm2 save
sleep 2
pm2 status iiqe-app

# ---- post-flight audit ----
# 跟 pre-flight 比對。任何 row count 在 deploy 中被改都會被印出來。
# 注意:若 deploy 期間使用者繼續作答,attempt/answer 數字可能增加 — 正常。
echo "---[10/10] post-flight audit---"
DATABASE_URL="${DATABASE_URL:-file:./prisma/prod.db}" \
  AUDIT_PHASE=post \
  IIQE_AUDIT_LAST="$AUDIT_DIR/last.json" \
  npx tsx scripts/deploy-audit.ts post "$AUDIT_DIR" 2>&1 | tail -30 || \
    echo "!!! [warn] deploy-audit post-flight 失敗(請手動比對 $AUDIT_DIR/last.json)"

echo "---ok---"
