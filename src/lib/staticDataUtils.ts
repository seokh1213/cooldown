export function getRuntimeBasePath(): string {
  return import.meta.env?.BASE_URL || "/";
}
