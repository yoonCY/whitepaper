# Chapter 1: AI Prompt Architecture (Agent Governance)

> **"지시(Instruction)하는 것을 넘어, 에이전트의 워크플로우를 통제(Govern)하다"**

## 1. 아키텍처 도입 배경: 통제되지 않는 AI의 한계

200명 규모의 회사(개발진 80명) 내에서 복잡하게 얽힌 사내 시스템과 레거시를 다루며 **특정 서비스를 단독으로 책임지는 체제**에서, 물리적인 인력의 한계를 극복하고자 AI 코딩 에이전트(GitHub Copilot, Cursor 등)를 도입했습니다. 하지만 곧 치명적인 한계에 직면했습니다.

> [!WARNING]
> **초기 AI 도입 시 발생한 문제점 (Goal Drift & Hallucination)**
> - **맥락 상실:** 어제 설정한 코딩 규칙(예: `fetch` 대신 사내 래퍼 함수 사용)을 오늘 세션에서 무시.
> - **환각:** 존재하지 않는 DB 컬럼으로 쿼리를 작성하여 서비스 장애 유발 가능성.
> - **목표 표류(Goal Drift):** 긴 작업을 지시하면, 스스로 계획을 잊고 전혀 다른 코드를 수정하기 시작.

이러한 문제를 해결하기 위해, 단순히 프롬프트를 텍스트로 적어두는 것을 넘어 **시스템에 의한 기계적 강제성(Mechanical Governance)**을 부여하는 '프롬프트 아키텍처'를 설계했습니다.

---

## 2. 3-Layer Rule Architecture

에이전트에게 제공되는 컨텍스트를 중요도와 생명주기(Lifecycle)에 따라 3단계로 엄격히 분리하여, 서로 충돌하지 않게 설계했습니다.

```mermaid
flowchart TD
    subgraph "Layer 1: Global Rules (~/.ai/rules.md)"
        direction TB
        G1[핵심 보안 원칙]
        G2[전역 도구 사용 규칙]
        G3[언어 및 포맷 강제]
    end

    subgraph "Layer 2: Project Rules (./.ai/rules.md)"
        direction TB
        P1[도메인 특화 비즈니스 로직]
        P2[프로젝트별 프레임워크 제약]
        P3[데이터베이스 스키마 원칙]
    end

    subgraph "Layer 3: Task Context (.ai/state/sessions/...)"
        direction TB
        T1[현재 작업 목표]
        T2[완료된 체크리스트]
        T3[발생한 트러블슈팅 기록]
    end

    G1 -->|상속 (Inheritance)| P1
    P1 -->|오버라이드 (Override)| T1

    classDef global fill:#f9f2f4,stroke:#d49a89,stroke-width:2px,color:#333;
    classDef project fill:#f4f9f4,stroke:#89d49a,stroke-width:2px,color:#333;
    classDef task fill:#f4f4f9,stroke:#89a8d4,stroke-width:2px,color:#333;

    class G1,G2,G3 global;
    class P1,P2,P3 project;
    class T1,T2,T3 task;
```

* **L1 (Global):** 모든 프로젝트에 공통으로 적용되는 보안 및 에이전트 페르소나 (Zero-trust, 절대로 임의로 파일을 삭제하지 말 것 등)
* **L2 (Project):** 개별 프로젝트(예: `company-ai-setup`, `dart-ai-trading-bot`)별 고유 스택 및 컨벤션. L1과 충돌 시 L2가 오버라이드.
* **L3 (Task):** 단일 작업 세션의 상태. 에이전트가 재시작되어도 이전 작업 내용을 잃지 않도록 영속성 유지.

---

## 3. Autonomous State-Transition Workflow

AI 에이전트가 "알아서 해줘"라는 모호한 명령 대신, 명확한 유한 상태 기계(Finite State Machine)의 흐름을 따르도록 설계된 워크플로우 엔진입니다.

```mermaid
stateDiagram-v2
    [*] --> G_PLAN : 사용자 요청 입력

    state G_PLAN {
        [*] --> 분석
        분석 --> 아키텍처_설계
        아키텍처_설계 --> Task_MD_생성
    }

    G_PLAN --> RUN : 승인 (Approval)

    state RUN {
        [*] --> 코드_작성
        코드_작성 --> 테스트_실행
        테스트_실행 --> 오류_수정(Self-Correction)
        오류_수정(Self-Correction) --> 코드_작성
    }

    RUN --> HANDOFF : 컨텍스트 한계 도달 / 휴식
    HANDOFF --> RUN : 세션 재개 (Resume)

    RUN --> DONE : 목표 100% 달성

    state DONE {
        [*] --> 변경사항_요약
        변경사항_요약 --> Walkthrough_문서_생성
    }

    DONE --> [*]
```

### 핵심 워크플로우 단계
1. **`/g-plan` (설계 모드):** 코드를 즉시 작성하지 않고, 먼저 아키텍처와 `task.md`를 생성하여 승인을 받도록 강제.
2. **`/run` (실행 모드):** `task.md`의 체크리스트를 기반으로 실제 구현 진행.
3. **`/handoff` (영속성 이양):** 에이전트의 컨텍스트 윈도우(토큰)가 가득 차거나 세션이 종료될 때, 현재 상태와 겪은 문제를 `handoff.md`에 요약하여 다음 세션의 에이전트에게 전달.
4. **`/done` (완료 및 검증):** `walkthrough.md`를 생성하여 작업 증명(Proof of Work)을 남김.

> [!TIP]
> **Handoff 메커니즘의 가치**
> 80명의 개발자가 생산하는 수많은 변화와 사내 레거시 사이에서, 특정 서비스를 홀로 책임지며 여러 태스크를 동시에 진행하다 보면 컨텍스트 스위칭 비용이 매우 큽니다. Handoff 시스템을 통해, 에이전트가 스스로 "어디까지 했고, 다음 에이전트는 무엇을 해야 하는지"를 문서로 남김으로써, 1인 전담 체제에서도 시스템을 안정적으로 모니터링하고 이어받는 과정을 완벽하게 자동화했습니다.
