# cooldown

**English** · [한국어](README.ko.md) · [简体中文](README.zh-CN.md)

Check ability cooldowns before the game starts. A static web app for League of Legends that shows every champion's ability cooldowns with the full in-game description, and puts your champion and the opponent side by side.

Live: https://seokh1213.github.io/cooldown/

## Repository layout

The project has three main areas.

```text
src/       # Application source
public/    # Public deployment data, images and models
dev/       # Tools, tests, docs, source data and research
```

[Folder conventions and reading order](dev/docs/project-structure.md)

## Ability cooldowns and descriptions

All 173 champions. P/Q/W/E/R cooldowns by rank, cost, per-rank values and scaling ratios, with the in-game description rendered from Riot's own calculation data. Champions with two forms, such as Jayce, show both as A and B.

![Champion cooldown table with Jayce's A/B Q tooltip open next to Aatrox](dev/docs/images/cooldown-desktop.en.png)

## VS matchup

Pick your champion and the opponent. Every rank's cooldown in one table, base stats by level, swap and share by URL. Works on phones.

![VS matchup: Aatrox against Fiora, cooldowns by rank and stats by level](dev/docs/images/vs-desktop.en.png)

<img src="dev/docs/images/vs-mobile.en.png" alt="VS matchup on a phone" width="320">

## Also included

- Champion biographies and skins, runes, items and summoner spells encyclopedia
- Korean, English and Simplified Chinese
- Installable PWA that works offline
- Optional LoL knowledge helper. The model runs inside the browser and nothing is sent to a server. See `dev/docs/advisor-answer-pipeline.md`.

## Data

A GitHub Actions workflow checks Data Dragon and CommunityDragon every hour, regenerates the static data, runs the tests and deploys to GitHub Pages. The browser reads precomputed results only. There is no server. The current patch and source versions are in `public/data/version.json`.

## Development

Node.js 24.

```bash
npm ci
npm run dev
```

Local preview with the production build and PWA (`http://127.0.0.1:4173/cooldown/`):

```bash
npm run preview:local
```

Full checks:

```bash
npm run type-check
npm run lint
npm test
npm run build
npm run test:e2e
```

Regenerate the current patch's data locally with `npm run generate-static-data`.

## More

- `dev/docs/product-roadmap.md`: priorities and done criteria
- [Data versions and PWA updates](dev/docs/data-and-updates.md)
- [Knowledge helper design](dev/docs/advisor-answer-pipeline.md) and [knowledge authoring](dev/data/knowledge/README.md)
- [Patch change reports](dev/docs/patch-notes.md)

## License

Apache License 2.0
