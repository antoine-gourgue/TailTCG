// Téléverse les modèles + index du scan dans un bucket Supabase Storage public
// (trop lourds pour git). Cache HTTP d'un an : le navigateur ne les
// retélécharge pas à chaque scan (en plus de la Cache API côté client).
// Modèles et index d'identification : ceux du scanner GoupixDex (Léo).
//   node scripts/upload-scan-assets.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdminEnv } from "./lib/env.mjs";

const admin = supabaseAdminEnv();
if (!admin) {
  console.error("Variables Supabase absentes (.env.local)");
  process.exit(1);
}
const supabase = createClient(admin.url, admin.key, { auth: { persistSession: false } });
const BUCKET = "scan-assets";
const BIN = "application/octet-stream";
const JSON_T = "application/json";

const files = [
  { path: "card-corners.onnx", src: "public/scan-model/card-corners.onnx", type: BIN },
  { path: "mobileclip-s0-vision-fp16.onnx", src: "public/scan-model/mobileclip-s0-vision-fp16.onnx", type: BIN },
  { path: "mobilenet-embed-int8.onnx", src: "public/scan-model/mobilenet-embed-int8.onnx", type: BIN },
  { path: "embed-v3.bin", src: "public/scan-index/embed-v3.bin", type: BIN },
  { path: "embed-v3.json", src: "public/scan-index/embed-v3.json", type: JSON_T },
  { path: "embed-v2.bin", src: "public/scan-index/embed-v2.bin", type: BIN },
  { path: "embed-pca-v2.bin", src: "public/scan-index/embed-pca-v2.bin", type: BIN },
  { path: "embed-v2.json", src: "public/scan-index/embed-v2.json", type: JSON_T },
  { path: "phash-v1.bin", src: "public/scan-index/phash-v1.bin", type: BIN },
  { path: "phash-v1.json", src: "public/scan-index/phash-v1.json", type: JSON_T },
  { path: "phash-images.json", src: "public/scan-index/phash-images.json", type: JSON_T },
];

const { data: buckets } = await supabase.storage.listBuckets();
if (!buckets?.some((b) => b.name === BUCKET)) {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 52428800 });
  if (error) { console.error("createBucket:", error.message); process.exit(1); }
  console.log(`bucket ${BUCKET} créé (public)`);
} else {
  await supabase.storage.updateBucket(BUCKET, { public: true, fileSizeLimit: 52428800 });
  console.log(`bucket ${BUCKET} existant`);
}

for (const f of files) {
  const body = readFileSync(f.src);
  const { error } = await supabase.storage.from(BUCKET).upload(f.path, body, { contentType: f.type, upsert: true, cacheControl: "31536000" });
  if (error) { console.error(`upload ${f.path}:`, error.message); process.exit(1); }
  console.log(`  ${f.path} (${(body.length / 1e6).toFixed(1)} Mo)`);
}
const base = `${admin.url}/storage/v1/object/public/${BUCKET}`;
console.log(`\nBASE PUBLIQUE: ${base}`);
