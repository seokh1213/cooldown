import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { koreanTranslations, untranslatedReviewText } from "../../scripts/llm/review/translations";
import { renderReview } from "../../scripts/llm/review/render";

test("번역은 중복 원문과 수치 변경을 거부한다", () => {
  const entry = { source: "CD 130/110/90 · AD 275%", ko: "재사용 대기시간 130/110/90 · 공격력 275%" };
  assert.equal(koreanTranslations([entry])[entry.source], entry.ko);
  assert.throws(() => koreanTranslations([entry, entry]), /duplicate/);
  assert.throws(() => koreanTranslations([{ ...entry, ko: "재사용 대기시간 120/110/90 · 공격력 275%" }]), /numeric/);
});

test("고정된 41문항은 외국어 질문·답변·스킬 근거를 모두 번역하고 판정 입력을 보존한다", t => {
  const directory = "research/llm-evals/workflow/reports/review-20261007";
  const packet = JSON.parse(fs.readFileSync(`${directory}/packet.json`, "utf8"));
  const translations = JSON.parse(fs.readFileSync("scripts/llm/review/translations.ko.json", "utf8"));
  assert.deepEqual(untranslatedReviewText(packet.cases, koreanTranslations(translations.entries)), []);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "review-translation-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  assert.equal(renderReview(temporary, packet).untranslatedTexts, 0);
  const html = fs.readFileSync(path.join(temporary, "review.html"), "utf8");
  const embedded = JSON.parse(html.match(/<script id="packet" type="application\/json">([\s\S]*?)<\/script>/)![1]);
  assert.deepEqual(embedded, packet);
  const altered = structuredClone(packet); altered.cases[0].question = "변경된 질문";
  assert.throws(() => renderReview(temporary, altered), /packet hash mismatch/);
});
