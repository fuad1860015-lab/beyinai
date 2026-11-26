// BeyinAI — Özünü-İnkişaf və Təkamül Mühərriki (v2.0)
// Bu modul:
// 1) "Mən niyə səhv etdim?" kök-səbəb təhlili aparır və alqoritmik düşünmə/yoxlama qaydaları yaradır.
// 2) Qanunvericilik dəyişdikdə köhnə qaydaları silmədən dövr üzrə arxivləyir (keçmiş 3 illik yoxlamalar üçün) və təsir hesabatı çıxarır.
// 3) Qanunda birbaşa cavabı olmayan mübahisəli halları "Boz Zona Dosyesi" kimi qeydə alıb Ekspertin İş Siyasətini öyrənir.
"use strict";

const db = require("./db");
const ai = require("./ai");

// ---- 1. "Mən Niyə Səhv Etdim?" — Kök-Səbəb Təhlili və Metodoloji Yoxlama Qaydaları ----

/**
 * Sürətli deterministik kök-səbəb təsnifatçısı (həm oflayn rejimdə, həm də ilkin baza kimi işləyir)
 */
function lokalKokSebebTap({ sual = "", sehvCavab = "", duzgunIzah = "" }) {
  const birlesik = db.azKicilt(`${duzgunIzah} ${sual}`);
  const duzMaddeler = db.metndenMaddeleriCixar(duzgunIzah);
  const sehvMaddeler = db.metndenMaddeleriCixar(sehvCavab);

  // 1) İstisna bəndi və ya xüsusi norma qaçırılması
  if (/istisna|xüsusi\s*hal|alt[-\s]*bənd|əvəzinə.*maddə|yox,?\s*\d+/i.test(birlesik) || (duzMaddeler.length > 0 && sehvMaddeler.length > 0 && duzMaddeler[0] !== sehvMaddeler[0])) {
    const mQeyd = duzMaddeler.length > 0 ? ` (xüsusilə Maddə ${duzMaddeler.join(", ")})` : "";
    return {
      sehv_koku: `Ümumi normaya baxıb xüsusi istisna maddəsini${mQeyd} yoxlamamaq`,
      yoxlama_qaydasi: `Cavab verməzdən əvvəl yalnız ümumi maddə ilə kifayətlənmə — həmin əməliyyata aid xüsusi istisna bəndini${mQeyd} və üstünlük təşkil edən xüsusi normanı mütləq yoxla.`,
      tetbiq_serti: duzMaddeler.length > 0 ? `Maddə ${duzMaddeler.join(", ")} və əlaqəli istisnalar` : "Ümumi və xüsusi normaların toqquşduğu hallar"
    };
  }

  // 2) Tarix kəsişməsi və hesabat dövrü sürüşməsi
  if (/cari\s*ay|köhnə\s*ay|əvvəlki\s*ay|hesabat\s*dövr|ödəniş\s*tarix|təsdiq\s*tarix|sonuncu\s*iş\s*gün/i.test(birlesik)) {
    return {
      sehv_koku: "Əməliyyatın sənəd tarixi ilə faktiki ödəniş / dəyişiklik hesabat dövrünü qarışdırmaq",
      yoxlama_qaydasi: "Çoxmərhələli əməliyyatlarda sənədin ilkin tarixi ilə kifayətlənmə — bütün hüquqi şərtlərin tamamlandığı və ya dəyişikliyin baş verdiyi cari hesabat dövrünü ayrı-ayrılıqda yoxla.",
      tetbiq_serti: "Fərqli aylara düşən qaimə, ödəniş, əvəzləşdirmə və bəyannamə halları"
    };
  }

  // 3) Subyektin hüquqi statusu və vergi rejimi fərqi
  if (/fərdi\s*sahibkar|hüquqi\s*şəxs|mikro|sadələşdirilmiş|qeyri[-\s]*rezident|ədv\s*ödəyicisi/i.test(birlesik)) {
    return {
      sehv_koku: "Subyektin hüquqi statusunu (fərdi sahibkar vs hüquqi şəxs, rezident vs qeyri-rezident) və vergi rejimini fərqləndirməmək",
      yoxlama_qaydasi: "Vergi öhdəliyini hesablamazdan əvvəl qarşı tərəfin və vergi ödəyicisinin dəqiq statusunu (FS/HŞ, Mikro/ƏDV/Sadələşdirilmiş, Rezident/Qeyri-rezident) müəyyənləşdir.",
      tetbiq_serti: "Vergi dərəcəsi, güzəşt və ÖMV öhdəliyi suallarında"
    };
  }

  // 4) Hədd, işçi sayı və faiz norması tələsi
  if (/işçi\s*say|0\s*işçi|3\s*işçi|hədd|limit|norma|45\s*000|30\s*000|200\s*000|kapitallaş/i.test(birlesik)) {
    return {
      sehv_koku: "Kəmiyyət hədlərini (dövriyyə limiti, işçi sayı şərti və ya xərc norması) dəqiq tətbiq etməmək",
      yoxlama_qaydasi: "Güzəşt və xərc silinməsi məsələlərində qanundakı kəmiyyət hədlərini (dövriyyə, işçi sayı tələbi olub-olmaması, faiz norması) rəqəmsal olaraq tutuşdur.",
      tetbiq_serti: "Limit, güzəşt şərti və təmir/amortizasiya normalarında"
    };
  }

  // 5) Nəzəri qanun vs Portal / Kameral yoxlama praktikası
  if (/praktikada|portalda|kameral|e-taxes|əmas|btp|müfəttiş/i.test(birlesik)) {
    return {
      sehv_koku: "Yalnız qanunun nəzəri mətninə baxıb elektron portalın (e-taxes / ƏMAS) texniki və kameral yoxlama praktikasını nəzərə almamaq",
      yoxlama_qaydasi: "Nəzəri maddə ilə yanaşı BTP / e-taxes / ƏMAS portalının texniki qəbul qaydasını və kameral uyğunsuzluq riskini də mütləq cavaba daxil et.",
      tetbiq_serti: "Bəyannamə doldurulması, qaimə və kadr qeydiyyatı suallarında"
    };
  }

  return {
    sehv_koku: "Sualdakı xüsusi praktiki şərti və istisna detalını nəzərdən qaçırmaq",
    yoxlama_qaydasi: `Oxşar mövzularda ekspert düzəlişini əsas yoxlama addımı kimi tətbiq et: ${String(duzgunIzah || "").slice(0, 180).trim()}`,
    tetbiq_serti: String(sual || "Oxşar praktiki situasiyalar").slice(0, 90)
  };
}

/**
 * İstifadəçi düzəlişi və ya simulyasiya səhvi zamanı "Mən niyə səhv etdim?" təhlili aparır
 * və nəticəni `dusunme_qaydalari` cədvəlinə alqoritmik yoxlama qaydası kimi əlavə edir.
 */
async function kokSebebAnaliziEt({
  sual = "",
  sehvCavab = "",
  duzgunIzah = "",
  sahe_id = null,
  llmIstifadeEt = true
}) {
  const secilmisSahe = sahe_id || db.aktivSaheIdAl();
  let analiz = lokalKokSebebTap({ sual, sehvCavab, duzgunIzah });

  const tenz = db.tenzimlemeleriAl();
  const apiVar = Boolean(tenz.gemini_api_key || process.env.GEMINI_API_KEY || tenz.groq_api_key || process.env.GROQ_API_KEY);

  if (llmIstifadeEt && apiVar && duzgunIzah && duzgunIzah.length >= 15) {
    try {
      const sistemPromptu = `Sən AI-nin öz səhvlərindən dərs çıxaran Metodoloji Kök-Səbəb Analizatorusan.
Sənə istifadəçinin sualı, AI-nin əvvəlki səhv/natamam cavabı və Ekspertin düzgün izahı verilir.
Yalnız faktı təkrarlama! AI-nin DÜŞÜNMƏ ALQORİTMİNDƏ NİYƏ SƏHV ETDİYİNİ tap (məsələn: "Ümumi normaya baxıb xüsusi istisna bəndini yoxlamadım", "Tarix kəsişməsini nəzərə almadım") və gələcək suallar üçün 1 cümləlik konkret YOXLAMA QAYDASI yaz.
Yalnız saf Azərbaycan dilində və YALNIZ JSON formatında cavab ver:
{
  "sehv_koku": "Niyə səhv etdiyinin qısa kök səbəbi",
  "yoxlama_qaydasi": "Gələcəkdə cavab verməzdən əvvəl icra edilməli alqoritmik yoxlama addımı",
  "tetbiq_serti": "Hansı növ suallarda işə düşməlidir"
}`;
      const istifadeciPromptu = `SUAL: ${String(sual).slice(0, 400)}\nƏVVƏLKİ CAVAB: ${String(sehvCavab).slice(0, 500)}\nEKSPERT DÜZƏLİŞİ: ${String(duzgunIzah).slice(0, 500)}`;
      const xam = await ai.llmCagir({ sistemPromptu, istifadeciPromptu, tenz, derinRejim: false });
      const m = String(xam || "").match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.sehv_koku && parsed.yoxlama_qaydasi) {
          analiz = {
            sehv_koku: String(parsed.sehv_koku).trim(),
            yoxlama_qaydasi: String(parsed.yoxlama_qaydasi).trim(),
            tetbiq_serti: String(parsed.tetbiq_serti || analiz.tetbiq_serti).trim()
          };
        }
      }
    } catch (_) {
      // LLM əlçatmaz olarsa deterministik kök-səbəb qaydası işləyir
    }
  }

  const qeyd = db.dusunmeQaydasiElaveEt({
    sahe_id: secilmisSahe,
    sehv_koku: analiz.sehv_koku,
    yoxlama_qaydasi: analiz.yoxlama_qaydasi,
    tetbiq_serti: analiz.tetbiq_serti,
    numune_sual: String(sual || "").slice(0, 160)
  });

  return qeyd;
}

// ---- 2. Qanun Dəyişikliyi Zamanı Dövr üzrə Arxivləmə və Təsir Hesabatı ----

function metniMaddeBloklarinaAyir(metn = "") {
  const map = new Map();
  const sətirlər = String(metn || "").split(/\r?\n/);
  let cariMadde = null;
  let bufer = [];

  for (const s of sətirlər) {
    const m = s.match(/^\s*Maddə\s+(\d+[0-9.-]*)/i);
    if (m) {
      if (cariMadde) map.set(cariMadde, bufer.join("\n").trim());
      cariMadde = m[1].replace(/\.$/, "");
      bufer = [s];
    } else if (cariMadde) {
      bufer.push(s);
    }
  }
  if (cariMadde) map.set(cariMadde, bufer.join("\n").trim());
  return map;
}

/**
 * Yeni qanun / məcəllə dəyişikliyi yükləndikdə və ya mövcud qanun sənədi yeniləndikdə:
 * 1) Hansı maddələrin dəyişdiyini tapır.
 * 2) Həmin maddələrə bağlı əvvəlki Qızıl Yaddaş qaydalarını silmədən dövr üzrə arxivləyir (keçmiş 3 illik yoxlamalar üçün!).
 * 3) İstifadəçi üçün Təsir Hesabatı yaradır.
 */
function qanunDeyisikliyiYoxlaVeArxivle({
  senedAdi = "",
  xamMetn = "",
  kohneMetn = "",
  sahe_id = null,
  kohneDovrEtiketi = ""
}) {
  const adKicik = db.azKicilt(senedAdi || "");
  const metnKicik = db.azKicilt((xamMetn || "").slice(0, 6000));

  const qanunSenedidir =
    /(?:məcəllə|qanun|qərar|fərman|dəyişiklik|redaksiya)/i.test(adKicik) ||
    /(?:maddə\s+\d+|dəyişikliklər\s+edil|yeni\s+redaksiyada|qüvvəyə\s+min)/i.test(metnKicik);

  if (!qanunSenedidir) {
    return { deyisiklikTapildi: false, deyisenMaddeler: [], arxivlenenSay: 0, arxivlenenler: [] };
  }

  let deyisenMaddeler = [];

  if (kohneMetn && kohneMetn.trim().length > 20) {
    // Mövcud qanun faylının yeni versiyası yüklənibsə, yalnız mətni faktiki dəyişən maddələri tap
    const kohneMap = metniMaddeBloklarinaAyir(kohneMetn);
    const yeniMap = metniMaddeBloklarinaAyir(xamMetn);
    for (const [mNo, yeniBlok] of yeniMap.entries()) {
      const kohneBlok = kohneMap.get(mNo);
      if (kohneBlok && db.azNormallashdir(kohneBlok) !== db.azNormallashdir(yeniBlok)) {
        deyisenMaddeler.push(mNo);
      }
    }
    if (deyisenMaddeler.length === 0 && db.azNormallashdir(kohneMetn) !== db.azNormallashdir(xamMetn)) {
      deyisenMaddeler = db.metndenMaddeleriCixar(xamMetn).slice(0, 15);
    }
  } else if (/(?:dəyişiklik|yeni\s*redaksiya|əlavə\s*edilsin|aşağıdakı\s*redaksiyada)/i.test(`${adKicik} ${metnKicik}`)) {
    // Müstəqil "Dəyişikliklər haqqında Qanun" sənədi yüklənibsə, içində çəkilən maddələri götür
    deyisenMaddeler = db.metndenMaddeleriCixar(xamMetn).slice(0, 25);
  }

  if (deyisenMaddeler.length === 0) {
    return { deyisiklikTapildi: false, deyisenMaddeler: [], arxivlenenSay: 0, arxivlenenler: [] };
  }

  // Qüvvəyə minmə ilini mətndən və ya cari ildən müəyyən et
  const ilMatch = String(`${senedAdi} ${xamMetn.slice(0, 2000)}`).match(/\b(202[5-9]|203\d)\b/);
  const yeniIl = ilMatch ? Number(ilMatch[1]) : new Date().getFullYear();
  const dovrEtiketi = kohneDovrEtiketi || `${yeniIl - 1}-ci ilədək qüvvədə olub`;

  const hesabat = db.maddelereBagliYaddaslariArxivle({
    sahe_id: sahe_id || db.aktivSaheIdAl(),
    deyisenMaddeler,
    kohneDovrEtiketi: dovrEtiketi,
    senedAdi: senedAdi || "Qanunvericilik Dəyişikliyi"
  });

  return {
    deyisiklikTapildi: true,
    ...hesabat
  };
}

// ---- 3. "Boz Zona" Aşkarlayıcısı və Mübahisəli Dosye Yaradıcısı ----

function bozZonaYoxlaVeDosyeAc({
  sual = "",
  movzu = "",
  sitatlar = [],
  teref_a = "",
  teref_b = "",
  sahe_id = null
}) {
  const resmiSitatlar = (sitatlar || []).filter(s => (s.huquqi_pille || 3) <= 2);
  const qeyriResmiSitatlar = (sitatlar || []).filter(s => (s.huquqi_pille || 3) >= 3);

  // Əgər birbaşa həm tərəf A, həm tərəf B ötürülübsə və ya rəsmi norma yoxdur amma müxtəlif praktiki şərhlər varsa
  const acilmalidir = Boolean(teref_a && teref_b) || (resmiSitatlar.length === 0 && qeyriResmiSitatlar.length >= 2);
  if (!acilmalidir) return null;

  const yekunMovzu = movzu || String(sual).slice(0, 85).trim();
  const secilmisSahe = sahe_id || db.aktivSaheIdAl();
  let profil = null;
  try {
    profil = require("./cognition").saheProfiliTeminEt(secilmisSahe);
  } catch (_) {}
  const rolA = profil?.teref_a_rol || "Mühafizəkar Tənqidçi";
  const rolB = profil?.teref_b_rol || "Praktik Mütəxəssis";

  const mufettisMovqeyi = teref_a || (
    secilmisSahe === "vergi_muhasibat"
      ? "Mühafizəkar (Vergi Orqanı) Mövqeyi: Qanunda birbaşa azadolma və ya xüsusi icazə göstərilmədiyi üçün əməliyyat ümumi qaydada tam vergiyə cəlb edilməli və sanksiya riski nəzərə alınmalıdır."
      : `${rolA}: Təsdiqlənmiş birbaşa norma və ya ciddi sübut olmadığı üçün ən ehtiyatlı, sıfır-riskli və mühafizəkar standart tətbiq edilməlidir.`
  );
  const muhasibMovqeyi = teref_b || (
    secilmisSahe === "vergi_muhasibat"
      ? "Praktiki Baş Mühasib Mövqeyi: Vergi Məcəlləsinin 3.11 və 13-cü maddələrinə (bütün ziddiyyətlərin və aydın olmayan məqamların vergi ödəyicisinin xeyrinə şərh edilməsi) əsasən, iqtisadi əsaslandırılmış sənədlərlə vergi ödəyicisinin xeyrinə tətbiq edilə bilər."
      : `${rolB}: Məntiqi əsaslandırma, sənədləşdirmə və praktiki təcrübə çərçivəsində çevik və effektiv həll tətbiq edilə bilər.`
  );

  return db.mubahiseliDosyeYarat({
    sahe_id: secilmisSahe,
    movzu: yekunMovzu,
    sual: sual || yekunMovzu,
    teref_a_mufettis: mufettisMovqeyi,
    teref_b_muhasib: muhasibMovqeyi,
    bagli_maddeler: db.metndenMaddeleriCixar(`${sual} ${mufettisMovqeyi} ${muhasibMovqeyi}`)
  });
}

module.exports = {
  lokalKokSebebTap,
  kokSebebAnaliziEt,
  qanunDeyisikliyiYoxlaVeArxivle,
  bozZonaYoxlaVeDosyeAc
};
