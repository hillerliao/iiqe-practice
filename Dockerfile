# syntax=docker/dockerfile:1.7

# ============================================================
# deps: install dependencies (including native build of better-sqlite3)
# ============================================================
FROM node:22-bookworm-slim AS deps

# 大陆环境:替换 apt/npm 源为国内镜像
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources

# python3 + build-essential 是 better-sqlite3 prebuild fallback 时需要
# ca-certificates 让 npm 可以走 HTTPS 到 registry
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 单独先复制 manifest 与 prisma schema,这样依赖未变时这一层可以缓存
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Prisma 引擎二进制也走国内镜像
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

# npm ci 会触发 postinstall: "prisma generate"
# 需要 prisma.config.ts 和 prisma/ 已经在上面 COPY
RUN npm config set registry https://registry.npmmirror.com \
    && npm ci

# ============================================================
# builder: build the Next.js production bundle
# ============================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# 复用 deps 阶段已装好的 node_modules(prisma generate 已执行)
COPY --from=deps /app/node_modules ./node_modules

# 复制其余源码
COPY . .

# next build 需要 prisma client 已生成(deps 阶段已完成)
RUN npm run build

# ============================================================
# runner: production runtime image
# ============================================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户(uid/gid 通过 build arg 提供,默认 1000)
# 1000 与大多数 Linux 发行版默认登录用户对齐,避免 volume 权限问题
ARG UID=1000
ARG GID=1000

RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -f --system --gid ${GID} nextjs \
    && useradd --system --uid ${UID} --gid nextjs --home /app --shell /sbin/nologin nextjs \
    && mkdir -p /data \
    && chown -R nextjs:nextjs /data

# 从 builder 复制产物
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next ./.next
COPY --from=builder --chown=nextjs:nextjs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nextjs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nextjs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nextjs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nextjs /app/next.config.ts ./next.config.ts

USER nextjs

EXPOSE 3000

# 健康检查:/api/papers 返回 200 同时也证明 DB 连接正常
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/papers',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["npm", "start"]