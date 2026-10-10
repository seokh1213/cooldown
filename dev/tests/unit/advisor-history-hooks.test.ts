import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";

const revealMock = `
  mock.module("./src/features/advisor/answers/useRevealText.ts", { exports: {
    useRevealText: write => ({ reveal: (id, content) => write(id, content), finishReveal() {}, revealing: false }),
  } });
`;

const setup = `
  import assert from "node:assert/strict";
  import { readFileSync } from "node:fs";
  import { mock } from "node:test";
  import { readCurrentPatchVersion } from "./dev/scripts/advisor/lib/data.ts";
  const read = path => JSON.parse(readFileSync(path, "utf8"));
  const patch = readCurrentPatchVersion();
  const aatrox = read("public/data/" + patch + "/champions/ko_KR/Aatrox.json");
  const ahri = read("public/data/" + patch + "/champions/ko_KR/Ahri.json");
  const cards = read("public/data/" + patch + "/llm/champion-cards-ko_KR.json").cards;
  const card = cards.find(entry => entry.id === "Aatrox");
  const otherCard = cards.find(entry => entry.id === "Ahri");
  const originalSource = { patch: aatrox.patchVersion, locale: aatrox.locale, ddragonVersion: aatrox.sources.ddragon };
  const nextPatch = patch.split(".").map((part, index) => index === 1 ? String(Number(part) + 1) : part).join(".");
  const nextDdragon = originalSource.ddragonVersion.split(".").map((part, index) => index === 1 ? String(Number(part) + 1) : part).join(".");
  const values = new Map();
  const listeners = new Map();
  const timers = new Map();
  let timerId = 0;
  let quotaBlocked = false;
  const requests = [];
  let detailLoader = async path => path.endsWith("/Aatrox.json") ? aatrox : ahri;
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem(key, value) { if (quotaBlocked) throw new DOMException("full", "QuotaExceededError"); values.set(key, value); },
    },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  };
  let active;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  class Harness {
    slots = []; cursor = 0; effects = []; dirty = false;
    constructor(call) { this.call = call; }
    flush() {
      let renders = 0;
      do {
        assert.ok(++renders < 30, "hook must settle");
        this.cursor = 0; this.effects = []; this.dirty = false; active = this;
        this.result = this.call(); active = undefined;
        for (const effect of this.effects) { effect.cleanup?.(); effect.cleanup = effect.fn(); }
      } while (this.dirty);
      return this.result;
    }
    dispose() { for (const slot of this.slots) slot?.cleanup?.(); }
  }
  mock.module("react", { exports: {
    useState(initial) {
      const owner = active; const index = owner.cursor++;
      if (!owner.slots[index]) {
        const slot = { value: typeof initial === "function" ? initial() : initial };
        slot.set = next => {
          const value = typeof next === "function" ? next(slot.value) : next;
          if (!Object.is(value, slot.value)) { slot.value = value; owner.dirty = true; }
        };
        owner.slots[index] = slot;
      }
      const slot = owner.slots[index]; return [slot.value, slot.set];
    },
    useRef(initial) { const index = active.cursor++; return active.slots[index] ??= { current: initial }; },
    useMemo(fn, deps) {
      const index = active.cursor++; let slot = active.slots[index];
      if (!slot || !same(slot.deps, deps)) active.slots[index] = slot = { deps, value: fn() };
      return slot.value;
    },
    useCallback(fn, deps) {
      const index = active.cursor++; let slot = active.slots[index];
      if (!slot || !same(slot.deps, deps)) active.slots[index] = slot = { deps, value: fn };
      return slot.value;
    },
    useEffect(fn, deps) {
      const index = active.cursor++; let slot = active.slots[index];
      if (!slot || !same(slot.deps, deps)) {
        if (!slot) active.slots[index] = slot = {};
        slot.deps = deps; slot.fn = fn; active.effects.push(slot);
      }
    },
  } });
  ${revealMock}
  mock.module("./src/features/advisor/conversation/dialogueReply.ts", { exports: { dialogueAnswerText: () => "" } });
  mock.module("./src/infrastructure/http/staticDataClient.ts", { exports: {
    createStaticDataClient: () => ({ getJson(path) { requests.push(path); return detailLoader(path); } }),
  } });
  const { useAdvisorTurns } = await import("./src/features/advisor/session/useAdvisorTurns.ts");
  const { useAdvisorHistoryDetails } = await import("./src/features/advisor/session/useAdvisorHistoryDetails.ts");
  const { useAdvisorHistory } = await import("./src/features/advisor/session/useAdvisorHistory.ts");
  const { CONVERSATIONS_KEY } = await import("./src/features/advisor/storage/history.ts");
  const tick = async () => { await new Promise(resolve => setImmediate(resolve)); };
`;

async function runScenario(source: string, realReveal = false) {
  const { stderr } = await promisify(execFile)(process.execPath, [
    "--experimental-test-module-mocks", "--disable-warning=ExperimentalWarning",
    "--import", "tsx", "--input-type=module", "--eval", (realReveal ? setup.replace(revealMock, "") : setup) + source,
  ], { cwd: new URL("../../../", import.meta.url) });
  assert.equal(stderr, "");
}

test("지연된 답변 표시 타이머는 실제 경과 시간에 맞춰 완료하고 다음 답변·해제 시 정리한다", async () => {
  await runScenario(`
    let now = 0;
    mock.method(performance, "now", () => now);
    window.setInterval = fn => { timers.set(++timerId, fn); return timerId; };
    window.clearInterval = id => timers.delete(id);
    const { useRevealText } = await import("./src/features/advisor/answers/useRevealText.ts");
    const writes = new Map();
    const write = (id, text) => writes.set(id, text);
    const harness = new Harness(() => useRevealText(write));
    let hook = harness.flush();
    const text = "긴 답변 😀 ".repeat(80);
    hook.reveal(1, text); hook = harness.flush();
    assert.equal(hook.revealing, true);
    now = 1200; [...timers.values()][0](); hook = harness.flush();
    assert.ok(writes.get(1).length > text.length * 0.5);
    assert.ok(writes.get(1).length < text.length);
    assert.doesNotMatch(writes.get(1), /[\\uD800-\\uDBFF]$/);
    now = 2000; [...timers.values()][0](); hook = harness.flush();
    assert.equal(writes.get(1), text);
    assert.equal(hook.revealing, false);
    assert.equal(timers.size, 0);
    hook.reveal(2, text); hook = harness.flush();
    hook.reveal(3, "다음 답변"); hook = harness.flush();
    assert.equal(writes.get(2), text);
    assert.equal(timers.size, 1);
    hook.finishReveal(); hook = harness.flush();
    assert.equal(writes.get(3), "다음 답변");
    assert.equal(timers.size, 0);
    hook.reveal(4, text); harness.flush(); harness.dispose();
    assert.equal(timers.size, 0);
  `, true);
});

test("발화 출처는 begin 당시 복제본을 유지하고 직접 응답은 현재 출처를 남긴다", async () => {
  await runScenario(`
    let source = structuredClone(originalSource);
    const harness = new Harness(() => useAdvisorTurns("ko_KR", () => {}, source));
    let hook = harness.flush();
    hook.begin("old question", "thinking"); hook = harness.flush();
    source.patch = nextPatch; source.locale = "en_US"; source.ddragonVersion = nextDdragon;
    hook = harness.flush();
    hook.place("old question", { role: "assistant", content: "answer", answer: { kind: "champion", card } });
    hook = harness.flush();
    assert.deepEqual(hook.turns[0].source, originalSource);
    assert.deepEqual(hook.turns[1].source, originalSource);
    hook.place("new question", { role: "assistant", content: "new answer" }); hook = harness.flush();
    assert.deepEqual(hook.turns.at(-1).source, source);
    assert.notEqual(hook.turns.at(-1).source, source);
    harness.dispose();
  `);
});

test("신규 참조 상세만 검증해 보관하고 중복·출처 불일치·복원 발화는 변경하지 않는다", async () => {
  await runScenario(`
    const harness = new Harness(() => useAdvisorTurns("ko_KR", () => {}, originalSource));
    let hook = harness.flush();
    const id = hook.place("question", { role: "assistant", content: "answer", answer: { kind: "champion", card } });
    hook = harness.flush();
    const before = hook.turns;
    for (const invalid of [
      { ...aatrox, patchVersion: nextPatch }, { ...aatrox, locale: "en_US" },
      { ...aatrox, sources: { ...aatrox.sources, ddragon: nextDdragon } }, ahri,
      { ...aatrox, champion: { ...aatrox.champion, id: 123 } },
    ]) {
      hook.attachReferenceDetail(id, invalid); hook = harness.flush();
      assert.equal(hook.turns, before);
    }
    const originalName = aatrox.champion.name;
    hook.attachReferenceDetail(id, aatrox); hook = harness.flush();
    assert.equal(hook.turns[1].details.Aatrox.champion.name, originalName);
    aatrox.champion.name = "mutated after attach";
    assert.equal(hook.turns[1].details.Aatrox.champion.name, originalName);
    const captured = hook.turns;
    hook.attachReferenceDetail(id, aatrox); hook = harness.flush(); assert.equal(hook.turns, captured);
    const historical = { id, role: "assistant", content: "old", source: originalSource,
      answer: { kind: "champion", card }, historical: { id, role: "assistant", content: "old" } };
    hook.replaceTurns([historical]); hook = harness.flush();
    hook.attachReferenceDetail(id, aatrox); hook = harness.flush();
    assert.equal(hook.turns[0], historical);
    assert.equal(hook.turns[0].details, undefined);
    harness.dispose();
  `);
});

test("champion·spell·compare·suggestion의 신규 참조를 공유 요청하고 과거 자료는 요청하지 않는다", async () => {
  await runScenario(`
    const pending = new Map();
    detailLoader = path => new Promise(resolve => pending.set(path, resolve));
    const turn = (id, answer) => ({ id, role: "assistant", content: "", source: originalSource, answer });
    let turns = [
      turn(1, { kind: "champion", card }),
      turn(2, { kind: "spell", championId: "Ahri" }),
      turn(3, { kind: "compare", cards: [card, otherCard] }),
      turn(4, { kind: "suggestion", candidates: [card, otherCard, card] }),
      { ...turn(5, { kind: "champion", card: { id: "Lux" } }), historical: { id: 5, role: "assistant", content: "old" } },
      { id: 6, role: "user", content: "question", source: originalSource },
    ];
    const attached = [];
    const attach = (id, detail) => attached.push([id, detail.champion.id]);
    const harness = new Harness(() => useAdvisorHistoryDetails(turns, attach));
    harness.flush();
    assert.equal(requests.length, 2);
    assert.ok(requests.every(path => path.endsWith("/Aatrox.json") || path.endsWith("/Ahri.json")));
    turns = [...turns]; harness.flush(); assert.equal(requests.length, 2);
    for (const [path, resolve] of pending) resolve(path.endsWith("/Aatrox.json") ? aatrox : ahri);
    await tick();
    assert.deepEqual(attached.sort(), [[1, "Aatrox"], [2, "Ahri"], [3, "Aatrox"], [3, "Ahri"], [4, "Aatrox"], [4, "Ahri"]].sort());
    turns = [...turns]; harness.flush(); await tick(); assert.equal(attached.length, 6);
    harness.dispose();
  `);
});

test("현재 자료 없이 즉시 복원하고 원본 없는 카드와 다른 패치 기억을 재저장해 보존한다", async () => {
  await runScenario(`
    const raw = { id: 2, role: "assistant", content: "Original answer", source: originalSource,
      answer: { kind: "champion", cardId: "Aatrox" }, memory: { patch: "26.19", conditions: [], active: "compare", compared: ["Aatrox", "Ahri"] } };
    const conversation = { id: "saved", title: "Old question", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
      turns: [{ id: 1, role: "user", content: "Old question" }, raw] };
    values.set(CONVERSATIONS_KEY, JSON.stringify([conversation]));
    let harness;
    const advisor = { status: "idle", working: false, turns: [],
      replaceTurns(turns) { advisor.turns = turns; harness.dirty = true; },
      reset() { advisor.turns = []; harness.dirty = true; } };
    harness = new Harness(() => useAdvisorHistory(advisor, "26.20"));
    const history = harness.flush();
    assert.equal(history.restoring, false);
    assert.equal(history.currentId, "saved");
    assert.equal(advisor.turns[1].content, "Original answer");
    assert.equal(advisor.turns[1].referenceUnavailable, true);
    assert.equal(advisor.turns[1].memory, undefined);
    assert.deepEqual(advisor.turns[1].historical, raw);
    assert.deepEqual(readSaved().turns[1], raw);
    assert.equal(requests.length, 0);
    harness.dispose();
    function readSaved() { return JSON.parse(values.get(CONVERSATIONS_KEY))[0]; }
  `);
});

test("저장 용량 오류는 기존 기록을 지우지 않고 미저장 대화 전체를 재시도로 기록한다", async () => {
  await runScenario(`
    const existing = { id: "old", title: "Old", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
      turns: [{ id: 1, role: "user", content: "Old" }] };
    values.set(CONVERSATIONS_KEY, JSON.stringify([existing]));
    let harness;
    const advisor = { status: "idle", working: false, turns: [],
      replaceTurns(turns) { advisor.turns = turns; harness.dirty = true; },
      reset() { advisor.turns = []; harness.dirty = true; } };
    harness = new Harness(() => useAdvisorHistory(advisor, "26.19"));
    let history = harness.flush();
    const persisted = values.get(CONVERSATIONS_KEY);
    quotaBlocked = true;
    const created = [];
    for (const question of ["Unsaved one", "Unsaved two"]) {
      history.startNew(); history = harness.flush(); created.push(history.currentId);
      advisor.turns = [{ id: 10, role: "user", content: question }]; history = harness.flush();
      assert.equal(history.saveFailed, true);
      assert.equal(values.get(CONVERSATIONS_KEY), persisted);
    }
    assert.ok(created.every(id => history.conversations.some(conversation => conversation.id === id)));
    history.retrySave(); history = harness.flush(); assert.equal(history.saveFailed, true);
    assert.equal(values.get(CONVERSATIONS_KEY), persisted);
    quotaBlocked = false; history.retrySave(); history = harness.flush();
    assert.equal(history.saveFailed, false);
    const stored = JSON.parse(values.get(CONVERSATIONS_KEY));
    assert.ok(created.every(id => stored.some(conversation => conversation.id === id)));
    assert.ok(stored.some(conversation => conversation.id === "old"));
    harness.dispose();
    assert.equal(timers.size, 0);
    assert.equal(listeners.get("pagehide").size, 0);
  `);
});
