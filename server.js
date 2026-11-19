// BeyinAI — Şəxsi AI Asistant və NotebookLM Hibridi (Backend HTTP Server)
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const db = require("./src/db");
const ai = require("./src/ai");
const agent = require("./src/agent");
const parsers = require("./src/parsers");
const connectors = require("./src/connectors");
const { fayliWorkerIleEmalEt } = require("./src/worker-fayl");
const geminiFiles = require("./src/gemini-files");

const PORT = Number(process.env.PORT) || 3847;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TIPLERI = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function jsonCavab(res, status, data) {
  const govde = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(govde);
}

function govdeOxu(req, maksBayt = 200 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const hisseler = [];
    let cemi = 0;
    req.on("data", chunk => {
      cemi += chunk.length;
      if (cemi > maksBayt) {
        req.destroy();
        reject(new Error("Fayl ölçüsü həddindən artıq böyükdür (Maksimum 80 MB)."));
        return;
      }
      hisseler.push(chunk);
    });
    req.on("end", () => {
      try {
        const tam = Buffer.concat(hisseler).toString("utf8");
        resolve(tam ? JSON.parse(tam) : {});
      } catch (e) {
        reject(new Error("JSON formatı yanlışdır."));
      }
    });
    req.on("error", reject);
  });
}

// 1 kliklə sistemi yoxlamaq üçün Nümunə Məlumatlar (WhatsApp çatı, Telegram qrupu və Müqavilə sənədi)
async function numuneMelumatYukle() {
  const wpNumune = `[12.11.2026, 10:15:00] Rəşad Müdir: Salam uşaqlar, "AzərLogistika MMC" ilə yeni proqram təminatı müqaviləsini bu həftə yekunlaşdırmalıyıq.
[12.11.2026, 10:17:22] Əli Developer: Salam Rəşad bəy. Server və baza hissəsi artıq 90% hazırdır. Yalnız elektron qaimə inteqrasiyası qalıb.
[12.11.2026, 10:19:45] Leyla Maliyyə: Müqavilənin ümumi məbləği ƏDV daxil 14,160 AZN (əsas məbləğ 12,000 AZN + 18% ƏDV 2,160 AZN) olaraq razılaşdırılıb. İlkin avans 50% (7,080 AZN) sabah hesabımıza köçürüləcək.
[12.11.2026, 10:22:10] Rəşad Müdir: Əla. Əli, sən cümə günü, yəni 14.11.2026 saat 16:00-a qədər test serverini müştəriyə təhvil verməlisən.
[12.11.2026, 10:23:05] Əli Developer: Oldu, 14 noyabr saat 16:00-da linki göndərəcəyəm.
[15.11.2026, 14:40:12] Leyla Maliyyə: Yeniləmə: AzərLogistika MMC 7,080 AZN avansı Kapital Bank hesabımıza köçürdü. Qalıq 7,080 AZN təhvil-təslim aktı imzalanandan 5 iş günü sonra ödəniləcək.`;

  const tgNumune = JSON.stringify({
    name: "Layihə və Təchizat Qrupu",
    type: "private_group",
    messages: [
      {
        id: 1,
        type: "message",
        date: "2026-11-13T11:10:00",
        from: "Kamran Təchizat",
        text: "Ofis üçün 3 ədəd yeni noutbuk (ThinkPad T16, 32GB RAM) sifariş veririk. Satıcı 'TexnoMart ASC' qiyməti 1 ədəd üçün 2,450 AZN deyir."
      },
      {
        id: 2,
        type: "message",
        date: "2026-11-13T11:14:30",
        from: "Nigar Mühasib",
        reply_to_message_id: 1,
        text: "Kamran bəy, TexnoMart ASC-nin VÖEN-i 1402938471-dir. Qaiməni göndərəndə mütləq zəmanət müddətini (24 ay) müqavilədə qeyd etsinlər."
      },
      {
        id: 3,
        type: "message",
        date: "2026-11-16T09:30:00",
        from: "Kamran Təchizat",
        text: "Noutbuklar gəldi və təhvil alındı. Ümumi ödəniş 7,350 AZN təşkil edir. Son ödəniş tarixi 25.11.2026-dır."
      }
    ]
  });

  const senedNumune = `XİDMƏT MÜQAVİLƏSİ № XM-2026/114
Tarix: 12 Noyabr 2026-cı il, Bakı şəhəri

1. TƏRƏFLƏR
Sifarişçi: "AzərLogistika" MMC (VÖEN: 1700456121, Direktor: Orxan Həsənov)
İcraçı: Fərdi Sahibkar (Layihə və Avtomatlaşdırma Xidmətləri)

2. MÜQAVİLƏNİN PREDMETİ VƏ QİYMƏTİ
2.1. İcraçı Sifarişçinin daxili sənəd dövriyyəsi və analitika sistemini 30.11.2026 tarixinədək hazırlayıb təhvil verir.
2.2. Müqavilənin ümumi dəyəri 12,000 AZN + 18% ƏDV (2,160 AZN) = 14,160 AZN təşkil edir.
2.3. Texniki dəstək müddəti sistem təhvil verildikdən sonra 6 ay pulsuz, daha sonra aylıq 350 AZN olaraq müəyyən edilir.

3. CƏRİMƏ VƏ MƏSULİYYƏT
3.1. Gecikdirilən hər iş günü üçün 0.1% dəbbə pulu hesablanır.`;

  const wpEmal = await parsers.whatsappOxu(wpNumune, "AzərLogistika_WhatsApp_Qrupu.txt");
  const tgEmal = await parsers.telegramJsonOxu(tgNumune, "Təchizat_Telegram_Çıxarışı.json");
  const docParcalar = parsers.metniParcala(senedNumune, "Xidmet_Muqavilesi_XM_2026_114.pdf");

  const m1 = db.menbeElaveEt({
    qovluq_id: "qovluq-cat",
    ad: "AzərLogistika_WhatsApp_Qrupu.txt",
    nov: "whatsapp",
    olcu: wpNumune.length,
    xulase: wpEmal.xulase,
    meta: wpEmal.meta,
    xam_metn: wpEmal.xam_metn,
    parcalar: wpEmal.parcalar
  });

  const m2 = db.menbeElaveEt({
    qovluq_id: "qovluq-cat",
    ad: "Təchizat_Telegram_Çıxarışı.json",
    nov: "telegram",
    olcu: tgNumune.length,
    xulase: tgEmal.xulase,
    meta: tgEmal.meta,
    xam_metn: tgEmal.xam_metn,
    parcalar: tgEmal.parcalar
  });

  const m3 = db.menbeElaveEt({
    qovluq_id: "qovluq-is",
    ad: "Xidmet_Muqavilesi_XM_2026_114.pdf",
    nov: "pdf",
    olcu: senedNumune.length,
    xulase: "PDF Müqavilə Sənədi • AzərLogistika MMC (14,160 AZN)",
    meta: { sened_no: "XM-2026/114", mebleg: "14160 AZN" },
    xam_metn: senedNumune,
    parcalar: docParcalar
  });

  db.yaddasElaveEt({
    kateqoriya: "qayda",
    metn: "Maliyyə və müqavilə suallarında məbləğləri həm ƏDV-siz, həm də 18% ƏDV daxil olmaqla göstər.",
    menbe: "Sistem Qaydası",
    vaciblik: 5
  });

  ai.menbeVektorlashdir(m1).catch(() => {});
  ai.menbeVektorlashdir(m2).catch(() => {});
  ai.menbeVektorlashdir(m3).catch(() => {});

  return [m1, m2, m3];
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      res.end();
      return;
    }

    const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const yol = urlObj.pathname;

    // ---- API MARŞRUTLARI ----

    // 1. Ümumi vəziyyət (Bootstrap)
    if (yol === "/api/bootstrap" && req.method === "GET") {
      const qovluq_id = urlObj.searchParams.get("qovluq_id") || "all";
      return jsonCavab(res, 200, {
        ok: true,
        qovluqlar: db.qovluqlariAl(),
        menbeler: db.menbeleriAl(qovluq_id),
        istirakcilar: db.istirakcilariAl(qovluq_id),
        yaddas: db.yaddaslariAl(),
        sohbetler: db.sohbetleriAl(qovluq_id),
        tenzimlemeler: db.tenzimlemeleriAl(),
        statistika: db.statistikaAl(),
        baglantilar: {
          ...connectors.veziyyetiAl(),
          notebooklm: agent.nlmKorpuVeziyyeti()
        }
      });
    }

    // 2. Qovluqlar (Notebooks)
    if (yol === "/api/qovluqlar" && req.method === "POST") {
      const b = await govdeOxu(req);
      if (!b.ad || !b.ad.trim()) return jsonCavab(res, 400, { ok: false, xeta: "Qovluq adı boş ola bilməz." });
      const yeni = db.qovluqYarat(b);
      return jsonCavab(res, 200, { ok: true, qovluq: yeni, qovluqlar: db.qovluqlariAl() });
    }

    if (yol.startsWith("/api/qovluqlar/") && req.method === "DELETE") {
      const id = decodeURIComponent(yol.split("/").pop());
      db.qovluqSil(id);
      return jsonCavab(res, 200, { ok: true, qovluqlar: db.qovluqlariAl() });
    }

    // 3. Fayl Yükləmə (PDF, Word, Excel, ZIP, WhatsApp/Telegram export, Səs, Şəkil)
    if (yol === "/api/menbeler/fayl" && req.method === "POST") {
      const b = await govdeOxu(req);
      const { qovluq_id = "qovluq-is", faylAdi, mimeType = "", base64Data } = b;
      if (!faylAdi || !base64Data) {
        return jsonCavab(res, 400, { ok: false, xeta: "Fayl məlumatı tam deyil." });
      }

      // Ayrı İşçi Axında (Worker Thread) emal et ki, böyük PDF/ZIP faylları serveri heç vaxt dondurmasın
      const { emal, olcu } = await fayliWorkerIleEmalEt({ base64Data, faylAdi, mimeType }, 45000);

      // Əgər çat faylıdırsa və qovluq "all" seçilibsə, avtomatik Çat qovluğuna yönləndir
      const hedefQovluq =
        qovluq_id && qovluq_id !== "all"
          ? qovluq_id
          : (emal.nov === "whatsapp" || emal.nov === "telegram" ? "qovluq-cat" : "qovluq-is");

      const menbe = db.menbeElaveEt({
        qovluq_id: hedefQovluq,
        ad: emal.ad || faylAdi,
        nov: emal.nov,
        olcu,
        xulase: emal.xulase,
        meta: emal.meta,
        xam_metn: emal.xam_metn,
        parcalar: emal.parcalar
      });

      // Xam faylı data/uploads/ qovluğunda saxla ki, Gemini File API (NotebookLM mühərriki) birbaşa orijinal faylı (PDF/Səs/Şəkil) oxuya bilsin!
      try {
        const lokalYol = geminiFiles.lokalFaylSaxla(menbe.id, faylAdi, Buffer.from(base64Data, "base64"));
        menbe.meta = { ...(menbe.meta || {}), lokal_yol: lokalYol };
        db.db.prepare("UPDATE menbeler SET meta = ? WHERE id = ?").run(JSON.stringify(menbe.meta), menbe.id);
      } catch (_) {}

      // Arxa planda Gemini File API-yə yüklə və vektorlaşdır
      ai.menbeVektorlashdir(menbe).catch(() => {});

      return jsonCavab(res, 200, {
        ok: true,
        menbe,
        qovluqlar: db.qovluqlariAl(),
        statistika: db.statistikaAl()
      });
    }

    // 4. Veb Link və ya YouTube Əlavə Etmə
    if (yol === "/api/menbeler/link" && req.method === "POST") {
      const b = await govdeOxu(req);
      const { qovluq_id = "qovluq-sexsi", url } = b;
      if (!url || !url.trim()) {
        return jsonCavab(res, 400, { ok: false, xeta: "Link (URL) daxil edilməyib." });
      }

      const emal = await parsers.linkOxu(url);
      const hedefQovluq = qovluq_id && qovluq_id !== "all" ? qovluq_id : "qovluq-sexsi";

      const menbe = db.menbeElaveEt({
        qovluq_id: hedefQovluq,
        ad: emal.ad,
        nov: emal.nov,
        olcu: emal.xam_metn.length,
        xulase: emal.xulase,
        meta: emal.meta,
        xam_metn: emal.xam_metn,
        parcalar: emal.parcalar
      });

      ai.menbeVektorlashdir(menbe).catch(() => {});

      return jsonCavab(res, 200, {
        ok: true,
        menbe,
        qovluqlar: db.qovluqlariAl(),
        statistika: db.statistikaAl()
      });
    }

    // 5. Mətn / Çat Yapışdırma (Birbaşa kopyalanmış WhatsApp/Telegram mesajları və ya qeyd)
    if (yol === "/api/menbeler/metn" && req.method === "POST") {
      const b = await govdeOxu(req);
      const { qovluq_id = "qovluq-sexsi", basliq = "Sürətli Qeyd", metn = "" } = b;
      if (!metn.trim()) {
        return jsonCavab(res, 400, { ok: false, xeta: "Mətn boş ola bilməz." });
      }

      const emal = await parsers.whatsappOxu(metn, basliq);
      const hedefQovluq =
        qovluq_id && qovluq_id !== "all"
          ? qovluq_id
          : (emal.nov === "whatsapp" ? "qovluq-cat" : "qovluq-sexsi");

      const menbe = db.menbeElaveEt({
        qovluq_id: hedefQovluq,
        ad: basliq,
        nov: emal.nov === "whatsapp" ? "whatsapp" : "qeyd",
        olcu: Buffer.byteLength(metn, "utf8"),
        xulase: emal.xulase,
        meta: emal.meta,
        xam_metn: metn,
        parcalar: emal.parcalar
      });

      ai.menbeVektorlashdir(menbe).catch(() => {});

      return jsonCavab(res, 200, {
        ok: true,
        menbe,
        qovluqlar: db.qovluqlariAl(),
        statistika: db.statistikaAl()
      });
    }

    // 6. Mənbə Detalı (Sitat önizləməsi və tam baxış üçün)
    if (yol.startsWith("/api/menbeler/") && !yol.endsWith("/sinxron") && req.method === "GET") {
      const id = decodeURIComponent(yol.split("/").pop());
      const detal = db.menbeDetaliAl(id);
      if (!detal) return jsonCavab(res, 404, { ok: false, xeta: "Mənbə tapılmadı." });
      return jsonCavab(res, 200, { ok: true, menbe: detal });
    }

    // 6b. Mənbəni Canlı Linkdən Sinxronizasiya / Yeniləmə (Auto-Sync Link)
    if (yol.startsWith("/api/menbeler/") && yol.endsWith("/sinxron") && req.method === "POST") {
      const hisseler = yol.split("/");
      const id = decodeURIComponent(hisseler[3] || "");
      const menbe = db.menbeDetaliAl(id);
      if (!menbe) {
        return jsonCavab(res, 404, { ok: false, xeta: "Mənbə tapılmadı." });
      }

      let url = menbe.meta?.url;
      if (!url && (menbe.nov === "link" || menbe.nov === "youtube")) {
        url = menbe.ad.startsWith("http") ? menbe.ad : "";
      }

      if (!url) {
        return jsonCavab(res, 400, {
          ok: false,
          xeta: "Bu mənbə veb linki ilə əlaqəli deyil. Yalnız link (URL) mənbələri canlı sinxronlaşdırıla bilər."
        });
      }

      try {
        const emal = await parsers.linkOxu(url);
        const yenilenmis = db.menbeYenile({
          id,
          ad: emal.ad || menbe.ad,
          nov: emal.nov || menbe.nov,
          olcu: emal.xam_metn ? Buffer.byteLength(emal.xam_metn, "utf8") : 0,
          xulase: emal.xulase || menbe.xulase,
          meta: { ...(menbe.meta || {}), ...(emal.meta || {}), son_sinxron: Date.now() },
          xam_metn: emal.xam_metn,
          parcalar: emal.parcalar
        });

        ai.menbeVektorlashdir(yenilenmis).catch(() => {});

        return jsonCavab(res, 200, {
          ok: true,
          menbe: yenilenmis,
          mesaj: `Mənbə canlı linkdən uğurla yeniləndi! (${yenilenmis.parcalar?.length || 0} parça/maddə yenidən indeksləndi)`
        });
      } catch (e) {
        return jsonCavab(res, 500, { ok: false, xeta: "Sinxronizasiya xətası: " + e.message });
      }
    }

    // 7. Mənbə Aktiv/Deaktiv və ya Silmə
    if (yol.startsWith("/api/menbeler/") && req.method === "PUT") {
      const id = decodeURIComponent(yol.split("/").pop());
      const b = await govdeOxu(req);
      db.menbeAktivlikDeyis(id, b.aktiv);
      return jsonCavab(res, 200, { ok: true });
    }

    if (yol.startsWith("/api/menbeler/") && req.method === "DELETE") {
      const id = decodeURIComponent(yol.split("/").pop());
      const movcud = db.menbeDetaliAl(id);
      if (movcud) {
        geminiFiles.menbeFayliniSil(movcud).catch(() => {});
      }
      db.menbeSil(id);
      return jsonCavab(res, 200, {
        ok: true,
        qovluqlar: db.qovluqlariAl(),
        statistika: db.statistikaAl()
      });
    }

    // 8. Çox-Addımlı Avtonom AI Agent Sual-Cavab və Analiz Mühərriki
    if (yol === "/api/sohbet" && req.method === "POST") {
      const b = await govdeOxu(req);
      if (!b.sual || !b.sual.trim()) {
        return jsonCavab(res, 400, { ok: false, xeta: "Sual boş ola bilməz." });
      }
      const netice = await agent.agentSualCavabla({
        sual: b.sual.trim(),
        qovluq_id: b.qovluq_id || "all",
        gonderen: b.gonderen || "",
        tarix_baslangic: b.tarix_baslangic || "",
        tarix_son: b.tarix_son || "",
        menbe_nov: b.menbe_nov || "",
        derin_rejim: b.derin_rejim !== undefined ? b.derin_rejim : null
      });
      return jsonCavab(res, 200, {
        ok: true,
        ...netice,
        yaddas: db.yaddaslariAl()
      });
    }

    // 8b. Canlı NotebookLM Brauzer Körpüsü (Chrome Genişlənməsi üçün)
    if (yol === "/api/nlm-korpu/novbe" && req.method === "POST") {
      const b = await govdeOxu(req);
      agent.nlmKorpuDurumuYenile({ notebookAdi: b.notebookAdi || "" });
      return jsonCavab(res, 200, {
        ok: true,
        sorgular: agent.nlmNövbəniAl()
      });
    }

    if (yol === "/api/nlm-korpu/cavab" && req.method === "POST") {
      const b = await govdeOxu(req);
      agent.nlmCavabQebulEt(b);
      return jsonCavab(res, 200, { ok: true });
    }

    if (yol === "/api/sohbet/temizle" && req.method === "POST") {
      const b = await govdeOxu(req);
      db.sohbetleriTemizle(b.qovluq_id || "all");
      return jsonCavab(res, 200, { ok: true });
    }

    // 9. Uzunmüddətli Şəxsi Yaddaş
    if (yol === "/api/yaddas" && req.method === "POST") {
      const b = await govdeOxu(req);
      db.yaddasElaveEt(b);
      return jsonCavab(res, 200, { ok: true, yaddas: db.yaddaslariAl() });
    }

    if (yol.startsWith("/api/yaddas/") && req.method === "DELETE") {
      const id = decodeURIComponent(yol.split("/").pop());
      db.yaddasSil(id);
      return jsonCavab(res, 200, { ok: true, yaddas: db.yaddaslariAl() });
    }

    // 10. Tənzimləmələr və Canlı Bağlantılar (Telegram / WhatsApp)
    if (yol === "/api/tenzimlemeler" && req.method === "POST") {
      const b = await govdeOxu(req);
      const yenilenmish = db.tenzimlemeYenile(b);
      if (b.gemini_api_key && b.gemini_api_key.trim()) {
        // Mövcud mənbələri arxa planda Google Gemini File API (NotebookLM mühərriki) ilə sinxronlaşdır
        const butunMenbeler = db.menbeleriAl("all");
        (async () => {
          for (const m of butunMenbeler.slice(0, 10)) {
            try {
              await geminiFiles.menbeniGeminiIleSinxronEt(m, b.gemini_api_key.trim());
            } catch (_) {}
          }
        })();
      }
      if ("tg_bot_token" in b) {
        if (b.tg_bot_token && b.tg_bot_token.trim()) {
          await connectors.tgBaslat();
        } else {
          connectors.tgDayandir();
        }
      }
      return jsonCavab(res, 200, {
        ok: true,
        tenzimlemeler: yenilenmish,
        baglantilar: connectors.veziyyetiAl()
      });
    }

    if (yol === "/api/connectors/telegram/test" && req.method === "POST") {
      const b = await govdeOxu(req);
      if (b.tg_bot_token !== undefined) {
        db.tenzimlemeYenile({ tg_bot_token: b.tg_bot_token });
      }
      const nət = await connectors.tgBaslat();
      return jsonCavab(res, 200, nət);
    }

    // WhatsApp Web Canlı Sinxronizasiya Qəbuledicisi (Bookmarklet və ya Xarici Skriptdən)
    if (yol === "/api/connectors/whatsapp/ingest" && req.method === "POST") {
      const b = await govdeOxu(req);
      const { catAdi = "WhatsApp Canlı Çat", metn = "", mesajlar = [] } = b;
      let xam = metn;
      if (Array.isArray(mesajlar) && mesajlar.length > 0) {
        xam = mesajlar.map(m => `[${m.tarix || new Date().toISOString().slice(0, 16)}] ${m.gonderen || "Şəxs"}: ${m.metn}`).join("\n");
      }
      if (!xam.trim()) {
        return jsonCavab(res, 400, { ok: false, xeta: "Mesaj tapılmadı." });
      }
      const emal = await parsers.whatsappOxu(xam, catAdi);
      const menbe = db.menbeElaveEt({
        qovluq_id: "qovluq-cat",
        ad: `🟢 WP Canlı: ${catAdi}`,
        nov: "whatsapp",
        olcu: Buffer.byteLength(xam, "utf8"),
        xulase: emal.xulase,
        meta: { ...emal.meta, canli: true },
        xam_metn: xam,
        parcalar: emal.parcalar
      });
      ai.menbeVektorlashdir(menbe).catch(() => {});
      return jsonCavab(res, 200, { ok: true, menbe });
    }

    // 11. Demo Məlumatları Yüklə
    if (yol === "/api/demo-yukle" && req.method === "POST") {
      const elaveler = await numuneMelumatYukle();
      return jsonCavab(res, 200, {
        ok: true,
        say: elaveler.length,
        qovluqlar: db.qovluqlariAl(),
        statistika: db.statistikaAl()
      });
    }

    // ---- STATİK FAYLLAR (/public) ----
    let faylYolu = yol === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, yol);
    if (!faylYolu.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end("Qadağandır");
      return;
    }

    if (fs.existsSync(faylYolu) && fs.statSync(faylYolu).isFile()) {
      const uz = path.extname(faylYolu).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TIPLERI[uz] || "application/octet-stream",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      });
      fs.createReadStream(faylYolu).pipe(res);
    } else {
      res.writeHead(404);
      res.end("Tapılmadı");
    }
  } catch (err) {
    jsonCavab(res, 500, { ok: false, xeta: err.message || "Daxili server xətası" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n======================================================`);
  console.log(`🧠 BeyinAI (Şəxsi AI Asistant & NotebookLM) işə düşdü!`);
  console.log(`🌐 Ünvan: http://localhost:${PORT}`);
  console.log(`======================================================\n`);

  // Əgər Telegram Bot Token bazada varsa, avtomatik başlat
  const tenz = db.tenzimlemeleriAl();
  if (tenz.tg_bot_token) {
    connectors.tgBaslat().catch(() => {});
  }
});
