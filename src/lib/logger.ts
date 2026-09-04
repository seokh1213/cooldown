/**
 * 로깅 유틸리티
 * 개발 환경에서는 모든 로그를 출력하고, 프로덕션 환경에서는 error만 출력합니다.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const runtimeProcess = (
  globalThis as typeof globalThis & {
    process?: { env?: { NODE_ENV?: string } };
  }
).process;
const isDevelopment = import.meta.env?.DEV
  ?? runtimeProcess?.env?.NODE_ENV !== "production";

class Logger {
  private shouldLog(level: LogLevel): boolean {
    if (isDevelopment) {
      return true; // 개발 환경에서는 모든 로그 출력
    }
    // 프로덕션 환경에서는 error만 출력
    return level === 'error';
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(...args);
    }
  }

  error(...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(...args);
    }
  }
}

export const logger = new Logger();
