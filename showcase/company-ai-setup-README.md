# 🚀 Company AI Setup v1.0.7 (AI Governance Repository)

> **Antigravity AI 운영 체제(AI OS) 및 전역 거버넌스 중앙 저장소**

[![Architecture Showcase](https://img.shields.io/badge/Portfolio-Architecture_Showcase_Only-FF4154?style=for-the-badge)](#)

<table>
<tr>
<td>
<b>🚨 Source Code Not Included</b><br/>
이 레포지토리는 아키텍처 및 시스템 설계 역량을 보여주기 위한 <b>Showcase Repository</b>입니다. <br/>
사내망 인프라 구성, AI 보안 가드레일 등 엔터프라이즈 레벨의 핵심 자산이 포함된 이유로 <b>실제 소스 코드 및 설정 파일은 공개하지 않습니다.</b><br/>
대신, <b>다중 에이전트 오케스트레이션(Multi-Agent Orchestration), 지식 그래프 탐색(GraphRAG), 그리고 제로 트러스트(Zero-Trust) 보안 통제</b> 등 핵심 아키텍처 설계 사상을 상세히 문서화했습니다.
</td>
</tr>
</table>

이 저장소는 `ai-mcp-server` 프로젝트에서 독립적으로 분리된 AI 에이전트 인프라의 **Single Source of Truth**입니다. 전사적으로 사용되는 AI 에이전트의 워크플로우, 규칙(Rules), 지식(Knowledge) 및 과거 이력(Memory)을 중앙 집중화하여 관리합니다.

## 🔄 버전 히스토리

| **v1.0.7** | 2026-04-26 | **ai-mcp-server v28.0.0-alpha.4 동기화 및 레거시 데이터 아카이브 완료**: 기존 ai-mcp-server의 세션/태스크 이력을 중앙 저장소로 완전히 이관하고 Ubuntu/Mac 환경용 마이그레이션 가이드 현행화 | [v1.0.6](docs/archive/company-ai-setup/README_v1.0.6.md) |
| **v1.0.6** | 2026-04-26 | **AI 거버넌스 아키텍처 확정**: `company-ai-setup`을 SSOT로 삼고 타 프로젝트에서 윈도우 디렉토리 정션(Junction)으로 연결하는 표준 아키텍처 수립 및 `00-L2-common.md` 반영 | [v1.0.5](docs/archive/company-ai-setup/README_v1.0.5.md) |
| **v1.0.5** | 2026-04-26 | `ai-mcp-server` v28.0.0-alpha.2 워크플로우 개선사항 동기화 — `github-pr.md` AGENT STOP 가드레일 및 브랜치 규칙 테이블 추가, `github-pr-feedback.md` 테이블 포맷 의무화, `run.md`/`handoff.md`/`done.md` Jira 소유권 가드레일 추가 | [v1.0.4](docs/archive/company-ai-setup/README_v1.0.4.md) |
| **v1.0.4** | 2026-04-26 | 아카이브 디렉토리를 `docs/archive/{프로젝트명}/` 구조로 개편하여 확장성 확보 | [v1.0.3](docs/archive/company-ai-setup/README_v1.0.3.md) |
| **v1.0.3** | 2026-04-26 | `/release-push` 공통 워크플로우를 타 프로젝트와 충돌하지 않도록 프로젝트 하위 디렉토리 구조로 개선 | [v1.0.3](docs/archive/company-ai-setup/README_v1.0.3.md) |
| **v1.0.2** | 2026-04-26 | `.ai` 원본 및 `.agents` 심볼릭 링크(Junction) 구조 확립 완료 | [v1.0.2](docs/archive/company-ai-setup/README_v1.0.2.md) |
| **v1.0.1** | 2026-04-26 | Windows Junction(심볼릭 링크)의 Git 중복 추적 방지 가이드라인(L2) 추가 | [v1.0.1](docs/archive/company-ai-setup/README_v1.0.1.md) |
| **v1.0.0** | 2026-04-26 | `ai-mcp-server`에서 AI 운영 체제 인프라 분리 및 중앙 집중화 저장소 구축 | [v1.0.0](docs/archive/company-ai-setup/README_v1.0.0.md) |

### 아카이브 (히스토리)
- [README_v1.0.6.md](docs/archive/company-ai-setup/README_v1.0.6.md)
- [README_v1.0.5.md](docs/archive/company-ai-setup/README_v1.0.5.md)
- [README_v1.0.4.md](docs/archive/company-ai-setup/README_v1.0.4.md)
- [README_v1.0.3.md](docs/archive/company-ai-setup/README_v1.0.3.md)
- [README_v1.0.2.md](docs/archive/company-ai-setup/README_v1.0.2.md)
- [README_v1.0.1.md](docs/archive/company-ai-setup/README_v1.0.1.md)
- [README_v1.0.0.md](docs/archive/company-ai-setup/README_v1.0.0.md)

## 🌟 분리 및 도입 목적 (Migration Objective)

- **AI 운영 체제 디커플링:** 기존 `ai-mcp-server`에서 AI 지시어, 워크플로우, 메모리 컨텍스트를 분리하여 독립적인 버전 관리 및 확장이 가능하게 합니다.
- **Single Source of Truth:** 전사 AI 시스템이 공통으로 참조할 지식 베이스(Knowledge)와 상태(State), 워크플로우 체계를 일원화합니다.
- **안정성과 영속성 보장:** 컨테이너화된 멀티 머신 환경(Windows, Mac Silicon, NAS)에 대응하기 위해 컨텍스트 데이터(Knowledge, Memory)를 독립된 볼륨으로 마운트하여 컨테이너 생명주기와 무관하게 데이터를 안전하게 보존합니다.

---

## 📂 저장소 핵심 구조 (Repository Structure)

이 저장소는 다음과 같은 역할별 디렉토리로 엄격하게 분리되어 관리됩니다:

```text
company-ai-setup/
├── .ai/           # [Origin/State] AI 에이전트의 원본 지시어, 워크플로우, 상태 관리 집합소
│   ├── workflows/ # 에이전트가 호출 가능한 명령어 기반 워크플로우 (원본)
│   ├── rules/     # 보안, 인프라, L2/L3 규칙 (원본)
│   ├── ...        # skills, templates, scripts, context 등 (원본)
│   ├── rules.md   # [핵심] 최우선으로 로드되는 동적 로드 라우팅 인덱스 파일
│   ├── state/     # task-board.json, global-task-board.md 등 세션 및 글로벌 태스크 현황
│   └── local.json # 로컬 환경 변수 및 설정
├── .agents/       # [Symlink] IDE 및 호환성을 위해 .ai 하위 디렉토리를 바라보는 심볼릭 링크
│   ├── workflows/ # 🔗 .ai/workflows 로 연결된 심볼릭 링크
│   ├── rules/     # 🔗 .ai/rules 로 연결된 심볼릭 링크
│   └── ...        # 🔗 skills, templates, scripts, context (심볼릭 링크)
├── knowledge/     # [Knowledge Base] KIs (Knowledge Items). 특정 도메인/문제 해결에 대한 정제된 지식
├── memory/        # [Long-term Memory] AI 에이전트의 과거 세션 히스토리 영구 저장소
└── docs/          # 시스템 아키텍처 및 각종 매뉴얼 (예: handoff-guide.md)
```

---

## 🚀 에이전트 핵심 가이드라인 (For AI Agents)

이 저장소에 접근하는 모든 AI 에이전트는 다음 수칙을 절대적으로 준수해야 합니다.

1. **Bootstrapping (초기화 필독):**
   어떠한 행동이나 분석을 시작하기 전에 반드시 가장 먼저 **`.ai/rules.md`** 를 읽고, 현재 세션에 필요한 전역(L2) 및 도메인(L3) 룰을 파악하여 동적으로 로드합니다.

2. **Knowledge First (지식 최우선 검색):**
   단순 분석이나 새로운 코드 작성을 시도하기 전, `knowledge/` 내의 KI 요약을 반드시 확인하여 기존에 확립된 패턴, 알려진 버그, 아키텍처 원칙을 준수해야 합니다.

3. **Global Task Board (작업 상태 동기화):**
   진행 중인 세션 상태와 새로운 작업(TODO)은 항상 **`.ai/state/global-task-board.md`** 및 `task-board.json`에 최신화하여 에이전트 간 중복 작업을 방지합니다.

4. **Standard Workflows (표준 워크플로우 사용):**
   임의의 절차를 생성하지 않고, `.agents/workflows/` 내에 정의된 글로벌 워크플로우 규격(`/g-plan`, `/run`, `/handoff`, `/done` 등)을 엄격하게 따릅니다.

5. **Korean Language Only (한국어 강제):**
   추론(Reasoning)에는 자유로운 언어를 사용할 수 있으나, 최종 산출물(Markdown, 답변, 코드 주석 등)은 **반드시 한국어**로 작성합니다.

---

## 🔗 타 프로젝트 연결 가이드 (Linking to Other Projects)

타 개발 프로젝트(L3 도메인)에서 이 거버넌스 설정을 사용하려면 윈도우 **디렉토리 정션(Junction)**을 활용합니다.

### 1. 연결 생성 (Administrator 권한 불필요)
각 프로젝트의 루트 디렉토리에서 다음 명령을 실행합니다:
```powershell
# .ai 폴더 연결
mklink /J .ai d:\projects\company-ai-setup\.ai

# .agents 폴더 연결
mklink /J .agents d:\projects\company-ai-setup\.agents
```

### 2. Git 추적 방지 (.gitignore 설정 필수)
정션으로 연결된 폴더의 내용이 해당 프로젝트 저장소에 중복 커밋되는 것을 방지하기 위해, 각 프로젝트의 `.gitignore`에 다음 내용을 반드시 추가해야 합니다:
```text
# AI Governance Junctions
.ai/
.agents/
```

---

## 🔒 인프라 및 보안 가이드레일

- **멀티/크로스 플랫폼 지원:** Main PC(Windows/GPU), 서버(Mac M4), 데이터 레이크(NAS)의 이기종 분산 환경을 고려하여 OS 종속성이 없는 클라우드 네이티브(Docker 중심) 방식으로 구조화되어 있습니다.
- **제로 트러스트 모델:** 외부 시스템 접근 시 직접적인 쉘 커맨드 실행을 지양하고 지정된 MCP 도구를 최우선적으로 탐색하여 활용합니다.
