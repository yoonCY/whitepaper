# Chapter 2: MCP (RAG) Architecture (Knowledge Middleware)

> **"80명의 개발자가 쏟아내는 레거시 한가운데서, 에이전트에게 눈과 귀를 달아주다"**

## 1. 아키텍처 도입 배경: 레거시의 홍수와 컨텍스트 빈곤

200명 규모의 기업 환경에서, 80명의 개발진이 매일 생성하는 수많은 커밋과 10년 치 데이터베이스 스키마는 한 명의 개발자가 모두 머릿속에 담을 수 없는 양입니다. 제가 전담하는 서비스 역시 이러한 거대한 사내 인프라와 단단히 결합되어 있었습니다.

AI 에이전트에게 코딩을 맡겼을 때 가장 심각했던 문제는 **'지식의 부재'**였습니다.
에이전트는 사내의 고유한 라이브러리(`company-core-utils`), 타 팀이 관리하는 테이블 스키마 구조, 그리고 어제 수정된 API 스펙을 알지 못했습니다. 프롬프트 창에 매번 수천 줄의 코드를 복사&붙여넣기 하는 것은 불가능에 가까웠습니다.

이를 해결하기 위해, 에이전트가 필요할 때마다 사내 지식을 **스스로 검색하고(RAG) 주입받을 수 있는 지식 미들웨어(Knowledge Middleware)**를 구축했습니다.

---

## 2. System Architecture: 분리된 관심사 (Separation of Concerns)

보안(사내망)과 자원 효율성을 고려하여, 비즈니스 로직(TS)과 무거운 AI 임베딩 연산(Python)을 철저히 분리하는 사이드카(Sidecar) 패턴을 채택했습니다.

```mermaid
graph LR
    subgraph "IDE Environment"
        A[AI Agent\nCopilot/Cursor]
    end

    subgraph "MCP Server (Node.js / TS)"
        B[MCP Tool Router]
        C[Schema Validator]
        D[TF-IDF In-Memory Fallback]
        B --> C
        C --> D
    end

    subgraph "Embedding Sidecar (Python)"
        E[FastAPI]
        F[Sentence Transformers\nMiniLM / E5]
        G[(ChromaDB\nVector Store)]
        E --> F --> G
    end

    A <-->|stdio (JSON-RPC)| B
    C <-->|HTTP POST (Port 8100)| E

    classDef ide fill:#f9f2f4,stroke:#d49a89,stroke-width:2px;
    classDef mcp fill:#f4f9f4,stroke:#89d49a,stroke-width:2px;
    classDef python fill:#f4f4f9,stroke:#89a8d4,stroke-width:2px;
    
    class A ide;
    class B,C,D mcp;
    class E,F,G python;
```

* **MCP (Model Context Protocol):** 에이전트가 `search_memory`, `query_context` 등의 도구를 통해 시스템 내부망에 안전하게 접근할 수 있도록 하는 표준 인터페이스.
* **Sidecar Pattern:** Node.js의 한계를 극복하기 위해, 무거운 벡터 임베딩 연산과 ChromaDB 접근은 Python 사이드카 프로세스로 완전히 분리. 장애가 격리(Isolation)됩니다.

---

## 3. 3-Tier Search Pipeline (하이브리드 검색)

"벡터 검색이 모든 것을 해결해주지 않는다"는 실무적 깨달음에서 출발했습니다. 회사 고유의 테이블명(`EX_USER_INFO_24`)이나 특정 사내 시스템 명칭은 벡터 임베딩 모델(MiniLM)이 유사도를 찾기 매우 어려워합니다.

이 문제를 해결하고 가용성을 100%로 끌어올리기 위해 **3-Tier Fallback 파이프라인**을 구축했습니다.

```mermaid
flowchart TD
    Q[에이전트 검색 요청] --> Check{사이드카 서버 정상?}
    
    Check -->|Yes| Vector[Tier 1: Vector Search\n(ChromaDB + Sentence Transformer)]
    Check -->|No (OOM / 장애)| Fallback[Tier 2: TF-IDF In-Memory\n(사내 고유명사 부스트)]
    
    Vector --> ResultCheck{유사도 0.5 이상?}
    ResultCheck -->|No| Fallback
    ResultCheck -->|Yes| R[검색 결과 반환]
    
    Fallback --> R
```

1. **메타데이터 하드 필터링:** 도메인(프로젝트) 태그를 이용해 먼저 검색 범위를 좁힘.
2. **벡터 유사도 검색:** 문맥과 의미를 기반으로 ChromaDB에서 탐색.
3. **TF-IDF 인메모리 폴백 (Fallback):** 파이썬 프로세스가 죽거나, 고유명사 매칭이 안 될 경우, Node.js 메모리에 상주하는 TF-IDF 엔진이 키워드 기반으로 정확하게 찾아냄. 사내 용어에 대한 가중치(Boost) 적용.

> [!IMPORTANT]
> **Zero-Trust 기반 도메인 격리**
> 80명이 작업하는 거대한 레거시 환경에서, 내가 전담하는 서비스의 컨텍스트에 타 팀의 코드가 섞이면 대형 사고가 발생할 수 있습니다. 이를 방지하기 위해 MCP 서버는 물리적 디렉토리 경로와 ChromaDB 컬렉션을 엄격하게 분리(`where: { domain: "MY_SERVICE" }`)하여 **데이터 오염과 권한 이탈을 원천 차단**합니다.
