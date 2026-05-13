/**
 * 서비스 집계기 (Aggregator)
 * 여러 업스트림 서비스를 병렬 호출하여 응답 통합
 *
 * 특징:
 * - Promise.allSettled: 일부 서비스 실패 시에도 나머지 데이터 반환
 * - 각 서비스별 독립 Circuit Breaker
 * - 응답 시간 추적 + 구조화 로그
 */

import axios, { AxiosInstance } from 'axios';
import { Redis } from 'ioredis';
import { CircuitBreakerWrapper } from '../circuit-breaker/circuit-breaker';
import { createLogger } from '../utils/logger';

const logger = createLogger('ServiceAggregator');

interface UpstreamService {
  name: string;
  baseUrl: string;
  timeout?: number;
  cacheTtlSeconds?: number;
}

interface AggregatedResponse<T = unknown> {
  [serviceName: string]: {
    success: boolean;
    data?: T;
    cached?: boolean;
    fallback?: boolean;
    circuitState?: string;
    error?: string;
  };
}

export class ServiceAggregator {
  private breakers: Map<string, CircuitBreakerWrapper<unknown>> = new Map();
  private clients: Map<string, AxiosInstance> = new Map();

  constructor(
    private readonly services: UpstreamService[],
    private readonly redis: Redis
  ) {
    this.initialize();
  }

  private initialize(): void {
    for (const svc of this.services) {
      // 서비스별 독립 Axios 클라이언트
      const client = axios.create({
        baseURL: svc.baseUrl,
        timeout: svc.timeout ?? 3_000,
        headers: { 'Content-Type': 'application/json' },
      });

      // 서비스별 독립 Circuit Breaker
      // 한 서비스 장애가 다른 서비스로 전파되지 않음
      const breaker = new CircuitBreakerWrapper<unknown>(
        async (path: unknown) => {
          const res = await client.get(path as string);
          return res.data;
        },
        {
          name: svc.name,
          errorThresholdPercentage: 50,
          resetTimeout: 30_000,
          timeout: svc.timeout ?? 3_000,
          cacheTtlSeconds: svc.cacheTtlSeconds ?? 300,
          staticFallback: { _fallback: true, service: svc.name },
        },
        this.redis
      );

      this.clients.set(svc.name, client);
      this.breakers.set(svc.name, breaker);
    }
  }

  /**
   * 여러 서비스 병렬 호출 + 응답 집계
   * Promise.allSettled: 일부 실패해도 성공한 서비스 데이터는 반환
   */
  async aggregate(
    calls: Array<{ service: string; path: string }>
  ): Promise<AggregatedResponse> {
    const startTime = Date.now();

    const results = await Promise.allSettled(
      calls.map(async ({ service, path }) => {
        const breaker = this.breakers.get(service);
        if (!breaker) {
          throw new Error(`알 수 없는 서비스: ${service}`);
        }
        const result = await breaker.call(path);
        return { service, result };
      })
    );

    const aggregated: AggregatedResponse = {};
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < results.length; i++) {
      const call = calls[i];
      const result = results[i];

      if (result.status === 'fulfilled') {
        aggregated[call.service] = {
          success: true,
          data: result.value.result.data,
          cached: result.value.result.cached,
          fallback: result.value.result.fallback,
          circuitState: result.value.result.circuitState,
        };
        successCount++;
      } else {
        aggregated[call.service] = {
          success: false,
          error: result.reason?.message ?? '알 수 없는 오류',
        };
        failCount++;
      }
    }

    const duration = Date.now() - startTime;

    logger.info({
      message: '서비스 집계 완료',
      totalServices: calls.length,
      successCount,
      failCount,
      duration_ms: duration,
    });

    return aggregated;
  }

  /** 모든 서비스의 Circuit Breaker 상태 조회 */
  getHealthStatus() {
    const status: Record<string, object> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      status[name] = breaker.getStats();
    }
    return status;
  }
}
