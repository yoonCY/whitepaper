/**
 * 구조화 로거 (JSON 형식)
 * ELK 파이프라인에서 자동 파싱되는 형식으로 출력
 */

import winston from 'winston';

/** JSON 구조화 로그 포맷 */
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, service, ...rest }) => {
    // ELK 파이프라인이 파싱할 수 있는 JSON 구조
    const log = {
      timestamp,
      level,
      service,
      message,
      ...rest,
    };
    return JSON.stringify(log);
  })
);

/**
 * 서비스별 로거 생성
 * @param serviceName 서비스/컴포넌트 이름 (Kibana 필터링에 사용)
 */
export function createLogger(serviceName: string): winston.Logger {
  return winston.createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    defaultMeta: {
      service: serviceName,
      environment: process.env.NODE_ENV ?? 'development',
    },
    format: structuredFormat,
    transports: [
      new winston.transports.Console(),
      // 운영: Filebeat가 수집할 파일 출력 추가
      // new winston.transports.File({ filename: '/var/log/app/app.log' }),
    ],
  });
}
