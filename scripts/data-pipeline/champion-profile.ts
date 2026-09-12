import type { Champion } from "../../src/types";
import type { StaticDataMetadata } from "../../src/data/contracts/staticData";
import { decodeChampionProfile } from "../../src/data/contracts/championProfile";
import { htmlToPlainText } from "../../src/lib/htmlText";

export function buildChampionProfile(input: StaticDataMetadata & { champion: Champion }) {
  const { champion } = input;
  return decodeChampionProfile({
    schemaVersion: 2,
    patchVersion: input.patchVersion,
    sources: input.sources,
    locale: input.locale,
    champion: {
      id: champion.id, name: champion.name, title: champion.title,
      lore: htmlToPlainText(champion.lore ?? ""),
      // Chroma entries share their parent skin's splash and have no separate CDN image.
      skins: (champion.skins ?? []).filter((skin) => skin.parentSkin === undefined)
        .map(({ num, name }) => ({ num, name })),
    },
  });
}
