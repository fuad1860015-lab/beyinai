// BeyinAI — Qat-qat (İyerarxik) Bilik Boşluğu Tədqiqatçısı (Web & Official Portal Researcher)
// Qayda 1.B + 1.C & Qayda 3.B & Qayda 6.B:
// 1-ci qat: Yalnız təsdiqlənmiş rəsmi dövlət mənbələri (e-qanun.az, taxes.gov.az, cabmin.gov.az, sosial.gov.az).
// 2-ci qat: Rəsmi izah tapılmadıqda açıq ekspert məqalələri — lakin mütləq "⚠️ Rəsmi qanun deyil — ekspert şərhi / fərziyyə" damğası ilə Qaralama Dəftərinə yazılır.
// İki fərqli yanaşma / qeyri-müəyyənlik çıxdıqda avtomatik "⚖️ Boz Zona Dosyesi" açılır.
"use strict";

const db = require("./db");
const ai = require("./ai");
const evolution = require("./evolution");

const RESMI_DOVLET_DOMENLERI = [
  "e-qanun.az",
  "taxes.gov.az",
  "e-taxes.gov.az",
  "cabmin.gov.az",
  "sosial.gov.az",
  "its.gov.az",
  "cbar.az"
];

function htmlMetneCevir(html = "") {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function linkResmidirmi(url = "") {
  const u = String(url || "").toLowerCase();
  return RESMI_DOVLET_DOMENLERI.some(d => u.includes(d));
}

/**
 * Axtarış mühərriki vasitəsilə (DuckDuckGo HTML) veb nəticələri gətirir.
 * Test və ya qapalı mühit üçün `fetchFn` ötürülə bilər.
 */
async function vebAxtarisApar(sorgu, { yalnızResmi = false, fetchFn = null } = {}) {
  const icraFetch = fetchFn || (typeof fetch === "function" ? fetch : null);
  if (!icraFetch) return [];

  const domenSerti = yalnızResmi
    ? " (site:e-qanun.az OR site:taxes.gov.az OR site:cabmin.gov.az OR site:sosial.gov.az)"
    : " Azərbaycan vergi qanunvericilik mühasibatlıq";

  const tamSorgu = `${sorgu}${domenSerti}`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(tamSorgu)}`;

  try {
    const res = await icraFetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BeyinAI-Researcher/2.0"
      },
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
    });
    if (!res || !res.ok) return [];
    const html = await res.text();

    const neticeler = [];
    const bloklar = html.split(/class="result__body"/i).slice(1, 7);
    for (const b of bloklar) {
      const basliqMatch = b.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
      const urlMatch = b.match(/href="([^"]+)"/i);
      const xulaseMatch = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);

      const xamUrl = urlMatch ? decodeURIComponent(urlMatch[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0]) : "";
      const basliq = htmlMetneCevir(basliqMatch ? basliqMatch[1] : "");
      const xulase = htmlMetneCevir(xulaseMatch ? (xulaseMatch[1] || xulaseMatch[2] || "") : "");

      if (!basliq && !xulase) continue;
      const resmidir = linkResmidirmi(xamUrl);
      if (yalnızResmi && !resmidir) continue;

      neticeler.push({
        basliq,
        url: xamUrl,
        xulase,
        resmi: resmidir
      });
    }
    return neticeler;
  } catch (_) {
    return [];
  }
}

/**
 * Bir bilik boşluğunu qat-qat (Əvvəl Lokal Baza -> 1-ci Qat Rəsmi Dövlət Saytları -> 2-ci Qat Ekspert Şərhləri) araşdırır.
 */
async function bosluguIyerarxikArasdir({
  bosluqId = null,
  sual,
  movzu = "",
  sahe_id = null,
  fetchFn = null
}) {
  if (!sual || !sual.trim()) return null;
  const aktivSahe = sahe_id || db.aktivSaheIdAl();
  const temizSual = sual.trim();
  const qisaMovzu = (movzu || temizSual).slice(0, 80);

  // QAT 0: Bəlkə sonradan bazaya yüklənmiş rəsmi sənəddə artıq cavab var?
  const lokalTapilanlar = db.hibridAxtar({ sorgu: temizSual, sahe_id: aktivSahe, limit: 3 });
  const gucluLokalResmi = lokalTapilanlar.find(
    p => (p.etibar_seviyyesi === "orijinal_menbe" || !p.etibar_seviyyesi) && (p.xam_bal || 0) >= 38
  );

  if (gucluLokalResmi) {
    const qaralama = db.yaddasElaveEt({
      sahe_id: aktivSahe,
      kateqoriya: "qayda",
      metn: `[RƏSMİ BAZA TAPINTISI — ${qisaMovzu}]: ${gucluLokalResmi.basliq ? gucluLokalResmi.basliq + " — " : ""}${String(gucluLokalResmi.metn || "").slice(0, 280).trim()}`,
      menbe: "Avtonom Tədqiqat",
      vaciblik: 4,
      etibar_seviyyesi: "orijinal_menbe",
      status: "tesdiqlenmis"
    });
    if (bosluqId) db.bilikBosluguHellEt(bosluqId);
    return {
      qat: "lokal_resmi",
      tapildi: true,
      etibar: "orijinal_menbe",
      yaddasQeydi: qaralama,
      bozZonaDosyesi: null,
      xulase: `Bazada mövcud rəsmi sənəd ("${gucluLokalResmi.menbe_adi}") əsasında boşluq bağlandı.`
    };
  }

  // QAT 1: Yalnız Rəsmi Dövlət Portalları (e-qanun.az, taxes.gov.az, cabmin.gov.az)
  const resmiNeticeler = await vebAxtarisApar(temizSual, { yalnızResmi: true, fetchFn });
  if (resmiNeticeler.length > 0) {
    const birlesikResmi = resmiNeticeler
      .slice(0, 3)
      .map(r => `${r.basliq}: ${r.xulase} (${r.url})`)
      .join(" | ");

    const yaddasQeydi = db.yaddasElaveEt({
      sahe_id: aktivSahe,
      kateqoriya: "qayda",
      metn: `[RƏSMİ PORTAL ARAŞDIRMASI — ${qisaMovzu}]: ${birlesikResmi.slice(0, 360)}`,
      menbe: "Avtonom Tədqiqat",
      vaciblik: 4,
      etibar_seviyyesi: "orijinal_menbe",
      // İstifadəçi təsdiqləyənədək və ya lokal maddə ilə 100% üst-üstə düşənədək Qaralamada saxla
      status: "qaralama"
    });

    if (bosluqId) db.bilikBosluguHellEt(bosluqId);
    return {
      qat: "resmi_dovlet_portali",
      tapildi: true,
      etibar: "orijinal_menbe",
      menbeler: resmiNeticeler,
      yaddasQeydi,
      bozZonaDosyesi: null,
      xulase: `Rəsmi dövlət portalından (${resmiNeticeler[0].url}) məlumat tapıldı və Qaralama Dəftərinə əlavə edildi.`
    };
  }

  // QAT 2: Açıq Ekspert Məqalələri və Şərhləri (Ciddi Fərziyyə Etiketi ilə Təcrid!)
  const aciqNeticeler = await vebAxtarisApar(temizSual, { yalnızResmi: false, fetchFn });
  if (aciqNeticeler.length > 0) {
    const birlesikEkspert = aciqNeticeler
      .slice(0, 3)
      .map(r => `${r.basliq}: ${r.xulase}`)
      .join(" | ");

    // Qayda 1.C + 3.B: Ekspert rəyi mütləq xəbərdarlıq damğası ilə və YALNIZ Qaralama kimi saxlanılır!
    const yaddasQeydi = db.yaddasElaveEt({
      sahe_id: aktivSahe,
      kateqoriya: "praktika",
      metn: `⚠️ [RƏSMİ QANUN DEYİL — EKSPERT ŞƏRHİ / FƏRZİYYƏ | ${qisaMovzu}]: ${birlesikEkspert.slice(0, 340)}`,
      menbe: "Xarici Ekspert Şərhi",
      vaciblik: 3,
      etibar_seviyyesi: "ekspert_serhi_ferziyye",
      status: "qaralama"
    });

    // Qayda 6.B: Rəsmi mənbədə birbaşa norma tapılmadığı və yalnız şərh olduğu üçün Boz Zona Dosyesi də açırıq!
    const bozZonaDosyesi = evolution.bozZonaYoxlaVeDosyeAc({
      sual: temizSual,
      movzu: qisaMovzu,
      sahe_id: aktivSahe,
      teref_a: "Mühafizəkar Vergi Müfəttişi Mövqeyi: Rəsmi dövlət mənbəsində birbaşa güzəşt/istisna təsdiqlənmədiyi üçün ümumi vergi dərəcəsi və ən sərt sənədləşmə tələbi tətbiq edilməlidir.",
      teref_b: `Ekspert Şərhi / Praktiki Mövqe: Açıq mənbələrdəki şərhlərə əsasən — ${aciqNeticeler[0].xulase.slice(0, 220)}`
    });

    if (bosluqId) db.bilikBosluguHellEt(bosluqId);
    return {
      qat: "ekspert_serhi_ferziyye",
      tapildi: true,
      etibar: "ekspert_serhi_ferziyye",
      menbeler: aciqNeticeler,
      yaddasQeydi,
      bozZonaDosyesi,
      xulase: `Rəsmi mənbədə birbaşa cavab tapılmadı; açıq ekspert şərhi "Fərziyyə" damğası ilə Qaralamaya yazıldı və Boz Zona Dosyesi açıldı.`
    };
  }

  // QAT 3: İnternet çıxışı yoxdursa (məs: oflayn rejim) — mövzunu həm Tədqiqat Təklifinə, həm də Boz Zona Dosyesinə çevir ki, ekspert qərar versin
  db.saheMovzuElaveEt({
    sahe_id: aktivSahe,
    movzu: qisaMovzu,
    status: "teklif",
    detal: `Rəsmi mənbə sənədi tələb olunur: "${temizSual}"`,
    menbe_sayi: 0
  });

  const bozZonaDosyesi = evolution.bozZonaYoxlaVeDosyeAc({
    sual: temizSual,
    movzu: qisaMovzu,
    sahe_id: aktivSahe,
    teref_a: "Mühafizəkar Yanaşma: Rəsmi normativ sənəd bazaya əlavə edilənədək əməliyyata maksimal vergi riski ilə yanaşılsın.",
    teref_b: "Praktiki Mühasib Yanaşması: Vergi Məcəlləsinin 3.11-ci maddəsinə əsasən vergi ödəyicisinin iqtisadi əsaslandırması rəhbər tutulsun."
  });

  return {
    qat: "boz_zona_eskalasiya",
    tapildi: false,
    etibar: "namelum",
    yaddasQeydi: null,
    bozZonaDosyesi,
    xulase: `Bazada və rəsmi axtarışda dəqiq norma tapılmadığı üçün "${qisaMovzu}" üzrə Mübahisəli Boz Zona Dosyesi açıldı.`
  };
}

module.exports = {
  RESMI_DOVLET_DOMENLERI,
  linkResmidirmi,
  vebAxtarisApar,
  bosluguIyerarxikArasdir
};
