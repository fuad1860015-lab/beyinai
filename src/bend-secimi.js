// BeyinAI — Suala aid bəndlərin seçilməsi (AI-siz, pulsuz)
// Cavabı bir dəfəyə yazan model yalnız burada seçilən mətni görür, ona görə seçim bənd səviyyəsindədir:
//  söz uyğunluğu (nadir söz ağır) + axtarışın tapdığı maddələr + istinad edilən və ümumi bəndlər.
"use strict";

const db = require("./db");
const icmal = require("./icmal");
const oyrenme = require("./oyrenme");

const NOMRE = "\\d{1,3}(?:-\\d+)?(?:\\.\\d{1,3}(?:-\\d+)?)*";
const BEND_HEDDI = 3500;   // bir bəndin ən böyük uzunluğu
const CEMI_HEDD = 24000;   // modelə verilən qanun mətninin ümumi həddi
const SOZLE_SECILEN = 16;

// Gündəlik sözlər → qanunun işlətdiyi sözlər
const SINONIMLER = [
  [/xərc/, "gəlirdən çıxılan xərclər çıxılmır"],
  [/şənli|ziyafət|korporativ|ad\s*günü|bayram/, "əyləncə sosial xarakterli xərclər"],
  [/maaş/, "əməkhaqqı"],
  [/limit|dərəcədə|həddə/, "yuxarı həddi məhdudlaşdırılır"],
  [/maşın|avtomobil/, "nəqliyyat vasitəsi əsas vəsait"],
  [/noutbuk|kompüter/, "əsas vəsait hesablama texnikası"],
  [/mmc|şirkət/, "müəssisə"],
  [/qaimə/, "elektron qaimə-faktura təqdim etməlidir"]
];

const kokler = (m) => new Set(db.sozKokleri(String(m)).map(k => k.normKok).filter(k => k.length >= 3));
const bendSetri = (setir, nomre) => setir.startsWith(`${nomre}.`) && /\s/.test(setir.charAt(nomre.length + 1));

// Bəndi alt bəndləri, nömrəsiz abzasları və giriş cümləsi ilə birlikdə qaytarır
function bendMetni(maddeMetni, nomre, hedd = 6000) {
  const setirler = String(maddeMetni).split(/\n/).map(s => s.trim()).filter(Boolean);
  const bas = setirler.findIndex(s => bendSetri(s, nomre));
  if (bas < 0) return null;
  let son = bas + 1;
  while (son < setirler.length) {
    const t = setirler[son].match(new RegExp(`^(${NOMRE})\\.\\s`));
    if (t && t[1].includes(".") && !t[1].startsWith(`${nomre}.`)) break;
    son++;
  }
  const giris = oyrenme.sitatinYeri(maddeMetni, setirler[bas]).giris;
  return [...giris, ...setirler.slice(bas, son)].join("\n").slice(0, hedd);
}

// Yalnız bu Məcəllənin daxilindəki istinadlar (başqa qanunun maddəsi ilə qarışdırılmır)
function daxiliIstinadlar(metn = "") {
  return [...new Set(Array.from(String(metn).matchAll(new RegExp(`bu\\s+Məcəllənin\\s+(${NOMRE})\\s*-\\s*(?:ci|cı|cu|cü)`, "giu")), m => m[1]))];
}

function nomreleriTap(metn = "") {
  const { cavabdakiMaddeler } = require("./agent");
  const t = String(metn).replace(/\[\d+(?:\s*,\s*\d+)*\]/g, " ");
  const bendler = Array.from(t.matchAll(/(?<![\d.,-])(\d{1,3}(?:-\d+)?(?:\.\d{1,3}(?:-\d+)?){1,3})(?![\d])/g), m => m[1]);
  return [...new Set([...bendler, ...cavabdakiMaddeler(t)])];
}

// Rəsmi mətnlərin bənd indeksi; mətn dəyişməyibsə yenidən qurulmur
let keshImza = "";
let keshIndeks = null;
function indeks(saheId) {
  const menbeler = icmal.saheMenbeleri(saheId).filter(m => m.sinif === "resmi")
    .sort((a, b) => String(b.xam_metn || "").length - String(a.xam_metn || "").length);
  const imza = menbeler.map(m => `${m.id}:${String(m.xam_metn || "").length}`).join("|");
  if (imza === keshImza && keshIndeks) return keshIndeks;
  const maddeler = [];
  const bendler = [];
  for (const menbe of menbeler) {
    for (const [madde, m] of oyrenme.maddeMetinleri([menbe])) {
      const x = { menbe_id: menbe.id, menbe_adi: menbe.ad, madde, metn: m.metn };
      maddeler.push(x);
      const basliqKok = kokler(m.basliq || "");
      const gorulen = new Set();
      for (const setir of m.metn.split("\n")) {
        const n = setir.trim().match(new RegExp(`^(${NOMRE})\\.\\s`))?.[1];
        if (!n || !n.includes(".") || n.split(".")[0] !== madde || gorulen.has(n)) continue;
        gorulen.add(n);
        const metn = bendMetni(m.metn, n);
        if (metn) bendler.push({ ...x, nomre: n, metn, kok: kokler(metn), basliqKok });
      }
    }
  }
  const tezlik = new Map();
  for (const b of bendler) for (const k of b.kok) tezlik.set(k, (tezlik.get(k) || 0) + 1);
  keshImza = imza;
  keshIndeks = { maddeler, bendler, tezlik };
  return keshIndeks;
}

/**
 * Suala aid bəndlər: [{ blok, nomre_metni, etiket, menbe_id, menbe_adi, metn }]
 * elaveNomreler — modelin ayrıca istədiyi; beyinNomreler — beynin bu sual üçün seçdiyi.
 */
function bendleriSec({ sual = "", saheId, elaveNomreler = [], beyinNomreler = [] }) {
  const { maddeler, bendler, tezlik } = indeks(saheId);
  if (bendler.length === 0) return [];
  const kicik = db.azKicilt(sual);
  const genis = [sual, ...SINONIMLER.filter(([r]) => r.test(kicik)).map(([, s]) => s)].join(" ");
  const sualKokleri = [...kokler(sual)];
  const elaveKokler = [...kokler(genis)].filter(k => !sualKokleri.includes(k));
  const ceki = (k) => (tezlik.get(k) ? Math.log(1 + bendler.length / tezlik.get(k)) : 0);

  // Axtarışın tapdığı maddələr (sinonim və morfologiya bazanın axtarışındadır)
  const sinifler = db.menbeSinifleriniAl();
  const maddeBonusu = new Map();
  for (const p of db.hibridAxtar({ sorgu: genis, sahe_id: saheId, qovluq_id: "all", limit: 14 })) {
    if (sinifler.get(p.menbe_id) !== "resmi") continue;
    const m = String(p.basliq || "").match(/^Maddə\s+(\d+(?:-\d+)?)/)?.[1];
    if (m && !maddeBonusu.has(m)) maddeBonusu.set(m, 5 * Math.max(0, 1 - maddeBonusu.size / 8));
  }

  const xalli = bendler.map(b => {
    let xal = 0;
    for (const k of sualKokleri) if (b.kok.has(k)) xal += ceki(k) * (b.basliqKok.has(k) ? 1.5 : 1);
    for (const k of elaveKokler) if (b.kok.has(k)) xal += ceki(k) * 0.7;
    if (xal > 0) xal = xal / (1 + 0.35 * Math.log(1 + b.metn.length / 500)) + (maddeBonusu.get(b.madde) || 0);
    return { b, xal };
  }).filter(x => x.xal > 0).sort((a, b) => b.xal - a.xal);

  const secilen = [];
  let uzunluq = 0;
  const ehateOlunub = (n) => secilen.some(s => s.nomre_metni === n || n.startsWith(`${s.nomre_metni}.`));
  const elaveEt = (n, menbeId = null, maks = BEND_HEDDI) => {
    if (ehateOlunub(n)) return null;
    const x = bendler.find(b => b.nomre === n && (!menbeId || b.menbe_id === menbeId));
    let kayit = x;
    if (!n.includes(".")) {
      const m = maddeler.find(k => k.madde === n && (!menbeId || k.menbe_id === menbeId));
      kayit = m && !secilen.some(s => s.nomre_metni.startsWith(`${n}.`)) ? m : null;
    }
    if (!kayit) return null;
    const metn = kayit.metn.slice(0, maks);
    if (kayit.metn.length > maks * 1.4 || uzunluq + metn.length > CEMI_HEDD) return null;
    uzunluq += metn.length;
    const yeni = { blok: secilen.length + 1, nomre_metni: n, etiket: `Maddə ${n}`, menbe_id: kayit.menbe_id, menbe_adi: kayit.menbe_adi, metn };
    secilen.push(yeni);
    return yeni;
  };

  for (const n of [...elaveNomreler, ...nomreleriTap(sual)]) elaveEt(n, null, 6000);
  for (const n of beyinNomreler) elaveEt(n);
  let say = 0;
  for (const { b } of xalli) {
    if (say >= SOZLE_SECILEN || uzunluq > CEMI_HEDD * 0.75) break;
    if (elaveEt(b.nomre, b.menbe_id)) say++;
  }
  // Ən uyğun bəndlərin istinad etdiyi bəndlər və ümumi qayda (həmin və əvvəlki maddənin birinci bəndi)
  const esaslar = secilen.slice(0, 6);
  for (const s of esaslar.slice(0, 3)) {
    const m = Number(s.nomre_metni.split(".")[0]);
    for (const n of [`${m - 1}.1`, `${m}.1`]) elaveEt(n, s.menbe_id, 1500);
  }
  for (const s of esaslar) for (const n of daxiliIstinadlar(s.metn).slice(0, 3)) elaveEt(n, s.menbe_id, 2500);
  return secilen;
}

module.exports = { bendleriSec, bendMetni, daxiliIstinadlar, nomreleriTap };
