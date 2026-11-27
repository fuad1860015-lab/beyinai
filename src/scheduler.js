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
const cognition = require("./cognition");
const icmal = require("./icmal");
const oyrenme = require("./oyrenme");

// ---- Tədqiqat Tezliyi İntrvalları (Milli-saniyə ilə) ----
const TEZLIK_INTERVAL_MS = {
  hec_vaxt: 0,
  gunde_3: 8 * 60 * 60 * 1000,       // 8 saatdan bir
  gunde_2: 12 * 60 * 60 * 1000,      // 12 saatdan bir
  gunde_1: 24 * 60 * 60 * 1000,      // 24 saatdan bir (Hər gün)
  heftede_1: 7 * 24 * 60 * 60 * 1000, // 7 gündən bir
  ayda_1: 30 * 24 * 60 * 60 * 1000   // 30 gündən bir
};

// Bildirişlər bazada saxlanılır — proqram yenidən başlayanda itmir
const MAKS_BILDIRIS_SAYI = 35;
db.db.exec(`
  CREATE TABLE IF NOT EXISTS bildirisler (
    id TEXT PRIMARY KEY,
    nov TEXT DEFAULT '',
    basliq TEXT DEFAULT '',
    metn TEXT DEFAULT '',
    seviyye TEXT DEFAULT 'info',
    vaxt INTEGER NOT NULL
  );
`);

function bildirisQeydEt({ nov = "tedqiqat", basliq, metn, seviyye = "info" }) {
  const b = {
    id: "notif-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    nov,
    basliq,
    metn,
    seviyye,
    vaxt: Date.now()
  };
  db.db.prepare("INSERT INTO bildirisler (id, nov, basliq, metn, seviyye, vaxt) VALUES (?, ?, ?, ?, ?, ?)")
    .run(b.id, nov, String(basliq || ""), String(metn || ""), seviyye, b.vaxt);
  db.db.prepare(`DELETE FROM bildirisler WHERE id NOT IN (SELECT id FROM bildirisler ORDER BY vaxt DESC, rowid DESC LIMIT ${MAKS_BILDIRIS_SAYI})`).run();
  return b;
}

function vebBildirisleriAl() {
  return db.db.prepare("SELECT * FROM bildirisler ORDER BY vaxt DESC, rowid DESC").all();
}

function bildirisleriTemizle() {
  db.db.prepare("DELETE FROM bildirisler").run();
  return { ok: true };
}

// Gündə bir dəfə (Bakı tarixi ilə) seçilmiş istiqamətin icmalını bildiriş kimi yaradır
function gundelikIcmalYoxla(vaxt = Date.now()) {
  const saheId = db.aktivSaheIdAl();
  const acar = `${icmal.bakiTarixi(vaxt)}|${saheId}`;
  if (db.tenzimlemeleriAl().icmal_son_acar === acar) return null;
  const hazir = icmal.icmalHazirla({ saheId, vaxt });
  db.tenzimlemeYenile({ icmal_son_acar: acar });
  return bildirisQeydEt({ nov: "icmal", basliq: hazir.basliq, metn: icmal.metnKimi(hazir), seviyye: "info" });
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

  // Avtomatik dövrə yalnız açıq bilik boşluğu araşdırır; sınaqlar pulsuz limiti yemir (əl ilə işə salmaq olar)
  const aktivSahe = db.aktivSaheIdAl();
  const bosluqNetice = simulator.bilikBosluqlariniAvtoTedqiqEt(aktivSahe);
  // Son 7 gündə araşdırılmış boşluqlar təkrar araşdırılmır (nəticə Qaralamada sizi gözləyir)
  const aciqBosluqlar = db.bilikBosluqlariniAl(50)
    .filter(b => !b.son_arasdirma || indi - b.son_arasdirma > 7 * 24 * 60 * 60 * 1000);

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

  if (!mecburidir && !iyerarxikArasdirma) {
    db.tenzimlemeYenile({ scheduler_son_vaxt: String(indi) });
    return { icraOlundu: false, sebeb: "Araşdırılacaq açıq boşluq yoxdur." };
  }

  // PRİORİTET 2: Sahənin Bacarıq Xəritəsində zəif (seviyye='zeif') mövzu varsa, hədəfli olaraq məhz həmin zəif mövzunu məşq et!
  cognition.bacariqXeritesiniSinxronEt(aktivSahe);
  const zeifMovzular = !iyerarxikArasdirma ? db.zeifMovzulariAl(aktivSahe, 3).filter(m => m.seviyye === "zeif") : [];
  if (zeifMovzular.length > 0) {
    icraOlunanPrioritet = "2_zeif_movzu_mesqi";
    simNetice = await simulator.simulyasiyaIcraEt({
      dinamikNov: "zeif_movzu",
      saheId: aktivSahe
    });
  }

  // PRİORİTET 3: Canlı çatlarda (Telegram/WhatsApp) yeni mübahisəli sual varsa, onu araşdır!
  const canliCatNamized = (!iyerarxikArasdirma && !simNetice) ? simulator.canliCatlardanMubahiseliKeysCixar(aktivSahe) : null;
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
    basliq = `Prioritet 1 — Bilik Boşluğu Araşdırıldı (${iyerarxikArasdirma.tapildi ? "tapıntı Qaralamada" : "tapılmadı"})`;
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
    const pEtiket =
      icraOlunanPrioritet === "2_zeif_movzu_mesqi"
        ? "Hədəfli Zəif Mövzu Məşqi"
        : icraOlunanPrioritet === "2_canli_cat_mubahisesi"
          ? "Prioritet 2 (Canlı Çat)"
          : "Prioritet 3 (Çarpaz Sınaq)";
    const balYazisi = simNetice.yoxlanib ? `${simNetice.bal}% Bal` : "yoxlanılmayıb";
    basliq = `${pEtiket}: ${simNetice.basliq} (${balYazisi})`;
    const dersMetnleri = (simNetice.dersler || []).join("\n• ");
    metn = simNetice.yoxlanib
      ? `🎯 **Sınaq Keysi:** ${simNetice.basliq}\n📊 **Bal (AI hakim):** ${simNetice.bal}/100 (${simNetice.ugurlu_mu ? "Uğurlu" : "Çatışmazlıq Aşkarlandı"})\n\n💡 **Təsdiqinizi gözləyən qeydlər:**\n• ${dersMetnleri || "Qeyd yoxdur."}`
      : `🎯 **Sınaq Keysi:** ${simNetice.basliq}\n⏳ ${simNetice.audit_netice}`;
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

// Gündəlik öyrənmə: bitəndə nəticə bildiriş kimi görünür
async function gundelikOyrenmeIcraEt() {
  const n = await oyrenme.gundelikOyrenmeYoxla();
  if (!n?.oyrenilen?.length) return n;
  bildirisQeydEt({
    nov: "oyrenme",
    basliq: `📚 Bu gün ${n.oyrenilen.length} mövzu öyrəndim`,
    metn: n.oyrenilen.map(o => `• Maddə ${o.madde}. ${o.basliq}${o.hisse_sayi > 1 ? ` [${o.hisse}/${o.hisse_sayi}]` : ""} (${o.fikirSayi} fikir sitatla yoxlandı${o.bendSayi ? `; ${o.bendSayi} bənddən ${o.ehateSayi}-i` : ""}${o.deyisiklikSayi ? "; ⚠️ dəyişiklik var" : ""})`).join("\n") +
      `\n\nÇatda və ya Telegram-da "nə öyrəndin ${n.oyrenilen[0].madde}" yazıb baxın.`,
    seviyye: "ugurlu"
  });
  return n;
}

// ---- Heartbeat Timer (Hər 60 saniyədən bir arxa planı yoxlayır) ----
let schedulerTimer = null;

function schedulerBaslat() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  // Proqram açılan kimi bugünkü icmal hazır olsun
  setTimeout(() => {
    try { gundelikIcmalYoxla(); } catch (e) { console.error("İcmal xətası:", e.message); }
  }, 2000).unref();
  schedulerTimer = setInterval(async () => {
    try { gundelikIcmalYoxla(); } catch (e) { console.error("İcmal xətası:", e.message); }
    gundelikOyrenmeIcraEt().catch(e => console.error("Öyrənmə xətası:", e.message));
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
  gundelikIcmalYoxla,
  gundelikOyrenmeIcraEt,
  schedulerBaslat,
  schedulerDayandir
};
