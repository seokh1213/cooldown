import fs from "node:fs";
import path from "node:path";

export async function fetchJson<T>(url: string, retries = 3): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      console.log(`Fetching: ${url}${attempt > 0 ? ` (retry ${attempt})` : ""}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return (await response.json()) as T;
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

export async function writeJson(data: unknown, filePath: string): Promise<void> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  console.log(`Saved: ${filePath}`);
}
