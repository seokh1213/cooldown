/**
 * ONNX Runtime WebGPU 런타임 파일을 우리 출처로 복사한다.
 *
 * Transformers.js 는 기본값으로 jsDelivr 에서 `ort-wasm-simd-threaded.jsep.wasm` 을 받는다.
 * 그러면 상성 코치가 제3자 CDN 에 매번 의존하게 되고, 사내망처럼 CDN 이 막힌 환경에서 그냥 죽는다.
 * 합쳐 35MB 나 되는 이진 파일이라 저장소에 넣지는 않고, 빌드할 때 node_modules 에서 꺼내 `public/ort/` 에 둔다.
 *
 * `public/ort/` 는 git 에서 제외한다. 설치만 되어 있으면 언제든 다시 만들 수 있다.
 */
import * as fs from "fs";
import * as path from "path";

/**
 * Transformers.js 4.x 가 참조하는 런타임은 두 벌뿐이다.
 * WebGPU 경로는 asyncify 빌드를, WASM 대체 경로는 접미사 없는 빌드를 쓴다.
 * jsep·jspi 빌드는 이 버전이 부르지 않으므로 복사하지 않는다(각각 26MB, 14MB).
 */
const FILES = [
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
];
const SOURCE_DIR = path.resolve(process.cwd(), "node_modules", "onnxruntime-web", "dist");
const TARGET_DIR = path.resolve(process.cwd(), "public", "ort");

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`onnxruntime-web 이 설치되어 있지 않다: ${SOURCE_DIR}`);
  }
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  for (const file of FILES) {
    const from = path.join(SOURCE_DIR, file);
    const to = path.join(TARGET_DIR, file);
    if (!fs.existsSync(from)) throw new Error(`원본이 없다: ${from}`);
    // 크기가 같으면 다시 쓰지 않는다. 26MB 를 매번 복사할 이유가 없다.
    if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size) {
      console.log(`유지: public/ort/${file}`);
      continue;
    }
    fs.copyFileSync(from, to);
    console.log(`복사: public/ort/${file} (${(fs.statSync(to).size / 1048576).toFixed(1)}MB)`);
  }
}

main();
