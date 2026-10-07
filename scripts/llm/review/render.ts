import fs from "node:fs";
import path from "node:path";
import { digest } from "../quality/bank";
import { safeEmbeddedJson, type ReviewCase } from "./packet";
import { koreanTranslations, untranslatedReviewText, type KoreanTranslation } from "./translations";

export function renderReview(directory: string, packet: { cases: ReviewCase[]; packetHash: string }) {
  const { packetHash, ...content } = packet;
  if (digest(content) !== packetHash) throw new Error("Review packet hash mismatch");
  const source = (file: string) => fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const entries = JSON.parse(source("translations.ko.json")) as { entries: KoreanTranslation[] };
  const translations = koreanTranslations(entries.entries);
  const missing = untranslatedReviewText(packet.cases, translations);
  const html = source("shell.html").replace("/* REVIEW_STYLE */", () => source("style.css"))
    .replace("/* REVIEW_SCRIPT */", () => source("app.js"))
    .replace("/* REVIEW_DATA */", () => safeEmbeddedJson(packet))
    .replace("/* REVIEW_TRANSLATIONS */", () => safeEmbeddedJson(translations));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "review.html"), html);
  return { untranslatedTexts: missing.length };
}
