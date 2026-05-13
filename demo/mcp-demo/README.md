# 🚀 Enterprise Knowledge Graph MCP Demo

> 사내 파편화된 지식(Jira, Wiki, Legacy Code)을 AI 에이전트(Cursor, Cline)에게 안전하고 정확하게 주입하는 중앙 집중형 RAG(검색 증강 생성) 파이프라인 데모입니다.

이 프로젝트는 대규모 사내 지식 처리의 유연성과 실시간 서빙의 극단적인 퍼포먼스 요구사항을 모두 충족하기 위해 **CQRS (Command Query Responsibility Segregation) 아키텍처**를 채택했습니다. 무거운 데이터 수집 및 인덱싱 작업은 **TypeScript**로 분리하고, AI IDE와의 초저지연 실시간 통신 및 하이브리드 검색은 **Rust**로 구현했습니다.

---

## 👨‍💻 설계 철학 및 운영 관점 (Engineering Philosophy)

10년 차 이상의 시니어 엔지니어링 관점에서, "단순히 동작하는 코드"를 넘어 **"운영의 안정감과 팀의 생산성"**을 최우선으로 고려하여 설계했습니다.

*   **“왜 이렇게 설계했는가?” (실무 안정감 vs 최신 기술)**
    *   유행하는 올인원 대형 AI 프레임워크에 의존하기보다 **역할 분리(Decoupling)**와 **실무 안정감**을 택했습니다. 비정형 데이터와 다양한 API(Jira 등) 연동에 유리한 Node.js 생태계(TypeScript)를 데이터 수집 파이프라인으로 두고, 밀리초 단위의 반응성과 메모리 안전성이 필요한 MCP 실시간 서빙 엔진은 Rust로 분리하여 **단일 장애점(SPOF)을 제거**했습니다.
*   **장애 대응 및 로그 흐름 (Observability)**
    *   장애 발생 시 "어디부터 봐야 하는지" 즉각적으로 파악할 수 있도록, 데이터 수집 파이프라인과 서빙 엔진의 로깅(JSON Lines 등) 및 DB 흐름(Neo4j, Redis, SQLite)을 완벽히 분리했습니다. 문제가 생기면 Indexer의 파싱 로그를 볼지, Server의 쿼리 퓨전 로그를 볼지 직관적으로 알 수 있습니다.
*   **운영 및 배포 안정성 (Ops & Deploy)**
    *   Docker Compose 기반으로 데이터베이스(Neo4j)와 캐시(Redis) 인프라를 컨테이너화하여, 로컬 환경과 프로덕션 환경 간의 간극을 없애고 배포 파이프라인의 리스크를 통제했습니다.
*   **리스크 관리 및 주니어 리딩 (Team Collaboration)**
    *   도메인 로직이 한곳에 엉키지 않도록 디렉토리와 모듈(Parser, Indexer, Search Engine)의 인터페이스를 명확히 분리했습니다. 주니어 엔지니어가 합류하더라도, 예를 들어 "새로운 마크다운 파서 추가" 작업 시 다른 서빙 코드를 망가뜨릴 리스크 없이 안전하게 작업하고 기여할 수 있습니다.

---

## 🌟 핵심 아키텍처 (CQRS 기반 역할 분리)

### 1. Data Indexer Agent (TypeScript)
비정형 데이터 처리와 외부 API 연동이 유연한 Node.js 생태계를 활용하여, 데이터 파이프라인(ETL) 역할을 전담합니다.

*   **AST 파싱 (코드 이해)**: TypeScript, PHP 등 레거시 사내 코드의 추상 구문 트리(AST)를 분석하여 함수/클래스 시그니처와 의존성 트리를 추출합니다.
*   **플러그인 아키텍처 (Plugin Registry)**: Jira, GitHub 등 다양한 사내 데이터 소스를 코어 로직 수정 없이 동적으로 추가할 수 있도록 개방-폐쇄 원칙(OCP)을 준수했습니다.
*   **Neo4j Graph 주입**: 추출된 도메인 엔티티(Entity)와 관계(Relationship)를 Neo4j Knowledge Graph에 정형화하여 주입합니다.
*   **BM25 인덱싱**: 문서 및 코드의 원문을 SQLite FTS5를 이용하여 전문 검색(Full-Text Search)이 가능하도록 색인합니다.
*   **구조화된 로깅 (Winston)**: 운영 환경(ELK, Datadog) 연동을 고려해 에러와 이벤트를 분리하고 JSON 포맷으로 `*.log` 파일에 저장하여 장애 추적을 용이하게 했습니다.

### 2. MCP Serving Agent (Rust)
밀리초(ms) 단위의 응답 속도와 동시성 처리가 요구되는 AI 에이전트와의 실시간 통신(MCP) 및 검색 레이어를 전담합니다.

*   **실시간 하이브리드 검색 (Fusion)**: IDE의 쿼리가 들어오면 BM25(키워드) + Vector(의미) + Neo4j(관계)를 동시에 조회하고 **RRF (Reciprocal Rank Fusion)** 알고리즘으로 결과를 병합하여 최적의 랭킹을 산출합니다.
*   **Ragas 기반 평가 하네스 (Feedback Loop)**: `metrics.jsonl` 기반으로 검색 정확도(Context Precision)와 환각(Faithfulness)을 평가하여, 모델 튜너가 RRF 가중치를 자동 조정하는 자체 개선 루프를 갖추었습니다.
*   **비동기 스케줄러 (Background Worker)**: 메인 서빙 루프의 성능을 저하시키지 않는 Non-blocking 백그라운드 스케줄러가 그래프 DB 헬스체크 및 캐시 GC를 전담합니다.
*   **MCP 프로토콜 서빙**: Cursor, Cline 등의 AI 에이전트와 직접 통신할 수 있도록 Model Context Protocol (stdio/SSE) 규격을 완벽히 지원합니다.
*   **Zero-Trust Guardrail**: 사내 민감 정보 유출 방지를 위해 컨텍스트를 마스킹하고, 토큰 예산에 맞춰 마크다운을 압축(Context Collapse)하여 반환합니다.

---

## 📁 디렉토리 구조

```text
mcp-demo/
├── docker-compose.yml             # Neo4j, Redis 등 공통 인프라 격리 및 구동용
│
├── 1-data-indexer-agent/          # [TypeScript] 지식 수집 및 파싱 파이프라인 (Producer)
│   ├── src/
│   │   ├── core/                  # Plugin Registry 및 구조화된 로깅(Winston)
│   │   ├── parsers/               # AST 파서 및 마크다운 청킹 로직 (주니어 온보딩 용이)
│   │   ├── indexers/              # BM25 (SQLite FTS5) 인덱서
│   │   └── graph-injector/        # Neo4j Graph 주입 모듈
│   └── mock-data/                 # 데모용 샘플 사내 지식 (Jira 덤프, 사내 Wiki)
│
└── 2-mcp-serving-agent/           # [Rust] 초고속 실시간 검색 및 MCP 서빙 레이어 (Consumer)
    └── src/
        ├── transport/             # MCP stdio / SSE 프로토콜 구현부
        ├── search_engine/         # RRF 기반 하이브리드 검색 엔진
        ├── scheduler/             # 비동기 백그라운드 워커 (GC, HealthCheck)
        ├── eval/                  # Ragas 평가 하네스 및 피드백 모델 튜너
        ├── guardrail/             # 보안 필터링 및 토큰 최적화
        └── tools/                 # AI IDE에 노출되는 최종 MCP Tool 인터페이스
```

---

## 🛠 실행 방법 (Quick Start)

### 1. 인프라 실행 (Infrastructure)
격리된 인프라(Neo4j, Redis) 환경을 백그라운드로 안전하게 구동합니다.
```bash
docker-compose up -d
```

### 2. 데이터 인덱싱 (Data Pipeline)
가상의 사내 데이터(`mock-data`)를 AST 파싱 및 인덱싱하여 DB에 주입합니다. 파싱 중 발생하는 에러 로그는 구조화되어 출력됩니다.
```bash
cd 1-data-indexer-agent
pnpm install
pnpm run index
```

### 3. 실시간 서빙 (MCP Server)
Rust 기반의 초저지연 RAG 서버를 실행합니다. 이 서버를 Cursor나 기타 MCP 지원 IDE에 연결하여 실시간으로 사내 지식을 질의할 수 있습니다.
```bash
cd 2-mcp-serving-agent
cargo run --release
```

---

## 📊 기술 스택
*   **Languages**: TypeScript (Data Pipeline), Rust (Serving Engine)
*   **Database**: Neo4j (GraphRAG), SQLite FTS5 (BM25)
*   **Protocol**: Model Context Protocol (MCP)
*   **Architecture**: CQRS, Multi-Agent, Zero-Trust Guardrails
