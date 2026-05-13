FROM node:20-alpine AS builder
WORKDIR /app

# 의존성 설치 (캐시 레이어 최적화)
COPY package*.json ./
RUN npm ci --only=production

# 소스 빌드
COPY tsconfig.json ./
COPY src ./src
RUN npm install -D typescript ts-node && npx tsc

# ──────────────────────────────────────────
# 프로덕션 이미지 (최소화)
# ──────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# 보안: root 대신 비특권 사용자 실행 (Zero-Trust)
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
USER appuser

COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist

# 헬스체크 (K8s Liveness Probe와 연동)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz/live || exit 1

EXPOSE 3000

# Graceful Shutdown을 위해 SIGTERM 전달
STOPSIGNAL SIGTERM
CMD ["node", "dist/gateway/app.js"]
