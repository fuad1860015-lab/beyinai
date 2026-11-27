// BeyinAI — Azərbaycan Respublikası Vergi və Əmək Qanunvericiliyi üzrə Dəqiq Hesablama Mühərriki
// Mühasibatlıq, Əməkhaqqı (Gross ⇄ Net), Məzuniyyət və Son Haqq-hesab Kalkulyatoru
"use strict";

// ================= DƏRƏCƏ CƏDVƏLİ (il üzrə) =================
// Dərəcə dəyişəndə YALNIZ bu cədvəli yeniləmək kifayətdir.
// Gəlir vergisi: Vergi Məcəlləsi 101.1-1.1 — 101.1-1.3 (özəl, qeyri-neft-qaz) və 101.1 (dövlət / neft-qaz); güzəşt 102.1.6.
// DSMF, işsizlik və tibbi sığorta: 2026-cı il dərəcələri (mənbə: vergiler.az icmalları — rəsmi mətnlə yoxlanmalıdır).
const OZEL_GELIR_VERGISI = {
  // 2025: 8000-dək 0%, yuxarı 14% (keçmiş dövr haqq-hesabları üçün)
  2025: { asagiFaiz: 0, ortaSabit: 0, ortaFaiz: 0, yuxariSabit: 0, bend: "101.1-1 (2025)" },
  2026: { asagiFaiz: 0.03, ortaSabit: 75, yuxariSabit: 625, bend: "101.1-1.1" },
  2027: { asagiFaiz: 0.05, ortaSabit: 125, yuxariSabit: 675, bend: "101.1-1.2" },
  2028: { asagiFaiz: 0.07, ortaSabit: 175, yuxariSabit: 725, bend: "101.1-1.3" }
};
const SIGORTA_DERECE_ILI = 2026;

function hesablamaIli(il) {
  const y = Number(il) || new Date().getFullYear();
  if (y < 2025) {
    throw new Error(`${y}-ci il üçün dərəcələr kalkulyatorda yoxdur (yalnız 2025 və sonrakı illər).`);
  }
  return y;
}

function yuvarla(x) {
  return Number((x + 1e-9).toFixed(2));
}

function neticeQur({ sektor, il, gross, gelirVergisi, dsmfIsci, itsIsci, dsmfIsegoturen, itsIsegoturen, bend }) {
  const issizlik = gross * 0.005;
  const isci = [gelirVergisi, dsmfIsci, issizlik, itsIsci].map(yuvarla);
  const firma = [dsmfIsegoturen, issizlik, itsIsegoturen].map(yuvarla);
  const cemiIsciTutulma = yuvarla(isci.reduce((a, b) => a + b, 0));
  const cemiIsegoturen = yuvarla(firma.reduce((a, b) => a + b, 0));
  return {
    sektor,
    il,
    bend,
    gross: yuvarla(gross),
    net: yuvarla(yuvarla(gross) - cemiIsciTutulma),
    gelirVergisi: isci[0],
    dsmfIsci: isci[1],
    issizlikIsci: isci[2],
    itsIsci: isci[3],
    cemiIsciTutulma,
    dsmfIsegoturen: firma[0],
    issizlikIsegoturen: firma[1],
    itsIsegoturen: firma[2],
    cemiIsegoturen,
    umumiXerc: yuvarla(yuvarla(gross) + cemiIsegoturen)
  };
}

/**
 * 1. Qeyri-dövlət / Qeyri-neft sektoru üzrə Gross-dan Net-ə
 * - Gəlir vergisi: 2500-dək (200 AZN güzəştdən sonra) 3/5/7%; 2500–8000: sabit + 10%; 8000+: sabit + 14%
 * - DSMF işçi: 200-dək 3%, sonra 6 + 10%; işəgötürən: 22% / 44 + 15% (8000+: 1214 + 11%)
 * - İTS (hər tərəf): 2500-dək 2%, sonra 50 + 0.5%
 */
function maasGrossdanNeteOzel(gross, il = null) {
  gross = Math.max(0, Number(gross) || 0);
  const y = hesablamaIli(il);
  const d = OZEL_GELIR_VERGISI[Math.min(y, 2028)];

  let gelirVergisi;
  if (gross <= 2500) gelirVergisi = Math.max(0, gross - 200) * d.asagiFaiz;
  else if (gross <= 8000) gelirVergisi = d.ortaSabit + (gross - 2500) * (d.ortaFaiz ?? 0.10);
  else gelirVergisi = d.yuxariSabit + (gross - 8000) * 0.14;

  const dsmfIsci = gross <= 200 ? gross * 0.03 : 6 + (gross - 200) * 0.10;
  const kohne = y < 2026;
  const dsmfIsegoturen = gross <= 200 ? gross * 0.22 : gross <= 8000 || kohne ? 44 + (gross - 200) * 0.15 : 1214 + (gross - 8000) * 0.11;
  const itsHedd = kohne ? 8000 : 2500; // tibbi sığortanın 2% tətbiq olunan həddi
  const its = gross <= itsHedd ? gross * 0.02 : itsHedd * 0.02 + (gross - itsHedd) * 0.005;

  return neticeQur({ sektor: "ozel", il: y, gross, gelirVergisi, dsmfIsci, itsIsci: its, dsmfIsegoturen, itsIsegoturen: its, bend: d.bend });
}

// Net-dən Gross-a: verilən aralıqlarda ikili axtarış (2500 sərhədində vergi pilləli dəyişdiyi üçün aralıqlar ayrıdır)
function netdenGrossaAxtar(net, hesabla, il) {
  net = Math.max(0, Number(net) || 0);
  const araliqlar = [[0, 200], [200, 2500], [2500.01, 8000], [8000.01, Math.max(20000, net * 3)]];
  for (const [alt, ust] of araliqlar) {
    if (hesabla(ust, il).net < net) continue;
    let low = alt;
    let high = ust;
    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2;
      if (hesabla(mid, il).net < net) low = mid;
      else high = mid;
    }
    // Qəpik yuvarlaqlaşdırmasına görə qonşu qəpiklərdən hədəfə ən yaxın nəticəni seç
    let enYaxin = null;
    for (let addim = -4; addim <= 4; addim++) {
      const r = hesabla(Number((high + addim / 100).toFixed(2)), il);
      if (!enYaxin || Math.abs(r.net - net) < Math.abs(enYaxin.net - net)) enYaxin = r;
    }
    return enYaxin;
  }
  return hesabla(net * 2, il);
}

/**
 * 2. Qeyri-dövlət / Qeyri-neft sektoru üzrə Net-dən Gross-a
 */
function maasNetdenGrossaOzel(net, il = null) {
  return netdenGrossaAxtar(net, maasGrossdanNeteOzel, il);
}

/**
 * 3. Dövlət və Neft-Qaz sektoru üzrə Gross-dan Net-ə
 */
function maasGrossdanNeteDovlet(gross, il = null) {
  gross = Math.max(0, Number(gross) || 0);
  const y = hesablamaIli(il);

  const gelirVergisi = gross <= 2500
    ? Math.max(0, gross - 200) * 0.14
    : 350 + (gross - 2500) * 0.25;
  const dsmfIsci = gross * 0.03;
  const its = gross <= 8000 ? gross * 0.02 : 160 + (gross - 8000) * 0.005;

  return neticeQur({ sektor: "dovlet", il: y, gross, gelirVergisi, dsmfIsci, itsIsci: its, dsmfIsegoturen: gross * 0.22, itsIsegoturen: its, bend: "101.1" });
}

function maasNetdenGrossaDovlet(net, il = null) {
  return netdenGrossaAxtar(net, maasGrossdanNeteDovlet, il);
}

// Hesablamanın izahı — dərəcələr birbaşa yuxarıdakı qaydalardan yazılır
function hesablamaIzahi(r) {
  const dovlet = r.sektor === "dovlet";
  const d = OZEL_GELIR_VERGISI[Math.min(r.il, 2028)];
  const faiz = (x) => `${Number((x * 100).toFixed(1))}%`;
  let vergi;
  if (dovlet) {
    vergi = r.gross <= 2500 ? "(gross − 200 manat güzəşt) × 14%" : "350 manat + 2500-dən yuxarı hissənin 25%-i";
  } else if (r.gross <= 2500) {
    vergi = d.asagiFaiz > 0 ? `(gross − 200 manat güzəşt) × ${faiz(d.asagiFaiz)}` : "0%";
  } else if (r.gross <= 8000) {
    vergi = `${d.ortaSabit} manat + 2500-dən yuxarı hissənin ${faiz(d.ortaFaiz ?? 0.10)}-i`;
  } else {
    vergi = `${d.yuxariSabit} manat + 8000-dən yuxarı hissənin 14%-i`;
  }
  const kohne = r.il < 2026;
  const itsHedd = dovlet || kohne ? 8000 : 2500;
  const its = r.gross <= itsHedd ? "2%" : `${itsHedd * 0.02} manat + ${itsHedd}-dən yuxarı hissənin 0.5%-i`;
  const dsmfIsci = dovlet ? "3%" : r.gross <= 200 ? "3%" : "6 manat + 200-dən yuxarı hissənin 10%-i";
  const dsmfFirma = dovlet || r.gross <= 200 ? "22%"
    : r.gross <= 8000 || kohne ? "44 manat + 200-dən yuxarı hissənin 15%-i" : "1214 manat + 8000-dən yuxarı hissənin 11%-i";
  return [
    `${r.il}-ci il, ${dovlet ? "dövlət / neft-qaz" : "özəl (qeyri-neft)"} sektor, gross ${r.gross} manat`,
    `Gəlir vergisi (VM ${r.bend}): ${vergi} = ${r.gelirVergisi} manat`,
    `DSMF, işçidən: ${dsmfIsci} = ${r.dsmfIsci} manat; işəgötürəndən: ${dsmfFirma} = ${r.dsmfIsegoturen} manat`,
    `İcbari tibbi sığorta (hər tərəf): ${its} = ${r.itsIsci} manat`,
    `İşsizlikdən sığorta (hər tərəf): 0.5% = ${r.issizlikIsci} manat`,
    `İşçinin ələ aldığı: ${r.net} manat; şirkətin ümumi xərci: ${r.umumiXerc} manat`
  ];
}

/**
 * 4. Məzuniyyət Haqqı Hesablanması (Əmək Məcəlləsi Maddə 140)
 * ortaAyliqMaas / 30.4 * gunSayi
 */
function mezuniyyetHesabla({ maas, gunler = 21, sektor = "ozel", il = null }) {
  maas = Number(maas) || 0;
  gunler = Number(gunler) || 21;

  const gunlukMaas = maas / 30.4;
  const grossMezuniyyet = gunlukMaas * gunler;

  // Diqqət: vergi burada yalnız bu məbləğ üzərindən hesablanır. Eyni ayda maaş da ödənilirsə,
  // vergi pillələri cəmi gəlirə tətbiq olunduğundan nəticə fərqlənə bilər.
  const netNetice = sektor === "dovlet"
    ? maasGrossdanNeteDovlet(grossMezuniyyet, il)
    : maasGrossdanNeteOzel(grossMezuniyyet, il);

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
function sonHaqqHesabHesabla({ maas, qaliqGun = 15, sektor = "ozel", il = null }) {
  return mezuniyyetHesabla({ maas, gunler: qaliqGun, sektor, il });
}

const SUAL_SOZLERI = /(?:^|\s)(?:necə|nə\s+qədər|neçə|nədir|nə\s+vaxt|hansı|olarmı|niyə|yoxsa|düşür|olmalıdır)(?=\s|$|[.,!])|\p{L}+(?:mı|mi|mu|mü)(?:dir|dır|dur|dür)?\s*\?/u;

/**
 * 6. Sualın hesablama komandası olub-olmadığını yoxlayır.
 * Yalnız açıq əmr ("hesabla ...") və ya qısa maaş əmri ("1500 net maaş") — hüquqi suallar AI-a gedir.
 */
function kalkulyatorSorgusudurmu(metn = "") {
  metn = String(metn || "").toLowerCase().trim();
  if (!metn) return false;

  // 1) Aşkar komanda və menyu
  if (/^(?:\/kalkulyator|\/hesabla|kalkulyator|hesabla)$/i.test(metn)) return true;
  if (!/\d/.test(metn)) return false;

  // 2) "hesabla ..." ilə başlayan əmrlər
  if (/^\/?hesabla(?=\s)/i.test(metn)) return true;

  // 3) Qısa, sual olmayan maaş əmri
  const qisadir = metn.split(/\s+/).length <= 8 && !metn.includes("?") && !SUAL_SOZLERI.test(metn);
  if (!qisadir) return false;
  if (/(?:^|\s)hesabla(?=\s|[.!]|$)/.test(metn)) return true;
  return /(?:^|\s)(?:net|gross|qross)(?=\s|[.!]|$)/.test(metn) && /(?:maaş|maas|azn|manat|\d\s*(?:net|gross|qross)|(?:net|gross|qross)\s*\d)/.test(metn);
}

// Mətndən il, gün sayı və məbləğləri ayırır. "1 500", "1,500", "1.500" = 1500; "1500,50" = 1500.5
function mebleglerinAnalizi(metn = "") {
  let t = String(metn).toLowerCase();
  let il = null;
  t = t.replace(/(?<![\d.,])(20[2-3]\d)\s*(?:-?\s*c[iıuü](?:\s*il\p{L}*)?|\s*il\p{L}*)/gu, (_, y) => { il = Number(y); return " "; });
  let gun = null;
  t = t.replace(/(?<![\d.,])(\d{1,3})\s*(?:təqvim\s*)?(?:gün|gun)\p{L}*/u, (_, g) => { gun = Number(g); return " "; });
  const meblegler = Array.from(t.matchAll(/(?<![\d.,])(?:\d{1,3}(?:[ \u00a0.,]\d{3})+(?!\d)|\d+)(?:[.,]\d{1,2}(?!\d))?/g))
    .map(m => {
      const xam = m[0];
      const onluq = xam.match(/[.,](\d{1,2})$/);
      const tam = (onluq ? xam.slice(0, -onluq[0].length) : xam).replace(/[ \u00a0.,]/g, "");
      return Number(onluq ? `${tam}.${onluq[1]}` : tam);
    });
  return { il, gun, meblegler };
}

/**
 * 7. Mətndən parametrləri çıxarıb hesablama aparır
 */
function kalkulyatorEmalEt(metn = "") {
  const t = String(metn || "").toLowerCase().trim();

  // A) Əgər yalnız "kalkulyator" yazıbsa:
  if (/^(\/kalkulyator|\/hesabla|kalkulyator|hesabla)$/i.test(t)) {
    return {
      nov: "menu",
      mesaj:
        `🧮 <b>Mühasibat və Əməkhaqqı Kalkulyatoru:</b>\n\n` +
        `Nümunə əmrlər (yazıb göndərə bilərsiniz):\n` +
        `• <code>hesabla maaş 1500 net</code> — 1500 AZN ələ verilən məbləğin Gross hesabı\n` +
        `• <code>hesabla maaş 2000 gross</code> — 2000 AZN üzərindən bütün vergi və fond tutulmaları\n` +
        `• <code>hesabla maaş 3000 gross dövlət 2027-ci il</code> — sektor və il seçimi\n` +
        `• <code>hesabla məzuniyyət 1200 maaş 21 gün</code> — Məzuniyyət haqqı\n` +
        `• <code>hesabla son haqq-hesab 1500 maaş 14 gün</code> — İşdən çıxarkən kompensasiya`
    };
  }

  const { il, gun, meblegler } = mebleglerinAnalizi(t);
  if (meblegler.length !== 1) {
    return {
      nov: "xeta",
      mesaj: meblegler.length === 0
        ? "⚠️ Zəhmət olmasa məbləği qeyd edin. Məsələn: <code>hesabla maaş 1500 net</code>"
        : `⚠️ Mətndə bir neçə rəqəm var (${meblegler.join(", ")}). Hansının maaş olduğunu təxmin etmirəm — yalnız bir məbləğ yazın. Məsələn: <code>hesabla maaş 1500 net</code>`
    };
  }
  const mebleg = meblegler[0];
  const isDovlet = /dövlət|dovlet|neft(?!siz)/.test(t) && !/qeyri[\s-]*(?:neft|dövlət|dovlet)/.test(t);
  const sektor = isDovlet ? "dovlet" : "ozel";

  try {
    // B) Məzuniyyət və ya Son haqq-hesab:
    if (/məzuniyyət|mezuniyyet|haqq[\s-]hesab/.test(t)) {
      const isSon = /haqq[\s-]hesab/.test(t);
      const netice = isSon
        ? sonHaqqHesabHesabla({ maas: mebleg, qaliqGun: gun || 21, sektor, il })
        : mezuniyyetHesabla({ maas: mebleg, gunler: gun || 21, sektor, il });
      const gunQeydi = gun ? "" : "\n⚠️ Gün sayı yazılmadığı üçün 21 gün götürülüb.";
      return {
        nov: isSon ? "son_haqq_hesab" : "mezuniyyet",
        netice,
        mesaj: (isSon ? formatSonHaqqHesab(netice) : formatMezuniyyet(netice)) + gunQeydi
      };
    }

    // C) Əməkhaqqı hesabı (Gross ⇄ Net):
    const isNet = /(?:^|\s|\d)net(?=\s|[.!?]|$)/.test(t) || !/gross|qross/.test(t);
    const netice = isNet
      ? (isDovlet ? maasNetdenGrossaDovlet(mebleg, il) : maasNetdenGrossaOzel(mebleg, il))
      : (isDovlet ? maasGrossdanNeteDovlet(mebleg, il) : maasGrossdanNeteOzel(mebleg, il));
    const rejimQeydi = !/net|gross|qross/.test(t) ? "\n⚠️ Net/Gross yazılmadığı üçün məbləğ NET sayıldı." : "";

    return {
      nov: "maas",
      isNet,
      netice,
      mesaj: formatMaasHesabi(netice, isNet) + rejimQeydi
    };
  } catch (err) {
    return { nov: "xeta", mesaj: `⚠️ ${err.message}` };
  }
}

// Telegram üçün formatlayıcılar
function formatMaasHesabi(res) {
  const sektorAdi = res.sektor === "dovlet" ? "Dövlət / Neft-qaz Sektoru" : "Qeyri-dövlət / Özəl Sektor";
  const sigortaQeydi = res.il > SIGORTA_DERECE_ILI
    ? `\n⚠️ ${res.il}-ci il üçün sığorta haqları ${SIGORTA_DERECE_ILI}-cı il dərəcələri ilə hesablanıb — yoxlayın.`
    : "";
  return (
    `🧮 <b>Əməkhaqqı Hesablaması — ${res.il}-ci il (${sektorAdi}):</b>\n\n` +
    `💵 <b>Gross (Hesablanmış Maaş):</b> <code>${res.gross.toFixed(2)} AZN</code>\n` +
    `💳 <b>Net (İşçinin Ələ Aldığı):</b> <code>${res.net.toFixed(2)} AZN</code>\n\n` +
    `👤 <b>İşçidən Tutulmalar:</b>\n` +
    `  • Gəlir vergisi (VM ${res.bend}): <b>${res.gelirVergisi.toFixed(2)} AZN</b>\n` +
    `  • DSMF: <b>${res.dsmfIsci.toFixed(2)} AZN</b>\n` +
    `  • İşsizlikdən sığorta (0.5%): <b>${res.issizlikIsci.toFixed(2)} AZN</b>\n` +
    `  • İcbari Tibbi Sığorta: <b>${res.itsIsci.toFixed(2)} AZN</b>\n` +
    `  👉 <i>Cəmi işçi tutulması: ${res.cemiIsciTutulma.toFixed(2)} AZN</i>\n\n` +
    `🏢 <b>İşəgötürənin Xərcləri (Şirkət fondu):</b>\n` +
    `  • DSMF: <b>${res.dsmfIsegoturen.toFixed(2)} AZN</b>\n` +
    `  • İşsizlikdən sığorta (0.5%): <b>${res.issizlikIsegoturen.toFixed(2)} AZN</b>\n` +
    `  • İcbari Tibbi Sığorta: <b>${res.itsIsegoturen.toFixed(2)} AZN</b>\n` +
    `  👉 <i>Cəmi şirkət əlavəsi: ${res.cemiIsegoturen.toFixed(2)} AZN</i>\n\n` +
    `💼 <b>Şirkət üçün ÜMUMİ İŞÇİ XƏRCİ:</b> <code>${res.umumiXerc.toFixed(2)} AZN</code>\n\n` +
    `📌 <i>200 AZN güzəşt (VM 102.1.6) yalnız əsas iş yerində tətbiq olunur. Sığorta dərəcələrini rəsmi mətnlə yoxlayın.</i>` +
    sigortaQeydi
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
  maasNetdenGrossaDovlet,
  hesablamaIzahi,
  mebleglerinAnalizi,
  mezuniyyetHesabla,
  sonHaqqHesabHesabla,
  kalkulyatorSorgusudurmu,
  kalkulyatorEmalEt
};
