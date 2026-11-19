// Google Gemini File API Mühərriki (NotebookLM-in Arxa Mühərriki)
// - PDF, Səs, Şəkil və Çat fayllarını birbaşa Google-un File API serverinə (20 GB pulsuz yaddaş) yükləyir.
// - Google PDF-ləri həm vizual (şəkil/cədvəl kimi), həm də mətn kimi 1 Milyon tokenlik kontekstdə oxuyur (şrift korlanması olmur!).
// - Faylın lokal nüsxəsini 'data/uploads/' qovluğunda saxlayır ki, 48 saatdan sonra Google-da müddəti bitsə belə, sual veriləndə avtomatik yenilənsin!
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const db = require("./db");

const UPLOADS_DIR = path.join(__dirname, "..", "data", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function geminiMimeTeyinEt(faylAdi, defaultMime = "") {
  const uz = path.extname(faylAdi || "").toLowerCase();
  if (uz === ".pdf") return "application/pdf";
  if (uz === ".ogg" || uz === ".opus") return "audio/ogg";
  if (uz === ".mp3") return "audio/mp3";
  if (uz === ".wav") return "audio/wav";
  if (uz === ".m4a") return "audio/mp4";
  if (uz === ".png") return "image/png";
  if (uz === ".jpg" || uz === ".jpeg") return "image/jpeg";
  if (uz === ".webp") return "image/webp";
  if (uz === ".csv") return "text/csv";
  if (uz === ".html" || uz === ".htm") return "text/html";
  if (defaultMime && (defaultMime.startsWith("audio/") || defaultMime.startsWith("image/") || defaultMime === "application/pdf")) {
    return defaultMime;
  }
  return "text/plain";
}

// Faylı həm lokal diskdə (data/uploads/) saxlayır, həm də Gemini API açarı varsa birbaşa Google File API-yə yükləyir
function lokalFaylSaxla(menbeId, faylAdi, buffer) {
  const uz = path.extname(faylAdi || "") || ".dat";
  const temizAd = `${menbeId}${uz}`;
  const tamYol = path.join(UPLOADS_DIR, temizAd);
  fs.writeFileSync(tamYol, buffer);
  return tamYol;
}

// Google Gemini Resumable File Upload API vasitəsilə faylı Google serverinə yükləyir
async function geminiServereYukle({ buffer, mimeType, displayName, apiKey }) {
  const key = String(apiKey || "").trim();
  if (!key) return null;

  // 1) Yükləmə sessiyasını başlat (Start Resumable Upload)
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(buffer.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        file: { display_name: displayName || "BeyinAI_Sened" }
      }),
      signal: AbortSignal.timeout(20000)
    }
  );

  if (!startRes.ok) {
    const errText = await startRes.text().catch(() => "");
    throw new Error(`Gemini File API başlatma xətası (${startRes.status}): ${errText}`);
  }

  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini File API yükləmə ünvanı (x-goog-upload-url) qaytarmadı.");
  }

  // 2) Faylın baytlarını göndər və tamamla (Upload & Finalize)
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(buffer.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: buffer,
    signal: AbortSignal.timeout(120000)
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`Gemini File API yükləmə xətası (${uploadRes.status}): ${errText}`);
  }

  const data = await uploadRes.json();
  let fileObj = data.file;
  if (!fileObj || !fileObj.uri) {
    throw new Error("Gemini File API fayl məlumatı qaytarmadı.");
  }

  // 3) Əgər böyük PDF və ya Səs faylıdırsa, "PROCESSING" bitib "ACTIVE" olana qədər gözlə (maksimum 25 saniyə)
  let cehd = 0;
  while (fileObj.state === "PROCESSING" && cehd < 18) {
    await new Promise(r => setTimeout(r, 1400));
    cehd++;
    const checkRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileObj.name}?key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (checkRes.ok) {
      fileObj = await checkRes.json();
    }
  }

  if (fileObj.state === "FAILED") {
    throw new Error("Google Gemini serveri bu faylı emal edə bilmədi.");
  }

  return {
    name: fileObj.name, // məs: "files/abc123xyz"
    uri: fileObj.uri,   // məs: "https://generativelanguage.googleapis.com/v1beta/files/abc123xyz"
    mimeType: fileObj.mimeType || mimeType,
    state: fileObj.state || "ACTIVE",
    expirationTime: fileObj.expirationTime ? new Date(fileObj.expirationTime).getTime() : (Date.now() + 47 * 3600 * 1000)
  };
}

// Mənbənin Gemini File API-də aktiv olmasını təmin edir (yoxdursa və ya vaxtı bitibsə, lokal diskdən və ya xam mətndən avtomatik yükləyir!)
async function menbeniGeminiIleSinxronEt(menbe, apiKey) {
  const key = String(apiKey || "").trim();
  if (!key || !menbe) return null;

  const meta = typeof menbe.meta === "string" ? JSON.parse(menbe.meta || "{}") : (menbe.meta || {});
  const indi = Date.now();

  // Əgər artıq aktiv Gemini URI varsa və vaxtının bitməsinə ən azı 30 dəqiqə qalıbsa, birbaşa onu qaytar!
  if (
    meta.gemini_file &&
    meta.gemini_file.uri &&
    meta.gemini_file.expirationTime &&
    meta.gemini_file.expirationTime > indi + 30 * 60 * 1000
  ) {
    return meta.gemini_file;
  }

  // Lokal diskdə xam fayl varmı? (PDF, Səs, Şəkil üçün orijinal fayl; Word/Excel/Çat üçün təmiz mətn)
  let buffer = null;
  let mimeType = "text/plain";

  const orijinalNovler = new Set(["pdf", "audio", "image"]);
  if (orijinalNovler.has(menbe.nov) && meta.lokal_yol && fs.existsSync(meta.lokal_yol)) {
    buffer = fs.readFileSync(meta.lokal_yol);
    mimeType = geminiMimeTeyinEt(meta.lokal_yol);
  } else {
    // Mənbənin xam mətnini və ya parçalarını birləşdirib təmiz UTF-8 sənəd kimi göndər
    const tamDetal = db.menbeDetaliAl(menbe.id);
    const metn =
      (tamDetal && tamDetal.xam_metn && tamDetal.xam_metn.length > 20)
        ? tamDetal.xam_metn
        : (tamDetal?.parcalar || []).map(p => `[${p.basliq}]\n${p.metn}`).join("\n\n");
    if (!metn || !metn.trim()) return null;
    buffer = Buffer.from(`=== MƏNBƏ SƏNƏDİ: ${menbe.ad} (${menbe.nov.toUpperCase()}) ===\n\n${metn}`, "utf8");
    mimeType = "text/plain";
  }

  const yuklenen = await geminiServereYukle({
    buffer,
    mimeType,
    displayName: menbe.ad,
    apiKey: key
  });

  if (yuklenen) {
    meta.gemini_file = yuklenen;
    db.db.prepare("UPDATE menbeler SET meta = ? WHERE id = ?").run(JSON.stringify(meta), menbe.id);
  }

  return yuklenen;
}

// Mənbə silinəndə həm lokal faylı, həm də Google serverindəki faylı silir
async function menbeFayliniSil(menbe) {
  if (!menbe) return;
  const meta = typeof menbe.meta === "string" ? JSON.parse(menbe.meta || "{}") : (menbe.meta || {});

  if (meta.lokal_yol && fs.existsSync(meta.lokal_yol)) {
    try {
      fs.unlinkSync(meta.lokal_yol);
    } catch (_) {}
  }

  const tenz = db.tenzimlemeleriAl();
  if (meta.gemini_file?.name && tenz.gemini_api_key) {
    try {
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${meta.gemini_file.name}?key=${encodeURIComponent(tenz.gemini_api_key.trim())}`,
        { method: "DELETE", signal: AbortSignal.timeout(8000) }
      );
    } catch (_) {}
  }
}

module.exports = {
  UPLOADS_DIR,
  geminiMimeTeyinEt,
  lokalFaylSaxla,
  geminiServereYukle,
  menbeniGeminiIleSinxronEt,
  menbeFayliniSil
};
