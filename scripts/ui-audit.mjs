// Harnais d'audit UI : compte jetable avec données de démonstration,
// connexion par cookies, captures desktop (1400) et mobile (390 émulé) de chaque page.
//   node scripts/ui-audit.mjs seed              → crée/complète le compte et ses données
//   node scripts/ui-audit.mjs shoot <out> [pages…] → captures dans <out>/<nom>-{desktop,mobile}.png
//   node scripts/ui-audit.mjs destroy           → supprime le compte
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const CRED = process.env.AUDIT_CRED ?? "/tmp/tailtcg-audit-cred.json";
const BASE = process.env.AUDIT_BASE ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function account() {
  if (existsSync(CRED)) return JSON.parse(readFileSync(CRED, "utf8"));
  const email = `audit-${randomBytes(4).toString("hex")}@tailtcg.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  const cred = { email, password, uid: data.user.id };
  writeFileSync(CRED, JSON.stringify(cred));
  return cred;
}

const CARDS = [
  ["sv03.5-006", "Dracaufeu ex", "151", "sv03.5", "006", "https://assets.tcgdex.net/fr/sv/sv03.5/006", "NM", 23.6, 42, "2026-09-12", "Holo"],
  ["sv03.5-199", "Dracaufeu ex", "151", "sv03.5", "199", "https://assets.tcgdex.net/fr/sv/sv03.5/199", "NM", 39, 51.1, "2026-08-30", "Holo"],
  ["sv08-057", "Pikachu-ex", "Étincelles Déferlantes", "sv08", "057", "https://assets.tcgdex.net/fr/sv/sv08/057", "NM", 8.1, 12.3, "2026-09-02", "Holo"],
  ["sv04.5-054", "Dracaufeu ex", "Destinées de Paldea", "sv04.5", "054", "https://assets.tcgdex.net/fr/sv/sv04.5/054", "EX", 16.3, 19.9, "2026-07-14", "Holo"],
  ["sv03.5-025", "Pikachu", "151", "sv03.5", "025", "https://assets.tcgdex.net/fr/sv/sv03.5/025", "NM", 2.75, 3.85, "2026-09-02", "Reverse"],
  ["sv03.5-133", "Évoli", "151", "sv03.5", "133", "https://assets.tcgdex.net/fr/sv/sv03.5/133", "NM", 0.5, 0.35, "2026-09-02", null],
  ["base1-4", "Dracaufeu", "Set de base", "base1", "4", "https://assets.tcgdex.net/fr/base/base1/4", "EX", 300, 420, "2026-05-20", "Holo"],
  ["sv03-125", "Dracaufeu-ex", "Flammes Obsidiennes", "sv03", "125", "https://assets.tcgdex.net/fr/sv/sv03/125", "NM", 22, 28, "2026-06-11", "Holo"],
  ["sv03.5-183", "Dracaufeu ex", "151", "sv03.5", "183", "https://assets.tcgdex.net/fr/sv/sv03.5/183", "NM", 18, 20, "2026-06-11", "Holo"],
  ["sv03.5-201", "Dracaufeu ex", "151", "sv03.5", "201", "https://assets.tcgdex.net/fr/sv/sv03.5/201", "NM", 12.5, 14, "2026-04-03", "Holo"],
  ["me01-002", "Herbizarre", "Méga-Évolution", "me01", "002", "https://assets.tcgdex.net/fr/me/me01/002", "NM", 0.08, null, "2026-09-25", null],
  ["sv06-196", "Pondralugon-ex", "Évolutions Prismatiques", "sv06", "196", "https://assets.tcgdex.net/fr/sv/sv06/196", "NM", 6.7, 9, "2026-03-15", "Holo"],
];

async function seed() {
  const cred = await account();
  const uid = cred.uid;
  await admin.from("user_settings").upsert({ owner_id: uid, display_name: "Sacha" }, { onConflict: "owner_id" });
  const { data: existing } = await admin.from("items").select("id").eq("owner_id", uid).limit(1);
  if (existing?.length) { console.log("déjà peuplé :", cred.email); return; }
  const rows = CARDS.map(([tcgdex_id, card_name, set_name, set_id, local_id, image_url, condition, purchase_price, manual_price, purchase_date, card_type], i) => ({
    owner_id: uid, tcgdex_id, card_name, set_name, set_id, local_id, image_url, condition, purchase_price, manual_price, purchase_date, card_type, language: "FR", quantity: i === 4 ? 2 : 1, rarity: i === 5 ? "Commune" : i === 10 ? "Commune" : "Double rare",
  }));
  const { data: items, error } = await admin.from("items").insert(rows).select("id, manual_price, purchase_date");
  if (error) throw new Error(error.message);
  // Historique de valeur : 3 points par carte valorisée
  const hist = [];
  for (const it of items) {
    if (it.manual_price == null) continue;
    const v = Number(it.manual_price);
    hist.push({ owner_id: uid, item_id: it.id, value: Math.round(v * 0.7 * 100) / 100, recorded_at: "2026-08-20" });
    hist.push({ owner_id: uid, item_id: it.id, value: Math.round(v * 0.86 * 100) / 100, recorded_at: "2026-09-08" });
    hist.push({ owner_id: uid, item_id: it.id, value: v, recorded_at: "2026-09-26" });
  }
  await admin.from("item_value_history").insert(hist);
  // Classeurs
  const { data: b1 } = await admin.from("binders").insert({ owner_id: uid, name: "Mes Dracaufeu", color: "red" }).select("id").single();
  const { data: b2 } = await admin.from("binders").insert({ owner_id: uid, name: "Primes", color: "blue" }).select("id").single();
  const draca = items.filter((_, i) => [0, 1, 3, 6, 7, 8, 9].includes(i));
  await admin.from("binder_items").insert(draca.map((it, k) => ({ owner_id: uid, binder_id: b1.id, item_id: it.id, position: k })));
  await admin.from("binder_items").insert([items[2], items[4], items[11]].map((it, k) => ({ owner_id: uid, binder_id: b2.id, item_id: it.id, position: k })));
  // Recherchées
  await admin.from("wishlist").insert([
    { owner_id: uid, tcgdex_id: "sv03.5-151", card_name: "Mew ex", set_name: "151", set_id: "sv03.5", local_id: "151", image_url: "https://assets.tcgdex.net/fr/sv/sv03.5/151", priority: "normal", target_price: 8 },
    { owner_id: uid, tcgdex_id: "sv08-238", card_name: "Pikachu-ex", set_name: "Étincelles Déferlantes", set_id: "sv08", local_id: "238", image_url: "https://assets.tcgdex.net/fr/sv/sv08/238", priority: "high", target_price: 220 },
    { owner_id: uid, tcgdex_id: "sv03-228", card_name: "Dracaufeu-ex", set_name: "Flammes Obsidiennes", set_id: "sv03", local_id: "228", image_url: "https://assets.tcgdex.net/fr/sv/sv03/228", priority: "high", target_price: 180 },
    { owner_id: uid, tcgdex_id: "sv03.5-205", card_name: "Mew ex", set_name: "151", set_id: "sv03.5", local_id: "205", image_url: "https://assets.tcgdex.net/fr/sv/sv03.5/205", priority: "normal", target_price: 45 },
    { owner_id: uid, tcgdex_id: "sv04.5-232", card_name: "Dracaufeu ex", set_name: "Destinées de Paldea", set_id: "sv04.5", local_id: "232", image_url: "https://assets.tcgdex.net/fr/sv/sv04.5/232", priority: "low", target_price: null },
    { owner_id: uid, tcgdex_id: "base1-4", card_name: "Dracaufeu", set_name: "Set de base", set_id: "base1", local_id: "4", image_url: "https://assets.tcgdex.net/fr/base/base1/4", priority: "normal", target_price: 350 },
  ]);
  // Scellés : 3 produits du catalogue
  const { data: prods } = await admin.from("sealed_products").select("id, name").in("name", ["151 Elite Trainer Box", "Prismatic Evolutions Elite Trainer Box", "Surging Sparks Sleeved Booster Pack"]);
  const paid = { "151 Elite Trainer Box": [59.99, 2, "2026-07-01"], "Prismatic Evolutions Elite Trainer Box": [64.9, 1, "2026-08-15"], "Surging Sparks Sleeved Booster Pack": [6.5, 12, "2026-09-10"] };
  await admin.from("sealed_items").insert((prods ?? []).map((p) => ({ owner_id: uid, product_id: p.id, quantity: paid[p.name][1], purchase_price: paid[p.name][0], purchase_date: paid[p.name][2] })));
  // Une pré-gradation (sans visuels redressés)
  await admin.from("item_gradings").insert({ owner_id: uid, item_id: items[6].id, centering: 9, corners: 10, edges: 9.5, surface: 9, grade: 9 });
  // Une source
  const { data: src } = await admin.from("sources").insert({ owner_id: uid, name: "Cardmarket", kind: "web", url: "https://www.cardmarket.com" }).select("id").single();
  await admin.from("items").update({ source_id: src.id }).eq("owner_id", uid);
  // Une boutique géolocalisée (carte des boutiques) avec quelques cartes rattachées
  const { data: shop } = await admin.from("sources").insert({ owner_id: uid, name: "Snoop Bayonne", kind: "shop", address: "12 rue Port-Neuf", city: "Bayonne", lat: 43.4929, lng: -1.4748, notes: "Ouvert le dimanche matin" }).select("id").single();
  const { data: firstItems } = await admin.from("items").select("id").eq("owner_id", uid).order("created_at").limit(4);
  await admin.from("items").update({ source_id: shop.id }).in("id", (firstItems ?? []).map((i) => i.id));
  await admin.from("sources").insert({ owner_id: uid, name: "Brocante de Biarritz", kind: "flea", city: "Biarritz" });
  console.log("compte peuplé :", cred.email, "·", items.length, "cartes");
}

async function cookies(cred) {
  const jar = [];
  const ssr = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => jar, setAll: (cs) => { for (const c of cs) { const i = jar.findIndex((j) => j.name === c.name); if (i >= 0) jar.splice(i, 1); jar.push({ name: c.name, value: c.value }); } } },
  });
  const { error } = await ssr.auth.signInWithPassword({ email: cred.email, password: cred.password });
  if (error) throw new Error(error.message);
  return jar;
}

async function shoot(out, pages) {
  const cred = await account();
  const jar = await cookies(cred);
  mkdirSync(out, { recursive: true });
  const port = 9370;
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/tailtcg-audit-chrome`, "--no-first-run", "--window-size=1400,900", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  try {
    let targets = [];
    for (let i = 0; i < 40 && !targets.length; i++) { await sleep(250); try { targets = (await (await fetch(`http://localhost:${port}/json`)).json()).filter((t) => t.type === "page"); } catch {} }
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0; const pending = new Map(); const errors = [];
    const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result); } else if (m.method === "Runtime.exceptionThrown") errors.push((m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text ?? "").slice(0, 160)); else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 160)); };
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    const u = new URL(BASE);
    // AUDIT_ANON=1 : aucune session (pages publiques telles qu'un visiteur les voit)
    if (process.env.AUDIT_ANON !== "1") for (const c of jar) await send("Network.setCookie", { name: c.name, value: c.value, domain: u.hostname, path: "/" });
    // Thème / sidebar : posés dans localStorage avant les navigations (lus par le script de démarrage)
    const theme = process.env.AUDIT_THEME ?? "dark";
    const rail = process.env.AUDIT_RAIL === "1";
    await send("Page.navigate", { url: `${BASE}/connexion` });
    await sleep(800);
    await send("Runtime.evaluate", { expression: `localStorage.setItem('theme','${theme}'); ${rail ? "localStorage.setItem('sidebar','rail')" : "localStorage.removeItem('sidebar')"}` });
    const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.value;
    for (const [name, path] of pages) {
      const modes = process.env.AUDIT_MODES ? process.env.AUDIT_MODES.split(",") : ["desktop", "mobile"];
      // AUDIT_HEIGHT : hauteur du viewport desktop (900 par défaut ; plus haut pour que
      // les éléments collants restent à leur place naturelle dans la capture)
      for (const [mode, w, h] of [["desktop", 1400, Number(process.env.AUDIT_HEIGHT) || 900], ["mobile", 390, 844]].filter(([m]) => modes.includes(m))) {
        await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mode === "mobile" ? 2 : 1, mobile: mode === "mobile" });
        errors.length = 0;
        await send("Page.navigate", { url: `${BASE}${path}` });
        for (let i = 0; i < 100; i++) { await sleep(300); const ok = await ev("document.readyState === 'complete' && !document.querySelector('.logo-loader') && [...document.images].every(im => im.complete)"); if (ok) break; }
        await ev("(function(){const st=document.createElement('style');st.textContent='nextjs-portal{display:none}';document.head.appendChild(st)})()");
        await sleep(700);
        // AUDIT_EVAL : expression JS évaluée sur chaque page (mesures ad hoc), résultat en console
        if (process.env.AUDIT_EVAL) {
          // L'expression peut renvoyer une promesse (fetch…) : on l'attend
          const r = await send("Runtime.evaluate", { expression: `(async () => { try { return JSON.stringify(await (${process.env.AUDIT_EVAL})); } catch (e) { return 'erreur: ' + e.message; } })()`, returnByValue: true, awaitPromise: true });
          console.log(`  [eval ${name}]`, r.result.value);
        }
        // AUDIT_WAIT : délai (ms) après l'évaluation, le temps qu'une interaction simulée aboutisse
        if (process.env.AUDIT_WAIT) await sleep(Number(process.env.AUDIT_WAIT));
        const info = await ev(`JSON.stringify({sw: document.documentElement.scrollWidth, vw: innerWidth, h: document.documentElement.scrollHeight, title: document.title, wide: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 && r.width > 30 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 5).map(e => e.tagName.toLowerCase() + '.' + [...e.classList].slice(0, 3).join('.') + '→' + Math.round(e.getBoundingClientRect().right))})`);
        const meta = JSON.parse(info);
        const H = Math.min(meta.h, 4000);
        // Dock/éléments fixes masqués pour la capture longue ; capture repliée d'abord
        const fold = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
        const tag = `${name}${theme === "light" ? "-light" : ""}${rail ? "-rail" : ""}-${mode}`;
        writeFileSync(`${out}/${tag}.png`, Buffer.from(fold.data, "base64"));
        if (meta.h > h + 40) {
          await ev("document.querySelectorAll('nav[aria-label=\"Navigation\"], .app-sidebar').forEach(e => e.style.visibility='hidden')");
          const full = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: H, scale: 1 } });
          writeFileSync(`${out}/${tag}-full.png`, Buffer.from(full.data, "base64"));
        }
        console.log(`${name} ${mode} · ${meta.vw}px · hauteur ${meta.h}${meta.sw > meta.vw ? ` · DÉBORDEMENT ${meta.sw}` : ""}${meta.wide.length ? " · larges: " + meta.wide.join(", ") : ""}${errors.length ? " · ERREURS: " + errors.slice(0, 2).join(" | ") : ""}`);
      }
    }
    ws.close();
  } finally { chrome.kill(); }
}

async function destroy() {
  if (!existsSync(CRED)) { console.log("aucun compte"); return; }
  const cred = JSON.parse(readFileSync(CRED, "utf8"));
  await admin.auth.admin.deleteUser(cred.uid);
  const { unlinkSync } = await import("node:fs");
  unlinkSync(CRED);
  console.log("compte d'audit supprimé");
}

const [cmd, ...rest] = process.argv.slice(2);
const ALL = [["collection", "/collection"], ["cartes", "/cartes"], ["scelles", "/scelles"], ["classeurs", "/classeurs"], ["recherchees", "/recherchees"], ["catalogue", `/catalogue${process.env.AUDIT_CATALOGUE_QS || ""}`], ["pregrades", "/pregrades"], ["boutiques", "/boutiques"], ["journal", "/journal"], ["parametres", "/parametres"], ["boosters", "/boosters"], ["scelles-ajouter", "/scelles/ajouter"], ["boosters-collection", "/boosters/collection"], ["boosters-gradation", "/boosters/gradation"], ["boosters-echanges", "/boosters/echanges"], ["ajouter-manuel", "/ajouter/manuel"], ["pokedex", "/extensions/pokedex"], ["extension", `/extensions/${process.env.AUDIT_SET || "sv03.5"}`], ["ajouter-carte", `/ajouter?card=${process.env.AUDIT_CARD || "sv03.5-006"}`], ["reevaluer", "/cartes/reevaluer"], ["scanner", "/scanner"], ["connexion", "/connexion"], ["landing", "/"]];
if (cmd === "seed") await seed();
else if (cmd === "destroy") await destroy();
else if (cmd === "shoot") {
  const out = rest[0];
  const names = rest.slice(1);
  let pages = names.length ? ALL.filter(([n]) => names.includes(n)) : ALL;
  // pages dynamiques (ids du compte) : carte, classeur, produit
  if (!names.length || names.includes("carte") || names.includes("classeur") || names.includes("produit")) {
    const cred = await account();
    const { data: it } = await admin.from("items").select("id").eq("owner_id", cred.uid).eq("tcgdex_id", "sv03.5-006").maybeSingle();
    const { data: it2 } = await admin.from("items").select("id").eq("owner_id", cred.uid).eq("tcgdex_id", "base1-4").maybeSingle();
    const { data: b } = await admin.from("binders").select("id").eq("owner_id", cred.uid).limit(1).maybeSingle();
    const { data: sp } = await admin.from("sealed_items").select("product_id").eq("owner_id", cred.uid).limit(1).maybeSingle();
    if (it && (!names.length || names.includes("carte"))) pages.push(["carte", `/carte/${it.id}`]);
    if (it2 && (!names.length || names.includes("carte"))) pages.push(["carte-gradee", `/carte/${it2.id}`]);
    if (b && (!names.length || names.includes("classeur"))) pages.push(["classeur", `/classeurs/${b.id}`]);
    if (sp && (!names.length || names.includes("produit"))) pages.push(["produit", `/scelles/produit/${sp.product_id}`]);
    if (!names.length || names.includes("vitrine")) {
      const { data: st } = await admin.from("user_settings").select("share_token").eq("owner_id", cred.uid).maybeSingle();
      let token = st?.share_token;
      if (!token) { token = crypto.randomUUID(); await admin.from("user_settings").upsert({ owner_id: cred.uid, share_token: token, share_show_values: true }, { onConflict: "owner_id" }); }
      pages.push(["vitrine", `/vitrine/${token}`]);
    }
  }
  await shoot(out, pages);
} else console.log("usage: seed | shoot <out> [pages] | destroy");
