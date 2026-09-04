import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpellTooltip } from "../src/lib/spellTooltipParser";
import type { CommunityDragonSpellData } from "../src/lib/spellTooltipParser/types";
import type { ChampionSpell } from "../src/types";

interface VersionInfo {
  version: string;
}

interface SpellDataFile {
  spellData: Record<string, CommunityDragonSpellData>;
  passive?: {
    id: string;
    locKeys: { keyTooltip?: string };
    localized: Record<string, { tooltip?: string }> | null;
  } | null;
}

interface ChampionFile {
  champion: {
    spells: ChampionSpell[];
    passive?: {
      description?: string;
      summary?: string;
      spellId?: string;
      tooltipSource?: string;
    };
  };
}

const passiveLocales = ["ko_KR", "en_US", "zh_CN"] as const;

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(
  await fs.readFile(path.join(projectRoot, "public/data/version.json"), "utf8")
) as VersionInfo;
const corki = JSON.parse(
  await fs.readFile(
    path.join(projectRoot, "public/data", version.version, "spells/Corki.json"),
    "utf8"
  )
) as SpellDataFile;

const qDataValues = corki.spellData.PhosphorusBomb?.DataValues;
assert.ok(qDataValues, "Corki Q DataValues must be generated from the current CDragon schema");
assert.deepEqual(qDataValues.BaseDamage?.slice(1, 6), [60, 105, 150, 195, 240]);
assert.deepEqual(qDataValues.ADRatio?.slice(1, 6), [1.25, 1.25, 1.25, 1.25, 1.25]);
assert.deepEqual(qDataValues.APRatio?.slice(1, 6), [1, 1, 1, 1, 1]);

const wukongChampion = JSON.parse(
  await fs.readFile(
    path.join(
      projectRoot,
      "public/data",
      version.version,
      "champions/MonkeyKing-ko_KR.json"
    ),
    "utf8"
  )
) as ChampionFile;
const wukongData = JSON.parse(
  await fs.readFile(
    path.join(projectRoot, "public/data", version.version, "spells/MonkeyKing.json"),
    "utf8"
  )
) as SpellDataFile;
const wukongQ = wukongChampion.champion.spells[0];
const wukongTooltip = parseSpellTooltip(
  wukongQ.tooltip,
  wukongQ,
  wukongData.spellData[wukongQ.id],
  "ko_KR"
);
assert.match(wukongTooltip, /사거리가 135\/145\/155\/165\/175 증가/);
assert.match(wukongTooltip, /20\/45\/70\/95\/120/);
assert.match(wukongTooltip, /방어력이 10\/15\/20\/25\/30%/);
assert.match(wukongTooltip, /재사용 대기시간이 0\.5초 감소/);

for (const locale of passiveLocales) {
  const localizedWukong = JSON.parse(
    await fs.readFile(
      path.join(
        projectRoot,
        "public/data",
        version.version,
        `champions/MonkeyKing-${locale}.json`
      ),
      "utf8"
    )
  ) as ChampionFile;
  const description = localizedWukong.champion.passive?.description ?? "";
  assert.match(description, /\(6 ~ 10\)/, `Wukong passive range (${locale})`);
  assert.match(description, /0\.35%/, `Wukong passive regen (${locale})`);
  assert.match(description, /5/, `Wukong passive stack values (${locale})`);
}

const championsDir = path.join(
  projectRoot,
  "public/data",
  version.version,
  "champions"
);
const championFiles = (await fs.readdir(championsDir))
  .filter((name) => name.endsWith("-en_US.json"))
  .sort();
let mappedSpellCount = 0;
let totalSpellCount = 0;
let variableSpellCount = 0;
let detailedPassiveCount = 0;
const passiveFallbacks: string[] = [];
const allowedPassiveFallbacks = new Set([
  "Kalista",
  "Kayn",
  "Ornn",
  "TwistedFate",
  "Zilean",
]);
for (const fileName of championFiles) {
  const championId = fileName.replace("-en_US.json", "");
  const championFile = JSON.parse(
    await fs.readFile(path.join(championsDir, fileName), "utf8")
  ) as ChampionFile;
  const spellFile = JSON.parse(
    await fs.readFile(
      path.join(projectRoot, "public/data", version.version, `spells/${championId}.json`),
      "utf8"
    )
  ) as SpellDataFile;
  const passiveData = spellFile.spellData.P;
  assert.ok(passiveData, `${championId} must expose its passive as the P alias`);
  if (spellFile.passive) {
    assert.deepEqual(
      spellFile.spellData[spellFile.passive.id],
      passiveData,
      `${championId} passive id and P aliases must match`
    );
    assert.ok(
      spellFile.passive.locKeys.keyTooltip,
      `${championId} passive must preserve keyTooltip`
    );
  }

  let hasDetailedPassiveInEveryLocale = true;
  for (const locale of passiveLocales) {
    const localizedFile = JSON.parse(
      await fs.readFile(
        path.join(championsDir, `${championId}-${locale}.json`),
        "utf8"
      )
    ) as ChampionFile;
    const passive = localizedFile.champion.passive;
    assert.ok(passive?.description, `${championId} passive description (${locale})`);
    assert.doesNotMatch(
      passive.description,
      /@[^@]+@|\{\{[^}]+}}/,
      `${championId} passive must not contain unresolved template tokens (${locale})`
    );
    if (passive.tooltipSource !== "communitydragon") {
      hasDetailedPassiveInEveryLocale = false;
    }
  }
  if (hasDetailedPassiveInEveryLocale) {
    detailedPassiveCount += 1;
  } else {
    passiveFallbacks.push(championId);
  }
  championFile.champion.spells.forEach((spell, index) => {
    totalSpellCount += 1;
    const byIndex = spellFile.spellData[String(index)];
    const byId = spellFile.spellData[spell.id];
    const spellData = byId ?? byIndex;
    const meaningfulVariables = [...spell.tooltip.matchAll(/\{\{([^}]+)}}/g)]
      .map((match) => match[1])
      .filter((token) =>
        !/spellmodifierdescriptionappend|gamemodeinteger|Spell_.*Tooltip/i.test(token)
      );
    if (meaningfulVariables.length > 0) {
      assert.ok(spellData, `${championId} ${spell.id} variables require spell data`);
      variableSpellCount += 1;
    }
    if (byId && byIndex) {
      assert.deepEqual(
        byId,
        byIndex,
        `${championId} ${spell.id} id and index aliases must match`
      );
    }
    if (spellData) mappedSpellCount += 1;
  });
}
assert.ok(championFiles.length > 0);
assert.ok(variableSpellCount > 0);
assert.ok(mappedSpellCount >= variableSpellCount);
assert.deepEqual(
  passiveFallbacks.filter((championId) => !allowedPassiveFallbacks.has(championId)),
  [],
  `unexpected passive fallbacks: ${passiveFallbacks.join(", ")}`
);
assert.ok(detailedPassiveCount >= championFiles.length - allowedPassiveFallbacks.size);

console.log(
  `✅ CommunityDragon schema: ${variableSpellCount} variable spells mapped ` +
    `(${mappedSpellCount}/${totalSpellCount} total spells have calculation data); ` +
    `${detailedPassiveCount}/${championFiles.length} passives localized in all three locales`
);
