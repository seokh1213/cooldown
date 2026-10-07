export interface SourceFailure { id: string; error: string; transient: boolean; httpStatus?: number }
export interface SourceHealth {
  schemaVersion: number;
  status: "available" | "deferred" | "unavailable";
  checkedAt: string;
  lastSuccessAt: string | null;
  firstUnavailableAt?: string;
  outageMs?: number;
  failures: SourceFailure[];
}
export const OUTAGE_LIMIT_MS: number;
export class SourceHttpError extends Error { constructor(status: number, url: string); readonly status: number }
export function isTransientError(error: unknown): boolean;
export function sourceFailure(id: string, error: unknown): SourceFailure;
export function readHealth(file: string): SourceHealth | undefined;
export function nextHealth(previous: SourceHealth | undefined, failures: SourceFailure[], now?: Date): SourceHealth;
export function saveHealth(file: string, failures: SourceFailure[], context?: Record<string, unknown>): SourceHealth;
