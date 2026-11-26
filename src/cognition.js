// BeyinAI — Universal Müstəqil Düşünmə Mühərriki (v3.0 — Domain-Agnostic Cognitive Core)
// Bu modul sistemi təkcə vergi/mühasibatlıqdan çıxarıb İSTƏNİLƏN BİLİK SAHƏSİ üçün müstəqil düşünən nüvəyə çevirir:
// 1) Yeni sahə yaradıldıqda həmin sahənin Tənqidçi/Qurucu rollarını, həlledici dəyişənlərini və ilkin yoxlama alqoritmlərini avtomatik qurur.
// 2) Yarımçıq sualları tutur: kor-koranə təxmin etmək əvəzinə "Əgər şərt A → X, şərt B → Y" Qərar Ağacı və dəqiqləşdirici sual qurur.
// 3) Sahəyə uyğun avtomatik "Əks-Hücum / Tənqidçi" (Red-Team Critic) mühakiməsi aparır.
// 4) Hər sahə daxilində "Harada güclüyəm / harada zəifəm" xəritəsini izləyir və zəif mövzular üzrə hədəfli məşq ssenariləri yaradır.
"use strict";

const db = require("./db");
const ai = require("./ai");

// ---- 1. Sahə Ailələri üzrə Ağıllı Düşünmə Şablonları (İstənilən sahəyə dərhal uyğunlaşma) ----
const SAHE_SABLONLARI = [
  {
    acar: /vergi|mühasib|muhasib|maliyyə\s*hesabat|bəyannamə|ədv|audit/i,
    teref_a_rol: "👮‍♂️ Mühafizəkar Vergi Müfəttişi",
    teref_b_rol: "💼 Təcrübəli Baş Mühasib",
    hakim_rol: "🎯 Baş Vergi və Maliyyə Müşaviri",
    eks_hucum_suali: "Kameral və ya səyyar yoxlama gəlsə, hansı sənəd çatışmazlığı, maddə istisnası və ya tarix sürüşməsi səbəbindən bu əməliyyata sanksiya yaza bilər?",
    helledici_deyisenler: [
      "Tərəflərin hüquqi statusu (Fərdi sahibkar, Hüquqi şəxs, VÖEN-siz fiziki şəxs, Qeyri-rezident)",
      "Vergi rejimi (ƏDV ödəyicisi, Mikro sahibkar, Sadələşdirilmiş, Mənfəət/Gəlir)",
      "Əməliyyatın sənəd, təhvil və faktiki ödəniş tarixləri"
    ],
    numune_suallar: [
      "Mikro sahibkar üçün 75% vergi güzəşti hansı şərtlərlə tətbiq olunur?",
      "İcarə müqaviləsi üzrə ödənişlərdən hansı vergilər tutulur?",
      "ƏDV-nin əvəzləşdirilməsi üçün hansı şərtlər eyni vaxtda ödənməlidir?"
    ],
    sual_ipucu: "Vergi, mühasibatlıq və ya yüklədiyiniz sənədlər barədə sualınızı yazın...",
    ilkin_qaydalar: [
      {
        sehv_koku: "Ümumi normaya baxıb subyektin statusunu və xüsusi istisna bəndini yoxlamamaq",
        yoxlama_qaydasi: "Cavab verməzdən əvvəl tərəflərin hüquqi statusunu, vergi rejimini və ümumi maddəni dəyişən istisna bəndlərini mütləq yoxla.",
        tetbiq_serti: "Vergi dərəcəsi, güzəşt və ÖMV suallarında"
      }
    ],
    ilkin_movzular: [
      "Elektron Qaimə və ƏDV Əvəzləşdirilməsi",
      "Mikro Sahibkar Güzəştləri və Şərtləri",
      "Qeyri-rezident Əməliyyatları (ÖMV və ƏDV)"
    ]
  },
  {
    acar: /əmək|emek|kadr|mülki|mulki|hüquq|huquq|məhkəmə|muqavile|müqavilə|qanun/i,
    teref_a_rol: "⚖️ Qarşı Tərəfin Vəkili / Nəzarət Müfəttişi",
    teref_b_rol: "🛡️ Müdafiə və Müqavilə Hüquqşünası",
    hakim_rol: "👨‍⚖️ Müstəqil Baş Hüquq Eksperti",
    eks_hucum_suali: "Mübahisə və ya məhkəmə zamanı qarşı tərəf hansı prosessual müddət, sübut çatışmazlığı və ya müqavilə boşluğundan istifadə edərək bu mövqeyi ləğv etdirə bilər?",
    helledici_deyisenler: [
      "Müqavilənin növü (Əmək müqaviləsi vs Mülki-hüquqi xidmət müqaviləsi)",
      "Rəsmi yazılı sənəd, akt və bildiriş müddətlərinin gözlənilib-gözlənilməməsi",
      "Tərəflərin hüquqi statusu və xüsusi imtiyaz/güzəşt halları"
    ],
    numune_suallar: [
      "İşçinin əmək müqaviləsinə xitam verilərkən hansı bildiriş müddətləri və ödənişlər məcburidir?",
      "Xidmət müqaviləsi ilə əmək müqaviləsi arasındakı əsas hüquqi risk fərqləri nələrdir?",
      "Müqavilə öhdəliyi gecikdirildikdə dəbbə pulu və zərər necə tələb olunur?"
    ],
    sual_ipucu: "Hüquqi məsələ, müqavilə şərti və ya qanunvericilik barədə sualınızı yazın...",
    ilkin_qaydalar: [
      {
        sehv_koku: "Maddi hüquq normasına baxıb prosessual müddətləri və yazılı rəsmiləşdirmə şərtini unutmaq",
        yoxlama_qaydasi: "Hüquqi qiymət verərkən yalnız haqlı olmağı deyil, həm də bildiriş/iddia müddətlərini və rəsmi sübut sənədlərini yoxla.",
        tetbiq_serti: "Müqavilə xitamı, mübahisə və məsuliyyət suallarında"
      }
    ],
    ilkin_movzular: [
      "Müqavilə Öhdəlikləri və Xitam Qaydaları",
      "Məzuniyyət və Kompensasiya Hüququ",
      "Hüquqi Məsuliyyət və Mübahisələrin Həlli"
    ]
  },
  {
    acar: /proqram|kod|software|it\b|texnologiya|sistem|server|ai\b|süni\s*intellekt|data|veb|mobil|kiber/i,
    teref_a_rol: "🛡️ Təhlükəsizlik, Xəta və Performans Tənqidçisi",
    teref_b_rol: "🏗️ Praktik Sistem və Proqram Memarı",
    hakim_rol: "🎯 Baş Mühəndis (Tech Lead)",
    eks_hucum_suali: "Yüksək istifadəçi yükü, gözlənilməz (edge-case) giriş məlumatları, şəbəkə kəsilməsi və ya təhlükəsizlik hücumu zamanı bu arxitektura harada çökə bilər?",
    helledici_deyisenler: [
      "Gözlənilən yük və miqyas (istifadəçi sayı, məlumat həcmi)",
      "Texnoloji mühit (proqramlaşdırma dili, verilənlər bazası, infrastruktur)",
      "Təhlükəsizlik, gecikmə (latency) və büdcə məhdudiyyəti"
    ],
    numune_suallar: [
      "Yüksək yüklənmə olan sistemdə verilənlər bazası sorğularını necə optimallaşdırmaq olar?",
      "Mikroservis arxitekturası nə vaxt faydalıdır, nə vaxt monolit daha doğrudur?",
      "API təhlükəsizliyində ən kritik boşluqlar və qorunma üsulları hansılardır?"
    ],
    sual_ipucu: "Proqramlaşdırma, sistem arxitekturası və ya texniki sənədlər barədə sualınızı yazın...",
    ilkin_qaydalar: [
      {
        sehv_koku: "Yalnız ideal işləmə ssenarisini (happy path) düşünüb xəta hallarını və miqyas yükünü nəzərə almamaq",
        yoxlama_qaydasi: "Hər texniki həlldə kənar halları (edge cases), təhlükəsizlik riskini, yaddaş/sürət mürəkkəbliyini və sadəlik balansını yoxla.",
        tetbiq_serti: "Kod, arxitektura və texniki qərar suallarında"
      }
    ],
    ilkin_movzular: [
      "Sistem Arxitekturası və Miqyaslanma",
      "Verilənlər Bazası və Sorğu Optimizasiyası",
      "Təhlükəsizlik və Xəta İdarəetməsi"
    ]
  },
  {
    acar: /biznes|strategiya|marketinq|satış|satis|idarəetmə|idareetme|iqtisad|investisiya|startap|layihə/i,
    teref_a_rol: "📉 Maliyyə Riski və Bazar Skeptiki",
    teref_b_rol: "🚀 Böyümə və Strategiya Memarı",
    hakim_rol: "🎯 Baş Strategiya və İdarəetmə Müşaviri",
    eks_hucum_suali: "Bazar tələbi gözləniləndən 2 dəfə zəif olsa, xərclər artsa və ya rəqiblər cavab addımı atsa bu strategiya hansı nöqtədə zərərə işləyər?",
    helledici_deyisenler: [
      "Mövcud büdcə, komanda resursu və nağd pul ehtiyatı",
      "Bazar seqmenti (B2B vs B2C) və rəqabət mühiti",
      "Hədəf müddət (qısamüddətli gəlir vs uzunmüddətli bazar payı)"
    ],
    numune_suallar: [
      "Yeni məhsulu bazara çıxararkən qiymət strategiyasını necə müəyyən etmək lazımdır?",
      "Müştəri itkisini (churn) azaltmaq üçün hansı ölçülə bilən addımlar atılmalıdır?",
      "Layihəyə investisiya qərarı verərkən hansı risk və gəlirlilik göstəriciləri yoxlanmalıdır?"
    ],
    sual_ipucu: "Biznes qərarı, strategiya, bazar təhlili və ya layihəniz barədə sualınızı yazın...",
    ilkin_qaydalar: [
      {
        sehv_koku: "Nikbin gəlir proqnozuna əsaslanıb gizli xərcləri və nağd pul axını riskini qiymətləndirməmək",
        yoxlama_qaydasi: "Biznes tövsiyəsi verərkən həm nikbin, həm də bədbin ssenarini, vahid iqtisadiyyatını (unit economics) və icra riskini tutuşdur.",
        tetbiq_serti: "Strategiya, qiymət, investisiya və idarəetmə suallarında"
      }
    ],
    ilkin_movzular: [
      "Bazar Strategiyası və Rəqabət Üstünlüyü",
      "Maliyyə Dayanıqlılığı və Xərc Nəzarəti",
      "Müştəri Cəlbi və Satış Sistemləri"
    ]
  },
  {
    acar: /tibb|sağlam|saglam|klinik|həkim|hekim|biologiya|psixologiya|farmakologiya/i,
    teref_a_rol: "🔬 Klinik Təhlükəsizlik və Əks-Göstəriş Nəzarətçisi",
    teref_b_rol: "🩺 Sübutlu Praktika Mütəxəssisi",
    hakim_rol: "🎯 Baş Elmi-Klinik Məsləhətçi",
    eks_hucum_suali: "Yanaşı xəstəliklər, yaş qrupu, fərdi həssaslıq və ya digər amillərlə qarşılıqlı təsirdə hansı təhlükəli fəsad yarana bilər?",
    helledici_deyisenler: [
      "Yaş, fərdi göstəricilər və yanaşı vəziyyətlər",
      "Əlamətlərin müddəti, şiddəti və laborator təsdiqi",
      "Sübut dərəcəsi və əks-göstərişlər"
    ],
    numune_suallar: [
      "Bu mövzu üzrə elmi sübut səviyyəsi yüksək olan əsas yanaşmalar hansılardır?",
      "Hansı qırmızı bayraq (təcili risk) əlamətlərinə xüsusi diqqət yetirilməlidir?",
      "Yüklənmiş tədqiqat və ya analiz nəticələrində əsas diqqət çəkən göstəricilər nələrdir?"
    ],
    sual_ipucu: "Elmi-tibbi mövzu, tədqiqat və ya yüklədiyiniz sənədlər barədə sualınızı yazın...",
    ilkin_qaydalar: [
      {
        sehv_koku: "Fərdi əks-göstərişləri və sübut səviyyəsini yoxlamadan ümumi tövsiyə vermək",
        yoxlama_qaydasi: "Hər zaman sübut mənbəyini, mümkün risk/əks-göstərişləri və həkim müayinəsi zərurətini aydın göstər.",
        tetbiq_serti: "Sağlamlıq və elmi-klinik təhlil suallarında"
      }
    ],
    ilkin_movzular: [
      "Sübutlu Təhlil və Diferensial Yanaşma",
      "Təhlükəsizlik və Əks-Göstərişlərin Yoxlanması"
    ]
  }
];

function saheUcunSablonTap(sahe = {}) {
  const metn = `${sahe.id || ""} ${sahe.ad || ""} ${sahe.aciqlama || ""}`;
  for (const sablon of SAHE_SABLONLARI) {
    if (sablon.acar.test(metn)) return sablon;
  }

  const ad = sahe.ad || "Ümumi Bilik Sahəsi";
  return {
    teref_a_rol: `🔎 "${ad}" üzrə Sərt Tənqidçi və Risk Analitiki`,
    teref_b_rol: `🛠️ "${ad}" üzrə Praktik Həll Mütəxəssisi`,
    hakim_rol: `🎯 "${ad}" üzrə Baş Ekspert`,
    eks_hucum_suali: `Real təcrübədə hansı gizli fərziyyə, çatışmayan məlumat və ya kənar hal bu nəticəni səhvə çıxara bilər?`,
    helledici_deyisenler: [
      "Məqsəd və tətbiq konteksti (nə üçün və hansı şəraitdə tətbiq olunur)",
      "Mövcud məhdudiyyətlər, resurslar və qaydalar",
      "Zaman çərçivəsi və gözlənilən dəqiqlik səviyyəsi"
    ],
    numune_suallar: [
      `${ad} sahəsində ən vacib təməl prinsiplər və tez-tez edilən səhvlər hansılardır?`,
      `Yüklədiyim sənədlər əsasında ${ad} üzrə əsas nəticələri və riskləri çıxar.`,
      `${ad} üzrə qərar qəbul edərkən hansı meyarlar mütləq yoxlanmalıdır?`
    ],
    sual_ipucu: `${ad} sahəsi və ya yüklədiyiniz sənədlər barədə sualınızı yazın...`,
    ilkin_qaydalar: [
      {
        sehv_koku: "Sualdakı gizli fərziyyələri və məhdudiyyətləri yoxlamadan təkvariantlı cavab vermək",
        yoxlama_qaydasi: `${ad} üzrə cavab hazırlayarkən əsas şərtləri ayır, çatışmayan dəyişənlər üzrə Qərar Ağacı qur və nəticəni əks-arqumentlə yoxla.`,
        tetbiq_serti: `${ad} üzrə bütün analitik suallarda`
      }
    ],
    ilkin_movzular: [
      `${ad} — Əsas Prinsiplər və Qaydalar`,
      `${ad} — Risklər və Praktiki Tətbiq`
    ]
  };
}

/**
 * İstənilən sahənin Müstəqil Düşünmə Profilini qaytarır (yoxdursa avtomatik yaradır və toxumlayır)
 */
function saheProfiliTeminEt(saheId = null) {
  const secilmisId = saheId || db.aktivSaheIdAl();
  const movcud = db.saheProfiliAl(secilmisId);
  if (movcud) return movcud;

  const saheler = db.saheleriAl();
  const sahe = saheler.find(s => s.id === secilmisId) || { id: secilmisId, ad: secilmisId, aciqlama: "" };
  const sablon = saheUcunSablonTap(sahe);

  const saxlanilan = db.saheProfiliSaxla({
    sahe_id: secilmisId,
    teref_a_rol: sablon.teref_a_rol,
    teref_b_rol: sablon.teref_b_rol,
    hakim_rol: sablon.hakim_rol,
    eks_hucum_suali: sablon.eks_hucum_suali,
    helledici_deyisenler: sablon.helledici_deyisenler,
    numune_suallar: sablon.numune_suallar,
    sual_ipucu: sablon.sual_ipucu
  });

  // Həmin sahədə düşünmə qaydası yoxdursa ilkin metodoloji qaydaları əlavə et
  const movcudQaydalar = db.dusunmeQaydalariniAl(secilmisId);
  if (movcudQaydalar.length === 0 && Array.isArray(sablon.ilkin_qaydalar)) {
    for (const q of sablon.ilkin_qaydalar) {
      db.dusunmeQaydasiElaveEt({
        sahe_id: secilmisId,
        sehv_koku: q.sehv_koku,
        yoxlama_qaydasi: q.yoxlama_qaydasi,
        tetbiq_serti: q.tetbiq_serti
      });
    }
  }

  // Həmin sahədə mövzu yoxdursa ilkin mövzuları əlavə et
  const movcudMovzular = db.saheMovzulariAl(secilmisId);
  if (movcudMovzular.length === 0 && Array.isArray(sablon.ilkin_movzular)) {
    for (const mAd of sablon.ilkin_movzular) {
      db.saheMovzuElaveEt({
        sahe_id: secilmisId,
        movzu: mAd,
        status: "oyrenilib",
        detal: "Sahə yaradılarkən avtomatik qurulmuş baza istiqaməti",
        menbe_sayi: 0
      });
    }
  }

  bacariqXeritesiniSinxronEt(secilmisId);
  return saxlanilan;
}

/**
 * Yeni sahə yaradıldıqda (POST /api/saheler) həm lokal şablonla dərhal qurur, həm də API açarı varsa LLM ilə daha dərin fərdiləşdirir
 */
async function yeniSaheniAvtoQurasdir(sahe, { llmIstifadeEt = true } = {}) {
  if (!sahe || !sahe.id) return null;
  let profil = saheProfiliTeminEt(sahe.id);

  const tenz = db.tenzimlemeleriAl();
  const apiVar = Boolean(tenz.gemini_api_key || process.env.GEMINI_API_KEY || tenz.groq_api_key || process.env.GROQ_API_KEY);

  if (llmIstifadeEt && apiVar) {
    try {
      const sistemPromptu = `Sən Universal Koqnitiv Sistem Memarısan. İstifadəçi yeni bilik sahəsi yaradıb.
Həmin sahədə müstəqil düşünmə, əks-hücum tənqidi və yarımçıq suallarda Qərar Ağacı qurmaq üçün sahənin profilini yalnız saf Azərbaycan dilində və YALNIZ JSON formatında hazırla:
{
  "teref_a_rol": "Emoji + Sərt tənqidçi/risk axtaran rol adı",
  "teref_b_rol": "Emoji + Praktik həll qurucusu rol adı",
  "hakim_rol": "Emoji + Baş sintezçi ekspert rol adı",
  "eks_hucum_suali": "Cavabı sındıra biləcək riskləri yoxlayan 1 cümləlik kəskin tənqid sualı",
  "helledici_deyisenler": ["Nəticəni 180 dərəcə dəyişən 1-ci dəyişən", "2-ci dəyişən", "3-cü dəyişən"],
  "numune_suallar": ["Praktiki sual 1?", "Praktiki sual 2?", "Praktiki sual 3?"],
  "yoxlama_qaydasi": "Bu sahədə səhv etməmək üçün 1 cümləlik qızıl metodoloji yoxlama qaydası",
  "ilkin_movzular": ["Əsas mövzu 1", "Əsas mövzu 2", "Əsas mövzu 3"]
}`;
      const istifadeciPromptu = `SAHƏ ADI: ${sahe.ad}\nİZAHI: ${sahe.aciqlama || "Müstəqil bilik və təhlil sahəsi"}`;
      const xam = await ai.llmCagir({ sistemPromptu, istifadeciPromptu, tenz, derinRejim: false });
      const m = String(xam || "").match(/\{[\s\S]*\}/);
      if (m) {
        const p = JSON.parse(m[0]);
        if (p.teref_a_rol && p.teref_b_rol) {
          profil = db.saheProfiliSaxla({
            sahe_id: sahe.id,
            teref_a_rol: p.teref_a_rol,
            teref_b_rol: p.teref_b_rol,
            hakim_rol: p.hakim_rol || profil.hakim_rol,
            eks_hucum_suali: p.eks_hucum_suali || profil.eks_hucum_suali,
            helledici_deyisenler: Array.isArray(p.helledici_deyisenler) && p.helledici_deyisenler.length > 0 ? p.helledici_deyisenler : profil.helledici_deyisenler,
            numune_suallar: Array.isArray(p.numune_suallar) && p.numune_suallar.length > 0 ? p.numune_suallar : profil.numune_suallar,
            sual_ipucu: `${sahe.ad} sahəsi və ya yüklədiyiniz sənədlər barədə sualınızı yazın...`
          });
          if (p.yoxlama_qaydasi) {
            db.dusunmeQaydasiElaveEt({
              sahe_id: sahe.id,
              sehv_koku: `${sahe.ad} sahəsində kontekst və kənar risk amillərini yoxlamamaq`,
              yoxlama_qaydasi: String(p.yoxlama_qaydasi).trim(),
              tetbiq_serti: `${sahe.ad} suallarında`
            });
          }
          if (Array.isArray(p.ilkin_movzular)) {
            for (const mov of p.ilkin_movzular.slice(0, 4)) {
              db.saheMovzuElaveEt({
                sahe_id: sahe.id,
                movzu: String(mov).trim(),
                status: "oyrenilib",
                detal: "Avtomatik sahə qurucusu tərəfindən müəyyən edildi",
                menbe_sayi: 0
              });
            }
          }
          bacariqXeritesiniSinxronEt(sahe.id);
        }
      }
    } catch (_) {
      // LLM əlçatmaz olduqda lokal ağıllı şablon artıq tam aktivdir
    }
  }

  return profil;
}

// ---- 2. Yarımçıq Sual Detektoru və "Əgər Şərt A → X, Şərt B → Y" Qərar Ağacı Qurucusu ----
function yarimciqSualAnalizEt({ sual = "", saheId = null }) {
  const temiz = String(sual || "").trim();
  const profil = saheProfiliTeminEt(saheId);
  const sozSayi = temiz.split(/\s+/).filter(Boolean).length;
  const kicik = db.azKicilt(temiz);

  // Sualda artıq konkret detallar verilibmi?
  const konkretDetalSayi = [
    /\b\d+\s*(?:azn|manat|usd|%|faiz|gün|ay|il|işçi|nəfər|gb|ms|req)/i.test(temiz),
    /fərdi\s*sahibkar|hüquqi\s*şəxs|\bmmc\b|\basc\b|qeyri[-\s]*rezident|fiziki\s*şəxs/i.test(kicik),
    /ədv\s*ödəyicisi|sadələşdirilmiş|mikro\s*sahibkar/i.test(kicik),
    /maddə\s*\d+/i.test(kicik),
    /əmək\s*müqavilə|xidmət\s*müqavilə|icarə|b2b|b2c|monolit|mikroservis|postgresql|sqlite/i.test(kicik)
  ].filter(Boolean).length;

  // Tipik çoxvariantlı / şərtlərdən asılı sual qəlibləri
  const coxVariantliMovzudur =
    /nə\s*qədər\s*vergi|hansı\s*vergi|vergi\s*var|vergi\s*tutulur|necə\s*hesablan|hansı\s*halda|olarmı|icazə\s*var|hansı\s*daha\s*yaxşı|necə\s*seç|nə\s*etməli|məsləhət|cəriməsi\s*nədir/i.test(kicik);

  const yarimciqdir =
    (sozSayi <= 9 && konkretDetalSayi <= 1) ||
    (coxVariantliMovzudur && konkretDetalSayi === 0 && sozSayi <= 16);

  if (!yarimciqdir) {
    return {
      yarimciqdir: false,
      catismayanDeyisenler: [],
      promptTelimati: "",
      lokalQerarAgaciBloku: ""
    };
  }

  // Konkret mövzuya uyğun xüsusi qərar ağacı budaqları (əgər tanınan mövzudursa) və ya sahənin həlledici dəyişənləri
  let sertA = "";
  let sertB = "";
  let deqiqlesdiriciSual = "";
  const catismayanDeyisenler = (profil.helledici_deyisenler || []).slice(0, 2);

  if (/icarə|icare/i.test(kicik)) {
    sertA = "Əgər icarəyə verən VÖEN-siz fiziki şəxsdirsə → Ödəmə mənbəyində 14% vergi (Maddə 124) tutulub büdcəyə ödənilir";
    sertB = "Əgər icarəyə verən VÖEN-li sahibkar və ya hüquqi şəxsdirsə → Ödəmə mənbəyində vergi tutulmur, elektron qaimə əsasında özü vergisini ödəyir";
    deqiqlesdiriciSual = "İcarəyə verən tərəf VÖEN-siz fiziki şəxsdir, yoxsa VÖEN-li sahibkar / şirkət? Həmçinin əmlak yaşayış, yoxsa qeyri-yaşayış sahəsidir?";
  } else if (/xaric|qeyri[-\s]*rezident|ölkədən\s*kənar|import|idxal/i.test(kicik)) {
    sertA = "Əgər xarici şirkətdən elektron/məsləhət xidməti alınırsa → 10% ÖMV (Maddə 125) və 18% qeyri-rezident ƏDV-si (Maddə 169) yaranır";
    sertB = "Əgər mal idxalıdırsa və ya ikiqat vergitutmanın aradan qaldırılması (DTA) sertifikatı varsa → Gömrük ƏDV-si və ya azaldılmış dərəcə tətbiq olunur";
    deqiqlesdiriciSual = "Ödəniş mal idxalı üçündür, yoxsa xidmət/proqram təminatı alışı üçün? Qarşı tərəfin rezidentlik (DTA) sertifikatı varmı?";
  } else if (/dividend|təsisçi|pul\s*çıxar/i.test(kicik)) {
    sertA = "Əgər xalis mənfəətdən rəsmi dividend bölüşdürülürsə → Ödəmə mənbəyində 5% vergi (Maddə 122.1) tutulur və sığorta haqqı hesablanmır";
    sertB = "Əgər fərdi sahibkar öz hesabından vəsait götürürsə → Gəlir/sadələşdirilmiş vergi ödənildikdən sonra əlavə dividend vergisi yoxdur (nağdlaşdırma limiti nəzərə alınmaqla)";
    deqiqlesdiriciSual = "Fəaliyyət forması MMC-dir (hüquqi şəxs), yoxsa Fərdi Sahibkar (fiziki şəxs VÖEN)?";
  } else {
    const d1 = catismayanDeyisenler[0] || "1-ci əsas şərt / status";
    const d2 = catismayanDeyisenler[1] || "2-ci xüsusi istisna / mühit";
    sertA = `Əgər standart rejim / 1-ci hal tətbiq olunursa (${d1}) → Ümumi baza qaydası və standart tələblər işə düşür`;
    sertB = `Əgər xüsusi status və ya istisna halı mövcuddursa (${d2}) → Fərqli dərəcə, güzəşt və ya xüsusi müdafiə mexanizmi tətbiq edilir`;
    deqiqlesdiriciSual = `Dəqiq qərar çıxarmaq üçün bildirin: ${catismayanDeyisenler.join(" və ")} sizin halda necədir?`;
  }

  const promptTelimati = `
🧭 **YARIMÇIQ SUAL VƏ QƏRAR AĞACI REJİMİ AKTİVDİR (MÜTLƏQ İCRA ET!):**
İstifadəçinin sualında nəticəni dəyişən vacib detallar (${catismayanDeyisenler.join("; ")}) tam qeyd edilməyib. Kor-koranə təxmin etmə!
Cavabın görünən hissəsində (<DETALLI_ANALIZ> teqindən ƏVVƏL) mütləq bu ardıcıllığı ver:
1) **### 📌 Konkret və Qısa Cavab:** (2-3 cümləlik ümumi mahiyyət)
2) **### 🔀 Şərtlər üzrə Qərar Ağacı:**
   - **Əgər Şərt A olarsa:** [konkret nəticə / qayda]
   - **Əgər Şərt B olarsa:** [konkret nəticə / qayda]
3) **❓ Dəqiqləşdirici Sual:** (Sizin konkret vəziyyətiniz üçün 1-2 qısa, aydın sual soruş)`;

  const lokalQerarAgaciBloku = `\n\n### 🔀 Şərtlər üzrə Qərar Ağacı:\n- **${sertA}**\n- **${sertB}**\n\n**❓ Dəqiqləşdirici Sual:** ${deqiqlesdiriciSual}`;

  return {
    yarimciqdir: true,
    catismayanDeyisenler,
    sertA,
    sertB,
    deqiqlesdiriciSual,
    promptTelimati,
    lokalQerarAgaciBloku
  };
}

// ---- 3. Sahəyə Uyğun "Əks-Hücum / Tənqidçi" (Red-Team Critic) Bloku ----
function saheyeUygunKonsiliumTelimatiQur(saheId = null) {
  const profil = saheProfiliTeminEt(saheId);
  return {
    profil,
    konsiliumPromptu: `   #### ⚖️ 5. Çox-Baxışlı Ekspert Konsiliumu və Əks-Hücum Testi (${profil.teref_a_rol} vs ${profil.teref_b_rol}):
   - ${profil.teref_a_rol}: [${profil.eks_hucum_suali} — ən sərt risk, səhv ehtimalı və zəif nöqtəni göstər].
   - ${profil.teref_b_rol}: [Qanuni/texniki/praktiki həll yolu, optimizasiya və müdafiə arqumentini göstər].
   - ${profil.hakim_rol}: [Riskdən qoruyan və ən dayanıqlı yekun əməli qərarı çıxar].`
  };
}

// ---- 4. Bacarıq Xəritəsinin Sinxronizasiyası və Zəif Mövzular üzrə Hədəfli Məşq ----
function bacariqXeritesiniSinxronEt(saheId = null) {
  const secilmisSahe = saheId || db.aktivSaheIdAl();
  const movcudXerite = db.bacariqXeritesiniAl(secilmisSahe);
  const movcudAdlar = new Set(movcudXerite.movzular.map(m => db.azNormallashdir(m.movzu)));

  // 1) Keçmiş simulyasiyalardan real balları xəritəyə köçür
  const simler = db.simulyasiyalariAl(secilmisSahe, 30);
  for (const s of simler) {
    const norm = db.azNormallashdir(s.basliq || "");
    if (norm && !movcudAdlar.has(norm)) {
      db.bacariqQeydEt({
        sahe_id: secilmisSahe,
        movzu: s.basliq,
        bal: s.bal || 75,
        nov: "simulyasiya"
      });
      movcudAdlar.add(norm);
    }
  }

  // 2) Sahə mövzularından hələ xəritədə olmayanları əlavə et ('teklif' olanlar zəif/öyrənilməli kimi başlayır!)
  const saheMovzulari = db.saheMovzulariAl(secilmisSahe);
  for (const sm of saheMovzulari) {
    const norm = db.azNormallashdir(sm.movzu || "");
    if (norm && !movcudAdlar.has(norm)) {
      db.bacariqQeydEt({
        sahe_id: secilmisSahe,
        movzu: sm.movzu,
        bal: sm.status === "teklif" ? 50 : 78,
        nov: sm.status === "teklif" ? "bosluq" : "simulyasiya"
      });
      movcudAdlar.add(norm);
    }
  }

  return db.bacariqXeritesiniAl(secilmisSahe);
}

/**
 * Həmin sahədə ən zəif mövzunu tapıb onun üzərində hədəfli sınaq ssenarisi qurur
 */
function zeifMovzudanSinaqYarat(saheId = null) {
  const secilmisSahe = saheId || db.aktivSaheIdAl();
  bacariqXeritesiniSinxronEt(secilmisSahe);
  const profil = saheProfiliTeminEt(secilmisSahe);
  const zeifler = db.zeifMovzulariAl(secilmisSahe, 5);
  const butunXerite = db.bacariqXeritesiniAl(secilmisSahe).movzular;

  const hedef = zeifler[0] || butunXerite[0];
  if (!hedef) {
    const ilkSual = (profil.numune_suallar && profil.numune_suallar[0]) || "Bu sahədə əsas qərar meyarları və risklər hansılardır?";
    return {
      id: "sim-zeif-" + Date.now(),
      nov: "zeif_movzu",
      sahe_id: secilmisSahe,
      basliq: "Hədəfli Məşq: Əsas Qərar Meyarları",
      ssenari: ilkSual,
      gozlenilenMaddeler: [],
      kritikMeqamlar: []
    };
  }

  // Bazada bu zəif mövzuya aid parça varmı? Varsa onun detallarını ssenariyə qat
  const uygunParcalar = db.hibridAxtar({
    sorgu: hedef.movzu,
    qovluq_id: "all",
    sahe_id: secilmisSahe,
    limit: 3
  });
  const maddeler = [];
  for (const p of uygunParcalar) {
    for (const m of db.metndenMaddeleriCixar(`${p.basliq || ""} ${(p.metn || "").slice(0, 200)}`)) {
      if (!maddeler.includes(m)) maddeler.push(m);
    }
  }

  const kontekstIpucu = uygunParcalar.length > 0
    ? `\nƏlaqəli baza konteksti: "${uygunParcalar[0].metn.slice(0, 220).trim()}..."`
    : "";

  return {
    id: "sim-zeif-" + hedef.id,
    nov: "zeif_movzu",
    sahe_id: secilmisSahe,
    hedef_movzu: hedef.movzu,
    basliq: `🎯 Zəif Mövzu Məşqi: ${hedef.movzu.slice(0, 65)}`,
    ssenari: `Hədəfli Özünü-İnkişaf Sınağı (Cari dəqiqlik: ${hedef.deqiqlik_faizi}%):\nMövzu: "${hedef.movzu}".${kontekstIpucu}\n\nTapşırıq: Bu mövzu üzrə 1) əsas qayda və şərtləri, 2) "Əgər şərt A → X, şərt B → Y" qərar ağacını, 3) "${profil.teref_a_rol}" gözü ilə ən kritik səhv və risk nöqtələrini dəqiq əsaslandır.`,
    gozlenilenMaddeler: maddeler.slice(0, 3),
    kritikMeqamlar: [hedef.movzu]
  };
}

/**
 * Qeyri-vergi (yeni yaradılmış) sahələr üçün də dinamik sınaq ssenariləri siyahısı qaytarır ki, heç bir sahə boş qalmasın
 */
function saheUcunDinamikSsenarilerAl(saheId) {
  const profil = saheProfiliTeminEt(saheId);
  const suallar = profil.numune_suallar || [];
  return suallar.map((sual, idx) => ({
    id: `sim-dyn-${saheId}-${idx + 1}`,
    sahe_id: saheId,
    basliq: `${profil.hakim_rol.replace(/^[^\wƏəİıÖöÜüĞğŞşÇç]+/u, "").trim()} Sınağı #${idx + 1}: ${sual.slice(0, 52)}`,
    ssenari: `${sual}\nCavabda həm qərar ağacını, həm də "${profil.teref_a_rol}" tərəfindən əks-hücum risk təhlilini göstər.`,
    gozlenilenMaddeler: [],
    kritikMeqamlar: [sual.slice(0, 45)]
  }));
}

// Bütün mövcud sahələrin ilkin profillərini hazırla
try {
  for (const s of db.saheleriAl()) {
    saheProfiliTeminEt(s.id);
  }
} catch (_) {}

module.exports = {
  saheUcunSablonTap,
  saheProfiliTeminEt,
  yeniSaheniAvtoQurasdir,
  yarimciqSualAnalizEt,
  saheyeUygunKonsiliumTelimatiQur,
  bacariqXeritesiniSinxronEt,
  zeifMovzudanSinaqYarat,
  saheUcunDinamikSsenarilerAl
};
