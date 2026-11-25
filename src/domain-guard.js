// BeyinAI — Bilik Sahələri Sərhəd Qoruyucusu və Mövzu Öyrənmə Analizatoru (Relevance Guard & Domain Isolation)
// Bu modul:
// 1) Yeni sənədin / sualın aktiv sahə (məs: Vergi və Mühasibatlıq) ilə əlaqə dərəcəsini ölçür (0-100%).
// 2) Kənar mövzuların (məs: proqramlaşdırma, coğrafiya) əsas sahənin yaddaşını zibilləməsinin qarşısını alır.
// 3) Yüksək əlaqəli sahələri (Əmək, Mülki, Qərarlar) avtomatik əlaqələndirir və yeni öyrənilən mövzuları qeyd edir.
"use strict";

const db = require("./db");

// Domenlər üzrə səciyyəvi açar ifadələr və çəkilər
const DOMEN_PROFILLERI = {
  vergi_muhasibat: {
    ad: "Vergi və Mühasibatlıq",
    agirlig: 1.0,
    sozler: [
      "vergi", "verg", "ədv", "edv", "qaimə", "qaime", "bəyannamə", "beyanname", "vöen", "voen",
      "mənfəət", "menfeet", "gəlir", "gelir", "sadələşdirilmiş", "sadeləşdirilmis", "aksiz",
      "hesab-faktura", "hesab faktura", "hesabat", "avans", "debet", "kredit", "subkonto",
      "balans", "maliyyə", "maliye", "mühasib", "muhasib", "uçot", "ucot", "kassa", "çek",
      "pos-terminal", "pos terminal", "nağdsız", "nagdsiz", "bank çıxarışı", "kameral",
      "səyyar", "inzibati", "cərimə", "maliyyə sanksiyası", "depozit", "əvəzləşdirmə",
      "evezlesdirme", "mikro", "kiçik sahibkar", "fərdi sahibkar", "45000", "75%", "güzəşt"
    ]
  },
  emek_mulki: {
    ad: "Əmək və Mülki Münasibətlər",
    agirlig: 0.9,
    sozler: [
      "əmək", "emek", "əməkhaqqı", "emekhaqqi", "maaş", "maas", "məzuniyyət", "mezuniyyet",
      "müqavilə", "muqavile", "işçi", "isci", "işəgötürən", "isegoturen", "kadr", "ştat",
      "əmək kitabçası", "əmas", "emas", "bildiriş", "son haqq-hesab", "kompensasiya",
      "iş vaxtı", "artıq iş", "istirahət günü", "xəstəlik vərəqəsi", "ödənişli məzuniyyət",
      "əməyin mühafizəsi", "mülki məcəllə", "icarə", "icare", "podrat", "xidmət müqaviləsi",
      "etibarnamə", "etibarname", "zərərin ödənilməsi", "öhdəlik", "ohdelik", "girov"
    ]
  },
  dovlet_qerarlari: {
    ad: "Normativ və Hökumət Qərarları",
    agirlig: 0.85,
    sozler: [
      "nazirlər kabineti", "nazirler kabineti", "nk qərarı", "nk qerari", "sərəncam", "serencam",
      "dsmf", "sosial sığorta", "icbari tibbi sığorta", "işsizlikdən sığorta", "sığorta haqqı",
      "219 nömrəli qərar", "minimum əməkhaqqı", "yaşayış minimumu", "dövlət rüsumu",
      "tarif şurası", "normativ", "qaydalar", "təlimat", "qərarı ilə təsdiq"
    ]
  },
  proqramlasdirma: {
    ad: "Proqramlaşdırma və Texnologiya",
    agirlig: 1.0,
    sozler: [
      "python", "javascript", "node.js", "nodejs", "react", "html", "css", "sql database",
      "docker", "kubernetes", "git commit", "repository", "github", "api endpoint", "backend",
      "frontend", "kod", "funksiya", "class", "async", "await", "loop", "kompilyasiya", "bug"
    ]
  },
  cografiya_tarix: {
    ad: "Tarix və Coğrafiya",
    agirlig: 1.0,
    sozler: [
      "dağ", "çay", "göl", "okean", "materik", "relyef", "iqlim", "faydalı qazıntı",
      "xanlıq", "sülalə", "döyüş", "müharibə", "əsrlər", "arxeologiya", "qədim dövr"
    ]
  }
};

// Sənəd və ya mətnin aktiv sahə ilə əlaqə dərəcəsini hesablayır
function saheUygunluguQiymetlendir({ metn = "", basliq = "", aktivSaheId = null }) {
  const cariAktivId = aktivSaheId || db.aktivSaheIdAl();
  const butunMetn = (basliq + " " + String(metn || "").slice(0, 15000)).toLowerCase();

  const xallar = {};
  for (const [sId, profil] of Object.entries(DOMEN_PROFILLERI)) {
    let tapilanSozSayi = 0;
    for (const soz of profil.sozler) {
      if (butunMetn.includes(soz)) {
        tapilanSozSayi += 1;
      }
    }
    xallar[sId] = tapilanSozSayi;
  }

  // Ən çox uyğun gələn domeni tap
  let enUygunId = cariAktivId;
  let maksXal = xallar[cariAktivId] || 0;

  for (const [sId, xal] of Object.entries(xallar)) {
    if (xal > maksXal) {
      maksXal = xal;
      enUygunId = sId;
    }
  }

  const vergiXali = (xallar.vergi_muhasibat || 0) + (xallar.emek_mulki || 0) * 0.8 + (xallar.dovlet_qerarlari || 0) * 0.7;
  const xariciXal = (xallar.proqramlasdirma || 0) + (xallar.cografiya_tarix || 0);

  // Əlaqə dərəcəsi hesablaması (0 - 100)
  let elaqeDerecesi = 50;
  if (vergiXali + xariciXal === 0) {
    elaqeDerecesi = 70; // Neytral / qısa mətn
  } else if (xariciXal > vergiXali && xariciXal >= 3) {
    elaqeDerecesi = Math.max(5, Math.round((vergiXali / (vergiXali + xariciXal * 2)) * 100));
  } else {
    elaqeDerecesi = Math.min(100, Math.round(50 + Math.min(50, vergiXali * 6)));
  }

  // Cari aktiv sahənin icazə verilən sahələri (vergi üçün: vergi_muhasibat, emek_mulki, dovlet_qerarlari)
  const icazeliler = db.icazeVerilenSaheIdleriAl(cariAktivId);
  const icazelidir = icazeliler.includes(enUygunId) || (enUygunId === cariAktivId);

  let status = "birbasa_uygun";
  let qeyd = "";
  let hedefSaheId = cariAktivId;

  if (!icazelidir && elaqeDerecesi < 40) {
    status = "kenar_sahe";
    hedefSaheId = enUygunId;
    qeyd = `⚠️ Sənəd cari '${DOMEN_PROFILLERI[cariAktivId]?.ad || cariAktivId}' sahəsinə aid deyil (Əlaqə: ${elaqeDerecesi}%). Yaddaşı təmiz saxlamaq üçün ayrı '${DOMEN_PROFILLERI[enUygunId]?.ad || enUygunId}' bölməsinə təcrid edildi.`;
  } else if (enUygunId !== cariAktivId && icazeliler.includes(enUygunId)) {
    status = "elaqeli_avto";
    hedefSaheId = enUygunId;
    qeyd = `🔗 Sənəd əsas sahə ilə sıx əlaqəli olan '${DOMEN_PROFILLERI[enUygunId]?.ad}' sahəsinə avtomatik bağlandı (Əlaqə: ${elaqeDerecesi}%).`;
  } else {
    status = "birbasa_uygun";
    hedefSaheId = cariAktivId;
    qeyd = `✓ Sənəd aktiv sahəyə tam uyğundur (Əlaqə: ${elaqeDerecesi}%).`;
  }

  return {
    uygundur: status !== "kenar_sahe",
    hedefSaheId,
    hedefSaheAdi: DOMEN_PROFILLERI[hedefSaheId]?.ad || hedefSaheId,
    elaqeDerecesi,
    status,
    qeyd
  };
}

// Sənəddən və ya çatdan mövzuları çıxarır və aktiv sahənin "Öyrənilmiş Mövzular" bazasına əlavə edir
function movzuTapVeOyren({ metn = "", basliq = "", sahe_id = null }) {
  const secilmisSahe = sahe_id || db.aktivSaheIdAl();
  const parca = String(metn || "").slice(0, 10000);
  const tapilanlar = [];

  // 1) Qanunvericilik Maddə Başlıqları (Maddə 163. Vergi tutulan dövriyyənin dəqiqləşdirilməsi)
  const maddeMatches = parca.matchAll(/Maddə\s+(\d+[0-9.-]*)\.?\s*([^\n\r.]+)/gi);
  for (const m of maddeMatches) {
    const nomre = m[1];
    const ad = (m[2] || "").trim();
    if (ad.length >= 6 && ad.length <= 80 && !ad.toLowerCase().startsWith("bu məcəllə")) {
      tapilanlar.push({
        movzu: `Maddə ${nomre}. ${ad}`,
        detal: `Rəsmi norma və tətbiq qaydası`
      });
    }
  }

  // 2) Vacib mühasibat və hüquq açar mövzuları
  const MOYZU_SABLONLARI = [
    { regex: /elektron\s*qaimə(?:-faktura)?/i, ad: "Elektron Qaimə-Faktura İntizamı", detal: "Tərtib, göndərilmə və ləğv qaydaları" },
    { regex: /ədv\s*əvəzləşdirilməsi|ədv\s*depozit/i, ad: "ƏDV Əvəzləşdirilməsi və Depozit Hesabı", detal: "Maddə 175 üzrə vaxt və ödəniş şərtləri" },
    { regex: /45\s*000|75\s*%|mikro\s*sahibkar/i, ad: "Mikro Sahibkarlıq və 75% Güzəşt Şərtləri", detal: "Maddə 102.1.30 və 3 nəfər işçi tələbi" },
    { regex: /pos-terminal|kassa\s*aparat|219\s*saylı/i, ad: "POS-terminal və Kassa İntizamı", detal: "219 nömrəli qərar və nağdsız dövriyyə" },
    { regex: /məzuniyyət\s*haqqı|istifadə\s*edilməmiş\s*məzuniyyət/i, ad: "Məzuniyyət və Kompensasiya Hesablanması", detal: "Əmək Məcəlləsi Maddə 140 qaydaları" },
    { regex: /nağdsız\s*hesablaşma|nağd\s*limit/i, ad: "Nağdsız Hesablaşmalar və Aylıq Limitlər", detal: "30 000 və 15 000 AZN hədləri və cərimələr" },
    { regex: /icarə\s*haqqı|ödəmə\s*mənbəyində\s*vergi/i, ad: "İcarə Münasibətləri və Öm-Vergi", detal: "14% vergi tutulması və bəyan edilməsi" }
  ];

  for (const sablon of MOYZU_SABLONLARI) {
    if (sablon.regex.test(basliq + " " + parca)) {
      tapilanlar.push({
        movzu: sablon.ad,
        detal: sablon.detal
      });
    }
  }

  const oyrenilenler = [];
  const unikalAdlar = new Set();

  for (const t of tapilanlar) {
    if (unikalAdlar.has(t.movzu)) continue;
    unikalAdlar.add(t.movzu);
    const qeyd = db.saheMovzuElaveEt({
      sahe_id: secilmisSahe,
      movzu: t.movzu,
      status: "oyrenilib",
      detal: t.detal,
      menbe_sayi: 1
    });
    if (qeyd) oyrenilenler.push(qeyd);
  }

  return oyrenilenler;
}

module.exports = {
  DOMEN_PROFILLERI,
  saheUygunluguQiymetlendir,
  movzuTapVeOyren
};
