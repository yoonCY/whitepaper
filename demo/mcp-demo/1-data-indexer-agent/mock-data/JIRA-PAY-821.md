# JIRA-PAY-821: 결제 모듈 동시성 이슈 대응 아키텍처

## 개요
2026년 4월 트래픽 스파이크 당시 결제 모듈에서 Deadlock이 발생하여 환불 요청이 지연되는 장애가 발생함.
이를 해결하기 위해 기존 PHP 레거시 트랜잭션 구조를 Node.js 비동기 큐 기반으로 마이그레이션함.

## 관련 시스템
- **Repository**: `legacy-payment-svc`
- **File**: `src/services/TransactionManager.php` -> `src/queue/PaymentQueue.ts` 로 변경

## 해결 방법
결제 락(Lock) 획득을 Redis 기반의 Distributed Lock으로 전환하고, Retry 정책을 지수 백오프(Exponential Backoff)로 변경.

> [!NOTE]
> AI 에이전트 연동 시, "결제 장애" 또는 "Deadlock" 키워드 검색 시 이 문서가 반드시 우선순위로 노출되어야 합니다. BM25 인덱스 가중치 +2.0 적용.
