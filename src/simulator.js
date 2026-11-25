// BeyinAI — Avtonom Sınaq, Keys-Simulyasiya və Səhvdən Öyrənmə Mühərriki (Level C Depth)
// Bu modul:
// 1) Mürəkkəb praktiki vergi, mühasibatlıq və hüquq keyslərini (ssenarilərini) idarə edir.
// 2) Agentin həmin ssenari üzrə çıxardığı həlli Tənqidçi Müfəttiş (Critic Auditor) və Hüquqi Normalarla sınaqdan keçirir.
// 3) Aşkar edilmiş zəif nöqtələri və kritik dərsləri Uzunmüddətli Yaddaşa ("praktiki_tecrube") avtomatik yazır.
// 4) Açıq Bilik Boşluqlarını (Knowledge Gaps) avtomatik tədqiqat və mövzu təkliflərinə çevirir.
"use strict";

const db = require("./db");
const agent = require("./agent");
const ai = require("./ai");
const evolution = require("./evolution");
const webResearcher = require("./web-researcher");

// ---- Standart Praktiki Sınaq Keysləri Bankı ----
const STANDART_SSENARILER = [
  {
    id: "sim-case-1",
    sahe_id: "vergi_muhasibat",
    basliq: "Qeyri-rezidentdən xidmət alışı və ƏDV / ÖMV öhdəlikləri",
    ssenari: "Yerli hüquqi şəxs xarici şirkətdən (ABŞ-da yerləşən server və proqram təminatı şirkəti) 10 000 USD dəyərində bulud xidməti alır. Ödəniş bank yolu ilə qeyri-rezidentə köçürülür. Mühasib hansı vergiləri (ÖMV, ƏDV) hesablamalı və bəyan etməlidir? ƏDV-nin əvəzləşdirilməsi hüququ nə vaxt yaranır?",
    gozlenilenMaddeler: ["125", "168", "169", "175"],
    kritikMeqamlar: [
      "10% ödəmə mənbəyində vergi (ÖMV) tutulması (Maddə 125.1.5)",
      "18% qeyri-rezident ƏDV-si hesablanması (Maddə 168.1.5 və 169.1)",
      "ƏDV-nin büdcəyə faktiki ödənildiyi ayda əvəzləşdirilməsi (Maddə 175.6)"
    ]
  },
  {
    id: "sim-case-2",
    sahe_id: "vergi_muhasibat",
    basliq: "Mikro sahibkarlıqda 75% gəlir vergisi güzəşti və işçi sayı şərti",
    ssenari: "Fərdi sahibkar konsaltinq və proqram təminatı fəaliyyəti ilə məşğuldur. İllik gəliri 38 000 AZN təşkil edib, muzdlu işçisi yoxdur (0 işçi). Mühasib 75% gəlir vergisi güzəştini tətbiq edə bilərmi, yoxsa 3 işçi tələb olunur?",
    gozlenilenMaddeler: ["102.1.30", "102.1.30-1"],
    kritikMeqamlar: [
      "45 000 AZN-dək dövriyyəsi olan 13 xidmət sahəsində işçi sayı tələbi yoxdur (0 işçi ilə tətbiq edilir)",
      "3 işçi şərti 45 000 AZN-dən yuxarı və ya digər sahələrə aiddir",
      "Güzəşt tətbiq edildikdən sonra effektiv vergi dərəcəsi 5% olur"
    ]
  },
  {
    id: "sim-case-3",
    sahe_id: "vergi_muhasibat",
    basliq: "Köhnə ayda təsdiq edilmiş elektron qaimənin ləğvi və ya düzəlişi",
    ssenari: "Şirkət yanvar ayında mal satışı üzrə elektron qaimə-faktura təqdim edib və yanvar ayı bəyannaməsində bəyan edib. Mart ayında alıcı malı geri qaytarıb və qaimə ləğv/dəqiqləşdirilib. Mühasib yanvar ayı üçün dəqiqləşdirilmiş bəyannamə verməlidir, yoxsa mart ayının bəyannaməsində nəzərə almalıdır?",
    gozlenilenMaddeler: ["163", "163.2", "72.4-1"],
    kritikMeqamlar: [
      "Vergi Məcəlləsinin 163.2 və 72.4-1-ci maddələrinə əsasən, dəqiqləşdirmə köhnə aya deyil, dəyişikliyin baş verdiyi cari hesabat dövründə (mart) nəzərə alınır",
      "Köhnə aya dəqiqləşmə verilməsi maliyyə sanksiyası və artıq gecikmə faizi riski yaradır"
    ]
  },
  {
    id: "sim-case-4",
    sahe_id: "vergi_muhasibat",
    basliq: "Əsas vəsaitlərin təmir xərclərinin gəlirdən çıxılması və kapitallaşdırma",
    ssenari: "Şirkətin balansında qalıq dəyəri 50 000 AZN olan istehsal avadanlığı var. İl ərzində avadanlığın təmirinə 4 000 AZN faktiki xərc çəkilib. Bu xərcin nə qədər hissəsi birbaşa gəlirdən çıxılan xərclərə aid edilir və qalan hissə nə edilir?",
    gozlenilenMaddeler: ["115", "115.1"],
    kritikMeqamlar: [
      "Maddə 115-ə görə maşın və avadanlıqlar üzrə təmir xərclərinin məhdudlaşdırılan norması (5%) tətbiq edilir: 50 000 * 5% = 2 500 AZN gəlirdən çıxılır",
      "Normadan artıq qalan 1 500 AZN əsas vəsaitin qalıq dəyərini artırır (kapitallaşdırılır) və amortizasiya yolu ilə xərcə silinir"
    ]
  },
  {
    id: "sim-case-5",
    sahe_id: "vergi_muhasibat",
    basliq: "Nağdsız hesablaşmalar həddi və nağd əməliyyat üzrə sanksiya",
    ssenari: "ƏDV ödəyicisi olan şirkət digər vergi ödəyicisinə bir təqvim ayı ərzində nağd qaydada ümumilikdə 34 000 AZN mal satışı həyata keçirib. Bu əməliyyat üzrə hansı qanun pozulub və hansı maliyyə sanksiyası tətbiq edilir?",
    gozlenilenMaddeler: ["3.3", "58.7-1"],
    kritikMeqamlar: [
      "Nağdsız hesablaşmalar haqqında Qanunun 3.3-cü maddəsinə görə ƏDV ödəyiciləri üçün aylıq nağd limit 30 000 AZN-dir",
      "Vergi Məcəlləsinin 58.7-1-ci maddəsinə əsasən limiti aşan məbləğə görə ilk dəfə 10%, təkrar olduqda 20% və 40% maliyyə sanksiyası tətbiq olunur"
    ]
  },
  {
    id: "sim-case-6",
    sahe_id: "emek_mulki",
    basliq: "İşdən azad olunma zamanı istifadə edilməmiş məzuniyyət kompensasiyası",
    ssenari: "İşçi 1 il 6 ay işlədikdən sonra əmək müqaviləsinə xitam verilir. İşçi bu müddətdə cəmi 15 gün məzuniyyətdə olub (illik əmək məzuniyyəti 30 gündür). Son haqq-hesab necə aparılmalı və hansı müddətdə ödənilməlidir?",
    gozlenilenMaddeler: ["140", "144", "172"],
    kritikMeqamlar: [
      "Əmək Məcəlləsinin 144-cü maddəsinə əsasən istifadə edilməmiş 30 günə görə orta əməkhaqqı əsasında kompensasiya hesablanır",
      "Maddə 172-yə əsasən son haqq-hesab işçinin sonuncu iş günündən gec olmayaraq tam ödənilməlidir"
    ]
  },
  {
    id: "sim-case-7",
    sahe_id: "dovlet_qerarlari",
    basliq: "POS-terminal quraşdırılması tələbi və 2000 AZN dövriyyə qaydası",
    ssenari: "Yeni açılmış ticarət və xidmət obyektində rüblük orta aylıq dövriyyə 2500 AZN təşkil edir. Sahibi yalnız nağd qəbul etdiyini bildirir. NK-nın 219 nömrəli qərarı və Vergi Məcəlləsinə görə hansı məsuliyyət yaranır?",
    gozlenilenMaddeler: ["219", "58.7"],
    kritikMeqamlar: [
      "Nazirlər Kabinetinin 219 saylı qərarına əsasən rüblük dövriyyəsi 2000 AZN-dən çox olan subyektlərdə POS-terminal quraşdırılması məcburidir",
      "POS-terminal quraşdırılmadıqda Vergi Məcəlləsinin 58.7-ci maddəsi ilə 1000 AZN, 3000 AZN və 6000 AZN maliyyə sanksiyası tətbiq edilir"
    ]
  }
];

function ssenarileriAl(saheId = null) {
  if (saheId && saheId !== "all") {
    return STANDART_SSENARILER.filter(s => s.sahe_id === saheId);
  }
  return STANDART_SSENARILER;
}

function ssenariTap(id) {
  return STANDART_SSENARILER.find(s => s.id === id) || null;
}

/**
 * Həlli deterministik və hüquqi nöqteyi-nəzərdən qiymətləndirir
 */
function helliQiymetlendir({ cavab, gozlenilenMaddeler = [], kritikMeqamlar = [] }) {
  const cavabAz = db.azKicilt(cavab || "");
  let bal = 100;
  const tapilmisMaddeler = [];
  const catismayanMaddeler = [];
  const tapilmisMeqamlar = [];
  const catismayanMeqamlar = [];
  const cixarilmisDersler = [];

  // 1) Maddə nömrələri yoxlanışı
  for (const m of gozlenilenMaddeler) {
    const esasNo = m.split(".")[0];
    const tapildi = cavabAz.includes(m) || new RegExp(`(?:maddə\\s+${esasNo}|\\b${esasNo}\\.)`, "i").test(cavabAz);
    if (tapildi) {
      tapilmisMaddeler.push(m);
    } else {
      catismayanMaddeler.push(m);
      bal -= 15;
    }
  }

  // 2) Kritik praktiki məqamlar yoxlanışı
  for (const meqam of kritikMeqamlar) {
    const meqamKokleri = db.sozKokleri(meqam).filter(k => k.kok.length >= 3 && !k.kok.match(/\b(?:və|ilə|üçün|üzrə|haqqında)\b/));
    let uygunKok = 0;
    for (const k of meqamKokleri) {
      if (cavabAz.includes(k.kok)) uygunKok++;
    }
    const nisbet = meqamKokleri.length > 0 ? uygunKok / meqamKokleri.length : 1;
    if (nisbet >= 0.45) {
      tapilmisMeqamlar.push(meqam);
    } else {
      catismayanMeqamlar.push(meqam);
      bal -= 10;
    }
  }

  // 3) Xüsusi tələ / ziddiyyət yoxlanışı
  let teleTutuldu = false;
  // Məsələn: 0 işçi mikro sahibkar keysində səhvən "3 işçi lazımdır" deyibsə
  if (cavabAz.includes("102.1.30") && /3\s*işçi\s*(?:tələb\s*olunur|olmalıdır|şərtdir)/i.test(cavabAz) && !/tələb\s*olunmur|0\s*işçi|işçi\s*sayı\s*şərti\s*yoxdur/i.test(cavabAz)) {
    bal -= 35;
    teleTutuldu = true;
    catismayanMeqamlar.push("Səhv şərh: 45 000 AZN-dək dövriyyəsi olan 13 sahədə 3 işçi tələb olunmur (0 işçi ilə tətbiq edilir).");
  }

  // 4) Köhnə ay dəqiqləşməsi tələsi
  if (cavabAz.includes("163") && /əvvəlki\s*aya\s*dəqiqləş|köhnə\s*aya\s*dəqiqləş/i.test(cavabAz) && !/cari\s*ay|dəyişikliyin\s*baş\s*verdiyi/i.test(cavabAz)) {
    bal -= 35;
    teleTutuldu = true;
    catismayanMeqamlar.push("Səhv təcrübə: Maddə 163.2-yə əsasən dəqiqləşmə köhnə aya deyil, dəyişikliyin baş verdiyi cari hesabat dövründə nəzərə alınır.");
  }

  bal = Math.max(20, Math.min(100, bal));
  const ugurlu_mu = bal >= 70 && !teleTutuldu;

  // Çıxarılan dərslər
  if (catismayanMaddeler.length > 0) {
    cixarilmisDersler.push(`Hüquqi İstinad Dərsi: Məsələnin tam təhlili üçün Maddə ${catismayanMaddeler.join(", ")} mütləq nəzərə alınmalıdır.`);
  }
  for (const m of catismayanMeqamlar) {
    cixarilmisDersler.push(`Praktiki Dərs: ${m}`);
  }
  if (cixarilmisDersler.length === 0) {
    cixarilmisDersler.push(`Uğurlu Sınaq Dərsi: Analiz qanunvericilik və praktiki təcrübə ilə 100% uzlaşdı.`);
  }

  return {
    bal,
    ugurlu_mu,
    tapilmisMaddeler,
    catismayanMaddeler,
    tapilmisMeqamlar,
    catismayanMeqamlar,
    cixarilmisDersler
  };
}

// ---- Dinamik Kəsişən Ssenari Generatoru (Qayda 2.A: Bazadakı maddələri çarpazlaşdırmaq) ----
function carpazMaddelerdenDinamikKeysYarat(saheId = null) {
  const aktivSahe = saheId || db.aktivSaheIdAl();
  const icaze = db.icazeVerilenSaheIdleriAl(aktivSahe);
  const pl = icaze.map(() => "?").join(",");

  const maddeParcalari = db.db.prepare(`
    SELECT p.id, p.basliq, p.metn, m.ad as menbe_adi
    FROM parcalar p
    JOIN menbeler m ON m.id = p.menbe_id
    WHERE m.aktiv = 1
      AND (p.sahe_id IS NULL OR p.sahe_id IN (${pl}))
      AND (p.basliq LIKE 'Maddə %' OR p.metn LIKE '%Maddə %')
    ORDER BY p.yaradildi DESC
    LIMIT 40
  `).all(...icaze);

  const tarixceBasliqlar = new Set(db.simulyasiyalariAl(aktivSahe, 40).map(t => t.basliq));

  // Əgər bazada ən azı 2 fərqli maddə parçası varsa, onları çarpazlaşdıraraq unikal keys yarat
  if (maddeParcalari.length >= 2) {
    for (let i = 0; i < maddeParcalari.length - 1; i++) {
      for (let j = i + 1; j < maddeParcalari.length; j++) {
        const p1 = maddeParcalari[i];
        const p2 = maddeParcalari[j];
        const m1 = db.metndenMaddeleriCixar(`${p1.basliq} ${p1.metn.slice(0, 120)}`)[0];
        const m2 = db.metndenMaddeleriCixar(`${p2.basliq} ${p2.metn.slice(0, 120)}`)[0];
        if (!m1 || !m2 || m1 === m2) continue;

        const basliq = `Çarpaz Sınaq: Maddə ${m1} × Maddə ${m2} kəsişməsi`;
        if (tarixceBasliqlar.has(basliq)) continue;

        return {
          id: `sim-carpaz-${m1}-${m2}`,
          nov: "carpaz_madde",
          sahe_id: aktivSahe,
          basliq,
          ssenari: `Mürəkkəb Kəsişən Praktiki Keys:\n Vergi ödəyicisinin eyni hesabat dövründə həm "${p1.basliq || "Maddə " + m1}" (${p1.metn.slice(0, 160).trim()}...), həm də "${p2.basliq || "Maddə " + m2}" (${p2.metn.slice(0, 160).trim()}...) normalarına düşən əməliyyatı baş verib.\nBu iki normanın eyni anda tətbiqi zamanı vergi öhdəliyi, istisnalar, bəyanetmə dövrü və sanksiya riskləri necə tənzimlənir?`,
          gozlenilenMaddeler: [m1, m2],
          kritikMeqamlar: [
            `Maddə ${m1} və Maddə ${m2} şərtlərinin birlikdə tətbiqi`,
            "Hesabat dövrü və sanksiya riskinin qiymətləndirilməsi"
          ]
        };
      }
    }
  }

  // Ehtiyat: Standart ssenarilərdən 2 fərqli mövzunu birləşdirib çətin hibrid keys qur
  const uygunlar = ssenarileriAl(aktivSahe);
  const s1 = uygunlar[0] || STANDART_SSENARILER[0];
  const s2 = uygunlar[1] || STANDART_SSENARILER[2];
  const birlesikMaddeler = Array.from(new Set([...(s1.gozlenilenMaddeler || []).slice(0, 2), ...(s2.gozlenilenMaddeler || []).slice(0, 2)]));

  return {
    id: "sim-carpaz-" + Date.now(),
    nov: "carpaz_madde",
    sahe_id: aktivSahe,
    basliq: `Çarpaz Sınaq: ${s1.basliq.slice(0, 32)} + ${s2.basliq.slice(0, 32)}`,
    ssenari: `Çoxşərtli Kəsişmə Ssenarisi:\n1-ci hal: ${s1.ssenari}\n2-ci əlavə şərt: Eyni vergi ödəyicisində paralel olaraq bu hal da baş verir — ${s2.ssenari}\nHər iki əməliyyatın kəsişməsində mühasib hansı ardıcıllıqla vergi hesablamalı və bəyannamə təqdim etməlidir?`,
    gozlenilenMaddeler: birlesikMaddeler,
    kritikMeqamlar: [
      ...(s1.kritikMeqamlar || []).slice(0, 1),
      ...(s2.kritikMeqamlar || []).slice(0, 1)
    ]
  };
}

// ---- Canlı Mühasib Çatlarından Mübahisəli Keyslərin Çıxarılması (Qayda 2.B / 2.C) ----
function canliCatlardanMubahiseliKeysCixar(saheId = null) {
  const aktivSahe = saheId || db.aktivSaheIdAl();
  const tarixceBasliqlar = new Set(db.simulyasiyalariAl(aktivSahe, 40).map(t => t.basliq));

  const catParcalari = db.db.prepare(`
    SELECT p.id, p.basliq, p.metn, p.gonderen, m.ad as menbe_adi
    FROM parcalar p
    JOIN menbeler m ON m.id = p.menbe_id
    WHERE m.aktiv = 1
      AND (p.qovluq_id IN ('qovluq-cat', 'qovluq-praktika') OR m.nov IN ('telegram', 'whatsapp'))
      AND length(p.metn) >= 45
    ORDER BY p.yaradildi DESC
    LIMIT 30
  `).all();

  for (const p of catParcalari) {
    const metn = String(p.metn || "");
    const mubahiselidir = /\?|necə\s*hesab|mübahisə|razı\s*deyil|hansı\s*maddə|tutulur\s*yoxsa|cərimə|əvəzləş/i.test(metn);
    if (!mubahiselidir) continue;

    const qisa = metn.replace(/^\[[^\]]+\]\s*[^:]+:\s*/, "").slice(0, 55).trim();
    const basliq = `Canlı Çat Müzakirəsi: ${qisa}...`;
    if (tarixceBasliqlar.has(basliq)) continue;

    const maddeler = db.metndenMaddeleriCixar(metn).slice(0, 3);
    return {
      id: "sim-cat-" + p.id,
      nov: "canli_cat",
      sahe_id: aktivSahe,
      basliq,
      ssenari: `Canlı Mühasib Qrupundan Real Müzakirə (${p.menbe_adi}):\n"${metn.slice(0, 650)}"\n\nBu müzakirədəki sualı rəsmi qanunvericiliklə tutuşdur, hansı yanaşmanın hüquqi cəhətdən doğru olduğunu sübut et və riskləri göstər.`,
      gozlenilenMaddeler: maddeler,
      kritikMeqamlar: [qisa]
    };
  }

  return null;
}

/**
 * Bir ssenarini Agent ilə simulyasiya edir, yoxlayır və dərsləri İki-Pilləli Yaddaşa qeyd edir
 */
async function simulyasiyaIcraEt({ ssenariId = null, customSsenari = null, dinamikNov = null, saheId = null }) {
  const aktivSahe = saheId || db.aktivSaheIdAl();
  let ssenariObj = null;

  if (ssenariId) {
    ssenariObj = ssenariTap(ssenariId);
  } else if (customSsenari && customSsenari.ssenari) {
    ssenariObj = {
      id: "sim-custom-" + Date.now(),
      sahe_id: customSsenari.sahe_id || aktivSahe,
      basliq: customSsenari.basliq || "Xüsusi Sınaq Keysi",
      ssenari: customSsenari.ssenari,
      gozlenilenMaddeler: customSsenari.gozlenilenMaddeler || [],
      kritikMeqamlar: customSsenari.kritikMeqamlar || []
    };
  } else if (dinamikNov === "canli_cat") {
    ssenariObj = canliCatlardanMubahiseliKeysCixar(aktivSahe) || carpazMaddelerdenDinamikKeysYarat(aktivSahe);
  } else if (dinamikNov === "carpaz_madde") {
    ssenariObj = carpazMaddelerdenDinamikKeysYarat(aktivSahe);
  }

  if (!ssenariObj) {
    throw new Error("Sınaq üçün etibarlı ssenari tapılmadı.");
  }

  const hedefSahe = ssenariObj.sahe_id || aktivSahe;

  // Agent ilə sualı dərindən araşdırıb cavab alırıq
  const agentCavab = await agent.agentSualCavabla({
    sual: `SINAQ SİMULYASİYASI:\n${ssenariObj.basliq}\n\nKonkret Keys:\n${ssenariObj.ssenari}\n\nZəhmət olmasa bu keysi qanunvericilik normaları, müvafiq maddələr, rəqəmlər və praktiki addımlarla tam təhlil et.`,
    sahe_id: hedefSahe,
    qovluq_id: "all",
    derin_rejim: true
  });

  const cavabMetni = typeof agentCavab.cavab === "object" ? (agentCavab.cavab?.metn || "") : String(agentCavab.cavab || "");
  const sitatlar = agentCavab.sitatlar || [];
  const menbeIdleri = sitatlar.map(s => s.id).filter(Boolean);

  // Həllin keyfiyyətini və doğruluğunu qiymətləndiririk
  const qiymet = helliQiymetlendir({
    cavab: cavabMetni,
    gozlenilenMaddeler: ssenariObj.gozlenilenMaddeler || [],
    kritikMeqamlar: ssenariObj.kritikMeqamlar || []
  });

  let auditReyi = qiymet.ugurlu_mu
    ? `Sınaq uğurludur (${qiymet.bal}/100 bal). Tapılmış əsas maddələr: ${qiymet.tapilmisMaddeler.join(", ") || "ümumi normalar"}.`
    : `Sınaqda çatışmazlıqlar aşkarlandı (${qiymet.bal}/100 bal). Çatışmayan maddələr/məqamlar: ${[...qiymet.catismayanMaddeler, ...qiymet.catismayanMeqamlar].join("; ")}.`;

  // Qayda 3.B: Kritik dərsləri İki-Pilləli Yaddaşa yazırıq (rəsmi maddə ilə 100% təsdiqlənərsə Qızıl Yaddaş, əks halda Qaralama Dəftəri!)
  const saxlanilanDersler = [];
  for (const ders of qiymet.cixarilmisDersler) {
    if (ders.startsWith("Uğurlu Sınaq")) continue;
    const yad = db.yaddasElaveEt({
      kateqoriya: "praktika",
      metn: `[SİMULYASİYA DƏRSİ - ${ssenariObj.basliq}]: ${ders}`,
      menbe: "Simulyasiya Sınağı",
      vaciblik: 4,
      etibar_seviyyesi: "praktika",
      sahe_id: hedefSahe
    });
    if (yad) saxlanilanDersler.push(yad);
  }

  // Qayda 4: Sınaqda səhv və ya çatışmazlıq aşkarlandısa, "Mən niyə səhv etdim?" kök-səbəb təhlili aparıb düşünmə qaydası əlavə et!
  let yeniDusunmeQaydasi = null;
  if (!qiymet.ugurlu_mu && (qiymet.catismayanMaddeler.length > 0 || qiymet.catismayanMeqamlar.length > 0)) {
    try {
      yeniDusunmeQaydasi = await evolution.kokSebebAnaliziEt({
        sual: ssenariObj.ssenari,
        sehvCavab: cavabMetni,
        duzgunIzah: [...qiymet.catismayanMaddeler.map(m => `Maddə ${m}`), ...qiymet.catismayanMeqamlar].join("; "),
        sahe_id: hedefSahe
      });
    } catch (_) {}
  }

  // Sahə mövzularına da mövzunu qeyd et
  db.saheMovzuElaveEt({
    sahe_id: hedefSahe,
    movzu: ssenariObj.basliq,
    status: "oyrenilib",
    detal: `Sınaq simulyasiyası ilə yoxlanıldı (Bal: ${qiymet.bal}%)`,
    menbe_sayi: menbeIdleri.length || 1
  });

  // Əgər açıq bilik boşluqlarından bu mövzuya aid olan vardısa, həll edildi kimi qeyd et
  const aciqBosluqlar = db.bilikBosluqlariniAl(20);
  for (const b of aciqBosluqlar) {
    if (db.azKicilt(b.sual).includes(db.azKicilt(ssenariObj.basliq).slice(0, 20))) {
      db.bilikBosluguHellEt(b.id);
    }
  }

  // Nəticəni simulyasiyalar cədvəlində saxlayırıq
  const qeyd = db.simulyasiyaSaxla({
    sahe_id: hedefSahe,
    basliq: ssenariObj.basliq,
    ssenari: ssenariObj.ssenari,
    cavab: cavabMetni,
    audit_netice: auditReyi,
    bal: qiymet.bal,
    ugurlu_mu: qiymet.ugurlu_mu ? 1 : 0,
    dersler: qiymet.cixarilmisDersler,
    menbe_idleri: menbeIdleri
  });

  return {
    ...qeyd,
    saxlanilanDersler,
    yeniDusunmeQaydasi,
    tapilmisMaddeler: qiymet.tapilmisMaddeler,
    catismayanMaddeler: qiymet.catismayanMaddeler,
    dusunmeAddimlari: agentCavab.dusunmeAddimlari || []
  };
}

/**
 * Açıq Bilik Boşluqlarını Mövzu Təkliflərinə çevirir və İyerarxik Araşdırma namizədləri hazırlayır
 */
function bilikBosluqlariniAvtoTedqiqEt(saheId = null) {
  const aktivSahe = saheId || db.aktivSaheIdAl();
  const aciqlar = db.bilikBosluqlariniAl(15);
  const cevrilmisTeklifler = db.bilikBosluqlariniMovzuTeklifineCevir(aktivSahe);

  const hazirSsenariler = aciqlar.map(b => ({
    id: "gap-sim-" + b.id,
    bosluqId: b.id,
    sahe_id: aktivSahe,
    basliq: b.movzu || b.sual.slice(0, 60),
    ssenari: b.sual,
    gozlenilenMaddeler: [],
    kritikMeqamlar: [b.sual]
  }));

  return {
    aciqBosluqSayi: aciqlar.length,
    cevrilmisTeklifler,
    namizedSsenariler: hazirSsenariler
  };
}

module.exports = {
  STANDART_SSENARILER,
  ssenarileriAl,
  ssenariTap,
  helliQiymetlendir,
  carpazMaddelerdenDinamikKeysYarat,
  canliCatlardanMubahiseliKeysCixar,
  simulyasiyaIcraEt,
  bilikBosluqlariniAvtoTedqiqEt
};
