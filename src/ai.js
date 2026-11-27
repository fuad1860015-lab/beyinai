// Hibrid AI Mühərriki (v4.5 — Google Gemini File API / NotebookLM Mühərriki + Avtomatik Model Keçidi):
// 1) Google Gemini File API (NotebookLM-in öz arxa mühərriki: PDF, Səs, Şəkil və Çatları birbaşa fileData URI ilə oxuyur!)
// 2) Avtomatik Çox-Modelli Ehtiyat Zənciri (gemini-3-flash-preview -> gemini-3.1-flash-lite-preview -> gemini-flash-lite-latest)
// 3) Daxili Pulsuz Bulud AI + Groq + Ollama
"use strict";

const db = require("./db");
const geminiFiles = require("./gemini-files");

// Aktiv və dərin düşünmə qabiliyyətli Gemini modelləri siyahısı (zəif lite modelə düşməzdən əvvəl güclü gemini-flash-latest yoxlanır!)
const GEMINI_DERIN_MODELLER = [
  "gemini-3-flash-preview",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite-preview",
  "gemini-flash-lite-latest"
];

const GEMINI_SURETLI_MODELLER = [
  "gemini-3-flash-preview",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite-preview",
  "gemini-flash-lite-latest"
];

function geminiModelSiyahisiAl(secilmishModel, derinRejim = true) {
  const bazaSiyahi = derinRejim ? GEMINI_DERIN_MODELLER : GEMINI_SURETLI_MODELLER;
  const kohneYararsiz = !secilmishModel || secilmishModel === "gemini-2.5-flash" || secilmishModel === "gemini-2.5-pro";
  if (kohneYararsiz) {
    return bazaSiyahi;
  }
  const temiz = secilmishModel.trim();
  if (derinRejim && (temiz === "gemini-flash-lite-latest" || temiz === "gemini-3.1-flash-lite-preview")) {
    return bazaSiyahi;
  }
  return Array.from(new Set([temiz, ...bazaSiyahi]));
}

// ---- 1. Vektorlaşdırma (Embeddings) ----
async function vektorYarat(metn, tenz = null) {
  const t = tenz || db.tenzimlemeleriAl();
  const temiz = String(metn || "").trim().slice(0, 6000);
  if (!temiz) return null;

  try {
    if (t.ai_provayder === "ollama") {
      const url = (t.ollama_url || "http://127.0.0.1:11434").replace(/\/$/, "");
      const model = t.ollama_embed_model || "nomic-embed-text";
      const res = await fetch(`${url}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: temiz }),
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.embedding) && data.embedding.length > 0) return data.embedding;
      }
    }

    if (t.gemini_api_key || process.env.GEMINI_API_KEY) {
      const key = (t.gemini_api_key || process.env.GEMINI_API_KEY || "").trim();
      const embedModeller = ["gemini-embedding-001", "text-embedding-004"];
      for (const em of embedModeller) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${em}:embedContent`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-goog-api-key": key
              },
              body: JSON.stringify({
                model: `models/${em}`,
                content: { parts: [{ text: temiz }] }
              }),
              signal: AbortSignal.timeout(8000)
            }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.embedding && Array.isArray(data.embedding.values) && data.embedding.values.length > 0) {
              return data.embedding.values;
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
  return null;
}

let vektorIsiVeziyyet = {
  gedir: false,
  cemi: 0,
  hazir: 0,
  ugurlu: 0,
  xeta: 0,
  sonBitme: null,
  sonXeta: ""
};

function vektorIsiVeziyyetiAl() {
  return { ...vektorIsiVeziyyet, baza: db.vektorStatistikasiAl() };
}

async function menbeVektorlashdir(menbeDetali) {
  if (!menbeDetali) return;
  const t = db.tenzimlemeleriAl();
  const key = (t.gemini_api_key || process.env.GEMINI_API_KEY || "").trim();
  const gecerliGeminiKey = key.length >= 20;

  if (gecerliGeminiKey) {
    try {
      await geminiFiles.menbeniGeminiIleSinxronEt(menbeDetali, key);
    } catch (_) {}
  }

  if (!Array.isArray(menbeDetali.parcalar)) return;
  if (!gecerliGeminiKey && t.ai_provayder !== "ollama") return;

  // Yalnız vektoru olmayan parçaları seç (maksimum 100 parça)
  const siyahı = menbeDetali.parcalar.filter(p => !p.vektor).slice(0, 100);
  for (const p of siyahı) {
    const metn = `${p.basliq ? p.basliq + "\n" : ""}${p.gonderen ? "Göndərən: " + p.gonderen + "\n" : ""}${p.metn}`;
    const v = await vektorYarat(metn, t);
    if (v) {
      db.parcaVektorYenile(p.id, v);
    } else {
      break;
    }
  }
}

/**
 * Bazadakı bütün vektorsuz parçaları təhlükəsiz partiyalarla (batch) semantik vektorlaşdırır
 */
async function butunBazaniVektorlashdir({ batchOlcu = 5, gecikmeMs = 250, onProgress = null } = {}) {
  if (vektorIsiVeziyyet.gedir) {
    return { ok: false, gedir: true, mesaj: "Vektorlaşdırma prosesi artıq arxa planda gedir.", veziyyet: vektorIsiVeziyyetiAl() };
  }

  const t = db.tenzimlemeleriAl();
  const key = (t.gemini_api_key || process.env.GEMINI_API_KEY || "").trim();
  if (key.length < 20 && t.ai_provayder !== "ollama") {
    return { ok: false, mesaj: "Semantik vektorlaşdırma üçün Gemini API açarı və ya Ollama lazımdır.", veziyyet: vektorIsiVeziyyetiAl() };
  }

  const siyahi = db.vektorsuzParcalariAl(2000);
  if (siyahi.length === 0) {
    return { ok: true, ugurlu: 0, xeta: 0, cemi: 0, mesaj: "✅ Bazadakı bütün parçalar artıq 100% semantik vektorlaşdırılıb!", veziyyet: vektorIsiVeziyyetiAl() };
  }

  vektorIsiVeziyyet = {
    gedir: true,
    cemi: siyahi.length,
    hazir: 0,
    ugurlu: 0,
    xeta: 0,
    sonBitme: null,
    sonXeta: ""
  };

  let ardicilXeta = 0;

  try {
    for (let i = 0; i < siyahi.length; i += batchOlcu) {
      const partiya = siyahi.slice(i, i + batchOlcu);
      const neticeler = await Promise.all(
        partiya.map(async p => {
          const metn = `${p.basliq ? p.basliq + "\n" : ""}${p.gonderen ? "Göndərən: " + p.gonderen + "\n" : ""}${p.metn}`;
          const v = await vektorYarat(metn, t);
          if (v) {
            db.parcaVektorYenile(p.id, v);
            return true;
          }
          return false;
        })
      );

      for (const ugur of neticeler) {
        vektorIsiVeziyyet.hazir++;
        if (ugur) {
          vektorIsiVeziyyet.ugurlu++;
          ardicilXeta = 0;
        } else {
          vektorIsiVeziyyet.xeta++;
          ardicilXeta++;
        }
      }

      if (typeof onProgress === "function" && (vektorIsiVeziyyet.hazir % 50 === 0 || vektorIsiVeziyyet.hazir === siyahi.length)) {
        try { await onProgress(vektorIsiVeziyyetiAl()); } catch (_) {}
      }

      if (ardicilXeta >= 8) {
        vektorIsiVeziyyet.sonXeta = "API sorğu limiti və ya şəbəkə xətası səbəbilə proses dayandırıldı.";
        break;
      }

      if (i + batchOlcu < siyahi.length && gecikmeMs > 0) {
        await new Promise(r => setTimeout(r, gecikmeMs));
      }
    }
  } finally {
    vektorIsiVeziyyet.gedir = false;
    vektorIsiVeziyyet.sonBitme = Date.now();
  }

  const stat = db.vektorStatistikasiAl();
  return {
    ok: vektorIsiVeziyyet.ugurlu > 0 || stat.qaliq === 0,
    ugurlu: vektorIsiVeziyyet.ugurlu,
    xeta: vektorIsiVeziyyet.xeta,
    cemi: siyahi.length,
    sonXeta: vektorIsiVeziyyet.sonXeta,
    veziyyet: vektorIsiVeziyyetiAl(),
    mesaj:
      `🧠 <b>Semantik Vektor İndeksləməsi Tamamlandı!</b>\n` +
      `• ✅ Yeni vektorlaşdırılan: <b>${vektorIsiVeziyyet.ugurlu}</b> parça\n` +
      `• ⚠️ Xəta/Dayanma: <b>${vektorIsiVeziyyet.xeta}</b>\n` +
      `• 📊 Ümumi baza əhatəsi: <b>${stat.vektorlu} / ${stat.cemi} (${stat.faiz}%)</b>` +
      (vektorIsiVeziyyet.sonXeta ? `\n• ℹ️ Qeyd: <i>${vektorIsiVeziyyet.sonXeta}</i>` : "")
  };
}

// ---- 2. Multimodal Analiz: Səsli Mesajlar (Voice) və Şəkillər / Skan PDF (Vision OCR) ----
async function mediaAnalizEt({ buffer, mimeType = "", faylAdi = "media", xususiPrompt = "" }) {
  const t = db.tenzimlemeleriAl();
  const isAudio = mimeType.startsWith("audio/") || /\.(ogg|opus|mp3|wav|m4a)$/i.test(faylAdi);
  const isImage = mimeType.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(faylAdi);
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(faylAdi);

  if (isAudio && t.groq_api_key && !t.gemini_api_key) {
    try {
      const form = new FormData();
      const blob = new Blob([buffer], { type: mimeType || "audio/ogg" });
      form.append("file", blob, faylAdi);
      form.append("model", "whisper-large-v3-turbo");
      form.append("response_format", "json");

      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${t.groq_api_key.trim()}` },
        body: form,
        signal: AbortSignal.timeout(40000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.text) return { ugurlu: true, metn: data.text.trim(), usul: "Groq Whisper" };
      }
    } catch (_) {}
  }

  if (t.gemini_api_key) {
    try {
      const key = t.gemini_api_key.trim();
      const gMime = geminiFiles.geminiMimeTeyinEt(faylAdi, mimeType);

      const fileObj = await geminiFiles.geminiServereYukle({
        buffer,
        mimeType: gMime,
        displayName: faylAdi,
        apiKey: key
      });

      let prompt = "";
      if (isAudio) {
        prompt =
          "Bu səs yazısını (səsli mesajı) diqqətlə dinlə və tam olaraq danışılan dildə (Azərbaycan, Rus, Türk və ya İngilis) sözbəsöz mətnə çevir (transkripsiya et). Əgər səsdə vacib rəqəmlər, tarixlər, adlar və ya tapşırıqlar varsa, mətnin sonunda '[Qısa Xülasə]:' başlığı ilə 1-2 cümləlik xülasə də əlavə et.";
      } else if (isImage) {
        prompt =
          "Bu şəkli (skrinşot, sənəd, qaimə, çek və ya çat şəkli) detallı analiz et. Şəkildəki BÜTÜN yazıları, rəqəmləri, tarixləri, məbləğləri və cədvəlləri olduğu kimi oxuyub çıxar (OCR).";
      } else if (isPdf) {
        prompt =
          xususiPrompt ||
          "Bu PDF sənədinin əsas məzmununu, bölmələrini, vacib maddələrini, rəqəmlərini və tarixlərini strukturlaşdırılmış mətn kimi çıxar.";
      }

      const modeller = geminiModelSiyahisiAl(t.gemini_model);
      for (const model of modeller) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-goog-api-key": key
              },
              body: JSON.stringify({
                contents: [
                  {
                    role: "user",
                    parts: [
                      { fileData: { mimeType: fileObj.mimeType, fileUri: fileObj.uri } },
                      { text: prompt }
                    ]
                  }
                ],
                generationConfig: { temperature: 0.1 }
              }),
              signal: AbortSignal.timeout(25000)
            }
          );

          if (res.ok) {
            const data = await res.json();
            const cavabMetn = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n").trim();
            if (cavabMetn) {
              return {
                ugurlu: true,
                metn: cavabMetn,
                usul: `NotebookLM / Gemini File API (${model})`,
                gemini_file: fileObj
              };
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  return {
    ugurlu: false,
    metn: `[Media faylı: ${faylAdi} (${mimeType}). Səs və ya şəklin birbaşa NotebookLM mühərriki ilə oxunması üçün sağ yuxarıdakı ⚙️ AI Mühərriki bölməsindən pulsuz Gemini API açarı əlavə edin.]`,
    usul: "İlkin Qeyd"
  };
}

// ---- 3. Offline Analitik Sintezator ----
function metniCumlelereBol(metn) {
  const birleshmish = String(metn || "")
    .replace(/\r\n/g, "\n")
    // Parça başlığındakı "[Maddə 115... — davamı]" və praktiki keys sual etiketlərini təmizlə ki, yarımçıq cümlə kimi çıxmasın
    .replace(/^\[[^\]]*?—\s*davamı\]\s*/gim, "")
    .replace(/^(?:🎯|✅)\s*\[[^\]]+\]\s*/gim, "")
    .replace(/^Sual\s*\/\s*Mövzu:[^\n]+\n?/gim, "")
    .replace(/([a-zəıöüşçğ,])\n+([a-zəıöüşçğ])/gi, "$1 $2");

  return birleshmish
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZƏİÖÜŞÇĞ0-9IVX])/g)
    .map(c => c.replace(/^[-•*]+\s*/, "").replace(/\s+/g, " ").trim())
    .filter(c => c.length >= 35 && !/—\s*davamı\]$/i.test(c));
}

function lokalAnalitikCavabQur(sual, sitatlar, uygunQizilQaydalar = null, ziddiyyetQeydi = "") {
  const sualKicik = db.azKicilt(sual || "");
  const sualdaCerimeVar = /(?:cərimə|cerime|sanksiya|faiz|məsuliyyət)/i.test(sualKicik);

  const qizillar = Array.isArray(uygunQizilQaydalar)
    ? uygunQizilQaydalar
    : (typeof db.aktualYaddaslariAl === "function" ? db.aktualYaddaslariAl(sual, 10).uygunQizilQaydalar : []);

  const qizilSetirler = qizillar.slice(0, 2).map(q => {
    const temizQayda = String(q.metn || "").replace(/^QIZIL\s*QAYDA(?:\s*\([^)]*\))?:\s*/i, "").trim();
    return `- 🎯 **[Təsdiqlənmiş Qayda]:** ${temizQayda}`;
  });

  if ((!sitatlar || sitatlar.length === 0) && qizilSetirler.length === 0) {
    return `Bu sual üzrə daxili aktiv mənbələrdə uyğun sənəd tapılmadı. Sol paneldən PDF, Word, Excel yükləyə və ya yuxarı sağdakı ⚙️ Tənzimləmələr bölməsindən AI API açarı daxil edərək universal cavab ala bilərsiniz.`;
  }

  // 1) Xüsusi İntellektual Sintez: Kassa çeki ilə malların/xidmətlərin xərcə salınması (Maddə 109.8)
  const isKassaCekiXerc = /(?:kassa|nka)\s*çek[iü]?.*(?:xərc|mənfəət|gəlirdən|alınan|mal)|xərc.*(?:kassa|nka)\s*çek[iü]?/i.test(sualKicik);
  if (isKassaCekiXerc) {
    const p109 = (sitatlar || []).find(s => String(s.metn || "").includes("109.8") || String(s.basliq || "").includes("109"));
    const nomre = p109 ? p109.nomre : 1;

    return `### 📌 Ekspert Qərarı və Xülasə:

- **Mallar üzrə (Bəli, 2% limiti ilə):** Vergi Məcəlləsinin 109.8-ci maddəsinə əsasən, vergi ödəyicilərindən yeni nəsil NKA (kassa) çeki ilə alınan **mallar** üzrə xərclər vergi ödəyicisinin hər il üçün gəlirlərinin və xərclərinin ən yüksəyinin **2 faizi həddində** mənfəət bəyannaməsində gəlirdən çıxılan xərclərə aid edilə bilər [${nomre}].
- **Xidmət və İşlər üzrə (Xeyr, qəti qadağandır):** Xidmət və işlərin kassa çeki ilə xərcə salınmasına qanunvericilik icazə vermir. Xidmətlərin xərc kimi tanınması üçün mütləq **elektron qaimə-faktura (və ya təhvil-təslim aktı)** tələb olunur.
- **2%-dən yuxarı məbləğ:** 2 faizlik həddi aşan hissə mənfəət vergisi məqsədləri üçün gəlirdən çıxılmayan xərc hesab edilir.

<DETALLI_ANALIZ>
### 🔍 Qanunvericilik Normaları və Tətbiq Şərtləri:

#### 📋 1. Məcəllənin 109.8-ci Maddəsinin Tələbi:
- Nəzarət-kassa aparatının (NKA) çeki bu Məcəllənin 50.8-ci maddəsinin tələblərinə tam cavab verməlidir (fiskal ID, malın adı, miqdarı, VÖEN aydın görünməlidir) [${nomre}].
- Limit hesablanarkən vergi ödəyicisinin illik gəlir və xərclərindən hansı daha yüksəkdirsə, həmin məbləğin 2%-i baza götürülür.

#### 🚫 2. Xüsusi İstisnalar (Heç vaxt kassa çeki ilə xərcə salına bilməz):
- Daşınmaz əmlak, avtomobil nəqliyyatı vasitələri və daşınar əsas vəsaitlərin alışı;
- Qiymətli daşlar, qiymətli metallar və onlardan hazırlanmış məmulatlar;
- "Nağdsız hesablaşmalar haqqında" Qanunun 3.5-ci maddəsində göstərilən xüsusi mallar.
</DETALLI_ANALIZ>

<NOVBETI_SUALLAR>
- Bəs illik gəlir və xərclərin 2% limiti vergi bəyannaməsində hansı sətirdə göstərilir?
- NKA çeki itdikdə və ya silindikdə onun dublikatı ilə xərc təsdiqlənə bilərmi?
</NOVBETI_SUALLAR>`;
  }

  const kokler = db.sozKokleri(sual);
  const maddeler = [];
  const gorulen = new Set();

  for (const st of (sitatlar || []).slice(0, 7)) {
    const cumleler = metniCumlelereBol(st.metn);
    const huquqBonusu = st.huquqi_pille === 1 ? 30 : (st.huquqi_pille === 2 ? 15 : 0);
    for (const c of cumleler) {
      const cAz = db.azKicilt(c);
      const cNorm = db.azNormallashdir(cAz);
      let uygun = 0;
      for (const k of kokler) {
        if (db.azKicilt(cAz).includes(k.kok) || (k.kok.length >= 3 && cNorm.includes(k.normKok))) uygun++;
      }
      const imza = c.slice(0, 65).toLowerCase();
      if ((uygun > 0 || kokler.length === 0) && !gorulen.has(imza)) {
        gorulen.add(imza);
        const siraBonusu = Math.max(0, (7 - st.nomre) * 18);
        maddeler.push({
          bal: uygun * 14 + siraBonusu + huquqBonusu + Math.min(40, st.bal || 0),
          metn: c.replace(/^[-•*]+\s*/, "").trim(),
          basliq: st.basliq || st.menbe_adi,
          gonderen: st.gonderen,
          tarix: st.tarix,
          nomre: st.nomre
        });
      }
    }
  }

  maddeler.sort((a, b) => b.bal - a.bal);
  const secilenler = maddeler.slice(0, 10);

  const ilkBasliq = (sitatlar && sitatlar[0]?.basliq) ? sitatlar[0].basliq : "";
  const maddeMatch = ilkBasliq.match(/^(Maddə\s+\d+[0-9.–-]*)/i);
  const movzuAd = maddeMatch ? maddeMatch[1] : (ilkBasliq.split("(")[0].trim().slice(0, 45) || "bu əməliyyat");
  const novbetiBlok = `\n\n<NOVBETI_SUALLAR>\n- Bəs ${movzuAd} üzrə əsas şərtlər və istisnalar nələrdir?\n- Praktikada bu əməliyyat rəsmiləşdirilərkən ən çox edilən səhvlər hansılardır?\n</NOVBETI_SUALLAR>`;

  if (secilenler.length === 0) {
    const parcaSetirler = (sitatlar || []).slice(0, 5).map(s => {
      const temiz = s.metn
        .replace(/^\[[^\]]*?—\s*davamı\]\s*/gim, "")
        .replace(/^[-•*]+\s*/gm, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 450);
      return `- **${s.basliq || s.menbe_adi}**: ${temiz} [${s.nomre}]`;
    });
    const birlesikQisa = [...qizilSetirler, ...parcaSetirler.slice(0, 2)].join("\n\n");
    return `### 📌 Ekspert Qərarı və Xülasə:\n\n${birlesikQisa}${ziddiyyetQeydi ? "\n\n" + ziddiyyetQeydi : ""}\n\n<DETALLI_ANALIZ>\n### 🔍 Geniş Təhlil və Hüquqi Mənbələr:\n\n${(parcaSetirler.length > 0 ? parcaSetirler : qizilSetirler).join("\n\n")}\n</DETALLI_ANALIZ>${novbetiBlok}`;
  }

  const qisaSetirler = [
    ...qizilSetirler,
    ...secilenler.slice(0, 3).map(m => {
      const maddeOn = m.basliq && /^Maddə\s+\d+/i.test(m.basliq) && !m.metn.toLowerCase().includes("maddə")
        ? `**(${m.basliq.split(".")[0]})** `
        : "";
      return `- ${maddeOn}${m.metn} [${m.nomre}]`;
    })
  ];

  const esasQaydaSetirleri = [];
  const sertVeIstisnaSetirleri = [];
  const sanksiyaRiskSetirleri = [];

  for (const m of secilenler) {
    const kim = m.gonderen ? ` (**${m.gonderen}**${m.tarix ? `, ${m.tarix}` : ""})` : "";
    const setir = `- ${m.metn}${kim} [${m.nomre}]`;
    if (/(?:cərimə|sanksiya|pozulma|məsuliyyət|58\.|gecikmə|faiz\s*hesablanır)/i.test(m.metn)) {
      sanksiyaRiskSetirleri.push(setir);
    } else if (/(?:istisna|əgər|təqdirdə|bu\s*halda|şamil\s*edilmir|tətbiq\s*edilmir|keçmədikdə|keçdikdə|fərqli|şərti\s*ilə|məhdudiyyət)/i.test(m.metn)) {
      sertVeIstisnaSetirleri.push(setir);
    } else {
      esasQaydaSetirleri.push(setir);
    }
  }

  const detalliHisseler = [
    `#### 📋 1. Əsas Qaydalar və Hüquqi Normalar:\n\n${
      esasQaydaSetirleri.length > 0
        ? esasQaydaSetirleri.slice(0, 4).join("\n\n")
        : secilenler.slice(0, 3).map(m => `- ${m.metn} [${m.nomre}]`).join("\n\n")
    }`
  ];

  if (sertVeIstisnaSetirleri.length > 0) {
    detalliHisseler.push(`#### 🔀 2. Tətbiq Şərtləri və İstisnalar:\n\n${sertVeIstisnaSetirleri.slice(0, 3).join("\n\n")}`);
  }

  if (sualdaCerimeVar && sanksiyaRiskSetirleri.length > 0) {
    detalliHisseler.push(`#### 🚨 3. Maliyyə Sanksiyası və Cərimə Riskləri:\n\n${sanksiyaRiskSetirleri.slice(0, 3).join("\n\n")}`);
  }

  return `### 📌 Ekspert Qərarı və Xülasə:\n\n${qisaSetirler.join("\n\n")}${ziddiyyetQeydi ? "\n\n" + ziddiyyetQeydi : ""}\n\n<DETALLI_ANALIZ>\n### 🔍 Geniş Təhlil və Hüquqi Şərtlər:\n\n${detalliHisseler.join("\n\n")}\n</DETALLI_ANALIZ>${novbetiBlok}`;
}

// ---- 4. LLM Çağırışı (NotebookLM Gemini File API + Dərin Düşünmə / Thinking Mode + Avtomatik Ehtiyat Zənciri) ----
async function llmCagir({ sistemPromptu, istifadeciPromptu, geminiFileParts = [], tarixce = [], tenz, derinRejim = null }) {
  const t = tenz || db.tenzimlemeleriAl();
  const provayder = t.ai_provayder || "gemini";
  const aktivDerinRejim = derinRejim !== null ? Boolean(derinRejim) : (t.derin_rejim !== "0");
  llmCagir.sonMelumat = { daxiliDusunce: "", model: "", derinRejim: aktivDerinRejim, xeta: "" };

  // 1) GOOGLE GEMINI API (Həm yeni 'AQ.' Auth açarları, həm köhnə 'AIzaSy...' açarları — X-goog-api-key header ilə!)
  const geminiKey = (t.gemini_api_key || process.env.GEMINI_API_KEY || "").trim();
  if (geminiKey && provayder === "gemini") {
    const key = geminiKey;
    const modeller = geminiModelSiyahisiAl(t.gemini_model, aktivDerinRejim);

    const userParts = [
      ...geminiFileParts.map(f => ({
        fileData: {
          mimeType: f.mimeType,
          fileUri: f.uri
        }
      })),
      { text: istifadeciPromptu }
    ];

    const contents = [
      ...tarixce.slice(-4).map(m => ({
        role: m.rol === "assistant" ? "model" : "user",
        parts: [{ text: m.metn }]
      })),
      {
        role: "user",
        parts: userParts
      }
    ];

    for (const model of modeller) {
      try {
        const dusunmeDestekleyir = model !== "gemini-flash-lite-latest";
        const generationConfig = {
          temperature: aktivDerinRejim ? 0.12 : 0.15,
          maxOutputTokens: aktivDerinRejim ? 5120 : 4096
        };
        if (dusunmeDestekleyir) {
          generationConfig.thinkingConfig = {
            includeThoughts: true,
            thinkingBudget: aktivDerinRejim ? 1024 : 512
          };
        }

        const timeoutMs = aktivDerinRejim ? 32000 : 20000;
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-goog-api-key": key
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: sistemPromptu }] },
              contents,
              generationConfig
            }),
            signal: AbortSignal.timeout(timeoutMs)
          }
        );

        if (res.ok) {
          const data = await res.json();
          const parts = data?.candidates?.[0]?.content?.parts || [];
          const dusunceMetni = parts
            .filter(p => p.thought && p.text)
            .map(p => p.text.trim())
            .join("\n")
            .trim();
          const cavab = parts
            .filter(p => !p.thought && p.text)
            .map(p => p.text)
            .join("\n")
            .trim();

          if (cavab) {
            llmCagir.sonMelumat = {
              daxiliDusunce: dusunceMetni,
              model,
              derinRejim: aktivDerinRejim,
              xeta: ""
            };
            return cavab;
          }
        } else if (res.status === 400 || res.status === 401 || res.status === 403) {
          const errText = await res.text().catch(() => "");
          if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(errText)) {
            llmCagir.sonMelumat.xeta = `Daxil edilmiş Gemini API açarı keçərsizdir (Status ${res.status}: Google AI Studio açarı 'AIzaSy...' ilə başlamalıdır)`;
            break;
          }
        }
      } catch (_) {
        // Bu modeldə timeout və ya 503 oldusa, dərhal növbəti Gemini modelini yoxla!
      }
    }
  }

  // 2) OLLAMA (Tam Lokal)
  if (provayder === "ollama") {
    const url = (t.ollama_url || "http://127.0.0.1:11434").replace(/\/$/, "");
    const model = t.ollama_model || "llama3.2";
    const mesajlar = [
      { role: "system", content: sistemPromptu },
      ...tarixce.slice(-4).map(m => ({ role: m.rol === "assistant" ? "assistant" : "user", content: m.metn })),
      { role: "user", content: istifadeciPromptu }
    ];

    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: mesajlar, stream: false, options: { temperature: 0.2 } }),
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) {
      throw new Error(`Ollama (${res.status}): Lokal Ollama proqramının açıq olduğundan əmin olun.`);
    }
    const data = await res.json();
    return data?.message?.content || "";
  }

  // 3) GROQ API (provayder groq-dursa VƏ YA Gemini uğursuz oldusa ehtiyat kimi!)
  const groqKey = (t.groq_api_key || process.env.GROQ_API_KEY || "").trim();
  if (groqKey && (provayder === "groq" || !t.gemini_api_key || llmCagir.sonMelumat.xeta)) {
    const model = t.groq_model || "llama-3.3-70b-versatile";
    const mesajlar = [
      { role: "system", content: sistemPromptu },
      ...tarixce.slice(-4).map(m => ({ role: m.rol === "assistant" ? "assistant" : "user", content: m.metn })),
      { role: "user", content: istifadeciPromptu }
    ];

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`
        },
        body: JSON.stringify({ model, messages: mesajlar, temperature: 0.15, max_tokens: 4096 }),
        signal: AbortSignal.timeout(35000)
      });
      if (res.ok) {
        const data = await res.json();
        const cavab = data?.choices?.[0]?.message?.content;
        if (cavab) {
          llmCagir.sonMelumat = {
            daxiliDusunce: "",
            model: `Groq (${model})`,
            derinRejim: aktivDerinRejim,
            xeta: ""
          };
          return cavab;
        }
      } else {
        const errTxt = await res.text().catch(() => "");
        llmCagir.sonMelumat.xeta = `Groq API xətası (${res.status}): ${errTxt.slice(0, 140)}`;
      }
    } catch (e) {
      llmCagir.sonMelumat.xeta = `Groq əlaqə xətası: ${e.message}`;
    }
  }

  // 4) DAXİLİ PULSUZ AI MÜHƏRRİKİ (Ehtiyat Bulud LLM)
  try {
    const mesajlar = [
      { role: "system", content: sistemPromptu },
      ...tarixce.slice(-2).map(m => ({
        role: m.rol === "assistant" ? "assistant" : "user",
        content: String(m.metn || "").slice(0, 1200)
      })),
      { role: "user", content: istifadeciPromptu.slice(0, 14000) }
    ];

    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai",
        messages: mesajlar,
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(35000)
    });

    if (res.ok) {
      const data = await res.json();
      const cavab = data?.choices?.[0]?.message?.content;
      if (cavab && cavab.trim().length > 10) {
        return cavab.trim();
      }
    }
  } catch (_) {}

  return null;
}

// ---- 5. Sitatlı RAG + NotebookLM File API + Uzunmüddətli Yaddaş Cavab Mühərriki ----
async function sitatliCavabVer({
  sual,
  qovluq_id = "all",
  gonderen = "",
  tarix_baslangic = "",
  tarix_son = "",
  menbe_nov = ""
}) {
  const tenz = db.tenzimlemeleriAl();

  const yaddasEmri = sual.match(/^(?:yadda saxla ki|unutma ki|qeyd et ki|yadda saxla\s*[:-])\s*(.+)/i);
  if (yaddasEmri && yaddasEmri[1]) {
    db.yaddasElaveEt({
      kateqoriya: "qayda",
      metn: yaddasEmri[1].trim(),
      menbe: "Birbaşa Təlimat",
      vaciblik: 5
    });
  }

  const sorguVektoru = db.bazadaVektorVarmi() ? await vektorYarat(sual, tenz) : null;
  const tapilanParcalar = db.hibridAxtar({
    sorgu: sual,
    sorguVektoru,
    qovluq_id,
    gonderen,
    tarix_baslangic,
    tarix_son,
    menbe_nov,
    limit: 8
  });

  const geminiFileParts = [];
  if (tapilanParcalar.length === 0 && tenz.gemini_api_key && (tenz.ai_provayder || "gemini") === "gemini") {
    const aktivMenbeler = db.menbeleriAl(qovluq_id).filter(m => m.aktiv === 1 && (!menbe_nov || m.nov === menbe_nov));
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
  }

  const sexsiYaddas = db.yaddaslariAl().slice(0, 20);
  const tarixce = db.sohbetleriAl(qovluq_id, 6);

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

  const menbeKonteksti = sitatlar.length > 0
    ? sitatlar.map(s => {
        const metaHisse = [
          `Mənbə faylı: ${s.menbe_adi} (${s.menbe_novu})`,
          s.gonderen ? `Göndərən/Şəxs: ${s.gonderen}` : null,
          s.tarix ? `Tarix/Saat: ${s.tarix}` : null,
          s.basliq ? `Bölmə: ${s.basliq}` : null
        ].filter(Boolean).join(" | ");
        return `=== [Mənbə ${s.nomre}] (${metaHisse}) ===\n${s.metn}`;
      }).join("\n\n")
    : "Bazaya hələ bu suala uyğun sənəd və ya çat yüklənməyib.";

  const yaddasKonteksti = sexsiYaddas.length > 0
    ? sexsiYaddas.map(y => `- [${y.kateqoriya.toUpperCase()}] ${y.metn}`).join("\n")
    : "Hələ şəxsi yaddaş qeydi yoxdur.";

  const sistemPromptu = `${tenz.sistem_telimati || "Sən istifadəçinin şəxsi AI asistantı və NotebookLM hibridisən."}

ƏSAS QAYDALAR:
1. İKİ-MƏRHƏLƏLİ CAVAB: Cavabını hər zaman 2 hissəyə böl:
   - Hissə 1: Əvvəlcə birbaşa, ən vacib nöqtələri göstərən "### 📌 Konkret və Qısa Cavab:" (3-5 maddə və ya 1-2 qısa abzas).
   - Hissə 2: Bütün geniş təhlili, maddələri, incəlikləri və izahatları "<DETALLI_ANALIZ>\n### 🔍 Detallı Təhlil və Hüquqi/Praktiki Əsaslar:\n...\n</DETALLI_ANALIZ>" teqləri daxilində yaz.
2. Əgər qanunvericilikdə və ya mənbələrdə konkret fəaliyyət sahələri (məs: İT, dizayn, tərcümə, reklam, təhsil, hüquq, mühasibat və s.), şərtlər və ya maddələr sadalanırsa, onları BƏND-BƏND, DƏQİQ VƏ AYDIN siyahı ilə yaz.
3. Mənbədən götürdüyün hər bir faktın, müddəanın, rəqəmin, tarixin və ya mesajın sonunda MÜTLƏQ həmin mənbənin nömrəsini kvadrat mötərizədə göstər: məsələn [1], [2], [1, 2].
4. Əgər mənbədə ümumi prinsip var amma konkret sahələrin siyahısı natamamdırsa, öz dəqiq hüquqi biliyinlə həmin konkret sahələri və şərtləri dərhal tamamlayıb təqdim et.
5. AVTOMATİK ŞƏXSİ YADDAŞ: Əgər istifadəçinin sualında onun özü, işi, müştəriləri və ya gələcəkdə xatırlanmalı olan vacib bir qayda varsa, cavabının ən sonunda yeni sətirdə bu formatda yaz (yoxdursa yazma):
<YADDAŞ kateqoriya="fakt|qayda|tapşırıq|şəxs">Yadda saxlanılmalı qısa və dəqiq fakt</YADDAŞ>

UZUNMÜDDƏTLİ ŞƏXSİ YADDAŞ:
${yaddasKonteksti}`;

  const istifadeciPromptu = `${geminiFileParts.length > 0 ? `QEYD: Hazırda bazada aktiv olan və Google File API (NotebookLM) vasitəsilə sənə qoşulmuş fayllar bunlardır: ${geminiFileParts.map(f => f.ad).join(", ")}.\n\n` : ""}TAPILMIŞ SİTAT BLOKLARI:
${menbeKonteksti}

İSTİFADƏÇİNİN SUALI:
${sual}`;

  let xamCavab = await llmCagir({
    sistemPromptu,
    istifadeciPromptu,
    geminiFileParts,
    tarixce,
    tenz
  });

  if (!xamCavab) {
    xamCavab = lokalAnalitikCavabQur(sual, sitatlar);
  }

  const yeniYaddaslar = [];
  const temizCavab = xamCavab
    .replace(/<YADDAŞ(?:\s+kateqoriya="([^"]*)")?>([\s\S]*?)<\/YADDAŞ>/gi, (_, kat, m) => {
      if (tenz.avto_yaddas !== "0" && m && m.trim()) {
        const elave = db.yaddasElaveEt({
          kateqoriya: kat || "fakt",
          metn: m.trim(),
          menbe: "Avtomatik Analiz",
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
    sitatlar
  });

  return {
    cavab: saxlanilanCavab,
    sitatlar,
    yeniYaddaslar,
    notebooklmFaylSayi: geminiFileParts.length
  };
}

// Universal AI Sorğu Tərcüməçisi və Maddə Planlayıcısı (İstənilən sənəd: Konstitusiya, Vergi, Əmək Məcəlləsi, Müqavilə, Kitab üçün)
async function universalSorguPlanla({ sual, aktivMenbeAdlari = [], tenz = null }) {
  const t = tenz || db.tenzimlemeleriAl();
  if (!t.gemini_api_key || (t.ai_provayder || "gemini") !== "gemini") return [];

  const prompt = `İstifadəçinin sualı: "${sual}"
Bazadakı sənədlər: ${aktivMenbeAdlari.slice(0, 6).join(", ") || "Ümumi sənədlər"}

Tapşırıq: İstifadəçi sualı gündəlik dildə verib. Bu sualın cavabını yuxarıdakı sənədlərdə dəqiq tapmaq üçün onu rəsmi hüquqi/texniki terminlərə və aid olduğu dəqiq Maddə nömrələrinə (məs: "Maddə 163", "Maddə 72.4-1", "Maddə 125", "Maddə 169" və s.) çevir.
Yalnız 3 fərqli axtarış sətri yaz (hər sətirdə açar sözlər və maddə nömrələri olsun, nömrələmə və əlavə izah yazma):`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": t.gemini_api_key.trim()
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 160
          }
        }),
        signal: AbortSignal.timeout(3500)
      }
    );
    if (res.ok) {
      const data = await res.json();
      const metn = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n") || "";
      return metn
        .split(/\r?\n/)
        .map(s => s.replace(/^[-*•\d.)\s]+/, "").trim())
        .filter(s => s.length >= 4 && s.length <= 180)
        .slice(0, 3);
    }
  } catch (_) {}
  return [];
}

module.exports = {
  vektorYarat,
  menbeVektorlashdir,
  butunBazaniVektorlashdir,
  vektorIsiVeziyyetiAl,
  mediaAnalizEt,
  llmCagir,
  universalSorguPlanla,
  lokalAnalitikCavabQur,
  sitatliCavabVer
};
