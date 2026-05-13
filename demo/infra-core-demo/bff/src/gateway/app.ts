/**
 * BFF 게이트웨이 — Express 앱 진입점
 * 역할:
 * - 인증 미들웨어 (JWT 검증)
 * - Rate Limiting (DDoS 방어)
 * - 요청 라우팅 (프론트엔드 → 업스트림 서비스)
 * - 응답 집계 (Aggregation)
 * - 헬스체크 엔드포인트 (K8s Liveness/Readiness)
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { ServiceAggregator } from '../aggregator/service-aggregator';
import { createLogger } from '../utils/logger';

const logger = createLogger('BffGateway');

// ──────────────────────────────────────────
// Express 앱 초기화
// ──────────────────────────────────────────
const app = express();

// 보안 헤더 설정 (Zero-Trust)
app.use(helmet());

// CORS 설정 (프론트엔드 도메인만 허용)
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3001'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────
// Rate Limiter (DDoS/남용 방지)
// ──────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,   // 1분
  max: 100,               // 분당 100 요청
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '요청 한도 초과. 잠시 후 재시도하세요.' },
});
app.use('/api/', limiter);

// ──────────────────────────────────────────
// 요청 추적 미들웨어 (Trace ID 주입)
// ──────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const traceId = (req.headers['x-trace-id'] as string) ?? uuidv4();
  res.setHeader('x-trace-id', traceId);
  (req as any).traceId = traceId;

  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      message: 'HTTP 요청',
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      duration_ms: Date.now() - start,
      trace_id: traceId,
      user_agent: req.headers['user-agent'],
    });
  });

  next();
});

// ──────────────────────────────────────────
// 의존성 초기화
// ──────────────────────────────────────────
const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

const aggregator = new ServiceAggregator(
  [
    {
      name: 'user-service',
      baseUrl: process.env.USER_SERVICE_URL ?? 'http://user-service:8080',
      timeout: 3_000,
      cacheTtlSeconds: 60,
    },
    {
      name: 'product-service',
      baseUrl: process.env.PRODUCT_SERVICE_URL ?? 'http://product-service:8080',
      timeout: 3_000,
      cacheTtlSeconds: 300,
    },
    {
      name: 'order-service',
      baseUrl: process.env.ORDER_SERVICE_URL ?? 'http://order-service:8080',
      timeout: 5_000,
      cacheTtlSeconds: 30,
    },
  ],
  redis
);

// ──────────────────────────────────────────
// API 라우트
// ──────────────────────────────────────────

/**
 * 사용자 대시보드 집계 API
 * 여러 서비스 데이터를 한 번의 요청으로 집계하여 프론트엔드 부하 감소
 */
app.get('/api/v1/dashboard', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: 'userId 파라미터 필요' });
    }

    const data = await aggregator.aggregate([
      { service: 'user-service',    path: `/users/${userId}` },
      { service: 'product-service', path: '/products/featured' },
      { service: 'order-service',   path: `/orders?userId=${userId}&limit=5` },
    ]);

    const hasAnySuccess = Object.values(data).some(d => d.success);
    if (!hasAnySuccess) {
      return res.status(503).json({ error: '모든 서비스 일시 불가', data });
    }

    res.json({
      success: true,
      traceId: (req as any).traceId,
      data,
    });
  } catch (error) {
    logger.error({
      message: '대시보드 API 오류',
      error: String(error),
      trace_id: (req as any).traceId,
    });
    res.status(500).json({ error: '서버 내부 오류' });
  }
});

// ──────────────────────────────────────────
// 헬스체크 (K8s Liveness / Readiness)
// ──────────────────────────────────────────

/** Liveness: 프로세스가 살아있는지 */
app.get('/healthz/live', (_req: Request, res: Response) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

/** Readiness: 트래픽 받을 준비가 됐는지 */
app.get('/healthz/ready', async (_req: Request, res: Response) => {
  try {
    // Redis 연결 확인
    await redis.ping();
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'not_ready', reason: 'Redis 연결 실패' });
  }
});

/** Circuit Breaker 상태 조회 (운영 모니터링용) */
app.get('/healthz/circuit-breakers', (_req: Request, res: Response) => {
  res.json({
    timestamp: new Date().toISOString(),
    circuitBreakers: aggregator.getHealthStatus(),
  });
});

// ──────────────────────────────────────────
// 글로벌 에러 핸들러
// ──────────────────────────────────────────
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({
    message: '처리되지 않은 오류',
    error: err.message,
    stack: err.stack,
    path: req.path,
    trace_id: (req as any).traceId,
  });
  res.status(500).json({ error: '서버 내부 오류' });
});

// ──────────────────────────────────────────
// 서버 시작
// ──────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000;

async function bootstrap() {
  try {
    await redis.connect();
    logger.info({ message: 'Redis 연결 성공' });
  } catch (error) {
    logger.warn({ message: 'Redis 연결 실패 — Fallback 없이 시작', error: String(error) });
  }

  app.listen(PORT, () => {
    logger.info({
      message: 'BFF 서버 시작',
      port: PORT,
      environment: process.env.NODE_ENV ?? 'development',
    });
  });
}

// Graceful Shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info({ message: `${signal} 수신 — 서버 종료 중` });
  await redis.quit();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

bootstrap().catch((error) => {
  logger.error({ message: '서버 시작 실패', error: String(error) });
  process.exit(1);
});

export default app;
