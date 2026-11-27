// BeyinAI — Bilik Xəritəsi və Gündəlik İcmal
// Seçilmiş istiqamət (sahə) üzrə: nə dəyişir, hansı tarix yaxınlaşır, mənbələr harada ziddiyyətlidir,
// sizdən nə təsdiq gözlənilir. AI sorğusu istifadə etmir — yalnız bazadakı mətnlərdən hesablanır.
"use strict";

const crypto = require("node:crypto");
const db = require("./db");

db.db.exec(`
  CREATE TABLE IF NOT EXISTS bilik_xeritesi (
    sahe_id TEXT NOT NULL,
    madde TEXT NOT NULL,
    basliq TEXT DEFAULT '',
    imza TEXT DEFAULT '',
    baxilma_sayi INTEGER DEFAULT 0,
    son_baxilma INTEGER DEFAULT 0,
    metn_deyisib INTEGER DEFAULT 0,
    PRIMARY KEY (sahe_id, madde)
  );
`);

const AYLAR = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"];

// Bakı vaxtı ilə bu günün tarixi (server başqa saat qurşağında olsa da)
function bakiTarixi(vaxt = Date.now()) {
  return new Date(vaxt + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function gunFerqi(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
function tarixYaz(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${AYLAR[m - 1]} ${y}`;
}
function say(n, soz) {
  return `${n} ${soz}`;
}

// Sahənin (və əlaqəli sahələrin) aktiv mənbələri
function saheMenbeleri(saheId) {
  const icaze = db.icazeVerilenSaheIdleriAl(saheId);
  const pl = icaze.map(() => "?").join(",");
  const sinifler = db.menbeSinifleriniAl();
  return db.db.prepare(`SELECT id, ad, sahe_id, xam_metn, yaradildi FROM menbeler WHERE aktiv = 1 AND (sahe_id IS NULL OR sahe_id IN (${pl}))`)
    .all(...icaze)
    .map(m => ({ ...m, sinif: sinifler.get(m.id) || "diger" }));
}

// Rəsmi mətnlərdəki maddələr: { nomre -> { basliq, metn } }
function resmiMaddeler(menbeler) {
  const map = new Map();
  const stmt = db.db.prepare("SELECT basliq, metn FROM parcalar WHERE menbe_id = ? ORDER BY sira");
  for (const m of menbeler.filter(x => x.sinif === "resmi")) {
    for (const p of stmt.all(m.id)) {
      const t = String(p.basliq || "").match(/^Maddə\s+(\d+(?:-\d+)?)\s*\.?\s*(.*)$/);
      if (!t) continue;
      const nomre = t[1];
      const ad = t[2].replace(/\[.*$/, "").replace(/\(Hissə\s*\d+\)/i, "").trim();
      const movcud = map.get(nomre) || { basliq: ad, metn: "" };
      movcud.metn += `\n${p.metn}`;
      map.set(nomre, movcud);
    }
  }
  return map;
}

// Bilik xəritəsini rəsmi mətnlə uyğunlaşdırır; mətni dəyişən maddə "yenidən baxılmalı" olur
function xeriteniSinxronEt(saheId, maddeler = resmiMaddeler(saheMenbeleri(saheId))) {
  const movcud = new Map(db.db.prepare("SELECT madde, imza FROM bilik_xeritesi WHERE sahe_id = ?").all(saheId).map(r => [r.madde, r.imza]));
  const elave = db.db.prepare("INSERT INTO bilik_xeritesi (sahe_id, madde, basliq, imza) VALUES (?, ?, ?, ?)");
  const deyis = db.db.prepare("UPDATE bilik_xeritesi SET basliq = ?, imza = ?, metn_deyisib = 1, baxilma_sayi = 0 WHERE sahe_id = ? AND madde = ?");
  db.tranzaksiyaIleIcraEt(() => {
    for (const [nomre, m] of maddeler) {
      const imza = crypto.createHash("sha1").update(m.metn.replace(/\s+/g, " ")).digest("hex").slice(0, 16);
      if (!movcud.has(nomre)) elave.run(saheId, nomre, m.basliq, imza);
      else if (movcud.get(nomre) !== imza) deyis.run(m.basliq, imza, saheId, nomre);
    }
  });
  return xeriteXulasesi(saheId);
}

function xeriteXulasesi(saheId) {
  const r = db.db.prepare(
    "SELECT COUNT(*) AS cemi, COALESCE(SUM(baxilma_sayi > 0), 0) AS baxilan, COALESCE(SUM(metn_deyisib = 1 AND baxilma_sayi = 0), 0) AS deyisen FROM bilik_xeritesi WHERE sahe_id = ?"
  ).get(saheId);
  return { cemi: r.cemi, baxilan: r.baxilan, deyisen: r.deyisen };
}

// Assistent cavab hazırlayarkən bir maddəni oxuyanda çağırılır
function maddeBaxildi(saheId, nomre) {
  const esas = String(nomre || "").match(/^\d+(?:-\d+)?/)?.[0];
  if (!esas) return;
  db.db.prepare("UPDATE bilik_xeritesi SET baxilma_sayi = baxilma_sayi + 1, son_baxilma = ?, metn_deyisib = 0 WHERE sahe_id = ? AND madde = ?")
    .run(Date.now(), saheId, esas);
}

// "... 2027-ci il yanvarın 1-dən qüvvəyə minir" qeydlərindən yaxınlaşan dəyişikliklər
function yaxinDeyisiklikler(menbeler, bugun, gunHeddi = 120) {
  const tarixRe = new RegExp(`(20\\d\\d)-c[ıiuü]\\s+il\\s+(${AYLAR.join("|")})(?:ın|in|un|ün)?\\s+(\\d{1,2})\\s*-\\s*(?:dən|dan|tən|tan)`, "i");
  const map = new Map();
  const elave = (iso, madde) => {
    const qalan = gunFerqi(bugun, iso);
    if (qalan < 0 || qalan > gunHeddi) return;
    if (!map.has(iso)) map.set(iso, { tarix: iso, qalan, maddeler: new Set() });
    if (madde) map.get(iso).maddeler.add(madde);
  };
  const isoQur = (m) => `${m[1]}-${String(AYLAR.indexOf(m[2].toLowerCase()) + 1).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

  for (const menbe of menbeler.filter(x => x.sinif === "resmi")) {
    for (const setir of String(menbe.xam_metn || "").split(/\r?\n/)) {
      if (/qüvvəyə\s+minir/i.test(setir)) {
        const t = setir.match(tarixRe);
        if (!t) continue;
        const md = setir.match(/(\d+(?:-\d+)?(?:\.\d+(?:-\d+)?)*)-c[ıiuü]\s+(?:maddə|fəsil)/i);
        elave(isoQur(t), md ? md[1] : "");
      } else {
        // Tarixə bağlı bənd: "101.1-1.2. 2027-ci il yanvarın 1-dən ..."
        const b = setir.match(/^\s*(\d+(?:-\d+)?(?:\.\d+(?:-\d+)?)+)\.\s*(?=20\d\d-c)/);
        const t = b && setir.match(tarixRe);
        if (t) elave(isoQur(t), b[1]);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.qalan - b.qalan).map(d => ({ ...d, maddeler: [...d.maddeler] }));
}

// Maddə mətnindən konkret bəndi (və onun alt bəndlərini) ayırır; tapılmasa bütün maddəni qaytarır
function bendiAyir(maddeMetni = "", bend = "") {
  if (!bend.includes(".")) return maddeMetni;
  const setirler = String(maddeMetni).split(/\r?\n/);
  const bas = setirler.findIndex(s => s.trim().startsWith(`${bend}.`));
  if (bas < 0) return maddeMetni;
  const netice = [setirler[bas]];
  for (const s of setirler.slice(bas + 1)) {
    const nomre = s.trim().match(/^(\d+(?:-\d+)?(?:\.\d+(?:-\d+)?)+)\.\s/);
    // "220.1" üçün "220.1.x" və "220.1-1" də həmin bəndə aid sayılır
    if (nomre && !nomre[1].startsWith(`${bend}.`) && !nomre[1].startsWith(`${bend}-`)) break;
    netice.push(s);
  }
  return netice.join("\n");
}

// Xülasə mənbəsi bir maddə üzrə rəsmi mətndə olmayan faiz yazırsa — mümkün ziddiyyət / köhnəlmə.
// Yalan həyəcan az olsun deyə qəsdən ehtiyatlıdır: yalnız TƏK və KONKRET bəndə (məs. 101.1-1) aid sətirlər;
// sığorta haqları (başqa qanunlardır), "effektiv dərəcə" hesabları və ümumi başlıqlar yoxlanmır.
function ziddiyyetleriTap(menbeler, maddeler) {
  const faizRe = /(\d+(?:[.,]\d+)?)\s*(?:%|faiz)/gi;
  const normal = (x) => String(Number(String(x).replace(",", ".")));
  const netice = [];
  const gorulen = new Set();

  for (const menbe of menbeler.filter(x => x.sinif === "xulase")) {
    let kontekst = null; // "Maddə X" başlığı altındakı sətirlər həmin maddəyə aiddir
    for (const xam of String(menbe.xam_metn || "").split(/\r?\n/)) {
      const setir = xam.trim();
      if (!setir) { kontekst = null; continue; }
      const istinadlar = Array.from(setir.matchAll(/(?:maddə(?:si)?\s*|\bvə\s+|,\s*)(\d+(?:-\d+)?(?:\.\d+(?:-\d+)?)+|(?<=maddə(?:si)?\s*)\d+(?:-\d+)?)/gi)).map(m => m[1]);
      if (/^\d+\.\s/.test(setir) && !/maddə/i.test(setir)) { kontekst = null; continue; } // yeni nömrəli bölmə
      if (/maddə/i.test(setir)) {
        // Yalnız bir konkret bənd göstərilibsə, altındakı sətirlər ona aid sayılır
        kontekst = istinadlar.length === 1 && istinadlar[0].includes(".") && !setir.startsWith("=") ? istinadlar : null;
        if (!kontekst) continue;
      }
      if (!kontekst || /effektiv|sığorta|dsmf|mdss|\bits\b|^=/i.test(setir)) continue;
      const aid = kontekst;
      const resmi = maddeler.get(aid[0].match(/^\d+(?:-\d+)?/)?.[0]);
      if (!resmi) continue;
      // Faizlər bütün maddədə yox, MƏHZ həmin bənddə (alt bəndləri ilə) axtarılır
      const bendMetni = bendiAyir(resmi.metn, aid[0]);
      const movcudFaizler = new Set(Array.from(bendMetni.matchAll(faizRe)).map(m => normal(m[1])));
      if (movcudFaizler.size === 0) continue;
      // "0%" azadolma deməkdirsə və rəsmi bənddə azadolma yazılıbsa, bu uyğunsuzluq deyil
      if (/azad|sıfır/i.test(bendMetni)) movcudFaizler.add("0");
      const yoxdur = [...new Set(Array.from(setir.matchAll(faizRe)).map(m => normal(m[1])))].filter(f => !movcudFaizler.has(f));
      if (yoxdur.length === 0) continue;
      const acar = `${menbe.id}|${aid[0]}|${yoxdur.join(",")}`;
      if (gorulen.has(acar)) continue;
      gorulen.add(acar);
      netice.push({ menbe: menbe.ad, madde: aid[0], faizler: yoxdur, setir: setir.replace(/^[-•*\d.)\s]+/, "").slice(0, 160) });
    }
  }
  return netice;
}

function vergiTarixleri(bugun, gunHeddi = 30) {
  const [il, ay] = bugun.split("-").map(Number);
  const siyahi = [];
  for (let i = 0; i < 3; i++) {
    const y = il + Math.floor((ay - 1 + i) / 12);
    const m = ((ay - 1 + i) % 12) + 1;
    const iso = (g) => `${y}-${String(m).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
    siyahi.push({ tarix: iso(20), ad: "ƏDV, aksiz və ödəmə mənbəyində vergi" });
    if ([1, 4, 7, 10].includes(m)) siyahi.push({ tarix: iso(20), ad: "Rüblük sadələşdirilmiş vergi və muzdlu iş üzrə hesabat" });
    if (m === 3) siyahi.push({ tarix: iso(31), ad: "İllik mənfəət / gəlir və əmlak vergisi bəyannaməsi" });
  }
  return siyahi
    .map(s => ({ ...s, qalan: gunFerqi(bugun, s.tarix), istirahet: [0, 6].includes(new Date(`${s.tarix}T00:00:00Z`).getUTCDay()) }))
    .filter(s => s.qalan >= 0 && s.qalan <= gunHeddi)
    .sort((a, b) => a.qalan - b.qalan);
}

/**
 * İcmalı bölmələr şəklində hazırlayır
 */
function icmalHazirla({ saheId = null, vaxt = Date.now() } = {}) {
  const sahe_id = saheId || db.aktivSaheIdAl();
  const sahe = db.saheleriAl().find(s => s.id === sahe_id);
  const bugun = bakiTarixi(vaxt);
  const menbeler = saheMenbeleri(sahe_id);
  const maddeler = resmiMaddeler(menbeler);
  const xerite = xeriteniSinxronEt(sahe_id, maddeler);
  const bolmeler = [];
  const suallar = [];

  const deyisiklikler = yaxinDeyisiklikler(menbeler, bugun);
  if (deyisiklikler.length) {
    bolmeler.push({
      basliq: "⚠️ Yaxınlaşan qanun dəyişiklikləri",
      setirler: deyisiklikler.slice(0, 4).map(d => {
        const siyahi = d.maddeler.slice(0, 8).join(", ") + (d.maddeler.length > 8 ? ` və daha ${d.maddeler.length - 8}` : "");
        return `${tarixYaz(d.tarix)} (${d.qalan === 0 ? "bu gün" : `${d.qalan} gün qaldı`})` + (d.maddeler.length ? `: maddə ${siyahi}` : "");
      })
    });
  }

  const vergiSahesi = db.icazeVerilenSaheIdleriAl(sahe_id).includes("vergi_muhasibat");
  const tarixler = vergiSahesi ? vergiTarixleri(bugun) : [];
  if (tarixler.length) {
    bolmeler.push({
      basliq: "📅 Vergi tarixləri (30 gün)",
      setirler: tarixler.slice(0, 5).map(t =>
        `${tarixYaz(t.tarix)} (${t.qalan === 0 ? "BU GÜN" : `${t.qalan} gün`}): ${t.ad}${t.istirahet ? " — istirahət gününə düşür, son tarixi dəqiqləşdirin" : ""}`)
    });
  }

  const ziddiyyetler = ziddiyyetleriTap(menbeler, maddeler);
  if (ziddiyyetler.length) {
    bolmeler.push({
      basliq: `🔀 Mənbələr arasında uyğunsuzluq (${ziddiyyetler.length})`,
      setirler: ziddiyyetler.slice(0, 4).map(z =>
        `«${z.menbe.slice(0, 45)}» maddə ${z.madde} üzrə ${z.faizler.map(f => `${f}%`).join(", ")} yazır; rəsmi mətnin həmin bəndində bu rəqəmi tapmadım (yoxlayın): “${z.setir}”`)
    });
    const menbeAdi = ziddiyyetler[0].menbe.slice(0, 45);
    suallar.push(`«${menbeAdi}» köhnəlmiş ola bilər. Yoxlayıb mənbələr siyahısından söndürək?`);
  }

  // Test qalıqları icmala düşmür
  const qaralamalar = db.qaralamaYaddaslariAl(sahe_id).filter(q => !q.metn.includes("__TEST")).sort((a, b) => b.yaradildi - a.yaradildi);
  if (qaralamalar.length) {
    bolmeler.push({
      basliq: `📝 Təsdiqinizi gözləyən qeydlər (${qaralamalar.length})`,
      setirler: qaralamalar.slice(0, 3).map(q => q.metn.replace(/\s+/g, " ").slice(0, 160))
    });
    suallar.push("Gözləyən qeydlərdən hansını təsdiqləyək, hansını silək?");
  }

  // Salamlaşma, test və sahəyə aid olmayan suallar "bilmədiklərim" sayılmır
  const sahəyeAid = /vergi|məcəllə|mühasib|maddə|bəyannamə|qaimə|cərimə|ədv|gəlir|icarə|dividend|maaş|əmək|ödəniş|kassa|nağd|sığorta|güzəşt|rüsum|müqavilə/i;
  const bosluqlar = db.bilikBosluqlariniAl(50).filter(b =>
    (!b.sahe_id || db.icazeVerilenSaheIdleriAl(sahe_id).includes(b.sahe_id)) && !b.sual.includes("__") &&
    (!vergiSahesi || sahəyeAid.test(b.sual)));
  if (bosluqlar.length) {
    bolmeler.push({ basliq: `❓ Cavabını hələ bilmədiklərim (${bosluqlar.length})`, setirler: bosluqlar.slice(0, 3).map(b => b.sual.replace(/\s+/g, " ").slice(0, 140)) });
  }

  for (const id of db.icazeVerilenSaheIdleriAl(sahe_id)) {
    if (id === sahe_id) continue;
    const s = db.saheleriAl().find(x => x.id === id);
    if (s && !menbeler.some(m => m.sahe_id === id)) suallar.push(`«${s.ad}» sahəsində heç bir sənəd yoxdur. Müvafiq məcəlləni yükləyərsiniz?`);
  }

  // Son 24 saatda nə dəyişib
  const dunen = vaxt - 24 * 60 * 60 * 1000;
  const yeniMenbe = menbeler.filter(m => m.yaradildi > dunen).length;
  const yeniYaddas = db.yaddaslariAl(sahe_id).filter(y => y.yaradildi > dunen).length;
  const baxilanSonGun = db.db.prepare("SELECT madde FROM bilik_xeritesi WHERE sahe_id = ? AND son_baxilma > ? ORDER BY son_baxilma DESC LIMIT 8").all(sahe_id, dunen).map(r => r.madde);
  const irelileyis = [];
  if (xerite.cemi) irelileyis.push(`Rəsmi mətndə ${say(xerite.cemi, "maddə")} var; suallarınıza cavab verərkən ${say(xerite.baxilan, "maddəni")} oxumuşam.`);
  if (xerite.deyisen) irelileyis.push(`${say(xerite.deyisen, "maddənin")} mətni dəyişib — yenidən oxunmalıdır.`);
  if (baxilanSonGun.length) irelileyis.push(`Son sutkada oxuduğum maddələr: ${baxilanSonGun.join(", ")}.`);
  if (yeniMenbe || yeniYaddas) irelileyis.push(`Son sutkada: ${say(yeniMenbe, "yeni mənbə")}, ${say(yeniYaddas, "yeni yaddaş qeydi")}.`);
  if (irelileyis.length) bolmeler.push({ basliq: "🧠 Bilik vəziyyəti", setirler: irelileyis });

  const oyrenme = require("./oyrenme");
  const yeniQeydler = oyrenme.sonQeydler(sahe_id, dunen, 12);
  if (yeniQeydler.length) {
    bolmeler.push({
      basliq: `📚 Son sutkada öyrəndiklərim (${yeniQeydler.length})`,
      setirler: yeniQeydler.slice(0, 4).map(q => {
        const f = q.fikirler.find(x => !x.resmi_metn) || q.fikirler[0];
        const metn = `Maddə ${q.madde}. ${q.basliq}: ${f?.resmi_metn ? "(qanun mətni) " : ""}${f?.fikir || ""}`;
        return metn.length > 220 ? `${metn.slice(0, 219)}…` : metn; // kəsilibsə görünsün
      })
        .concat(`Sitatları ilə baxmaq üçün: "nə öyrəndin ${yeniQeydler[0].madde}"`)
    });
    const aydinOlmayan = yeniQeydler.flatMap(q => q.aydin_olmayan.map(a => `Maddə ${q.madde}: ${a}`));
    if (aydinOlmayan.length) bolmeler.push({ basliq: "🤔 Oxuyarkən mənə aydın olmayanlar", setirler: aydinOlmayan.slice(0, 3).map(a => a.slice(0, 200)) });
  }
  const oyrenilen = oyrenme.oyrenmeStatistikasi(sahe_id);
  if (oyrenilen.madde) {
    const bolme = bolmeler.find(b => b.basliq === "🧠 Bilik vəziyyəti");
    bolme?.setirler.push(`Özüm öyrənib qeyd yazdığım maddə: ${oyrenilen.madde}/${xerite.cemi}.`);
  }

  if (suallar.length) bolmeler.push({ basliq: "🙋 Sizə suallarım", setirler: suallar.slice(0, 3) });

  const basliq = `☀️ Gündəlik icmal — ${tarixYaz(bugun)}${sahe ? ` • ${sahe.ad}` : ""}`;
  if (bolmeler.length === 0) bolmeler.push({ basliq: "Bu gün", setirler: ["Diqqət tələb edən bir şey tapmadım."] });
  return { basliq, tarix: bugun, sahe_id, bolmeler, deyisiklikler, ziddiyyetler, xerite };
}

// Üç görünüş: bildiriş (sadə mətn), çat (markdown)
function metnKimi(icmal) {
  return icmal.bolmeler.map(b => `${b.basliq}\n${b.setirler.map(s => `• ${s}`).join("\n")}`).join("\n\n");
}
function markdownKimi(icmal) {
  return `### ${icmal.basliq}\n\n` + icmal.bolmeler.map(b => `**${b.basliq}**\n${b.setirler.map(s => `- ${s.replace(/[<>]/g, "")}`).join("\n")}`).join("\n\n");
}

const ICMAL_EMRI = /^\s*\/?\s*(?:g[uü]ndəlik\s+)?icmal(?:[ıi])?(?:\s+(?:g[oö]ndər|ver|göstər|hazırla))?\s*[.!]?\s*$/iu;
function icmalEmridirmi(metn = "") {
  return ICMAL_EMRI.test(db.azKicilt(String(metn)));
}

module.exports = {
  saheMenbeleri,
  resmiMaddeler,
  icmalHazirla,
  metnKimi,
  markdownKimi,
  icmalEmridirmi,
  maddeBaxildi,
  xeriteniSinxronEt,
  xeriteXulasesi,
  yaxinDeyisiklikler,
  ziddiyyetleriTap,
  vergiTarixleri,
  bakiTarixi
};
