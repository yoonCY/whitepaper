/**
 * Kafka 공통 SDK — 설정 타입 정의
 * 모든 프로듀서/컨슈머는 이 설정 구조를 기반으로 초기화
 */

export interface KafkaConfig {
  /** Kafka 브로커 엔드포인트 목록 */
  brokers: string[];
  /** 클라이언트 식별자 (서비스명-환경) */
  clientId: string;
  /** SASL 인증 (MSK SASL/SCRAM) */
  sasl?: {
    mechanism: 'scram-sha-256' | 'scram-sha-512' | 'plain';
    username: string;
    password: string;
  };
  /** TLS 설정 (운영 환경 필수) */
  ssl?: boolean | {
    rejectUnauthorized: boolean;
    ca?: string[];
  };
  /** 연결 타임아웃 (ms) */
  connectionTimeout?: number;
  /** 요청 타임아웃 (ms) */
  requestTimeout?: number;
  /** 재연결 설정 */
  retry?: {
    maxRetryTime?: number;
    initialRetryTime?: number;
    factor?: number;
    multiplier?: number;
    retries?: number;
  };
}

export interface ProducerConfig {
  /** 토픽 이름 */
  topic: string;
  /**
   * 멱등성 모드 활성화
   * - true: exactly-once semantics 보장
   * - acks=all + retries 자동 설정
   */
  idempotent?: boolean;
  /** 압축 방식 */
  compression?: 'none' | 'gzip' | 'snappy' | 'lz4' | 'zstd';
}

export interface ConsumerConfig {
  /** 컨슈머 그룹 ID */
  groupId: string;
  /** 구독할 토픽 목록 */
  topics: string[];
  /**
   * DLQ(Dead Letter Queue) 설정
   * 메시지 처리 실패 시 재시도 후 DLQ로 이동
   */
  dlq?: {
    /** DLQ 토픽 이름 (기본: {원본토픽}-dlq) */
    topic: string;
    /** 최대 재시도 횟수 (기본: 3) */
    maxRetries: number;
    /** 재시도 간격 (ms) */
    retryDelay: number;
  };
  /** 파티션당 동시 처리 수 */
  concurrency?: number;
  /** 자동 커밋 비활성화 (수동 커밋으로 메시지 유실 방지) */
  autoCommit?: boolean;
  /** 세션 타임아웃 (ms) */
  sessionTimeout?: number;
}

/** 모든 이벤트 메시지의 기본 구조 */
export interface BaseEvent<T = unknown> {
  /** 이벤트 고유 ID (UUID v4) */
  id: string;
  /** 이벤트 타입 (ex: user.created, order.placed) */
  type: string;
  /** 이벤트 소스 서비스 */
  source: string;
  /** 이벤트 발생 시각 (ISO 8601) */
  timestamp: string;
  /** 분산 추적 ID */
  traceId?: string;
  /** 이벤트 페이로드 */
  payload: T;
  /** 메타데이터 */
  metadata?: Record<string, string>;
}

/** DLQ 메시지 구조 (원본 메시지 + 실패 정보) */
export interface DlqMessage<T = unknown> {
  originalMessage: BaseEvent<T>;
  /** 실패한 토픽 */
  failedTopic: string;
  /** 실패 사유 */
  failureReason: string;
  /** 시도 횟수 */
  attemptCount: number;
  /** 최초 실패 시각 */
  firstFailedAt: string;
  /** 마지막 실패 시각 */
  lastFailedAt: string;
}
