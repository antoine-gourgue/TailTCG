// Copie les binaires WASM d'onnxruntime-web dans public/ort/ (servis au client).
// À lancer au prebuild : les fichiers ne sont pas versionnés.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("onnxruntime-web")); // .../onnxruntime-web/dist
mkdirSync("public/ort", { recursive: true });
for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) copyFileSync(`${dist}/${f}`, `public/ort/${f}`);
console.log("ort wasm copié dans public/ort/");
