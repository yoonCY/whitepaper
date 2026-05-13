.PHONY: install test lint run-indexer run-server up down

# ==========================================
# Developer Experience (DX) Unified Commands
# ==========================================

# 1. 인프라 세팅
up:
	@echo "🚀 Starting Neo4j & Redis Infrastructure..."
	docker-compose up -d

down:
	@echo "🛑 Stopping Infrastructure..."
	docker-compose down

# 2. 의존성 설치
install:
	@echo "📦 Installing TS Agent dependencies..."
	cd 1-data-indexer-agent && pnpm install

# 3. 테스트 및 린트 검사
test:
	@echo "🧪 Running Tests across all agents..."
	cd 1-data-indexer-agent && pnpm test
	cd 2-mcp-serving-agent && cargo test

lint:
	@echo "🧹 Running Linting..."
	cd 1-data-indexer-agent && pnpm tsc --noEmit
	cd 2-mcp-serving-agent && cargo clippy -- -D warnings

# 4. 로컬 실행
run-indexer:
	@echo "🔄 Running Data Indexer Pipeline..."
	cd 1-data-indexer-agent && pnpm run index

run-server:
	@echo "⚡ Starting Rust MCP Server..."
	cd 2-mcp-serving-agent && cargo run --release
