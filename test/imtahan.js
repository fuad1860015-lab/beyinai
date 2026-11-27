// BeyinAI İmtahanı — "proqram həqiqətən yaxşılaşıb?" sualının ölçülə bilən cavabı.
//
//   npm run imtahan           → pulsuz, internetsiz: axtarış düzgün maddəni tapırmı?
//   npm run imtahan:canli     → Gemini açarınızla: cavab da düzgündürmü?
//
// Həmişə bazanın müvəqqəti surəti ilə işləyir; real baza dəyişmir.
// Yeni sual əlavə etmək üçün test/imtahan-suallari.json faylına yazın:
//   sual     — istifadəçi dilində sual
//   madde    — düzgün maddə nömrəsi
//   menbede  — həmin maddənin rəsmi mətnindən hərfi parça (axtarışı yoxlamaq üçün)
//   cavabda  — düzgün cavabda mütləq olmalı ifadələr (regex)
//   olmamali — cavabda olmamalı olan, əvvəl rast gəlinmiş səhvlər (regex, istəyə görə)
// Səhv tapdınızsa, bura sual kimi əlavə edin ki, bir daha təkrarlansa görünsün.
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const arq = process.argv.slice(2);
const canli = arq.includes("--canli");
const deyer = (ad) => { const i = arq.indexOf(ad); return i >= 0 ? arq[i + 1] : null; };
const kok = path.resolve(deyer("--kok") || path.join(__dirname, ".."));
const dataMenbe = path.resolve(deyer("--data") || path.join(kok, "data"));
const suallar = JSON.parse(fs.readFileSync(path.join(__dirname, "imtahan-suallari.json"), "utf8"));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "beyin-imtahan-"));
for (const f of ["beyin.sqlite", "beyin.sqlite-wal", "beyin.sqlite-shm"]) {
  const s = path.join(dataMenbe, f);
  if (fs.existsSync(s)) fs.copyFileSync(s, path.join(tmp, f));
}
process.env.BEYIN_DATA_DIR = tmp;

// Canlı rejimdə yalnız Google Gemini-yə sorğu gedir (başqa heç bir xidmətə məlumat göndərilmir).
const sorguStatistikasi = {};
const esasFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  if (!canli) throw new Error("imtahan: oflayn rejim");
  const unvan = new URL(String(u));
  if (unvan.host !== "generativelanguage.googleapis.com") throw new Error("imtahan: yalnız Gemini icazəlidir");
  const model = (unvan.pathname.match(/models\/([^:]+):(\w+)/) || []).slice(1).join(":") || unvan.pathname;
  const qeyd = (netice) => { const k = `${model} → ${netice}`; sorguStatistikasi[k] = (sorguStatistikasi[k] || 0) + 1; };
  try {
    const res = await esasFetch(u, o);
    qeyd(res.status);
    return res;
  } catch (e) {
    qeyd(e.name || "şəbəkə xətası");
    throw e;
  }
};

const db = require(path.join(kok, "src", "db"));
if (path.resolve(path.dirname(db.DB_PATH)) !== path.resolve(tmp)) {
  console.error("Təhlükəsizlik: baza surəti istifadə olunmur, imtahan dayandırıldı.");
  process.exit(2);
}
if (!canli) db.tenzimlemeYenile({ gemini_api_key: "", groq_api_key: "", dusunen_rejim: "0" });
db.tenzimlemeYenile({ oyrenme_limiti: "0" });
const agent = require(path.join(kok, "src", "agent"));

const sade = (s) => String(s || "").replace(/\s+/g, " ");

(async () => {
  console.log(`\n🎓 BeyinAI İmtahanı — ${suallar.length} sual (${canli ? "CANLI: AI cavabı" : "oflayn: yalnız axtarış"})\n`);
  let tapildi = 0, ilk3 = 0, duz = 0, aiCavab = 0;
  const setirler = [];
  for (const s of suallar) {
    let net;
    try {
      net = await agent.agentSualCavabla({ sual: s.sual, sohbetdeSaxla: false });
    } catch (e) {
      console.log(`  ❌ ${s.id}: ${e.message}`);
      setirler.push({ id: s.id, xeta: e.message });
      continue;
    }
    const sira = (net.sitatlar || []).findIndex((p) => sade(`${p.basliq || ""} ${p.metn || ""}`).includes(sade(s.menbede))) + 1;
    if (sira) tapildi++;
    if (sira && sira <= 3) ilk3++;
    const metn = String(net.cavab?.metn || "").split(/<NOVBETI_SUALLAR>/i)[0];
    const aiIsledi = canli && net.aiCavabVerdi !== false;
    // Əlavə olunan hərfi qanun mətni cavab sayılmır — assistentin öz sözləri yoxlanılır
    const ozSozu = metn.replace(/<DETALLI_ANALIZ>\s*\*\*Qanunun öz mətni[\s\S]*?<\/DETALLI_ANALIZ>/gi, "");
    const cavabDuz = aiIsledi && s.cavabda.every((r) => new RegExp(r, "i").test(ozSozu)) &&
      !(s.olmamali || []).some((r) => new RegExp(r, "i").test(ozSozu));
    if (aiIsledi) aiCavab++;
    if (cavabDuz) duz++;
    const model = (net.dusunmeAddimlari || []).map((d) => (d.match(/Analitik Mühərrik: \*\*([^*]+)\*\*/) || [])[1]).find(Boolean) || null;
    setirler.push({
      id: s.id, madde: s.madde, axtarisSirasi: sira || null, cavabDuz: aiIsledi ? cavabDuz : null, model,
      nisan: canli ? net.etibarliliqKod : null, cavab: canli ? metn.slice(0, 3000) : null
    });
    if (canli) await new Promise((r) => setTimeout(r, 1500)); // API limitinə görə qısa fasilə
    const axt = sira ? (sira <= 3 ? `✅ ${sira}-ci yerdə` : `🟡 ${sira}-ci yerdə`) : "❌ tapılmadı";
    const cav = !canli ? "" : !aiIsledi ? " | AI cavab vermədi" : cavabDuz ? " | cavab ✅" : " | cavab ❌";
    console.log(`  ${s.id.padEnd(20)} Maddə ${s.madde.padEnd(11)} axtarış: ${axt}${cav}`);
  }
  console.log(`\n📊 Axtarış: düzgün maddə tapıldı ${tapildi}/${suallar.length}, ilk 3-lükdə ${ilk3}/${suallar.length}`);
  if (canli) {
    console.log(`📊 Cavab: düzgün ${duz}/${aiCavab} (AI cavab verən suallar)`);
    console.log("\nGemini sorğuları (model → nəticə : say):");
    for (const [k, v] of Object.entries(sorguStatistikasi)) console.log(`  ${k} : ${v}`);
  }

  const netice = { vaxt: new Date().toISOString(), canli, cemi: suallar.length, tapildi, ilk3, duz: canli ? duz : null, aiCavab: canli ? aiCavab : null, setirler };
  if (!deyer("--kok") && !arq.includes("--yazma")) {
    const tarixceYolu = path.join(kok, "data", "imtahan_tarixcesi.json");
    let tarixce = [];
    try { tarixce = JSON.parse(fs.readFileSync(tarixceYolu, "utf8")); } catch (_) {}
    tarixce.push(netice);
    fs.writeFileSync(tarixceYolu, JSON.stringify(tarixce.slice(-50), null, 1));
  }
  try { db.db.close(); fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  process.exit(0);
})();
