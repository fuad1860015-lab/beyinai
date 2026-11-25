// BeyinAI — Avtonom Tədqiqatçı, Vergi Təqvimi və Planlayıcı Modulu (Scheduler & Proactive Dispatcher)
// Bu modul:
// 1) İstifadəçinin təyin etdiyi tezliklə (gündə 1, 2, 3 dəfə, ayda 1 dəfə və ya tələb üzrə) avtonom tədqiqat aparır.
// 2) Sınaq keyslərini arxa planda həll edir, dərsləri yaddaşa yazır və hesabat formalaşdırır.
// 3) Azərbaycan Vergi Təqvimini (20-si ƏDV/ÖMV, rüblük DSMF/İTS, 31 Mart Mənfəət və s.) izləyir və vaxtında xəbərdarlıq edir.
// 4) Həm Veb İnterfeysə, həm də qoşulu Telegram Botuna proaktiv bildirişlər göndərir.
"use strict";

const db = require("./db");
const simulator = require("./simulator");
const connectors = require("./connectors");
const webResearcher = require("./web-researcher");

// ---- Tədqiqat Tezliyi İntrvalları (Milli-saniyə ilə) ----
const TEZLIK_INTERVAL_MS = {
  hec_vaxt: 0,
  gunde_3: 8 * 60 * 60 * 1000,       // 8 saatdan bir
  gunde_2: 12 * 60 * 60 * 1000,      // 12 saatdan bir
  gunde_1: 24 * 60 * 60 * 1000,      // 24 saatdan bir (Hər gün)
  heftede_1: 7 * 24 * 60 * 60 * 1000, // 7 gündən bir
  ayda_1: 30 * 24 * 60 * 60 * 1000   // 30 gündən bir
};

// Veb interfeys üçün daxili bildirişlər jurnalı (in-memory FIFO növbəsi)
const vebBildirisler = [];
const MAKS_BILDIRIS_SAYI = 35;

function bildirisQeydEt({ nov = "tedqiqat", basliq, metn, seviyye = "info" }) {
  const b = {
    id: "notif-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    nov,
    basliq,
    metn,
    seviyye,
    vaxt: Date.now()
  };
  vebBildirisler.unshift(b);
  if (vebBildirisler.length > MAKS_BILDIRIS_SAYI) {
    vebBildirisler.pop();
  }
  return b;
}

function vebBildirisleriAl() {
  return [...vebBildirisler];
}

function bildirisleriTemizle() {
  vebBildirisler.length = 0;
  return { ok: true };
}

// ---- Azərbaycan Vergi və Hesabat Təqvimi İzləyicisi ----
function vergiTeqvimiStatusu(tarix = new Date()) {
  const gun = tarix.getDate();
  const ay = tarix.getMonth() + 1; // 1-12
  const il = tarix.getFullYear();
  const rubSonudur = [1, 4, 7, 10].includes(ay);

  const yaxinOlanlar = [];

  // Hər ayın 20-si: ƏDV, Aksiz, ÖMV və cari vergi ödəmələri
  if (gun >= 17 && gun <= 20) {
    const qalan = 20 - gun;
    yaxinOlanlar.push({
      ad: "ƏDV, Aksiz və ÖMV Hesabatı & Ödənişi",
      sonTarix: `${il}-${String(ay).padStart(2, "0")}-20`,
      qalanGun: qalan,
      aciqlama: qalan === 0
        ? "⚠️ BU GÜN SON GÜNDÜR! ƏDV, Aksiz və Ödəmə Mənbəyində Vergi bəyannamələrinin verilməsi və verginin büdcəyə ödənilməsinin son tarixidir."
        : `⏳ Son tarixə ${qalan} gün qaldı: ƏDV, Aksiz və ÖMV bəyannamələrinin və ödənişlərinin tamamlanması tövsiyə olunur.`
    });
  }

  // Rüblük Sadələşdirilmiş Vergi və DSMF/İTS hesabatı (Yanvar, Aprel, İyul, Oktyabr aylarının 20-si)
  if (rubSonudur && gun >= 15 && gun <= 20) {
    const qalan = 20 - gun;
    yaxinOlanlar.push({
      ad: "Rüblük Sadələşdirilmiş Vergi & DSMF/İTS Hesabatı",
      sonTarix: `${il}-${String(ay).padStart(2, "0")}-20`,
      qalanGun: qalan,
      aciqlama: `🏛️ Rüblük Sadələşdirilmiş Vergi bəyannaməsi və Muzdlu İşlə Əlaqədar Vahid Bəyannamənin (DSMF, İTS, İşsizlik) verilməsi üçün ${qalan === 0 ? "BU GÜN SON GÜNDÜR!" : qalan + " gün qaldı."}`
    });
  }

  // İllik Mənfəət və Gəlir Vergisi bəyannaməsi (Mart ayının 31-i)
  if (ay === 3 && gun >= 25) {
    const qalan = 31 - gun;
    yaxinOlanlar.push({
      ad: "İllik Mənfəət / Gəlir və Əmlak Vergisi Bəyannaməsi",
      sonTarix: `${il}-03-31`,
      qalanGun: qalan,
      aciqlama: `💼 İllik Mənfəət vergisi (Maddə 105) və Fərdi Sahibkarların Gəlir vergisi bəyannamələrinin son təqdimetmə tarixinə ${qalan === 0 ? "BU GÜN SON GÜNDÜR!" : qalan + " gün qaldı."}`
    });
  }

  return {
    tarix: `${il}-${String(ay).padStart(2, "0")}-${String(gun).padStart(2, "0")}`,
    yaxinOlanlar
  };
}

/**
 * Planlaşdırılmış və ya Tələb üzrə 3-Pilləli Ağıllı Öyrənmə Növbəsi (Qayda 7: 1 -> 2 -> 3):
 * Prioritet 1: Sənin suallarındakı açıq bilik boşluqlarının İyerarxik Tədqiqatı.
 * Prioritet 2: Telegram/WhatsApp qruplarına düşən real mübahisəli sualların araşdırılması.
 * Prioritet 3: Bazadakı maddələri çarpazlaşdıraraq çətin kəsişmə keysləri ilə məşq.
 */
async function avtoTedqiqatDovresiCalisdir({ mecburidir = false, fetchFn = null } = {}) {
  const tenz = db.tenzimlemeleriAl();
  const tezlik = tenz.scheduler_tezlik || "gunde_1";
  const interval = TEZLIK_INTERVAL_MS[tezlik] ?? TEZLIK_INTERVAL_MS.gunde_1;
  const sonVaxt = Number(tenz.scheduler_son_vaxt) || 0;
  const indi = Date.now();

  if (!mecburidir) {
    if (tezlik === "hec_vaxt") return { icraOlundu: false, sebeb: "Planlayıcı söndürülüb (hec_vaxt)." };
    if (indi - sonVaxt < interval) {
      const qalanDq = Math.round((interval - (indi - sonVaxt)) / 60000);
      return { icraOlundu: false, sebeb: `Növbəti tədqiqata hələ ${qalanDq} dəqiqə var.` };
    }
  }

  const aktivSahe = db.aktivSaheIdAl();
  const bosluqNetice = simulator.bilikBosluqlariniAvtoTedqiqEt(aktivSahe);
  const aciqBosluqlar = db.bilikBosluqlariniAl(5);

  let icraOlunanPrioritet = "";
  let iyerarxikArasdirma = null;
  let simNetice = null;

  // PRİORİTET 1: Sənin suallarında yaranan açıq bilik boşluğu varsa, birinci onu İyerarxik Tədqiq et!
  if (aciqBosluqlar.length > 0) {
    icraOlunanPrioritet = "1_bilik_boslugu";
    const ilkBosluq = aciqBosluqlar[0];
    iyerarxikArasdirma = await webResearcher.bosluguIyerarxikArasdir({
      bosluqId: ilkBosluq.id,
      sual: ilkBosluq.sual,
      movzu: ilkBosluq.movzu,
      sahe_id: aktivSahe,
      fetchFn
    });
  }

  // PRİORİTET 2: Canlı mühasib çatlarında (Telegram/WhatsApp) yeni mübahisəli sual varsa, onu araşdır!
  const canliCatNamized = !iyerarxikArasdirma ? simulator.canliCatlardanMubahiseliKeysCixar(aktivSahe) : null;
  if (canliCatNamized) {
    icraOlunanPrioritet = "2_canli_cat_mubahisesi";
    simNetice = await simulator.simulyasiyaIcraEt({
      customSsenari: canliCatNamized,
      saheId: aktivSahe
    });
  }

  // PRİORİTET 3: Boş vaxt qaldıqda əvvəl işlənməmiş standart keysi və ya Çarpaz Maddə Kəsişməsini məşq et!
  if (!iyerarxikArasdirma && !simNetice) {
    icraOlunanPrioritet = "3_carpaz_madde_mesqi";
    const ssenariler = simulator.ssenarileriAl(aktivSahe);
    const tarixce = db.simulyasiyalariAl(aktivSahe, 50);
    const icraSayiMap = new Map();
    for (const t of tarixce) {
      icraSayiMap.set(t.basliq, (icraSayiMap.get(t.basliq) || 0) + 1);
    }
    const hecIslenmemisStandart = ssenariler.find(s => !icraSayiMap.has(s.basliq));

    if (hecIslenmemisStandart) {
      simNetice = await simulator.simulyasiyaIcraEt({
        ssenariId: hecIslenmemisStandart.id,
        saheId: aktivSahe
      });
    } else {
      simNetice = await simulator.simulyasiyaIcraEt({
        dinamikNov: "carpaz_madde",
        saheId: aktivSahe
      });
    }
  }

  db.tenzimlemeYenile({ scheduler_son_vaxt: String(indi) });

  // Hesabat və Bildiriş mətni qur
  let basliq = "Avtonom Tədqiqat Dövrəsi Tamamlandı";
  let metn = "";
  const tgDuymeler = [];

  if (iyerarxikArasdirma) {
    basliq = `Prioritet 1 — Bilik Boşluğu Araşdırıldı (${iyerarxikArasdirma.qat})`;
    metn = `🔍 ${iyerarxikArasdirma.xulase}`;
    if (iyerarxikArasdirma.yaddasQeydi && iyerarxikArasdirma.yaddasQeydi.status === "qaralama") {
      tgDuymeler.push([
        { text: "👍 Qızıl Yaddaşa Təsdiqlə", callback_data: `qar_ok_${iyerarxikArasdirma.yaddasQeydi.id}` },
        { text: "🗑️ Rədd Et", callback_data: `qar_no_${iyerarxikArasdirma.yaddasQeydi.id}` }
      ]);
    }
    if (iyerarxikArasdirma.bozZonaDosyesi) {
      tgDuymeler.push([
        { text: "👮‍♂️ Müfəttiş Mövqeyi Seç", callback_data: `boz_a_${iyerarxikArasdirma.bozZonaDosyesi.id}` },
        { text: "💼 Baş Mühasib Mövqeyi Seç", callback_data: `boz_b_${iyerarxikArasdirma.bozZonaDosyesi.id}` }
      ]);
    }
  } else if (simNetice) {
    const pEtiket = icraOlunanPrioritet === "2_canli_cat_mubahisesi" ? "Prioritet 2 (Canlı Çat)" : "Prioritet 3 (Çarpaz Sınaq)";
    basliq = `${pEtiket}: ${simNetice.basliq} (${simNetice.bal}% Bal)`;
    const dersMetnleri = (simNetice.dersler || []).join("\n• ");
    metn = `🎯 **Sınaq Keysi:** ${simNetice.basliq}\n📊 **Müvəffəqiyyət Balı:** ${simNetice.bal}/100 (${simNetice.ugurlu_mu ? "Uğurlu" : "Çatışmazlıq Aşkarlandı"})\n\n💡 **Öyrənilmiş Dərslər:**\n• ${dersMetnleri || "Normativ qaydalar təsdiqləndi."}`;
    const ilkQaralama = (simNetice.saxlanilanDersler || []).find(d => d.status === "qaralama");
    if (ilkQaralama) {
      tgDuymeler.push([
        { text: "👍 Dərsi Qızıl Yaddaşa Təsdiqlə", callback_data: `qar_ok_${ilkQaralama.id}` },
        { text: "🗑️ Qaralamanı Sil", callback_data: `qar_no_${ilkQaralama.id}` }
      ]);
    }
  }

  const vebNotif = bildirisQeydEt({
    nov: "avto_tedqiqat",
    basliq,
    metn,
    seviyye: simNetice && !simNetice.ugurlu_mu ? "xeberdarliq" : "ugurlu"
  });

  // Telegram Bildirişi Göndər (Əgər qoşulubsa, interaktiv Təsdiq / Boz Zona düymələri ilə!)
  let tgNetice = null;
  try {
    const tgMetn = `🤖 <b>[BeyinAI 3-Pilləli Öyrənmə Hesabatı]</b>\n\n📌 <b>${basliq}</b>\n\n${metn.replace(/\*\*/g, "")}`;
    const tgSecim = tgDuymeler.length > 0 ? { reply_markup: { inline_keyboard: tgDuymeler } } : {};
    tgNetice = await connectors.proaktivBildirisGonder(tgMetn, tgSecim);
  } catch (_) {}

  return {
    icraOlundu: true,
    prioritet: icraOlunanPrioritet,
    vaxt: indi,
    bosluqNetice,
    iyerarxikArasdirma,
    simNetice,
    vebBildiris: vebNotif,
    telegramGonderildi: Boolean(tgNetice && tgNetice.ok)
  };
}

/**
 * Təqvim Xəbərdarlığı Dövrəsi (Gündə 1 dəfə yoxlayır)
 */
async function teqvimXebardarligiYoxla() {
  const tenz = db.tenzimlemeleriAl();
  const sonTeqvimVaxt = Number(tenz.scheduler_son_teqvim_vaxt) || 0;
  const indi = Date.now();

  // Son 18 saat ərzində yoxlanıbsa təkrar narahat etmə
  if (indi - sonTeqvimVaxt < 18 * 60 * 60 * 1000) return null;

  const durum = vergiTeqvimiStatusu();
  if (!durum.yaxinOlanlar || durum.yaxinOlanlar.length === 0) return null;

  db.tenzimlemeYenile({ scheduler_son_teqvim_vaxt: String(indi) });

  for (const t of durum.yaxinOlanlar) {
    const basliq = `📅 Vergi Təqvimi: ${t.ad}`;
    bildirisQeydEt({
      nov: "teqvim",
      basliq,
      metn: t.aciqlama,
      seviyye: t.qalanGun === 0 ? "tehlukeli" : "xeberdarliq"
    });

    try {
      const tgMetn = `📅 <b>[BeyinAI Vergi Təqvimi Xəbərdarlığı]</b>\n\n📌 <b>Hesabat:</b> ${t.ad}\n⏰ <b>Son Tarix:</b> ${t.sonTarix}\n\n${t.aciqlama}`;
      await connectors.proaktivBildirisGonder(tgMetn);
    } catch (_) {}
  }

  return durum.yaxinOlanlar;
}

// ---- Heartbeat Timer (Hər 60 saniyədən bir arxa planı yoxlayır) ----
let schedulerTimer = null;

function schedulerBaslat() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(async () => {
    try {
      await teqvimXebardarligiYoxla();
      await avtoTedqiqatDovresiCalisdir({ mecburidir: false });
    } catch (_) {}
  }, 60 * 1000).unref();
}

function schedulerDayandir() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

// Server işə düşərkən planlayıcını aktivləşdir
schedulerBaslat();

module.exports = {
  TEZLIK_INTERVAL_MS,
  vergiTeqvimiStatusu,
  avtoTedqiqatDovresiCalisdir,
  teqvimXebardarligiYoxla,
  bildirisQeydEt,
  vebBildirisleriAl,
  bildirisleriTemizle,
  schedulerBaslat,
  schedulerDayandir
};
