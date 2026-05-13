FROM node:20-alpine

# pnpm 설치
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 패키지 매니저 파일 복사
COPY package.json pnpm-lock.yaml* ./

# 의존성 설치
RUN pnpm install --frozen-lockfile || pnpm install

# 소스코드 복사
COPY . .

# 실행 (docker-compose에서 오버라이드 가능)
CMD ["pnpm", "run", "index"]
