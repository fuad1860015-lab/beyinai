// BeyinAI — Çox-Addımlı Avtonom AI Agent Mühərriki (ReAct / Deep Research Agent)
// Adi 1-addımlı RAG-dan fərqli olaraq bu Agent:
// 1) İstifadəçinin sualını təhlil edir və bazada hansı açar sözlərlə/mövzularla axtarış edəcəyini özü planlaşdırır (Agent Planlama).
// 2) Bazada paralel və dərin axtarışlar (Multi-Query Search + Sənəd Daxili Oxuma + NotebookLM Körpü Sorğusu) icra edir.
// 3) Tapılan bütün sənədləri, çatları və rəqəmləri çarpaz müqayisə edib Gemini / ChatGPT / Claude səviyyəsində dərin analitik cavab hazırlayır.
"use strict";

const db = require("./db");
const ai = require("./ai");
const geminiFiles = require("./gemini-files");

// Canlı NotebookLM Brauzer Körpüsü növbəsi (Extension qoşulduqda sualları canlı olaraq notebooklm.google.com-a da yönləndirə bilir)
const nlmSorguNovbesi = [];
const nlmCavabGozleyenler = new Map();
let nlmSonGorulme = 0;
let nlmAktivNotebookAdi = "";

function nlmKorpuDurumuYenile({ notebookAdi = "" } = {}) {
  nlmSonGorulme = Date.now();
  if (notebookAdi) nlmAktivNotebookAdi = notebookAdi;
}

function nlmKorpuAktivdirmi() {
  return Date.now() - nlmSonGorulme < 25000;
}

function nlmKorpuVeziyyeti() {
  return {
    aktiv: nlmKorpuAktivdirmi(),
    sonGorulme: nlmSonGorulme,
    notebookAdi: nlmAktivNotebookAdi
  };
}

function nlmNövbəniAl() {
  nlmSonGorulme = Date.now();
  return nlmSorguNovbesi.splice(0, nlmSorguNovbesi.length);
}

function nlmCavabQebulEt({ sorguId, cavab, menbeler = [] }) {
  nlmSonGorulme = Date.now();
  const gozleyen = nlmCavabGozleyenler.get(sorguId);
  if (gozleyen) {
    clearTimeout(gozleyen.timer);
    nlmCavabGozleyenler.delete(sorguId);
    gozleyen.resolve({ ok: true, cavab, menbeler });
  }
}

function notebooklmCanliSorus(sual, timeoutMs = 28000) {
  if (!nlmKorpuAktivdirmi()) return Promise.resolve(null);
  const crypto = require("node:crypto");
  const sorguId = "nlm-" + crypto.randomUUID().slice(0, 8);

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      nlmCavabGozleyenler.delete(sorguId);
      resolve(null);
    }, timeoutMs);

    nlmCavabGozleyenler.set(sorguId, { resolve, timer });
    nlmSorguNovbesi.push({ sorguId, sual, vaxt: Date.now() });
  });
}

// ---- AGENT ADDIM 1: Sürətli (<1ms) Lokal Morfoloji və Domen Sinonim Planlayıcısı ----
const DOMEN_SINONIMLERI = [
  { acar: /ləğv|legv|geri qaytar|qaytarıl|dəqiqləşdir|deqiqlesdir|köhnə ay|kohne ay|əvvəlki ay|evvelki ay|növbəti ay|novbeti ay|bəyan etdiyim/i, elave: "Maddə 163 163.1 163.2 Maddə 72.4-1 72.5 Maddə 174.2 175.5 vergi tutulan dövriyyənin dəqiqləşdirilməsi qiymətləndirmə bazasında dəyişikliyin baş verdiyi hesabat dövründə cari ayın bəyannaməsi ləğv edilmiş elektron qaimə" },
  { acar: /əvəzləş|evezles|təsdiq|tesdiq|əsas ödəniş|esas odenis|fərqli ay|ferqli ay/i, elave: "Maddə 175 175.1 175.8 ƏDV əvəzləşdirilməsi elektron qaimə-faktura əsas ödəniş ƏDV depozit ən son hesabat dövrü fərqli aylar" },
  { acar: /dövriyyə|dovriyye|limit|hədd|hedd/i, elave: "illik gəlir həcmi 45000 200000 manat dövriyyə" },
  { acar: /45\s*000|45000|yetmiş beş|75\s*%|75\s*faiz/i, elave: "Maddə 102.1.30 102.1.30-1 106.1.20 fərdi mikro sahibkar 45 000 manat 75 faiz güzəşt 13 fəaliyyət sahəsi 3 işçi" },
  { acar: /pos|terminal|kassa|nka/i, elave: "POS-terminal 219 nömrəli qərar 2000 manat rüb orta aylıq dövriyyə nağdsız Maddə 58.7" },
  { acar: /nağd|nagd|hesablaşma|kassa limit/i, elave: "Nağdsız hesablaşmalar haqqında Qanun Maddə 3.3 3.4 30000 15000 manat aylıq nağd limit Maddə 58.7-1 1 faiz nağdlaşdırma" },
  { acar: /cərimə|cerime|sanksiya|pozuntu|gecikmə|faiz/i, elave: "Maddə 57 58 59 maliyyə sanksiyası 40 manat 50 faiz cərimə məbləği 0.1 faiz" },
  { acar: /qaimə|qaime|elektron qaimə|eqf/i, elave: "Maddə 71-1 175 176 elektron qaimə-faktura verilmə müddəti 5 gün təsdiqi əvəzləşdirmə Maddə 58.13" },
  { acar: /ədv|edv|əlavə dəyər|sıfır dərəcə|ixrac/i, elave: "Maddə 155 164 165 166 175 177 ƏDV əvəzləşdirmə 18 faiz 0 faiz qeydiyyat 200000 POS 0.5 əmsal" },
  { acar: /sadələşdirilmiş|sadelesdirilmis|topdansatış|b2b/i, elave: "Maddə 218 218.5 220 sadələşdirilmiş vergi 2 faiz 8 faiz 30 faiz həddi qadağan olunanlar" },
  { acar: /amortizasiya|əsas vəsait|esas vesait|təmir|temir|xərc/i, elave: "Maddə 108 109 114 115 əsas vəsaitlərin amortizasiyası təmir xərci norması qalıq dəyəri 2 əmsal" },
  { acar: /kənd|kend|təsərrüfat|teserrufat|fermer|emal/i, elave: "Maddə 13.2.60 Maddə 102.1.11 Maddə 106.1.14 164.1.18 kənd təsərrüfatı istehsal emal azadolma" },
  { acar: /dividend|təsisçi|tesisci|icarə|icare|royalti|qeyri-rezident|ömv/i, elave: "Maddə 122 123 124 125 ödəmə mənbəyində vergi dividend 5 faiz icarə 14 faiz qeyri-rezident 10 faiz" },
  { acar: /işçi|isci|əmək müqaviləsi|muzdlu|maaş|əməkhaqqı|sosial|mdss|its/i, elave: "Maddə 101.1 101.1-1 102 58.10 muzdlu iş 8000 manat sosial sığorta MDSS İTS 2000 manat cərimə" },
  { acar: /kameral|səyyar|seyyar|yoxlama|uyğunsuzluq|iddia müddəti/i, elave: "Maddə 37 38 85 kameral vergi yoxlaması 30 iş günü səyyar yoxlama 3 il" },
  { acar: /kassa metodu|hesablama metodu|avans|debitor/i, elave: "Maddə 130 131 132 166 kassa metodu hesablama metodu gəlir və xərclərin uçotu" },
  { acar: /əmlak|emlak|torpaq|yol vergisi|mədən/i, elave: "Maddə 197 199.14 203 206 209 215 əmlak vergisi 1 faiz mikro sahibkar azadolma torpaq vergisi" }
];

async function agentAxtarisPlaniQur(sual, aktivMenbeler = [], tenz = null) {
  const sorgular = [sual];

  // Mürəkkəb sualı tərkib hissələrinə (alt-suallara) parçala ki, hər şərt ayrıca axtarılsın
  const altHisseler = sual
    .split(/(?:,\s*(?:bəs|həmçinin|əgər|lakin|amma)|;\s*|\?\s+|\s+və\s+eyni\s+zamanda\s+)/i)
    .map(s => s.trim())
    .filter(s => s.length >= 18 && s !== sual);
  for (const h of altHisseler.slice(0, 2)) {
    sorgular.push(h);
  }

  // 1) Universal Sİ Sorğu Tərcüməçisi (İstənilən sənəd: Konstitusiya, Vergi, Əmək Məcəlləsi, Müqavilə və s. üçün danışıq dilini rəsmi termin və Maddə nömrələrinə çevirir)
  if (typeof ai.universalSorguPlanla === "function" && sual.length >= 10) {
    const aiSorgular = await ai.universalSorguPlanla({
      sual,
      aktivMenbeAdlari: aktivMenbeler.map(m => m.ad),
      tenz
    });
    for (const aq of aiSorgular) {
      sorgular.push(aq);
    }
  }

  // 2) Sürətli lokal domen sinonimləri (əlavə dəstək kimi)
  for (const s of DOMEN_SINONIMLERI) {
    if (s.acar.test(sual)) {
      sorgular.push(s.elave);
    }
  }

  if (sorgular.length === 1) {
    const ilkinKokler = db.sozKokleri(sual).map(k => k.tam);
    if (ilkinKokler.length > 0) {
      sorgular.push(ilkinKokler.join(" "));
    }
  }

  const unikalSorgular = Array.from(new Set(sorgular.filter(Boolean))).slice(0, 6);
  return {
    meqsed: "Universal Sİ Sorğu Tərcüməsi, Maddə-əsaslı axtarış və parçaların birləşdirilməsi",
    sorgular: unikalSorgular
  };
}

// ---- AGENT ADDIM 2: Bazada Çox-Mərhələli Dərin Axtarış və Qonşu Kontekst Birləşdirmə ----
async function agentDerinAxtarisEt({
  sorgular,
  qovluq_id = "all",
  gonderen = "",
  tarix_baslangic = "",
  tarix_son = "",
  menbe_nov = "",
  tenz
}) {
  const birleshmishParcalarMap = new Map();
  const gorulmusImzalar = new Set();
  const sorguUzreTapilanlar = [];
  const addimLoqlari = [];

  for (let i = 0; i < sorgular.length; i++) {
    const s = sorgular[i];
    const tapilanlar = db.hibridAxtar({
      sorgu: s,
      sorguVektoru: null,
      qovluq_id,
      gonderen,
      tarix_baslangic,
      tarix_son,
      menbe_nov,
      limit: 6
    });

    sorguUzreTapilanlar.push(tapilanlar);
    addimLoqlari.push(`🔍 Bucaq #${i + 1}: *"${s.slice(0, 85)}${s.length > 85 ? "..." : ""}"* → **${tapilanlar.length}** blok tapıldı.`);

    for (const p of tapilanlar) {
      const imza = db.azNormallashdir(p.metn).replace(/\s+/g, " ").trim().slice(0, 140);
      if (!birleshmishParcalarMap.has(p.id)) {
        if (gorulmusImzalar.has(imza)) continue;
        gorulmusImzalar.add(imza);
        birleshmishParcalarMap.set(p.id, { ...p, _bucaqIndex: i });
      } else {
        // Əgər eyni blok bir neçə fərqli sorğu bucağında tapılıbsa (kəsişən parça!), onun əhəmiyyət balını artır!
        const movcud = birleshmishParcalarMap.get(p.id);
        movcud.bal = Number((movcud.bal + p.bal * 0.75).toFixed(4));
      }
    }
  }

  // Balanslaşdırılmış Çox-Bucaqlı Seçim: Hər sorğu bucağından ən güclü 2 parçanı mütləq qoru ki, mürəkkəb sualın heç bir hissəsi itməsin!
  const secilmishIdler = new Set();
  const balansliSiyahi = [];

  for (const siyahi of sorguUzreTapilanlar) {
    let say = 0;
    for (const p of siyahi) {
      if (birleshmishParcalarMap.has(p.id) && !secilmishIdler.has(p.id)) {
        secilmishIdler.add(p.id);
        balansliSiyahi.push(birleshmishParcalarMap.get(p.id));
        say++;
        if (say >= 2) break;
      }
    }
  }

  // Qalan yerləri ümumi ən yüksək ballı parçalarla tamamla
  const butunSiralanmish = Array.from(birleshmishParcalarMap.values()).sort((a, b) => b.bal - a.bal);
  for (const p of butunSiralanmish) {
    if (!secilmishIdler.has(p.id) && balansliSiyahi.length < 11) {
      secilmishIdler.add(p.id);
      balansliSiyahi.push(p);
    }
  }

  // Bütöv Maddənin və Qonşu Bəndlərin Birləşdirilməsi (Full-Article & Neighbor Context Stitching):
  // Ən yüksək ballı 3 parçanın eyni maddəyə aid digər hissələrini və ya qonşu bəndlərini kontekstə qoş!
  if (balansliSiyahi.length > 0 && balansliSiyahi.length < 12 && typeof db.qonsuParcalariAl === "function") {
    for (const esasParca of balansliSiyahi.slice(0, 3)) {
      const qonsular = db.qonsuParcalariAl(esasParca.menbe_id, esasParca.sira, esasParca.basliq);
      for (const q of qonsular) {
        if (!secilmishIdler.has(q.id)) {
          const imza = db.azNormallashdir(q.metn).replace(/\s+/g, " ").trim().slice(0, 140);
          if (!gorulmusImzalar.has(imza)) {
            gorulmusImzalar.add(imza);
            secilmishIdler.add(q.id);
            balansliSiyahi.push({ ...q, bal: Number((esasParca.bal * 0.65).toFixed(4)) });
            addimLoqlari.push(`🔗 Bütöv maddə birləşdirilməsi: **"${q.basliq || q.menbe_adi}"** (#${q.sira}) kontekstə əlavə edildi.`);
            if (balansliSiyahi.length >= 12) break;
          }
        }
      }
      if (balansliSiyahi.length >= 12) break;
    }
  }

  // Əgər bazada sənədlər var amma spesifik açar sözlə az blok çıxıbsa, hər aktiv mənbənin xülasə/pasport və ilk bloklarını da kontekstə qat!
  const aktivMenbeler = db.menbeleriAl(qovluq_id).filter(m => m.aktiv === 1 && (!menbe_nov || m.nov === menbe_nov));
  if (balansliSiyahi.length < 3 && aktivMenbeler.length > 0) {
    for (const m of aktivMenbeler.slice(0, 5)) {
      const detal = db.menbeDetaliAl(m.id);
      if (detal && Array.isArray(detal.parcalar)) {
        for (const p of detal.parcalar.slice(0, 2)) {
          if (!secilmishIdler.has(p.id)) {
            secilmishIdler.add(p.id);
            balansliSiyahi.push({
              ...p,
              menbe_id: m.id,
              menbe_adi: m.ad,
              menbe_novu: m.nov,
              bal: 0.2
            });
          }
        }
      }
    }
    addimLoqlari.push(`📚 Aktiv mənbələrin ümumi struktur və pasport məlumatları kontekstə əlavə edildi.`);
  }

  const siralanmish = balansliSiyahi
    .sort((a, b) => b.bal - a.bal)
    .slice(0, 12);

  return {
    parcalar: siralanmish,
    addimLoqlari,
    aktivMenbeler
  };
}

// ---- AGENT ADDIM 3: Dərin Analitik Sintez (Gemini Deep Thinking + Parçaların Birləşdirilməsi) ----
async function agentSualCavabla({
  sual,
  qovluq_id = "all",
  gonderen = "",
  tarix_baslangic = "",
  tarix_son = "",
  menbe_nov = "",
  derin_rejim = null
}) {
  const baslangicVaxt = Date.now();
  const tenz = db.tenzimlemeleriAl();
  const aktivDerinRejim = derin_rejim !== null ? Boolean(derin_rejim) : (tenz.derin_rejim !== "0");
  const dusunmeAddimlari = [];

  // 1) Birbaşa yaddaş əmri və ya İstifadəçi Ekspert Düzəlişi (Active Learning Loop) varmı?
  const yaddasEmri = sual.match(/^(?:yadda saxla ki|unutma ki|qeyd et ki|yadda saxla\s*[:-])\s*(.+)/i);
  const duzelisEmri = !yaddasEmri && sual.length > 35 && /(?:düzgün təhlil etmədin|bəyənmədim|səhvdir|əslində belədir|şərti belədi|qaydası belədir|qəbul edilir)/i.test(sual);

  if (yaddasEmri && yaddasEmri[1]) {
    db.yaddasElaveEt({
      kateqoriya: "qayda",
      metn: yaddasEmri[1].trim(),
      menbe: "Birbaşa Təlimat",
      vaciblik: 5
    });
    dusunmeAddimlari.push(`📌 İstifadəçi təlimatı birbaşa Uzunmüddətli Şəxsi Yaddaşa yazıldı.`);
  } else if (duzelisEmri) {
    db.yaddasElaveEt({
      kateqoriya: "qayda",
      metn: `QIZIL QAYDA (İstifadəçi Düzəlişi): ${sual.slice(0, 350).trim()}`,
      menbe: "Ekspert Əks-Əlaqə",
      vaciblik: 5
    });
    dusunmeAddimlari.push(`📌 İstifadəçinin ekspert düzəlişi "Qızıl Qayda" olaraq Uzunmüddətli Yaddaşa əlavə edildi.`);
  }

  const aktivMenbeler = db.menbeleriAl(qovluq_id).filter(m => m.aktiv === 1);
  dusunmeAddimlari.push(`🗂️ Aktiv Baza yoxlanıldı: **${aktivMenbeler.length}** mənbə (${aktivMenbeler.map(m => m.ad).slice(0, 5).join(", ") || "boşdur"}).`);

  // 2) Agent Axtarış Planı qurur (Universal Sİ Sorğu Tərcüməçisi + Maddə/Termin Planlayıcısı)
  const plan = await agentAxtarisPlaniQur(sual, aktivMenbeler, tenz);
  dusunmeAddimlari.push(`🧭 Analiz Planı: *${plan.meqsed}* | Axtarış bucaqları: ${plan.sorgular.map(q => `\`${q}\``).join(", ")}`);

  // 3) Bazada Çox-Bucaqlı Dərin Axtarış
  const { parcalar: tapilanParcalar, addimLoqlari } = await agentDerinAxtarisEt({
    sorgular: plan.sorgular,
    qovluq_id,
    gonderen,
    tarix_baslangic,
    tarix_son,
    menbe_nov,
    tenz
  });
  dusunmeAddimlari.push(...addimLoqlari);

  // 4) Google Gemini File API (yalnız lokal axtarışda heç bir mətn tapılmadıqda bulud fayllarına müraciət et ki, sürət 5x artsın!)
  const geminiFileParts = [];
  if (tapilanParcalar.length === 0 && tenz.gemini_api_key && (tenz.ai_provayder || "gemini") === "gemini") {
    for (const m of aktivMenbeler.slice(0, 4)) {
      try {
        const gFile = await geminiFiles.menbeniGeminiIleSinxronEt(m, tenz.gemini_api_key);
        if (gFile && gFile.uri) {
          geminiFileParts.push({
            menbe_id: m.id,
            ad: m.ad,
            uri: gFile.uri,
            mimeType: gFile.mimeType
          });
        }
      } catch (_) {}
    }
    if (geminiFileParts.length > 0) {
      dusunmeAddimlari.push(`☁️ **${geminiFileParts.length}** sənəd birbaşa Gemini Kontekst Mühərrikinə bağlandı.`);
    }
  }

  // Sitatları nömrələ
  const sitatlar = tapilanParcalar.map((p, idx) => ({
    nomre: idx + 1,
    parca_id: p.id,
    menbe_id: p.menbe_id,
    menbe_adi: p.menbe_adi,
    menbe_novu: p.menbe_novu,
    basliq: p.basliq,
    gonderen: p.gonderen,
    tarix: p.tarix,
    metn: p.metn,
    bal: p.bal
  }));

  // Hər aktiv mənbənin Pasport məlumatlarını (məbləğlər, tarixlər, VÖEN-lər) topla
  const pasportXulasesi = aktivMenbeler.slice(0, 10).map(m => {
    const p = m.meta?.pasport || {};
    const hisseler = [`- **${m.ad}** (${m.xulase})`];
    if (p.meblegler?.length) hisseler.push(`  Məbləğlər/Rəqəmlər: ${p.meblegler.slice(0, 10).join(", ")}`);
    if (p.tarixler?.length) hisseler.push(`  Tarixlər: ${p.tarixler.slice(0, 10).join(", ")}`);
    if (p.kodlar?.length) hisseler.push(`  VÖEN/Kodlar: ${p.kodlar.slice(0, 8).join(", ")}`);
    return hisseler.join("\n");
  }).join("\n");

  const menbeKonteksti = sitatlar.length > 0
    ? sitatlar.map(s => {
        const metaHisse = [
          `Mənbə: ${s.menbe_adi} (${s.menbe_novu})`,
          s.gonderen ? `Şəxs: ${s.gonderen}` : null,
          s.tarix ? `Tarix: ${s.tarix}` : null,
          s.basliq ? `Hissə: ${s.basliq}` : null
        ].filter(Boolean).join(" | ");
        return `=== [Mənbə ${s.nomre}] (${metaHisse}) ===\n${s.metn}`;
      }).join("\n\n")
    : "Bazada bu sorğuya birbaşa uyğun parça tapılmadı.";

  const sexsiYaddas = db.yaddaslariAl().slice(0, 25);
  const yaddasKonteksti = sexsiYaddas.length > 0
    ? sexsiYaddas.map(y => `- [${y.kateqoriya.toUpperCase()}] ${y.metn}`).join("\n")
    : "Hələ xüsusi yaddaş qeydi yoxdur.";

  const tarixce = db.sohbetleriAl(qovluq_id, 6);

  const sistemPromptu = `${tenz.sistem_telimati || "Sən istifadəçinin yüksək intellektli Şəxsi AI Agentisən (Gemini / Claude / ChatGPT və NotebookLM hibridi)."}

SƏNİN ROLUN VƏ DƏRİN ANALİTİK METODOLOGİYAN:
1. Sən istifadəçinin universal intellektə malik Şəxsi AI Agentisən (İkinci Beyin). Sən **Hüquq, Konstitusiya, Vergi və Mühasibatlıq, Fəlsəfə, Dünyagörüşü, İdarəetmə, Kitablar, Texnologiya və Şəxsi Qeydlər** daxil olmaqla, istifadəçinin sualını və əlavə etdiyi mənbələri dərindən oxuyub **təhlil edən, tənqidi düşünən, arqumentləri tutuşduran və yetkin ekspert fikri/qərarı bildirən** baş məsləhətçisən.

2. **DAXİLİ 5-ADDIMLI DƏRİN ANALİZ VƏ PARÇALARI BİRLƏŞDİRMƏ PROTOKOLU (Cavab yazmazdan əvvəl mütləq icra et):**
   - **Addım A (Parametrlərin Parçalanması):** İstifadəçinin sualındakı BÜTÜN şərtləri tək-tək ayır (məsələn: sənəd şərti + əsas məbləğ ödənişi + ƏDV depozit ödənişi + fərqli tarixlər/aylar + subyektin hüquqi statusu + dövriyyə həddi + işçi sayı + fəaliyyət sahəsi). Heç bir parametri diqqətdən kənarda qoyma!
   - **Addım B (Maddə və Qızıl Qayda Uyğunlaşdırması):** Əvvəlcə aşağıdakı "UZUNMÜDDƏTLİ ŞƏXSİ YADDAŞ"dakı Qızıl Qaydaları və "TAPILMIŞ SİTAT BLOKLARI"ndakı rəsmi maddələri yoxla.
   - **Addım C (Parçaların Birləşdirilməsi — Cross-Piece Synthesis):** Sual bir neçə fərqli mövzunu (məsələn: həm sadələşdirilmiş vergi, həm POS-terminal, həm nağd limit, həm də işçi cəriməsi) və ya fərqli sənədləri əhatə edirsə, hər bir parçanı tapdığın müvafiq maddə ilə əlaqələndirib vahid məntiqi zəncir qur!
   - **Addım D (Kəsişən Şərtlər və İstisnalar):** Əgər əməliyyatın tərkib hissələri fərqli vaxtlarda/aylarda baş verirsə və ya bir neçə şərt eyni vaxtda tələb olunursa, təkcə bir şərti (məsələn, yalnız qaimənin təsdiq tarixini) götürüb səhv nəticə çıxarma — bütün şərtlərin tamamlandığı YEKUN (ƏN SON) tarixi və istisnaları əsas götür!
   - **Addım E (Müfəttiş Özünü-Tənqidi):** Cavabı bitirməzdən əvvəl özünə sual ver: *"İstifadəçinin sualındakı hər bir hissəni birləşdirdimmi? Dəqiq maddə, rəqəm və praktik misalla tam cavab verdimmi?"*

3. **SUALIN AYDINLIQ DƏRƏCƏSİ VƏ DƏQİQLƏŞDİRİCİ ƏKS-SUAL QAYDASI (MÜTLƏQ ƏMƏL ET!):**
   - **Hal A (Sual heç aydın deyilsə / kontekstsizdirsə):** Əgər istifadəçinin sualı çox qısa və ya tamamilə qeyri-müəyyəndirsə (hansı sənəd, hansı əməliyyat və ya nə soruşulduğu heç bəlli deyilsə), təxmin yürütmə! Birbaşa "### ❓ Dəqiqləşdirici Sual:" başlığı altında məsələni dəqiq araşdırmaq üçün lazım olan 2-3 konkret sualı istifadəçiyə ünvanla.
   - **Hal B (Sualın böyük bir qismi aydındırsa, lakin bəzi hallar/detallar qeyd edilməyibsə):** Əvvəlcə sualın aydın olan hissəsini bütün mümkün ssenariləri (məs: həm əsas qayda, həm istisna; həm A tərəfi, həm B tərəfi) əhatə etməklə dərindən araşdırıb tam cavablandır. Daha sonra cavabın görünən hissəsinin sonunda (<DETALLI_ANALIZ> teqindən əvvəl) "**❓ Dəqiqləşdirmə (Sizin konkret halınız üçün):**" sətri ilə çatışmayan detalı istifadəçidən soruş.

4. **İKİ-MƏRHƏLƏLİ CAVAB STRUKTURU (Sual aydın olduqda və ya Hal B-də HƏR ZAMAN BU FORMATDA YAZ):**

   HİSSƏ 1 (Giriş hissəsi — Açılışda görünən yığcam ekspert qərarı):
   ### 📌 Konkret və Qısa Cavab:
   - Sualın birbaşa, ən vacib hüquqi/analitik qərarını, bütün şərtlərin kəsişmə nəticəsini, dəqiq maddə nömrəsini və rəqəmləri 3-4 maddə ilə çox aydın, yığcam və konkret yaz.
   - Mənbədən götürülən faktların sonuna mütləq [1], [2] kimi sitat nömrəsi qoy.
   - Əgər sualda bəzi fərdi parametrlər (məs: subyektin statusu, vergi rejimi, müqavilə şərti və s.) qeyd edilməyibsə, bu hissənin sonuncu bəndi kimi **❓ Dəqiqləşdirici Sual:** qoyub istifadəçiyə həmin sualı ünvanla.

   HİSSƏ 2 (Geniş təhlil — <DETALLI_ANALIZ> teqləri daxilində 4-bəndli Ekspert Matrisi):
   <DETALLI_ANALIZ>
   ### 🔍 Geniş Təhlil, Şərtlər və Hüquqi/Nəzəri Əsaslar:
   #### 1. Tələb Olunan Bütün Şərtlər və Parçaların Birləşdirilməsi:
   - Məsələnin həlli üçün eyni vaxtda ödənməli olan bütün şərtləri və fərqli maddələrin bir-biri ilə əlaqəsini [1], [2] sitatları ilə izah et.
   #### 2. Xüsusi Hallar, İstisnalar və Məhdudiyyətlər:
   - Fərqli tarixlər, hədlər, istisnalar və sanksiya risklərini göstər.
   #### 3. Praktiki Keys (Rəqəmli / Tarixli Nümunə):
   - Sualdakı vəziyyəti konkret aylar və ya rəqəmlər üzərində addım-addım hesablayıb nümayiş etdir.
   #### 4. Ekspert Tövsiyəsi:
   - İstifadəçinin praktikada səhv etməməsi üçün yekun peşəkar məsləhət ver.
   </DETALLI_ANALIZ>

   HİSSƏ 3 (Mövzunu dərinləşdirən 2-3 ağıllı növbəti sual — <NOVBETI_SUALLAR> teqləri daxilində):
   <NOVBETI_SUALLAR>
   - Mövzu ilə bağlı istifadəçinin soruşa biləcəyi 1-ci konkret, praktik sual?
   - Mövzu ilə bağlı 2-ci konkret sual?
   </NOVBETI_SUALLAR>

5. **Mənbə Şəffaflığı:**
   - Fakt TAPILMIŞ SİTAT BLOKLARI içində varsa, mütləq həmin blokun nömrəsini [1], [2] kimi göstər.
   - Fakt sitat bloklarında yoxdursa və öz ümumi hüquqi/ekspert biliyinlə tamamlayırsansa, uydurma sitat nömrəsi qoyma və bunu açıq qeyd et.
6. **Avtomatik Şəxsi Yaddaş:** İstifadəçinin maraqlarına, iş qaydalarına aid vacib məqamları yadda saxla:
<YADDAŞ kateqoriya="fakt|qayda|tapşırıq|şəxs">Qısa fakt</YADDAŞ>

UZUNMÜDDƏTLİ ŞƏXSİ YADDAŞ (QIZIL QAYDALAR — BİRİNCİ DƏRƏCƏLİ ÜSTÜNLÜK!):
${yaddasKonteksti}`;

  const istifadeciPromptu = `BAZADAKI AKTİV SƏNƏDLƏRİN PASPORTU:
${pasportXulasesi || "Hələ sənəd yüklənməyib."}

TAPILMIŞ SİTAT BLOKLARI:
${menbeKonteksti}

İSTİFADƏÇİNİN SUALI / TAPŞIRIĞI:
${sual}`;

  let xamCavab = await ai.llmCagir({
    sistemPromptu,
    istifadeciPromptu,
    geminiFileParts,
    tarixce,
    tenz,
    derinRejim: aktivDerinRejim
  });

  const sonMelumat = ai.llmCagir.sonMelumat || {};
  if (sonMelumat.model) {
    dusunmeAddimlari.push(
      `🧠 Analitik Mühərrik: **${sonMelumat.model}** (${sonMelumat.derinRejim ? "Dərin Təfəkkür / Thinking Rejimi Aktiv" : "Sürətli Rejim"})`
    );
  }
  if (sonMelumat.daxiliDusunce) {
    const qisaDusunce = sonMelumat.daxiliDusunce
      .replace(/\n+/g, " ")
      .trim()
      .slice(0, 420);
    dusunmeAddimlari.push(`💭 Daxili Analitik Mühakimə (Chain-of-Thought): *${qisaDusunce}${sonMelumat.daxiliDusunce.length > 420 ? "..." : ""}*`);
  }

  if (!xamCavab) {
    xamCavab = ai.lokalAnalitikCavabQur(sual, sitatlar);
  }

  const muddetSan = ((Date.now() - baslangicVaxt) / 1000).toFixed(1);
  dusunmeAddimlari.push(`⚡ Analiz **${muddetSan} saniyəyə** tamamlandı (${sitatlar.length} mənbə bloku birləşdirildi).`);

  const yeniYaddaslar = [];
  const temizCavab = xamCavab
    .replace(/<YADDAŞ(?:\s+kateqoriya="([^"]*)")?>([\s\S]*?)<\/YADDAŞ>/gi, (_, kat, m) => {
      if (tenz.avto_yaddas !== "0" && m && m.trim()) {
        const elave = db.yaddasElaveEt({
          kateqoriya: kat || "fakt",
          metn: m.trim(),
          menbe: "Agent Analizi",
          vaciblik: 4
        });
        if (elave) yeniYaddaslar.push(elave);
      }
      return "";
    })
    .replace(/(?:---\s*)?\*\*Yadda saxlanılmalı[^*]*\*\*[\s\S]*$/i, "")
    .trim();

  db.sohbetElaveEt({ qovluq_id, rol: "user", metn: sual, sitatlar: [] });
  const saxlanilanCavab = db.sohbetElaveEt({
    qovluq_id,
    rol: "assistant",
    metn: temizCavab,
    sitatlar: sitatlar.map(s => ({ ...s, dusunmeAddimlari }))
  });

  return {
    cavab: saxlanilanCavab,
    sitatlar,
    dusunmeAddimlari,
    yeniYaddaslar,
    notebooklmFaylSayi: geminiFileParts.length
  };
}

module.exports = {
  agentSualCavabla,
  nlmKorpuDurumuYenile,
  nlmKorpuVeziyyeti,
  nlmNövbəniAl,
  nlmCavabQebulEt
};
