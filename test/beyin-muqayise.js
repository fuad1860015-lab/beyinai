// Eyni sualları beyinsiz və beyinli verib müqayisə edir (Gemini sorğuları gedir).
//   node test/beyin-muqayise.js <sınaq baza qovluğu> <nəticə.json> [sual sayı]
// Yalnız sınaq bazasında işlədin. Alınmış cavab təkrar sorulmur, ona görə kəsilsə yenidən işlətmək olar.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const [bazaQovlugu, neticeYolu, say] = process.argv.slice(2);
if (!bazaQovlugu || !neticeYolu) { console.error("İstifadə: node test/beyin-muqayise.js <baza qovluğu> <nəticə.json> [say]"); process.exit(2); }
if (path.resolve(bazaQovlugu) === path.resolve(__dirname, "..", "data")) { console.error("Əsas bazada işlədilmir."); process.exit(2); }
process.env.BEYIN_DATA_DIR = path.resolve(bazaQovlugu);

const esasFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  if (new URL(String(u)).host !== "generativelanguage.googleapis.com") throw new Error("yalnız Gemini icazəlidir");
  return esasFetch(u, o);
};

const db = require("../src/db");
const agent = require("../src/agent");
const suallar = JSON.parse(fs.readFileSync(path.join(__dirname, "beyin-suallari.json"), "utf8")).slice(0, Number(say) || undefined);
let netice = {};
try { netice = JSON.parse(fs.readFileSync(neticeYolu, "utf8")); } catch (_) {}

const ozSozu = (m) => String(m || "").replace(/<DETALLI_ANALIZ>[\s\S]*?(<\/DETALLI_ANALIZ>|$)/gi, "").trim();
const qiymet = (s, metn) => ({
  tapilan: s.cavabda.filter((r) => new RegExp(r, "i").test(metn)).length,
  cemi: s.cavabda.length,
  sehv: (s.olmamali || []).filter((r) => new RegExp(r, "i").test(metn)).length
});

(async () => {
  let ardicilUgursuz = 0;
  for (const s of suallar) {
    for (const rejim of ["beyinsiz", "beyinli"]) {
      const acar = `${s.id}|${rejim}`;
      if (netice[acar]) { netice[acar].qiymet = qiymet(s, netice[acar].cavab); continue; }
      if (ardicilUgursuz >= 3) break;
      db.tenzimlemeYenile({ beyin_rejim: rejim === "beyinli" ? "1" : "0", dusunen_rejim: "1", mena_yoxlamasi: "1", oyrenme_limiti: "0" });
      db.db.exec("DELETE FROM yoxlanmis_cavablar; DELETE FROM sohbetler;");
      const bas = Date.now();
      const n = await agent.agentSualCavabla({ sual: s.sual, sohbetdeSaxla: false });
      const addimlar = n.dusunmeAddimlari || [];
      const dusunen = Boolean(n.dusunenRejim);
      const yoxlandi = dusunen && addimlar.some((a) => a.startsWith("🧐"));
      if (!dusunen) { ardicilUgursuz++; console.log(`  ${acar}: AI cavab vermədi`); await new Promise((r) => setTimeout(r, 60000)); continue; }
      ardicilUgursuz = 0;
      const cavab = ozSozu(n.cavab?.metn);
      netice[acar] = {
        cavab, yoxlandi, saniye: Math.round((Date.now() - bas) / 1000),
        modeller: addimlar.filter((a) => /Analitik Mühərrik|tutuşdurdum/.test(a)).map((a) => (a.match(/gemini-[\w.-]+/) || [""])[0]),
        beyinIslendi: addimlar.some((a) => a.startsWith("🧠 Beynimdən")),
        qiymet: qiymet(s, cavab)
      };
      fs.writeFileSync(neticeYolu, JSON.stringify(netice, null, 1));
      const q = netice[acar].qiymet;
      console.log(`  ${acar}: ${q.tapilan}/${q.cemi}${q.sehv ? ` səhv ${q.sehv}` : ""} | ${netice[acar].saniye}s | ${netice[acar].modeller.join(" → ")}${yoxlandi ? "" : " | YOXLANMADI"}${rejim === "beyinli" && !netice[acar].beyinIslendi ? " | BEYİN UYĞUN SAYILMADI" : ""}`);
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
  fs.writeFileSync(neticeYolu, JSON.stringify(netice, null, 1));
  for (const rejim of ["beyinsiz", "beyinli"]) {
    const x = suallar.map((s) => netice[`${s.id}|${rejim}`]).filter(Boolean);
    console.log(`${rejim}: ${x.length}/${suallar.length} cavab | açar fakt ${x.reduce((t, a) => t + a.qiymet.tapilan, 0)}/${x.reduce((t, a) => t + a.qiymet.cemi, 0)} | tam ${x.filter((a) => a.qiymet.tapilan === a.qiymet.cemi && !a.qiymet.sehv).length}`);
  }
  db.db.close();
  process.exit(0);
})();
