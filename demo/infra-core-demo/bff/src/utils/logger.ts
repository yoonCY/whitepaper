import winston from 'winston';

const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, service, ...rest }) => {
    return JSON.stringify({ timestamp, level, service, message, ...rest });
  })
);

export function createLogger(serviceName: string): winston.Logger {
  return winston.createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    defaultMeta: { service: serviceName, environment: process.env.NODE_ENV ?? 'development' },
    format: structuredFormat,
    transports: [new winston.transports.Console()],
  });
}
