import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const ARCHIVE_DIRECTORY = path.resolve("dev/data/patch-notes");
export const REPORT_DIRECTORY = path.resolve("public/patch-notes");

export async function readJson(file: string): Promise<unknown | undefined> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as unknown; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

async function writeTemporaryJson(file: string, value: unknown): Promise<string> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value));
  return temporary;
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  const temporary = await writeTemporaryJson(file, value);
  try { await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

export async function archiveJson(file: string, value: unknown): Promise<void> {
  const temporary = await writeTemporaryJson(file, value);
  try { await fs.link(temporary, file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  finally { await fs.rm(temporary, { force: true }); }
}
