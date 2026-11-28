// Güclü modelin düşünmə səviyyələrini eyni suallarda ölçür (Gemini sorğuları gedir).
//   node test/rejim-olcu.js <sınaq baza qovluğu> <nəticə.json> [səviyyələr, məs: low,high]
// Alınmış cavab təkrar sorulmur; model məşğuldursa, yenidən işlətmək olar.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const [bazaQovlugu, neticeYolu, seviyyeler = "low,high"] = process.argv.slice(2);
if (!bazaQovlugu || !neticeYolu) { console.error("İstifadə: node test/rejim-olcu.js <baza qovluğu> <nəticə.json> [low,high]"); process.exit(2); }
if (path.resolve(bazaQovlugu) === path.resolve(__dirname, "..", "data")) { console.error("Əsas bazada işlədilmir."); process.exit(2); }
process.env.BEYIN_DATA_DIR = path.resolve(bazaQovlugu);

const esasFetch = globalThis.fetch;
let sorgu = [];
globalThis.fetch = async (u, o) => {
  if (new URL(String(u)).host !== "generativelanguage.googleapis.com") throw new Error("yalnız Gemini icazəlidir");
  const bas = Date.now();
  try {
    const r = await esasFetch(u, o);
    sorgu.push({ status: r.status, saniye: Math.round((Date.now() - bas) / 1000) });
    return r;
  } catch (e) { sorgu.push({ status: e.name, saniye: Math.round((Date.now() - bas) / 1000) }); throw e; }
};

const db = require("../src/db");
require("../src/agent");
const yoxlayici = require("../src/yoxlayici");
const hamisi = require("./beyin-suallari.json");
const secilen = ["kassa-xidmet", "adgunu", "esas-vesait-cek", "mehmanxana", "temir"].map((id) => hamisi.find((s) => s.id === id));
let netice = {};
try { netice = JSON.parse(fs.readFileSync(neticeYolu, "utf8")); } catch (_) {}

(async () => {
  for (let tur = 1; tur <= 4; tur++) {
    for (const s of secilen) {
      for (const seviyye of seviyyeler.split(",")) {
        const acar = `${s.id}|${seviyye}`;
        if (netice[acar]) continue;
        sorgu = [];
        const y = await yoxlayici.sinaqCavabi({ sual: s.sual, saheId: db.aktivSaheIdAl(), seviyye });
        const ugurlu = sorgu.find((x) => x.status === 200);
        if (!y || y.model !== "gemini-4-hydrogen") {
          console.log(`  ${acar}: alınmadı (${sorgu.map((x) => x.status).join(",")})`);
          await new Promise((r) => setTimeout(r, 20000));
          continue;
        }
        const ozSozu = y.cavab.split("<DETALLI_ANALIZ>")[0].trim();
        netice[acar] = {
          cavab: ozSozu, saniye: ugurlu?.saniye ?? null, problemler: y.problemler,
          fakt: s.cavabda.filter((r) => new RegExp(r, "i").test(ozSozu)).length, faktCemi: s.cavabda.length
        };
        fs.writeFileSync(neticeYolu, JSON.stringify(netice, null, 1));
        console.log(`  ${acar}: ${netice[acar].saniye}s | açar fakt ${netice[acar].fakt}/${netice[acar].faktCemi}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    if (secilen.every((s) => seviyyeler.split(",").every((v) => netice[`${s.id}|${v}`]))) break;
  }
  for (const v of seviyyeler.split(",")) {
    const x = secilen.map((s) => netice[`${s.id}|${v}`]).filter(Boolean);
    const san = x.map((a) => a.saniye).sort((a, b) => a - b);
    console.log(`${v}: ${x.length}/${secilen.length} cavab | median ${san[Math.floor(san.length / 2)] ?? "-"}s | açar fakt ${x.reduce((t, a) => t + a.fakt, 0)}/${x.reduce((t, a) => t + a.faktCemi, 0)}`);
  }
  db.db.close();
  process.exit(0);
})();
