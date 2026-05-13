/**
 * Circuit Breaker 래퍼
 *
 * 상태 전이:
 *   Closed (정상) → Open (장애, 즉시 실패 반환) → Half-Open (탐침) → Closed
 *
 * Failback 계층:
 *   1차: 실제 업스트림 API 호출
 *   2차: Redis 캐시 (마지막 성공 응답)
 *   3차: Static Fallback 응답 (서비스 기본값)
 *
 * 모든 상태 변화는 구조화 로그로 기록 → ELK 대시보드에서 실시간 모니터링
 */

import CircuitBreaker from 'opossum';
import { Redis } from 'ioredis';
import { createLogger } from '../utils/logger';

const logger = createLogger('CircuitBreaker');

export interface CircuitBreakerConfig {
  /** 서비스 이름 (로그/메트릭 식별) */
  name: string;
  /** 실패율 임계치 (%) — 이 이상이면 Open */
  errorThresholdPercentage?: number;
  /** CB가 Open 상태를 유지하는 시간 (ms) */
  resetTimeout?: number;
  /** 타임아웃 (ms) — 이 시간 내 응답 없으면 실패 처리 */
  timeout?: number;
  /** 통계 창 크기 (ms) */
  rollingCountTimeout?: number;
  /** 통계 창 내 최소 요청 수 (이 이하면 Open 안 함) */
  volumeThreshold?: number;
  /** Redis 캐시 TTL (초) */
  cacheTtlSeconds?: number;
  /** 3차 폴백: 캐시도 없을 때 반환할 기본값 */
  staticFallback?: unknown;
}

export interface UpstreamCallResult<T> {
  data: T;
  cached: boolean;
  fallback: boolean;
  circuitState: 'closed' | 'open' | 'halfOpen';
}

export class CircuitBreakerWrapper<T> {
  private breaker: CircuitBreaker;
  private redis: Redis;
  private cacheKey: string;
  private config: CircuitBreakerConfig;

  constructor(
    /** 보호할 비동기 함수 (업스트림 API 호출) */
    protected readonly action: (...args: unknown[]) => Promise<T>,
    config: CircuitBreakerConfig,
    redis: Redis
  ) {
    this.config = config;
    this.redis = redis;
    this.cacheKey = `cb:cache:${config.name}`;

    // opossum Circuit Breaker 초기화
    this.breaker = new CircuitBreaker(action, {
      name: config.name,
      // 실패율이 50% 이상이면 Open
      errorThresholdPercentage: config.errorThresholdPercentage ?? 50,
      // 30초 후 Half-Open 상태로 전환 (탐침 시도)
      resetTimeout: config.resetTimeout ?? 30_000,
      // 3초 내 응답 없으면 실패 처리
      timeout: config.timeout ?? 3_000,
      // 10초 창 내 통계 집계
      rollingCountTimeout: config.rollingCountTimeout ?? 10_000,
      // 최소 5개 요청 후 CB 판단
      volumeThreshold: config.volumeThreshold ?? 5,
    });

    this.registerEventHandlers();
  }

  /**
   * 업스트림 API 호출 (Circuit Breaker 보호)
   * 실패 시 Redis 캐시 → Static Fallback 순으로 강등
   */
  async call(...args: unknown[]): Promise<UpstreamCallResult<T>> {
    const circuitState = this.getState();

    try {
      // 1차: 실제 업스트림 호출
      const data = await this.breaker.fire(...args) as T;

      // 성공 시 Redis에 마지막 성공 응답 캐싱
      await this.cacheResponse(data);

      return { data, cached: false, fallback: false, circuitState };
    } catch (error) {
      // CB Open 또는 실패 → Fallback 체인
      logger.warn({
        message: `업스트림 호출 실패 — Fallback 시작`,
        service: this.config.name,
        circuitState,
        error: String(error),
      });

      return this.executeFallback(circuitState);
    }
  }

  /**
   * Fallback 체인 실행
   * 2차(Redis 캐시) → 3차(Static)
   */
  private async executeFallback(
    circuitState: 'closed' | 'open' | 'halfOpen'
  ): Promise<UpstreamCallResult<T>> {
    // 2차: Redis 캐시 조회
    const cachedData = await this.getCachedResponse();
    if (cachedData !== null) {
      logger.info({
        message: 'Redis 캐시 Fallback 사용',
        service: this.config.name,
        circuitState,
      });
      return { data: cachedData, cached: true, fallback: true, circuitState };
    }

    // 3차: Static Fallback
    if (this.config.staticFallback !== undefined) {
      logger.warn({
        message: 'Static Fallback 사용 — 실시간 데이터 없음',
        service: this.config.name,
        circuitState,
        alert: 'FALLBACK_STATIC',
      });
      return {
        data: this.config.staticFallback as T,
        cached: false,
        fallback: true,
        circuitState,
      };
    }

    // 모든 Fallback 실패 → 에러 전파
    throw new Error(`서비스 ${this.config.name} 사용 불가 — 모든 Fallback 실패`);
  }

  /** Redis에 마지막 성공 응답 캐싱 */
  private async cacheResponse(data: T): Promise<void> {
    try {
      const ttl = this.config.cacheTtlSeconds ?? 300;
      await this.redis.setex(this.cacheKey, ttl, JSON.stringify(data));
    } catch (cacheError) {
      // 캐시 실패는 무시 (비크리티컬)
      logger.warn({
        message: 'Redis 캐싱 실패 (무시)',
        service: this.config.name,
        error: String(cacheError),
      });
    }
  }

  /** Redis에서 캐시된 응답 조회 */
  private async getCachedResponse(): Promise<T | null> {
    try {
      const cached = await this.redis.get(this.cacheKey);
      return cached ? JSON.parse(cached) as T : null;
    } catch {
      return null;
    }
  }

  /** Circuit Breaker 상태 조회 */
  getState(): 'closed' | 'open' | 'halfOpen' {
    if (this.breaker.opened)   return 'open';
    if (this.breaker.halfOpen) return 'halfOpen';
    return 'closed';
  }

  /** 현재 통계 (Kibana 대시보드 연동) */
  getStats() {
    const stats = this.breaker.stats;
    return {
      service: this.config.name,
      state: this.getState(),
      successCount:   stats.successes,
      failureCount:   stats.failures,
      timeoutCount:   stats.timeouts,
      shortCircuited: stats.fallbacks,
      successRate: stats.successPercentage,
      latencyMean: stats.latencyMean,
    };
  }

  /**
   * 이벤트 핸들러 등록
   * 모든 상태 변화를 구조화 로그로 기록 → ELK 알림
   */
  private registerEventHandlers(): void {
    // CB가 Open 상태로 전환 (장애 감지)
    this.breaker.on('open', () => {
      logger.error({
        message: `Circuit Breaker OPEN — 업스트림 차단`,
        service: this.config.name,
        cb_state: 'open',
        alert: 'CB_OPEN',
      });
    });

    // CB가 Half-Open으로 전환 (복구 시도)
    this.breaker.on('halfOpen', () => {
      logger.warn({
        message: `Circuit Breaker HALF-OPEN — 복구 탐침`,
        service: this.config.name,
        cb_state: 'half-open',
      });
    });

    // CB가 Closed로 복귀 (정상 복구)
    this.breaker.on('close', () => {
      logger.info({
        message: `Circuit Breaker CLOSED — 서비스 복구`,
        service: this.config.name,
        cb_state: 'closed',
      });
    });

    // Fallback 실행 이벤트
    this.breaker.on('fallback', (result) => {
      logger.warn({
        message: `Fallback 실행됨`,
        service: this.config.name,
        cb_state: this.getState(),
      });
    });

    // 타임아웃 이벤트
    this.breaker.on('timeout', () => {
      logger.warn({
        message: `업스트림 타임아웃 (${this.config.timeout}ms 초과)`,
        service: this.config.name,
        duration_ms: this.config.timeout,
      });
    });
  }
}
