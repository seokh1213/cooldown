import type { DataLocale } from "@/data/contracts/staticData";
import type { StoredSelectedChampionList } from "@/lib/storageSchema";
import type { Tab } from "@/pages/EncyclopediaPage/types";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const APP_STORAGE_KEYS = {
  schema: "cooldown:storage-schema",
  theme: "theme",
  language: "language",
  pwaAutoUpdate: "pwaAutoUpdate",
  selectedChampions: "cooldown_selected_champions",
  tabs: "cooldown_tabs",
  selectedTabId: "cooldown_selected_tab_id",
} as const;

const STATE_SCHEMA_VERSION = "2";
const LEGACY_OWNED_KEYS = [
  "app_serialization_version",
  "encyclopedia_selected_champions",
  "encyclopedia_tabs",
  "encyclopedia_selected_tab_id",
];
const STATE_KEYS = [
  APP_STORAGE_KEYS.selectedChampions,
  APP_STORAGE_KEYS.tabs,
  APP_STORAGE_KEYS.selectedTabId,
  ...LEGACY_OWNED_KEYS,
];

function browserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readStorage(
  key: string,
  storage: StorageLike | undefined = browserStorage()
): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(
  key: string,
  value: string,
  storage: StorageLike | undefined = browserStorage()
): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Preferences remain in memory when storage is blocked or full.
  }
}

export function removeStorage(
  key: string,
  storage: StorageLike | undefined = browserStorage()
): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Removing persisted state is best-effort.
  }
}

export function readJsonStorage<T>(
  key: string,
  decode: (value: unknown) => T | null,
  storage: StorageLike | undefined = browserStorage()
): T | null {
  const value = readStorage(key, storage);
  if (!value) return null;
  try {
    const decoded = decode(JSON.parse(value));
    if (decoded) return decoded;
  } catch {
    // Invalid owned data is removed below.
  }
  removeStorage(key, storage);
  return null;
}

export function initializeAppStorage(
  storage: StorageLike | undefined = browserStorage()
): void {
  if (readStorage(APP_STORAGE_KEYS.schema, storage) === STATE_SCHEMA_VERSION) {
    return;
  }
  STATE_KEYS.forEach((key) => removeStorage(key, storage));
  writeStorage(APP_STORAGE_KEYS.schema, STATE_SCHEMA_VERSION, storage);
}

export function decodeSelectedChampions(
  value: unknown
): StoredSelectedChampionList | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((entry) =>
    typeof entry === "object" &&
    entry !== null &&
    typeof entry.id === "string" &&
    (entry.key === undefined || typeof entry.key === "string")
  )) return null;
  return value as StoredSelectedChampionList;
}

export function decodeTabs(value: unknown): Tab[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((tab) => {
    if (typeof tab !== "object" || tab === null) return false;
    if (tab.mode !== "normal" && tab.mode !== "vs") return false;
    if (typeof tab.id !== "string" || !Array.isArray(tab.champions)) return false;
    if (!tab.champions.every((id: unknown) => typeof id === "string")) return false;
    return tab.champions.length === (tab.mode === "normal" ? 1 : 2);
  })) return null;
  return value as Tab[];
}

export function readTheme(): "light" | "dark" | null {
  const value = readStorage(APP_STORAGE_KEYS.theme);
  return value === "light" || value === "dark" ? value : null;
}

export function readLocale(): DataLocale | null {
  const value = readStorage(APP_STORAGE_KEYS.language);
  return value === "ko_KR" || value === "en_US" || value === "zh_CN"
    ? value
    : null;
}
