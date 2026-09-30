/**
 * 로깅 유틸리티
 * 개발 환경에서는 모든 로그를 출력하고, 프로덕션 환경에서는 error만 출력합니다.
 * Node 스크립트(자료 생성·시험)에서 debug 는 DEBUG 환경 변수가 있을 때만 출력합니다.
 * 툴팁 계산에서 값이 빠지는 경우는 active-tooltip-validation.json 진단이 모읍니다.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const runtimeProcess = (
  globalThis as typeof globalThis & {
    process?: { env?: { NODE_ENV?: string; DEBUG?: string } };
  }
).process;
const isDevelopment = import.meta.env?.DEV
  ?? runtimeProcess?.env?.NODE_ENV !== "production";
const isDebug = import.meta.env?.DEV ?? Boolean(runtimeProcess?.env?.DEBUG);

class Logger {
  private shouldLog(level: LogLevel): boolean {
    if (level === 'debug') {
      return isDebug;
    }
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
