/* global document */
import { STATS, rankedChampions } from "./ranking.js";

const data = globalThis.rankingData;
const state = { stat: "health", level: 1, role: "", search: "", view: "table", selected: [] };
const roleNames = { Fighter: "전사", Tank: "탱커", Mage: "마법사", Assassin: "암살자", Marksman: "원거리 딜러", Support: "서포터" };
const byId = new Map(data.champions.map(champion => [champion.id, champion]));
const element = id => document.getElementById(id);
const imageUrl = id => `../../public/img/${data.ddragon}/champion/${id}.webp`;
const number = value => value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });

function node(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}

function portrait(champion) {
  const image = node("img");
  image.src = imageUrl(champion.id); image.alt = ""; image.loading = "lazy";
  return image;
}

function growthText(champion) {
  const growth = champion.stats[state.stat].perLevel;
  return `+${number(growth)}${state.stat === "attackSpeed" ? "%" : ""}`;
}

function valueCell(champion, maximum) {
  const cell = node("td", undefined, "value");
  if (state.view === "table") cell.textContent = number(champion.value);
  else {
    const wrapper = node("div", undefined, "bar-value");
    const track = node("span", undefined, "bar-track");
    const fill = node("span", undefined, "bar-fill");
    fill.style.width = `${maximum ? champion.value / maximum * 100 : 0}%`;
    track.append(fill); wrapper.append(track, node("strong", number(champion.value))); cell.append(wrapper);
  }
  cell.append(node("span", growthText(champion), "mobile-growth"));
  return cell;
}

function championRow(champion, maximum) {
  const row = node("tr", undefined, state.selected.includes(champion.id) ? "chosen" : "");
  row.dataset.champion = champion.id;
  row.append(node("td", champion.rank, "rank"));
  const nameCell = node("td");
  const name = node("div", undefined, "champion");
  name.append(portrait(champion), node("span", champion.name)); nameCell.append(name); row.append(nameCell);
  row.append(node("td", champion.roles.map(role => roleNames[role]).join(" · "), "roles"));
  row.append(valueCell(champion, maximum), node("td", growthText(champion), "growth"));
  const selection = node("td", undefined, "selection");
  const label = node("label");
  const checkbox = node("input"); checkbox.type = "checkbox"; checkbox.checked = state.selected.includes(champion.id);
  checkbox.setAttribute("aria-label", `${champion.name} 비교 선택`);
  checkbox.addEventListener("change", () => toggleChampion(champion.id));
  label.append(checkbox); selection.append(label); row.append(selection);
  return row;
}

function renderDock() {
  const selected = element("selected"); selected.replaceChildren();
  if (!state.selected.length) selected.append(node("span", "궁금한 챔피언 두 명을 골라 보세요.", "dock-hint"));
  for (const id of state.selected) {
    const champion = byId.get(id); const chip = node("div", undefined, "selected-chip");
    const remove = node("button", "×"); remove.setAttribute("aria-label", `${champion.name} 선택 해제`);
    remove.addEventListener("click", () => toggleChampion(id));
    chip.append(portrait(champion), node("span", champion.name), remove); selected.append(chip);
  }
  const compare = element("compare"); const ready = state.selected.length === 2;
  compare.setAttribute("aria-disabled", String(!ready));
  if (ready) compare.href = `https://seokh1213.github.io/cooldown/vs?a=${state.selected[0]}&t=${state.selected[1]}`;
  else compare.removeAttribute("href");
}

function toggleChampion(id) {
  if (state.selected.includes(id)) state.selected = state.selected.filter(item => item !== id);
  else if (state.selected.length < 2) state.selected.push(id);
  else { element("selection-message").textContent = "먼저 선택한 챔피언 한 명을 해제하면 바꿀 수 있어요."; render(); return; }
  element("selection-message").textContent = state.selected.length === 1 ? "한 명 더 고르면 VS 화면에서 자세히 비교할 수 있어요." : "";
  render();
}

function render() {
  const champions = rankedChampions(data.champions, state);
  element("level-label").value = state.level;
  element("ranking-title").textContent = `${STATS[state.stat]} 순위`;
  element("value-heading").textContent = `${state.level}레벨 ${STATS[state.stat]}`;
  element("result-count").textContent = `${champions.length}명 · 전체 챔피언 기준 순위 · 높은 순`;
  document.querySelectorAll("[data-stat]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.stat === state.stat)));
  document.querySelectorAll("[data-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.view === state.view)));
  const maximum = Math.max(0, ...champions.map(champion => champion.value));
  element("rows").replaceChildren(...champions.map(champion => championRow(champion, maximum)));
  element("empty").hidden = champions.length > 0; renderDock();
}

for (const [stat, text] of Object.entries(STATS)) {
  const button = node("button", text); button.dataset.stat = stat;
  button.addEventListener("click", () => { state.stat = stat; render(); }); element("stat-tabs").append(button);
}
element("patch").textContent = `패치 ${data.patch} · ${data.champions.length}명`;
element("level").addEventListener("input", event => { state.level = Number(event.target.value); render(); });
document.querySelectorAll("[data-level]").forEach(button => button.addEventListener("click", () => {
  state.level = Number(button.dataset.level); element("level").value = state.level; render();
}));
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => { state.view = button.dataset.view; render(); }));
for (const id of ["role", "search"]) element(id).addEventListener("input", event => { state[id] = event.target.value; render(); });
element("reset").addEventListener("click", () => { state.search = ""; state.role = ""; element("search").value = ""; element("role").value = ""; render(); });
render();
