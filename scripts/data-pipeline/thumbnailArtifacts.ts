import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ABILITY_SIZE, AVIF_EFFORT, AVIF_QUALITY, FORCE, QUALITY } from "./thumbnailImages";

/**
 * 시트에 무엇이 몇째 칸에 있는지를 **묶음에 심는다.**
 *
 * 그동안 화면이 자기가 들고 있는 목록으로 자리를 셌다. 그 목록은 보여 줄 차례라
 * 시트와 맞을 까닭이 없었고 실제로 어긋나 있었다(가렌 자리에 아트록스). 이름순으로
 * 다시 세게 해서 그것은 고쳤지만, 목록을 **일부만** 넘기면 여전히 열 수가 달라져
 * 통째로 밀린다. 그리고 목록을 들고 있지 않은 자리(아이템 상세·고르개)는 시트를
 * 아예 쓸 수가 없었다.
 *
 * 그래서 차례를 화면에 맡기지 않고 여기서 적어 준다. 네 시트를 합쳐 13KB(gzip
 * 4KB)라 묶음에 넣을 만하고, 부르는 쪽은 id 만 대면 된다.
 *
 * 시트 옆의 `<kind>s.json` 은 그대로 남긴다. 그쪽은 시험이 짝을 맞춰 보는 자리다.
 */
export async function writeSheetIndex(sheets: SheetInfo[], generatedDirectory: string): Promise<void> {
  const body = sheets
    .map((sheet) => `  ${sheet.kind}: { cols: ${sheet.cols}, ids: ${JSON.stringify(sheet.ids)} },`)
    .join("\n");
  const file = [
    "/* 자동 생성 — `npm run generate-thumbnails`. 손으로 고치지 마십시오. */",
    "",
    "export interface SheetGrid {",
    "  cols: number;",
    "  /** 시트에 붙은 차례. 칸 번호가 곧 이 배열의 자리다. */",
    "  ids: string[];",
    "}",
    "",
    "export const SPRITE_SHEETS: Record<string, SheetGrid> = {",
    body,
    "};",
    "",
  ].join("\n");
  await writeFile(path.join(generatedDirectory, "spriteSheets.ts"), file);
}

/**
 * 그림이 놓인 판본을 묶음에 적어 둔다.
 *
 * 주소를 짓는 자리 중에는 React 밖도 있다(스탯 글리프). 거기서는 화면이 들고 있는
 * 판본을 받을 수 없으므로 여기서 적어 준다. 그림과 함께 커밋되므로 둘이 어긋날
 * 자리가 없다.
 */
export async function writeAssetVersion(ddragon: string, generatedDirectory: string): Promise<void> {
  const file = [
    "/* 자동 생성 — `npm run generate-thumbnails`. 손으로 고치지 마십시오. */",
    "",
    "/** `public/img/<이 값>/` 아래에 그림이 있다. 주소가 판본을 타야 캐시가 안 굳는다. */",
    `export const IMAGE_VERSION = ${JSON.stringify(ddragon)};`,
    "",
  ].join("\n");
  await writeFile(path.join(generatedDirectory, "assetVersion.ts"), file);
}

/**
 * 변신 아이콘의 파일 이름. 경로를 눕혀 한 낱말로 만든다.
 *
 * 화면 쪽 `formIconKey` 와 같은 규칙이어야 하고, 어긋나면 시험이 잡는다.
 */
export const formIconKey = (iconPath: string) =>
  iconPath.replace(/^\//, "").replace(/\.png$/i, "").replace(/[^a-zA-Z0-9]+/g, "-");

/** 띠의 칸 차례. 화면도 이 차례로 자리를 센다. */
export const ABILITY_SLOTS = ["P", "Q", "W", "E", "R"] as const;

/**
 * 챔피언마다 스킬 다섯 개를 가로 한 줄로 붙인다.
 *
 * 칸 자리를 받아 오지 않는다. 차례가 P·Q·W·E·R 로 정해져 있으므로 화면은 슬롯
 * 글자만 알면 몇째 칸인지 안다. 빠진 스킬 자리는 빈 칸으로 둔다 — 자리가 밀리면
 * 다섯 개가 통째로 어긋나는데 눈으로는 "왜 이 아이콘이지" 싶을 뿐이라 못 알아본다.
 *
 * 띠가 없는 챔피언이 생기면 그 화면은 빈 칸이 된다. 그래서 `test-thumbnails` 가
 * 챔피언 수와 띠 수가 같은지 본다.
 */
export async function buildAbilityStrips(
  strips: Map<string, Array<string | undefined>>,
  out: string,
  stamps: Stamps,
): Promise<{ count: number; bytes: number; avifBytes: number }> {
  const cell = (name: string | undefined, slot: string) => {
    if (!name) return undefined;
    const file = path.join(out, slot === "P" ? "passive" : "spell", `${name}.webp`);
    return existsSync(file) ? file : undefined;
  };
  let bytes = 0;
  let avifBytes = 0;
  let count = 0;
  for (const [championId, names] of strips) {
    const composite = [];
    for (const [index, name] of names.entries()) {
      const file = cell(name, ABILITY_SLOTS[index]);
      if (!file) continue;
      composite.push({ input: await readFile(file), left: index * ABILITY_SIZE, top: 0 });
    }
    if (composite.length === 0) continue;
    const webpFile = path.join(out, "ability", `${championId}.webp`);
    const avifFile = path.join(out, "ability", `${championId}.avif`);
    const stampKey = `ability/${championId}`;
    const hash = stampOf([ABILITY_SIZE, QUALITY, AVIF_QUALITY, AVIF_EFFORT], composite);
    if (await unchanged(stamps, stampKey, hash, [webpFile, avifFile])) {
      bytes += (await stat(webpFile)).size;
      avifBytes += (await stat(avifFile)).size;
      count += 1;
      continue;
    }
    // 시트와 같은 까닭으로 합친 그림을 먼저 굳히고 꼴마다 새로 인코딩한다.
    const flat = await sharp({
      create: {
        width: ABILITY_SLOTS.length * ABILITY_SIZE,
        height: ABILITY_SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composite)
      .png()
      .toBuffer();
    const strip = await sharp(flat).webp({ quality: QUALITY }).toBuffer();
    const avif = await sharp(flat).avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT }).toBuffer();
    await writeFile(webpFile, strip);
    await writeFile(avifFile, avif);
    stamps[stampKey] = hash;
    bytes += strip.length;
    avifBytes += avif.length;
    count += 1;
  }
  return { count, bytes, avifBytes };
}

/**
 * 합친 그림(시트·스킬 띠)의 재료 지문. 재료 낱장·배치·인코딩 설정이 같으면 결과도 같다.
 *
 * AVIF 인코딩이 이 스크립트에서 가장 오래 걸린다. 게다가 macOS 와 CI(Linux)의 libavif 가
 * 달라 로컬에서 돌리면 내용이 같아도 .avif 177개가 바뀐 것으로 나왔다. 지문이 같으면
 * 인코딩하지 않으므로 둘 다 사라진다.
 */
export type Stamps = Record<string, string>;

const stampFile = (out: string) => path.join(out, "encode-stamps.json");

export async function readStamps(out: string): Promise<Stamps> {
  if (FORCE) return {};
  try {
    return JSON.parse(await readFile(stampFile(out), "utf8")) as Stamps;
  } catch {
    return {};
  }
}

export async function writeStamps(out: string, stamps: Stamps): Promise<void> {
  const sorted = Object.fromEntries(Object.entries(stamps).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(stampFile(out), `${JSON.stringify(sorted, null, 2)}\n`);
}

function stampOf(settings: unknown[], composite: Array<{ input: Buffer; left: number; top: number }>): string {
  const hash = createHash("sha1").update(JSON.stringify(settings));
  for (const part of composite) hash.update(`${part.left},${part.top};`).update(part.input);
  return hash.digest("hex");
}

async function unchanged(stamps: Stamps, key: string, hash: string, files: string[]): Promise<boolean> {
  return !FORCE && stamps[key] === hash && files.every((file) => existsSync(file));
}

export interface SheetInfo {
  kind: string;
  count: number;
  cols: number;
  rows: number;
  bytes: number;
  avifBytes: number;
  /** 시트에 실제로 붙은 차례. 묶음에 심을 값이다. */
  ids: string[];
}

/**
 * 낱장을 격자로 붙여 한 장으로 만든다.
 *
 * 차례는 **이름순**이다. 화면도 같은 비교로 다시 세운다(`useSpriteSheet`).
 *
 * 한때는 자료에 실린 차례를 그대로 썼다. 챔피언은 그것이 디렉터리를 읽은 차례라
 * 파일 시스템에 달려 있었고, 화면이 들고 있는 목록은 보여 줄 차례(즐겨찾기 먼저,
 * 그 나라 말 가나다순)였다. 둘이 맞을 까닭이 없었고 실제로 어긋나 있었다 — 가렌
 * 자리에 아트록스가 나왔다. 그림이 비는 것이 아니라 **다른 그림이** 나오므로
 * 아무도 고장으로 안 봤다.
 *
 * 이름순은 양쪽이 아무것도 주고받지 않고도 같아지는 유일한 차례다. 옆에 남기는
 * 목록 JSON 은 그 짝을 시험이 맞춰 보는 용도로만 쓴다.
 */
export async function buildSheet(
  kind: string,
  ids: string[],
  size: number,
  out: string,
  quality: number,
  stamps: Stamps,
  /** 시트를 둘 자리. 안 주면 낱장이 있는 자리에 함께 둔다. */
  sheetDir = out,
): Promise<SheetInfo> {
  // 룬은 낱장이 `runes/` 바로 아래에 있고 나머지는 `<kind>/` 아래에 있다.
  const cell = (id: string) => (kind === "rune" ? path.join(out, `${id}.webp`) : path.join(out, kind, `${id}.webp`));
  const present = [...new Set(ids)].sort().filter((id) => existsSync(cell(id)));
  if (present.length === 0) throw new Error(`Cannot build empty ${kind} thumbnail sheet`);
  const cols = Math.ceil(Math.sqrt(present.length));
  const rows = Math.ceil(present.length / cols);
  const composite = await Promise.all(
    present.map(async (id, index) => ({
      input: await readFile(cell(id)),
      left: (index % cols) * size,
      top: Math.floor(index / cols) * size,
    })),
  );
  const files = ["webp", "avif", "json"].map((ext) => path.join(sheetDir, `${kind}s.${ext}`));
  const hash = stampOf([size, cols, quality, AVIF_QUALITY, AVIF_EFFORT], composite);
  if (await unchanged(stamps, `sheet/${kind}`, hash, files)) {
    const [bytes, avifBytes] = await Promise.all(files.slice(0, 2).map(async (file) => (await stat(file)).size));
    return { kind, count: present.length, cols, rows, bytes, avifBytes, ids: present };
  }
  /*
   * 합친 그림을 먼저 손실 없이 굳히고, 꼴마다 **새로 인코딩한다.**
   *
   * 한 파이프라인에 `.webp()` 와 `.avif()` 를 잇달아 걸고 두 번 뽑으면 앞 호출이
   * 남긴 설정이 뒤에 섞인다. 같은 자료로 돌려도 판마다 바이트가 달라져, 바뀐 것이
   * 없는데 파일 177개가 커밋에 딸려 왔다.
   */
  const flat = await sharp({
    create: { width: cols * size, height: rows * size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composite)
    .png()
    .toBuffer();
  const sheet = await sharp(flat).webp({ quality }).toBuffer();
  const avif = await sharp(flat).avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT }).toBuffer();
  await writeFile(path.join(sheetDir, `${kind}s.webp`), sheet);
  await writeFile(path.join(sheetDir, `${kind}s.avif`), avif);
  await writeFile(path.join(sheetDir, `${kind}s.json`), `${JSON.stringify({ size, cols, rows, ids: present })}\n`);
  stamps[`sheet/${kind}`] = hash;
  return { kind, count: present.length, cols, rows, bytes: sheet.length, avifBytes: avif.length, ids: present };
}
