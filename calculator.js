// BeyinAI — Azərbaycan Respublikası Vergi və Əmək Qanunvericiliyi üzrə Dəqiq Hesablama Mühərriki
// Mühasibatlıq, Əməkhaqqı (Gross ⇄ Net), Məzuniyyət və Son Haqq-hesab Kalkulyatoru
"use strict";

/**
 * 1. Qeyri-dövlət / Qeyri-neft sektoru üzrə Gross-dan Net-ə hesablama
 * - Gəlir vergisi: 8000 AZN-dək 0%, 8000-dən yuxarı 14% (Maddə 101.1-1)
 * - DSMF (işçi): 200-dək 3%, 200-dən yuxarı 6 AZN + (Gross - 200) * 10%
 * - İşsizlik (işçi): 0.5%
 * - İTS (işçi): 8000-dək 2%, 8000-dən yuxarı 160 + (Gross - 8000) * 0.5%
 *
 * İşəgötürən:
 * - DSMF: 200-dək 22%, 200-dən yuxarı 44 AZN + (Gross - 200) * 15%
 * - İşsizlik: 0.5%
 * - İTS: 8000-dək 2%, 8000-dən yuxarı 160 + (Gross - 8000) * 0.5%
 */
function maasGrossdanNeteOzel(gross) {
  gross = Math.max(0, Number(gross) || 0);

  // İşçi tutulmaları
  let gelirVergisi = 0;
  if (gross > 8000) {
    gelirVergisi = (gross - 8000) * 0.14;
  }

  let dsmfIsci = 0;
  if (gross <= 200) {
    dsmfIsci = gross * 0.03;
  } else {
    dsmfIsci = 6 + (gross - 200) * 0.10;
  }

  const issizlikIsci = gross * 0.005;

  let itsIsci = 0;
  if (gross <= 8000) {
    itsIsci = gross * 0.02;
  } else {
    itsIsci = 160 + (gross - 8000) * 0.005;
  }

  const cemiIsciTutulma = gelirVergisi + dsmfIsci + issizlikIsci + itsIsci;
  const net = gross - cemiIsciTutulma;

  // İşəgötürən xərcləri
  let dsmfIsegoturen = 0;
  if (gross <= 200) {
    dsmfIsegoturen = gross * 0.22;
  } else {
    dsmfIsegoturen = 44 + (gross - 200) * 0.15;
  }

  const issizlikIsegoturen = gross * 0.005;

  let itsIsegoturen = 0;
  if (gross <= 8000) {
    itsIsegoturen = gross * 0.02;
  } else {
    itsIsegoturen = 160 + (gross - 8000) * 0.005;
  }

  const cemiIsegoturen = dsmfIsegoturen + issizlikIsegoturen + itsIsegoturen;
  const umumiXerc = gross + cemiIsegoturen;

  return {
    sektor: "ozel",
    gross: Number(gross.toFixed(2)),
    net: Number(net.toFixed(2)),
    gelirVergisi: Number(gelirVergisi.toFixed(2)),
    dsmfIsci: Number(dsmfIsci.toFixed(2)),
    issizlikIsci: Number(issizlikIsci.toFixed(2)),
    itsIsci: Number(itsIsci.toFixed(2)),
    cemiIsciTutulma: Number(cemiIsciTutulma.toFixed(2)),
    dsmfIsegoturen: Number(dsmfIsegoturen.toFixed(2)),
    issizlikIsegoturen: Number(issizlikIsegoturen.toFixed(2)),
    itsIsegoturen: Number(itsIsegoturen.toFixed(2)),
    cemiIsegoturen: Number(cemiIsegoturen.toFixed(2)),
    umumiXerc: Number(umumiXerc.toFixed(2))
  };
}

/**
 * 2. Qeyri-dövlət / Qeyri-neft sektoru üzrə Net-dən Gross-a hesablama
 */
function maasNetdenGrossaOzel(net) {
  net = Math.max(0, Number(net) || 0);

  if (net <= 189) {
    return maasGrossdanNeteOzel(net / 0.945);
  }

  const net8000 = maasGrossdanNeteOzel(8000).net; // 7014 AZN
  if (net <= net8000) {
    // Net = 0.875 * Gross + 14  =>  Gross = (Net - 14) / 0.875
    const gross = (net - 14) / 0.875;
    return maasGrossdanNeteOzel(gross);
  }

  // 8000 AZN-dən yuxarı üçün dəqiq binary search
  let low = 8000;
  let high = net * 2;
  for (let i = 0; i < 45; i++) {
    const mid = (low + high) / 2;
    const res = maasGrossdanNeteOzel(mid);
    if (res.net < net) low = mid;
    else high = mid;
  }
  return maasGrossdanNeteOzel((low + high) / 2);
}

/**
 * 3. Dövlət və Neft-Qaz sektoru üzrə Gross-dan Net-ə hesablama
 */
function maasGrossdanNeteDovlet(gross) {
  gross = Math.max(0, Number(gross) || 0);

  // Yaşayış minimumu (200 AZN) güzəşti 2500 AZN-dək gəlir üçün
  let vergiyeCelb = gross;
  if (gross <= 2500) {
    vergiyeCelb = Math.max(0, gross - 200);
  }

  let gelirVergisi = 0;
  if (gross <= 2500) {
    gelirVergisi = vergiyeCelb * 0.14;
  } else {
    gelirVergisi = 350 + (gross - 2500) * 0.25;
  }

  const dsmfIsci = gross * 0.03;
  const issizlikIsci = gross * 0.005;

  let itsIsci = 0;
  if (gross <= 8000) {
    itsIsci = gross * 0.02;
  } else {
    itsIsci = 160 + (gross - 8000) * 0.005;
  }

  const cemiIsciTutulma = gelirVergisi + dsmfIsci + issizlikIsci + itsIsci;
  const net = gross - cemiIsciTutulma;

  const dsmfIsegoturen = gross * 0.22;
  const issizlikIsegoturen = gross * 0.005;
  const itsIsegoturen = gross <= 8000 ? gross * 0.02 : 160 + (gross - 8000) * 0.005;
  const cemiIsegoturen = dsmfIsegoturen + issizlikIsegoturen + itsIsegoturen;
  const umumiXerc = gross + cemiIsegoturen;

  return {
    sektor: "dovlet",
    gross: Number(gross.toFixed(2)),
    net: Number(net.toFixed(2)),
    gelirVergisi: Number(gelirVergisi.toFixed(2)),
    dsmfIsci: Number(dsmfIsci.toFixed(2)),
    issizlikIsci: Number(issizlikIsci.toFixed(2)),
    itsIsci: Number(itsIsci.toFixed(2)),
    cemiIsciTutulma: Number(cemiIsciTutulma.toFixed(2)),
    dsmfIsegoturen: Number(dsmfIsegoturen.toFixed(2)),
    issizlikIsegoturen: Number(issizlikIsegoturen.toFixed(2)),
    itsIsegoturen: Number(itsIsegoturen.toFixed(2)),
    cemiIsegoturen: Number(cemiIsegoturen.toFixed(2)),
    umumiXerc: Number(umumiXerc.toFixed(2))
  };
}

/**
 * 4. Məzuniyyət Haqqı Hesablanması (Əmək Məcəlləsi Maddə 140)
 * ortaAyliqMaas / 30.4 * gunSayi
 */
function mezuniyyetHesabla({ maas, gunler = 21, sektor = "ozel" }) {
  maas = Number(maas) || 0;
  gunler = Number(gunler) || 21;

  const gunlukMaas = maas / 30.4;
  const grossMezuniyyet = gunlukMaas * gunler;

  const netNetice = sektor === "dovlet"
    ? maasGrossdanNeteDovlet(grossMezuniyyet)
    : maasGrossdanNeteOzel(grossMezuniyyet);

  return {
    maas,
    gunler,
    gunlukMaas: Number(gunlukMaas.toFixed(2)),
    gross: Number(grossMezuniyyet.toFixed(2)),
    net: netNetice.net,
    tutulma: netNetice.cemiIsciTutulma,
    ayrinti: netNetice
  };
}

/**
 * 5. Son Haqq-hesab (İstifadə edilməmiş məzuniyyət kompensasiyası - Maddə 144)
 */
function sonHaqqHesabHesabla({ maas, qaliqGun = 15, sektor = "ozel" }) {
  return mezuniyyetHesabla({ maas, gunler: qaliqGun, sektor });
}

/**
 * 6. Sualın hesablama komandası olub-olmadığını yoxlayır
 */
function kalkulyatorSorgusudurmu(metn = "") {
  metn = String(metn || "").toLowerCase().trim();
  if (!metn) return false;

  // 1) Aşkar komanda və menyu
  if (/^(?:\/kalkulyator|\/hesabla|kalkulyator|hesabla)$/i.test(metn)) return true;

  // 2) "hesabla ..." ilə başlayan və ya rəqəm + maaş/məzuniyyət/net/gross içeren əmrlər
  if (/^hesabla\b/i.test(metn) && /\d+/.test(metn)) return true;
  if (/\b\d+(?:[.,]\d+)?\s*(?:azn|manat)?\s*(?:net|gross|qross)\b/i.test(metn)) return true;
  if (/\b(?:net|gross|qross)\s*(?:maaş|maas)?\s*\d+/i.test(metn)) return true;

  // 3) Məzuniyyət və son haqq-hesab yalnız real maaş məbləği (azn/manat/maaş) və ya "hesabla" olduqda
  if (/(?:məzuniyyət|mezuniyyet|son\s*haqq[\s-]*hesab)/i.test(metn)) {
    const maasVeYaHesablaVar = /(?:hesabla|maaş|maas|azn|manat)/i.test(metn);
    const reqemVar = /\d+/.test(metn);
    if (maasVeYaHesablaVar && reqemVar) return true;
  }

  return false;
}

/**
 * 7. Mətndən parametrləri çıxarıb hesablama aparır
 */
function kalkulyatorEmalEt(metn = "") {
  const t = metn.toLowerCase().replace(/,/g, ".").trim();

  // A) Əgər yalnız "kalkulyator" yazıbsa:
  if (/^(\/kalkulyator|\/hesabla|kalkulyator|hesabla)$/i.test(t)) {
    return {
      nov: "menu",
      mesaj:
        `🧮 <b>Mühasibat və Əməkhaqqı Kalkulyatoru:</b>\n\n` +
        `Nümunə əmrlər (yazıb göndərə bilərsiniz):\n` +
        `• <code>hesabla maaş 1500 net</code> — 1500 AZN ələ verilən məbləğin Gross hesabı\n` +
        `• <code>hesabla maaş 2000 gross</code> — 2000 AZN üzərindən bütün vergi və fond tutulmaları\n` +
        `• <code>hesabla məzuniyyət 1200 maaş 21 gün</code> — Məzuniyyət haqqı\n` +
        `• <code>hesabla son haqq-hesab 1500 maaş 14 gün</code> — İşdən çıxarkən kompensasiya`
    };
  }

  // B) Məzuniyyət və ya Son haqq-hesab:
  if (t.includes("məzuniyyət") || t.includes("mezuniyyet") || t.includes("haqq-hesab") || t.includes("haqq hesab")) {
    const gunMatch = t.match(/(\d+)\s*(?:gün|gun)/i) || t.match(/(?:gün|gun)\s*[:=]?\s*(\d+)/i);
    const gun = gunMatch ? parseInt(gunMatch[1], 10) : 21;

    // Maaşı taparkən gün sayını çıxırıq
    const tTemiz = gunMatch ? t.replace(gunMatch[0], "") : t;
    const maasMatch =
      tTemiz.match(/(\d+(?:\.\d+)?)\s*(?:azn|manat)?\s*(?:maaş|maas|əməkhaqqı)/i) ||
      tTemiz.match(/(?:maaş|maas|əməkhaqqı)\s*[:=]?\s*(\d+(?:\.\d+)?)/i) ||
      tTemiz.match(/(\d+(?:\.\d+)?)/);

    const maas = maasMatch ? parseFloat(maasMatch[1]) : 1000;
    const isSon = t.includes("haqq-hesab") || t.includes("haqq hesab");

    const netice = isSon
      ? sonHaqqHesabHesabla({ maas, qaliqGun: gun })
      : mezuniyyetHesabla({ maas, gunler: gun });

    return {
      nov: isSon ? "son_haqq_hesab" : "mezuniyyet",
      netice,
      mesaj: isSon
        ? formatSonHaqqHesab(netice)
        : formatMezuniyyet(netice)
    };
  }

  // C) Əməkhaqqı hesabı (Gross ⇄ Net):
  const meblegMatch = t.match(/(\d+(?:\.\d+)?)/);
  if (!meblegMatch) {
    return {
      nov: "xeta",
      mesaj: "⚠️ Zəhmət olmasa məbləği qeyd edin. Məsələn: <code>hesabla maaş 1500 net</code>"
    };
  }

  const mebleg = parseFloat(meblegMatch[1]);
  const isNet = t.includes("net") || (!t.includes("gross") && !t.includes("qross"));
  const isDovlet = t.includes("dövlət") || t.includes("dovlet") || t.includes("neft");

  const netice = isNet
    ? maasNetdenGrossaOzel(mebleg)
    : (isDovlet ? maasGrossdanNeteDovlet(mebleg) : maasGrossdanNeteOzel(mebleg));

  return {
    nov: "maas",
    isNet,
    netice,
    mesaj: formatMaasHesabi(netice, isNet)
  };
}

// Telegram üçün formatlayıcılar
function formatMaasHesabi(res, isNetden) {
  return (
    `🧮 <b>Əməkhaqqı Hesablaması (Qeyri-dövlət / Özəl Sektor):</b>\n\n` +
    `💵 <b>Gross (Hesablanmış Maaş):</b> <code>${res.gross.toFixed(2)} AZN</code>\n` +
    `💳 <b>Net (İşçinin Ələ Aldığı):</b> <code>${res.net.toFixed(2)} AZN</code>\n\n` +
    `👤 <b>İşçidən Tutulmalar:</b>\n` +
    `  • Gəlir vergisi (8000-dək 0% güzəşt): <b>${res.gelirVergisi.toFixed(2)} AZN</b>\n` +
    `  • DSMF (200-dək 3%, yuxarı 10%): <b>${res.dsmfIsci.toFixed(2)} AZN</b>\n` +
    `  • İşsizlikdən sığorta (0.5%): <b>${res.issizlikIsci.toFixed(2)} AZN</b>\n` +
    `  • İcbari Tibbi Sığorta (2%): <b>${res.itsIsci.toFixed(2)} AZN</b>\n` +
    `  👉 <i>Cəmi işçi tutulması: ${res.cemiIsciTutulma.toFixed(2)} AZN</i>\n\n` +
    `🏢 <b>İşəgötürənin Xərcləri (Şirkət fondu):</b>\n` +
    `  • DSMF (200-dək 22%, yuxarı 15%): <b>${res.dsmfIsegoturen.toFixed(2)} AZN</b>\n` +
    `  • İşsizlikdən sığorta (0.5%): <b>${res.issizlikIsegoturen.toFixed(2)} AZN</b>\n` +
    `  • İcbari Tibbi Sığorta (2%): <b>${res.itsIsegoturen.toFixed(2)} AZN</b>\n` +
    `  👉 <i>Cəmi şirkət əlavəsi: ${res.cemiIsegoturen.toFixed(2)} AZN</i>\n\n` +
    `💼 <b>Şirkət üçün ÜMUMİ İŞÇİ XƏRCİ:</b> <code>${res.umumiXerc.toFixed(2)} AZN</code>\n\n` +
    `📌 <i>Hesablama AR Vergi Məcəlləsinin 101.1-1 və Sosial Sığorta haqqında qanuna uyğun aparılmışdır.</i>`
  );
}

function formatMezuniyyet(res) {
  return (
    `🏖️ <b>Məzuniyyət Haqqı Hesablaması:</b>\n\n` +
    `• <b>Orta aylıq əməkhaqqı:</b> ${res.maas.toFixed(2)} AZN\n` +
    `• <b>Məzuniyyət müddəti:</b> ${res.gunler} təqvim günü\n` +
    `• <b>Günlük qazanc (Orta / 30.4):</b> <code>${res.gunlukMaas.toFixed(2)} AZN</code>\n\n` +
    `💵 <b>Hesablanmış Məzuniyyət (Gross):</b> <code>${res.gross.toFixed(2)} AZN</code>\n` +
    `💳 <b>İşçiyə Ödəniləcək (Net):</b> <code>${res.net.toFixed(2)} AZN</code>\n` +
    `📉 <b>Məzuniyyətdən tutulmalar:</b> ${res.tutulma.toFixed(2)} AZN\n\n` +
    `📌 <i>Əmək Məcəlləsinin 140-cı maddəsinə əsasən hesablanmışdır.</i>`
  );
}

function formatSonHaqqHesab(res) {
  return (
    `📋 <b>İşdən Çıxış / Son Haqq-hesab Kompensasiyası:</b>\n\n` +
    `• <b>Aylıq maaş:</b> ${res.maas.toFixed(2)} AZN\n` +
    `• <b>İstifadə edilməmiş məzuniyyət:</b> ${res.gunler} gün\n` +
    `• <b>Günlük əmsal (Maaş / 30.4):</b> <code>${res.gunlukMaas.toFixed(2)} AZN</code>\n\n` +
    `💵 <b>Kompensasiya məbləği (Gross):</b> <code>${res.gross.toFixed(2)} AZN</code>\n` +
    `💳 <b>Ələ veriləcək məbləğ (Net):</b> <code>${res.net.toFixed(2)} AZN</code>\n\n` +
    `📌 <i>Əmək Məcəlləsinin 144-cü maddəsinə uyğundur.</i>`
  );
}

module.exports = {
  maasGrossdanNeteOzel,
  maasNetdenGrossaOzel,
  maasGrossdanNeteDovlet,
  mezuniyyetHesabla,
  sonHaqqHesabHesabla,
  kalkulyatorSorgusudurmu,
  kalkulyatorEmalEt
};
