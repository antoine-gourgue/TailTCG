// Téléverse le modèle + l'index neuraux dans un bucket Supabase Storage public
// (trop lourds pour git, mis à jour périodiquement). Le client les charge
// depuis l'URL publique du bucket. Secrets jamais affichés.
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

const files = [
  { path: "mobileclip-s0.onnx", src: "public/scan-model/mobileclip-s0.onnx", type: "application/octet-stream" },
  { path: "embed.bin", src: "public/scan-index/embed.bin", type: "application/octet-stream" },
  { path: "embed.json", src: "public/scan-index/embed.json", type: "application/json" },
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
  const { error } = await supabase.storage.from(BUCKET).upload(f.path, body, { contentType: f.type, upsert: true });
  if (error) { console.error(`upload ${f.path}:`, error.message); process.exit(1); }
  console.log(`  ${f.path} (${(body.length / 1e6).toFixed(1)} Mo)`);
}
const base = `${admin.url}/storage/v1/object/public/${BUCKET}`;
console.log(`\nBASE PUBLIQUE: ${base}`);
