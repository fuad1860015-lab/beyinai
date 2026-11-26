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
const domainGuard = require("./src/domain-guard");
const simulator = require("./src/simulator");
const scheduler = require("./src/scheduler");
const payroll = require("./src/payroll");
const evolution = require("./src/evolution");
const webResearcher = require("./src/web-researcher");
const cognition = require("./src/cognition");

const PORT = Number(process.env.PORT) || 3847;
const HOST = process.env.HOST || "0.0.0.0";
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

const TEHLUKESIZLIK_BASLIQLARI = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "no-referrer",
  "X-XSS-Protection": "1; mode=block"
};

// Sadə və yüngül IP əsaslı Rate-Limiter (dəqiqədə maks. 120 API sorğusu)
const rateLimitMap = new Map();
const RATE_LIMIT_PENCERE_MS = 60 * 1000;
const RATE_LIMIT_MAKS = 120;

setInterval(() => {
  const indi = Date.now();
  for (const [ip, qeyd] of rateLimitMap.entries()) {
    if (indi - qeyd.baslangic > RATE_LIMIT_PENCERE_MS * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

function sorguLimitiniYoxla(req) {
  const ip =
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "local";
  const indi = Date.now();
  let qeyd = rateLimitMap.get(ip);
  if (!qeyd || indi - qeyd.baslangic > RATE_LIMIT_PENCERE_MS) {
    qeyd = { baslangic: indi, say: 1 };
    rateLimitMap.set(ip, qeyd);
    return { icaze: true, qalan: RATE_LIMIT_MAKS - 1 };
  }
  qeyd.say++;
  if (qeyd.say > RATE_LIMIT_MAKS) {
    return { icaze: false, qalan: 0 };
  }
  return { icaze: true, qalan: RATE_LIMIT_MAKS - qeyd.say };
}

function jsonCavab(res, status, data) {
  const govde = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...TEHLUKESIZLIK_BASLIQLARI
  });
  res.end(govde);
}

function govdeOxu(req, maksBayt = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const hisseler = [];
    let cemi = 0;
    const maksMb = Math.round(maksBayt / (1024 * 1024));
    req.on("data", chunk => {
      cemi += chunk.length;
      if (cemi > maksBayt) {
        req.destroy();
        reject(new Error(`Fayl ölçüsü həddindən artıq böyükdür (Maksimum ${maksMb} MB).`));
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
    if (yol.startsWith("/api/")) {
      const lim = sorguLimitiniYoxla(req);
      if (!lim.icaze) {
        return jsonCavab(res, 429, { ok: false, xeta: "Çox sayda sorğu göndərildi. Zəhmət olmasa 1 dəqiqə gözləyin." });
      }
    }

    // 1. Ümumi vəziyyət (Bootstrap)
    if (yol === "/api/bootstrap" && req.method === "GET") {
      const qovluq_id = urlObj.searchParams.get("qovluq_id") || "all";
      const sahe_id = urlObj.searchParams.get("sahe_id") || db.aktivSaheIdAl();
      return jsonCavab(res, 200, {
        ok: true,
        saheler: db.saheleriAl(),
        aktiv_sahe: db.aktivSaheAl(),
        aktiv_sahe_profili: cognition.saheProfiliTeminEt(sahe_id),
        bacariq_xeritesi: cognition.bacariqXeritesiniSinxronEt(sahe_id),
        sahe_movzulari: db.saheMovzulariAl(sahe_id),
        simulyasiya_statistika: db.simulyasiyaStatistikaAl(sahe_id),
        simulyasiya_ssenariler: simulator.ssenarileriAl(sahe_id),
        scheduler_veziyyet: {
          tezlik: db.tenzimlemeleriAl().scheduler_tezlik || "gunde_1",
          son_vaxt: Number(db.tenzimlemeleriAl().scheduler_son_vaxt) || 0,
          bildirisler: scheduler.vebBildirisleriAl()
        },
        vergi_teqvimi: scheduler.vergiTeqvimiStatusu(),
        qaralamalar: db.qaralamaYaddaslariAl(sahe_id),
        dusunme_qaydalari: db.dusunmeQaydalariniAl(sahe_id),
        mubahiseli_dosyeler: db.mubahiseliDosyeleriAl(sahe_id, "gozleyir"),
        qanun_tesir_hesabatlari: db.qanunTesirHesabatlariniAl(sahe_id, 5),
        qovluqlar: db.qovluqlariAl(),
        menbeler: db.menbeleriAl(qovluq_id, sahe_id),
        istirakcilar: db.istirakcilariAl(qovluq_id),
        yaddas: db.yaddaslariAl(sahe_id),
        sohbetler: db.sohbetleriAl(qovluq_id, 60, sahe_id),
        tenzimlemeler: db.tenzimlemeleriAl(),
        statistika: db.statistikaAl(),
        baglantilar: {
          ...connectors.veziyyetiAl(),
          notebooklm: agent.nlmKorpuVeziyyeti()
        }
      });
    }

    // 1b. Kitabxana və Bilik Sahələri (Domain Spaces) API-ləri
    if (yol === "/api/saheler" && req.method === "GET") {
      return jsonCavab(res, 200, {
        ok: true,
        saheler: db.saheleriAl(),
        aktiv_sahe: db.aktivSaheAl(),
        movzular: db.saheMovzulariAl(db.aktivSaheIdAl())
      });
    }

    if (yol === "/api/saheler" && req.method === "POST") {
      const b = await govdeOxu(req);
      if (!b.ad || !b.ad.trim()) return jsonCavab(res, 400, { ok: false, xeta: "Sahə adı boş ola bilməz." });
      const yeni = db.saheYarat(b);
      const profil = await cognition.yeniSaheniAvtoQurasdir(yeni, { llmIstifadeEt: b.llmIstifadeEt !== false });
      return jsonCavab(res, 200, {
        ok: true,
        sahe: yeni,
        profil,
        saheler: db.saheleriAl(),
        dusunme_qaydalari: db.dusunmeQaydalariniAl(yeni.id),
        bacariq_xeritesi: cognition.bacariqXeritesiniSinxronEt(yeni.id)
      });
    }

    if (yol === "/api/saheler/aktiv" && req.method === "POST") {
      const b = await govdeOxu(req);
      if (!b.sahe_id) return jsonCavab(res, 400, { ok: false, xeta: "Sahə ID-si tələb olunur." });
      const deyisdi = db.aktivSaheDeyis(b.sahe_id);
      return jsonCavab(res, 200, {
        ok: true,
        aktiv_sahe: deyisdi,
        aktiv_sahe_profili: cognition.saheProfiliTeminEt(b.sahe_id),
        bacariq_xeritesi: cognition.bacariqXeritesiniSinxronEt(b.sahe_id),
        saheler: db.saheleriAl(),
        sahe_movzulari: db.saheMovzulariAl(b.sahe_id),
        menbeler: db.menbeleriAl("all", b.sahe_id)
      });
    }

    if (yol.startsWith("/api/saheler/") && yol.endsWith("/movzular") && req.method === "GET") {
      const hisseler = yol.split("/");
      const saheId = decodeURIComponent(hisseler[3] || "");
      return jsonCavab(res, 200, { ok: true, movzular: db.saheMovzulariAl(saheId) });
    }

    if (yol.startsWith("/api/saheler/") && yol.endsWith("/movzular") && req.method === "POST") {
      const hisseler = yol.split("/");
      const saheId = decodeURIComponent(hisseler[3] || "");
      const b = await govdeOxu(req);
      const yeni = db.saheMovzuElaveEt({ sahe_id: saheId, ...b });
      return jsonCavab(res, 200, { ok: true, movzu: yeni, movzular: db.saheMovzulariAl(saheId) });
    }

    // 1c. Sınaq və Praktiki Təcrübə Simulyatoru (Autonomous Simulator & Case-Solver) API-ləri
    if (yol === "/api/simulyator/ssenariler" && req.method === "GET") {
      const saheId = urlObj.searchParams.get("sahe_id") || db.aktivSaheIdAl();
      return jsonCavab(res, 200, {
        ok: true,
        ssenariler: simulator.ssenarileriAl(saheId),
        statistika: db.simulyasiyaStatistikaAl(saheId)
      });
    }

    if (yol === "/api/simulyator/tarixce" && req.method === "GET") {
      const saheId = urlObj.searchParams.get("sahe_id") || null;
      const limit = Number(urlObj.searchParams.get("limit")) || 30;
      return jsonCavab(res, 200, {
        ok: true,
        simulyasiyalar: db.simulyasiyalariAl(saheId, limit),
        statistika: db.simulyasiyaStatistikaAl(saheId)
      });
    }

    if (yol === "/api/simulyator/icra" && req.method === "POST") {
      const b = await govdeOxu(req);
      const saheId = b.sahe_id || db.aktivSaheIdAl();
      try {
        const netice = await simulator.simulyasiyaIcraEt({
          ssenariId: b.ssenariId || null,
          customSsenari: b.customSsenari || null,
          saheId
        });
        return jsonCavab(res, 200, {
          ok: true,
          netice,
          statistika: db.simulyasiyaStatistikaAl(saheId),
          bacariq_xeritesi: cognition.bacariqXeritesiniSinxronEt(saheId),
          yaddas: db.yaddaslariAl(saheId),
          sahe_movzulari: db.saheMovzulariAl(saheId)
        });
      } catch (err) {
        return jsonCavab(res, 500, { ok: false, xeta: err.message || "Simulyasiya zamanı xəta baş verdi." });
      }
    }

    if (yol === "/api/simulyator/avto-tedqiqat" && req.method === "POST") {
      const b = await govdeOxu(req);
      const saheId = b.sahe_id || db.aktivSaheIdAl();
      const netice = simulator.bilikBosluqlariniAvtoTedqiqEt(saheId);
      return jsonCavab(res, 200, {
        ok: true,
        ...netice,
        movzular: db.saheMovzulariAl(saheId),
        bosluqlar: db.bilikBosluqlariniAl(20)
      });
    }

    // 1d. Planlaşdırılmış Avtonom Tədqiqatçı və Vergi Təqvimi (Scheduler & Tax Calendar)
    if (yol === "/api/scheduler/veziyyet" && req.method === "GET") {
      const tenz = db.tenzimlemeleriAl();
      return jsonCavab(res, 200, {
        ok: true,
        tezlik: tenz.scheduler_tezlik || "gunde_1",
        son_vaxt: Number(tenz.scheduler_son_vaxt) || 0,
        teqvim: scheduler.vergiTeqvimiStatusu(),
        bildirisler: scheduler.vebBildirisleriAl()
      });
    }

    if (yol === "/api/scheduler/tezlik" && req.method === "POST") {
      const b = await govdeOxu(req);
      if (!b.tezlik) return jsonCavab(res, 400, { ok: false, xeta: "Tezlik seçimi tələb olunur." });
      db.tenzimlemeYenile({ scheduler_tezlik: b.tezlik });
      return jsonCavab(res, 200, { ok: true, tezlik: b.tezlik });
    }

    if (yol === "/api/scheduler/icra" && req.method === "POST") {
      try {
        const netice = await scheduler.avtoTedqiqatDovresiCalisdir({ mecburidir: true });
        return jsonCavab(res, 200, {
          ok: true,
          netice,
          bildirisler: scheduler.vebBildirisleriAl(),
          yaddas: db.yaddaslariAl(db.aktivSaheIdAl())
        });
      } catch (err) {
        return jsonCavab(res, 500, { ok: false, xeta: err.message || "Tədqiqat dövrəsi xətası" });
      }
    }

    if (yol === "/api/scheduler/teqvim" && req.method === "GET") {
      return jsonCavab(res, 200, { ok: true, teqvim: scheduler.vergiTeqvimiStatusu() });
    }

    if (yol === "/api/scheduler/bildirisler" && req.method === "GET") {
      return jsonCavab(res, 200, { ok: true, bildirisler: scheduler.vebBildirisleriAl() });
    }

    if (yol === "/api/scheduler/bildirisler" && req.method === "DELETE") {
      scheduler.bildirisleriTemizle();
      return jsonCavab(res, 200, { ok: true, bildirisler: [] });
    }

    // 1e. Maaş, Məzuniyyət və Son Haqq-Hesab Generatoru
    if (yol === "/api/kalkulyator/haqq-hesab" && req.method === "POST") {
      const b = await govdeOxu(req);
      try {
        const netice = payroll.sonHaqqHesabHesabatiQur(b);
        return jsonCavab(res, 200, { ok: true, ...netice });
      } catch (err) {
        return jsonCavab(res, 400, { ok: false, xeta: err.message || "Hesablama xətası" });
      }
    }

    // 1f. BeyinAI Özünü-İnkişaf və Təkamül Mühərriki (v2.0 + v3.0 Bacarıq Xəritəsi) API-ləri
    if (yol === "/api/tekamul/veziyyet" && req.method === "GET") {
      const saheId = urlObj.searchParams.get("sahe_id") || db.aktivSaheIdAl();
      return jsonCavab(res, 200, {
        ok: true,
        aktiv_sahe_profili: cognition.saheProfiliTeminEt(saheId),
        bacariq_xeritesi: cognition.bacariqXeritesiniSinxronEt(saheId),
        qaralamalar: db.qaralamaYaddaslariAl(saheId),
        arxiv_yaddaslar: db.arxivYaddaslariAl(saheId),
        dusunme_qaydalari: db.dusunmeQaydalariniAl(saheId),
        mubahiseli_dosyeler: db.mubahiseliDosyeleriAl(saheId),
        qanun_tesir_hesabatlari: db.qanunTesirHesabatlariniAl(saheId, 10)
      });
    }

    if (yol === "/api/tekamul/qaralama/tesdiq" && req.method === "POST") {
      const b = await govdeOxu(req);
      const saheId = b.sahe_id || db.aktivSaheIdAl();
      const tesdiq = db.qaralamaTesdiqle(b.id);
      if (!tesdiq) return jsonCavab(res, 404, { ok: false, xeta: "Qaralama qayda tapılmadı." });
      return jsonCavab(res, 200, {
        ok: true,
        tesdiq,
        qaralamalar: db.qaralamaYaddaslariAl(saheId),
        yaddas: db.yaddaslariAl(saheId),
        statistika: db.statistikaAl()
      });
    }

    if (yol === "/api/tekamul/qaralama/redd" && req.method === "POST") {
      const b = await govdeOxu(req);
      const saheId = b.sahe_id || db.aktivSaheIdAl();
      db.qaralamaReddEt(b.id);
      return jsonCavab(res, 200, {
        ok: true,
        qaralamalar: db.qaralamaYaddaslariAl(saheId),
        statistika: db.statistikaAl()
      });
    }

    if (yol === "/api/tekamul/boz-zona/qerar" && req.method === "POST") {
      const b = await govdeOxu(req);
      const saheId = b.sahe_id || db.aktivSaheIdAl();
      const qerar = db.mubahiseliDosyeQerarVer(b.id, {
        secilmis_movqe: b.secilmis_movqe || "teref_b",
        ekspert_qerari: b.ekspert_qerari || ""
      });
      if (!qerar) return jsonCavab(res, 404, { ok: false, xeta: "Boz zona dosyesi tapılmadı." });
      return jsonCavab(res, 200, {
        ok: true,
        ...qerar,
        mubahiseli_dosyeler: db.mubahiseliDosyeleriAl(saheId),
        yaddas: db.yaddaslariAl(saheId),
        statistika: db.statistikaAl()
      });
    }

    if (yol === "/api/tekamul/dusunme-qaydasi/sil" && req.method === "POST") {
      const b = await govdeOxu(req);
      const saheId = b.sahe_id || db.aktivSaheIdAl();
      db.dusunmeQaydasiSil(b.id);
      return jsonCavab(res, 200, {
        ok: true,
        dusunme_qaydalari: db.dusunmeQaydalariniAl(saheId),
        statistika: db.statistikaAl()
      });
    }

    if (yol === "/api/tekamul/dinamik-sinaq" && req.method === "POST") {
      const b = await govdeOxu(req);
      const saheId = b.sahe_id || db.aktivSaheIdAl();
      try {
        const netice = await simulator.simulyasiyaIcraEt({
          dinamikNov: b.dinamikNov || "carpaz_madde",
          saheId
        });
        return jsonCavab(res, 200, {
          ok: true,
          netice,
          statistika: db.simulyasiyaStatistikaAl(saheId),
          bacariq_xeritesi: cognition.bacariqXeritesiniSinxronEt(saheId),
          qaralamalar: db.qaralamaYaddaslariAl(saheId),
          dusunme_qaydalari: db.dusunmeQaydalariniAl(saheId),
          yaddas: db.yaddaslariAl(saheId)
        });
      } catch (err) {
        return jsonCavab(res, 500, { ok: false, xeta: err.message });
      }
    }

    if (yol === "/api/tekamul/iyerarxik-arasdir" && req.method === "POST") {
      const b = await govdeOxu(req);
      const saheId = b.sahe_id || db.aktivSaheIdAl();
      try {
        const netice = await webResearcher.bosluguIyerarxikArasdir({
          bosluqId: b.bosluqId || null,
          sual: b.sual || "",
          movzu: b.movzu || "",
          sahe_id: saheId
        });
        return jsonCavab(res, 200, {
          ok: true,
          netice,
          qaralamalar: db.qaralamaYaddaslariAl(saheId),
          mubahiseli_dosyeler: db.mubahiseliDosyeleriAl(saheId),
          bosluqlar: db.bilikBosluqlariniAl(20)
        });
      } catch (err) {
        return jsonCavab(res, 500, { ok: false, xeta: err.message });
      }
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
      const { qovluq_id = "qovluq-is", faylAdi, mimeType = "", base64Data, sahe_id = null } = b;
      if (!faylAdi || !base64Data) {
        return jsonCavab(res, 400, { ok: false, xeta: "Fayl məlumatı tam deyil." });
      }

      // Ayrı İşçi Axında (Worker Thread) emal et ki, böyük PDF/ZIP faylları serveri heç vaxt dondurmasın
      const { emal, olcu } = await fayliWorkerIleEmalEt({ base64Data, faylAdi, mimeType }, 45000);

      // Sərhəd Qoruyucusu: Sənədin aktiv sahəyə uyğunluğunu yoxla
      const saheQiymet = domainGuard.saheUygunluguQiymetlendir({
        metn: emal.xam_metn,
        basliq: emal.ad || faylAdi,
        aktivSaheId: sahe_id || db.aktivSaheIdAl()
      });
      const teyinOlunanSaheId = sahe_id || saheQiymet.hedefSaheId;

      // Əgər çat faylıdırsa və qovluq "all" seçilibsə, avtomatik Çat qovluğuna yönləndir
      const hedefQovluq =
        qovluq_id && qovluq_id !== "all"
          ? qovluq_id
          : (emal.nov === "whatsapp" || emal.nov === "telegram" ? "qovluq-cat" : "qovluq-is");

      const senedBasliq = emal.ad || faylAdi;
      const evvelkiMenbe = db.db.prepare("SELECT xam_metn FROM menbeler WHERE qovluq_id = ? AND LOWER(ad) = LOWER(?)").get(hedefQovluq, senedBasliq);
      const kohneMetn = evvelkiMenbe ? evvelkiMenbe.xam_metn : "";

      const menbe = db.menbeElaveEt({
        qovluq_id: hedefQovluq,
        sahe_id: teyinOlunanSaheId,
        ad: senedBasliq,
        nov: emal.nov,
        olcu,
        xulase: emal.xulase,
        meta: { ...(emal.meta || {}), sahe_qiymet: saheQiymet },
        xam_metn: emal.xam_metn,
        parcalar: emal.parcalar
      });

      // Qanun dəyişikliyi olduqda köhnə qaydaları silmədən dövr üzrə arxivlə və Təsir Hesabatı çıxar
      const qanunTesir = evolution.qanunDeyisikliyiYoxlaVeArxivle({
        senedAdi: senedBasliq,
        xamMetn: emal.xam_metn,
        kohneMetn,
        sahe_id: teyinOlunanSaheId
      });
      if (qanunTesir && qanunTesir.deyisiklikTapildi) {
        scheduler.bildirisQeydEt({
          nov: "qanun_deyisikliyi",
          basliq: `📜 Qanun Dəyişikliyi Təsir Hesabatı: ${senedBasliq}`,
          metn: qanunTesir.xulase,
          seviyye: "xeberdarliq"
        });
      }

      // Avtonom Öyrənmə: Sənəddən mövzuları çıxar və sahənin öyrənilmiş mövzularına yaz
      const oyrenilenMovzular = domainGuard.movzuTapVeOyren({
        metn: emal.xam_metn,
        basliq: senedBasliq,
        sahe_id: teyinOlunanSaheId
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
        sahe_qiymet: saheQiymet,
        qanun_tesir: qanunTesir,
        oyrenilen_movzular: oyrenilenMovzular,
        qovluqlar: db.qovluqlariAl(),
        statistika: db.statistikaAl()
      });
    }

    // 4. Veb Link və ya YouTube Əlavə Etmə
    if (yol === "/api/menbeler/link" && req.method === "POST") {
      const b = await govdeOxu(req);
      const { qovluq_id = "qovluq-sexsi", url, sahe_id = null } = b;
      if (!url || !url.trim()) {
        return jsonCavab(res, 400, { ok: false, xeta: "Link (URL) daxil edilməyib." });
      }

      const emal = await parsers.linkOxu(url);
      const hedefQovluq = qovluq_id && qovluq_id !== "all" ? qovluq_id : "qovluq-sexsi";

      const saheQiymet = domainGuard.saheUygunluguQiymetlendir({
        metn: emal.xam_metn,
        basliq: emal.ad,
        aktivSaheId: sahe_id || db.aktivSaheIdAl()
      });
      const teyinOlunanSaheId = sahe_id || saheQiymet.hedefSaheId;

      const kohneLinkMenbe = db.db.prepare("SELECT xam_metn FROM menbeler WHERE qovluq_id = ? AND LOWER(ad) = LOWER(?)").get(hedefQovluq, emal.ad);
      const menbe = db.menbeElaveEt({
        qovluq_id: hedefQovluq,
        sahe_id: teyinOlunanSaheId,
        ad: emal.ad,
        nov: emal.nov,
        olcu: emal.xam_metn.length,
        xulase: emal.xulase,
        meta: { ...(emal.meta || {}), sahe_qiymet: saheQiymet },
        xam_metn: emal.xam_metn,
        parcalar: emal.parcalar
      });

      const qanunTesir = evolution.qanunDeyisikliyiYoxlaVeArxivle({
        senedAdi: emal.ad,
        xamMetn: emal.xam_metn,
        kohneMetn: kohneLinkMenbe?.xam_metn || "",
        sahe_id: teyinOlunanSaheId
      });
      if (qanunTesir?.deyisiklikTapildi) {
        scheduler.bildirisQeydEt({
          nov: "qanun_deyisikliyi",
          basliq: `📜 Link Qanun Yenilənməsi: ${emal.ad}`,
          metn: qanunTesir.xulase,
          seviyye: "xeberdarliq"
        });
      }

      const oyrenilenMovzular = domainGuard.movzuTapVeOyren({
        metn: emal.xam_metn,
        basliq: emal.ad,
        sahe_id: teyinOlunanSaheId
      });

      ai.menbeVektorlashdir(menbe).catch(() => {});

      return jsonCavab(res, 200, {
        ok: true,
        menbe,
        sahe_qiymet: saheQiymet,
        qanun_tesir: qanunTesir,
        oyrenilen_movzular: oyrenilenMovzular,
        qovluqlar: db.qovluqlariAl(),
        statistika: db.statistikaAl()
      });
    }

    // 5. Mətn / Çat Yapışdırma (Birbaşa kopyalanmış WhatsApp/Telegram mesajları və ya qeyd)
    if (yol === "/api/menbeler/metn" && req.method === "POST") {
      const b = await govdeOxu(req);
      const { qovluq_id = "qovluq-sexsi", basliq = "Sürətli Qeyd", metn = "", sahe_id = null } = b;
      if (!metn.trim()) {
        return jsonCavab(res, 400, { ok: false, xeta: "Mətn boş ola bilməz." });
      }

      const emal = await parsers.whatsappOxu(metn, basliq);
      const isMuhasibatMetni = /(?:vergi|məcəllə|qaimə|ədv|müqavilə|maddə\s+\d+|mühasib|bəyannamə)/i.test(basliq + " " + metn.slice(0, 800));
      const hedefQovluq =
        qovluq_id && qovluq_id !== "all"
          ? qovluq_id
          : (emal.nov === "whatsapp" ? "qovluq-cat" : (isMuhasibatMetni ? "qovluq-is" : "qovluq-sexsi"));

      const saheQiymet = domainGuard.saheUygunluguQiymetlendir({
        metn,
        basliq,
        aktivSaheId: sahe_id || db.aktivSaheIdAl()
      });
      const teyinOlunanSaheId = sahe_id || saheQiymet.hedefSaheId;

      const kohneQeyd = db.db.prepare("SELECT xam_metn FROM menbeler WHERE qovluq_id = ? AND LOWER(ad) = LOWER(?)").get(hedefQovluq, basliq);
      const menbe = db.menbeElaveEt({
        qovluq_id: hedefQovluq,
        sahe_id: teyinOlunanSaheId,
        ad: basliq,
        nov: emal.nov === "whatsapp" ? "whatsapp" : "qeyd",
        olcu: Buffer.byteLength(metn, "utf8"),
        xulase: emal.xulase,
        meta: { ...(emal.meta || {}), sahe_qiymet: saheQiymet },
        xam_metn: metn,
        parcalar: emal.parcalar
      });

      const qanunTesir = evolution.qanunDeyisikliyiYoxlaVeArxivle({
        senedAdi: basliq,
        xamMetn: metn,
        kohneMetn: kohneQeyd?.xam_metn || "",
        sahe_id: teyinOlunanSaheId
      });
      if (qanunTesir?.deyisiklikTapildi) {
        scheduler.bildirisQeydEt({
          nov: "qanun_deyisikliyi",
          basliq: `📜 Qanun Dəyişikliyi Təsir Hesabatı: ${basliq}`,
          metn: qanunTesir.xulase,
          seviyye: "xeberdarliq"
        });
      }

      const oyrenilenMovzular = domainGuard.movzuTapVeOyren({
        metn,
        basliq,
        sahe_id: teyinOlunanSaheId
      });

      ai.menbeVektorlashdir(menbe).catch(() => {});

      return jsonCavab(res, 200, {
        ok: true,
        menbe,
        sahe_qiymet: saheQiymet,
        qanun_tesir: qanunTesir,
        oyrenilen_movzular: oyrenilenMovzular,
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
        const kohneSinxronMetn = menbe.xam_metn || "";
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

        const qanunTesir = evolution.qanunDeyisikliyiYoxlaVeArxivle({
          senedAdi: emal.ad || menbe.ad,
          xamMetn: emal.xam_metn,
          kohneMetn: kohneSinxronMetn,
          sahe_id: menbe.sahe_id || db.aktivSaheIdAl()
        });
        if (qanunTesir?.deyisiklikTapildi) {
          scheduler.bildirisQeydEt({
            nov: "qanun_deyisikliyi",
            basliq: `📜 Canlı Linkdə Qanun Dəyişikliyi Aşkarlandı: ${emal.ad || menbe.ad}`,
            metn: qanunTesir.xulase,
            seviyye: "tehlukeli"
          });
        }

        ai.menbeVektorlashdir(yenilenmis).catch(() => {});

        return jsonCavab(res, 200, {
          ok: true,
          menbe: yenilenmis,
          qanun_tesir: qanunTesir,
          mesaj: `Mənbə canlı linkdən uğurla yeniləndi! (${yenilenmis.parcalar?.length || 0} parça/maddə yenidən indeksləndi)`
        });
      } catch (e) {
        return jsonCavab(res, 500, { ok: false, xeta: "Sinxronizasiya xətası: " + e.message });
      }
    }

    // 7. Mənbə Aktiv/Deaktiv, Qovluq Dəyişmə və ya Silmə
    if (yol.startsWith("/api/menbeler/") && req.method === "PUT") {
      const id = decodeURIComponent(yol.split("/").pop());
      const b = await govdeOxu(req);
      if (b.aktiv !== undefined) {
        db.menbeAktivlikDeyis(id, b.aktiv);
      }
      if (b.qovluq_id && typeof db.menbeQovluqDeyis === "function") {
        db.menbeQovluqDeyis(id, b.qovluq_id);
      }
      return jsonCavab(res, 200, {
        ok: true,
        qovluqlar: db.qovluqlariAl(),
        statistika: db.statistikaAl()
      });
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

      // Əgər kalkulyator sorğusudursa, dərhal dəqiq riyazi alqoritmlə cavabla
      const calculator = require("./src/calculator");
      if (calculator.kalkulyatorSorgusudurmu(b.sual)) {
        const kalk = calculator.kalkulyatorEmalEt(b.sual);
        return jsonCavab(res, 200, {
          ok: true,
          cavab: {
            metn: kalk.mesaj,
            model: "Daxili Mühasibat Kalkulyatoru",
            istifadeEdilenParcaSayi: 0
          },
          sitatlar: [],
          yaddas: db.yaddaslariAl()
        });
      }

      const secilmisSaheId = b.sahe_id || db.aktivSaheIdAl();
      const netice = await agent.agentSualCavabla({
        sual: b.sual.trim(),
        qovluq_id: b.qovluq_id || "all",
        sahe_id: secilmisSaheId,
        gonderen: b.gonderen || "",
        tarix_baslangic: b.tarix_baslangic || "",
        tarix_son: b.tarix_son || "",
        menbe_nov: b.menbe_nov || "",
        derin_rejim: b.derin_rejim !== undefined ? b.derin_rejim : null
      });
      return jsonCavab(res, 200, {
        ok: true,
        ...netice,
        sahe_id: secilmisSaheId,
        yaddas: db.yaddaslariAl(secilmisSaheId),
        qaralamalar: db.qaralamaYaddaslariAl(secilmisSaheId),
        dusunme_qaydalari: db.dusunmeQaydalariniAl(secilmisSaheId),
        mubahiseli_dosyeler: db.mubahiseliDosyeleriAl(secilmisSaheId, "gozleyir")
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

    // 8c. Bütün Bazada Ani Maddə və Açar Söz Axtarışı (<10ms)
    if (yol === "/api/axtar" && req.method === "GET") {
      const q = (urlObj.searchParams.get("q") || "").trim();
      const qovluq_id = urlObj.searchParams.get("qovluq_id") || "all";
      if (!q) {
        return jsonCavab(res, 200, { ok: true, neticeler: [] });
      }
      const tapilan = db.hibridAxtar({
        sorgu: q,
        qovluq_id,
        limit: 15
      });
      return jsonCavab(res, 200, {
        ok: true,
        neticeler: tapilan.map(r => ({
          id: r.id,
          menbe_id: r.menbe_id,
          menbe_adi: r.menbe_adi,
          menbe_novu: r.menbe_novu,
          basliq: r.basliq,
          gonderen: r.gonderen,
          tarix: r.tarix,
          metn: r.metn.slice(0, 380),
          xal: Number((r.xal || 0).toFixed(1))
        }))
      });
    }

    // 9. Uzunmüddətli Şəxsi Yaddaş
    if (yol === "/api/yaddas" && req.method === "POST") {
      const b = await govdeOxu(req);
      db.yaddasElaveEt(b);
      return jsonCavab(res, 200, { ok: true, yaddas: db.yaddaslariAl() });
    }

    if (yol.startsWith("/api/yaddas/") && req.method === "PUT") {
      const id = decodeURIComponent(yol.split("/").pop());
      const b = await govdeOxu(req);
      if (!b.metn || !b.metn.trim()) {
        return jsonCavab(res, 400, { ok: false, xeta: "Yaddaş mətni boş ola bilməz." });
      }
      db.yaddasRedakteEt(id, b);
      return jsonCavab(res, 200, { ok: true, yaddas: db.yaddaslariAl() });
    }

    if (yol.startsWith("/api/yaddas/") && req.method === "DELETE") {
      const id = decodeURIComponent(yol.split("/").pop());
      db.yaddasSil(id);
      return jsonCavab(res, 200, { ok: true, yaddas: db.yaddaslariAl() });
    }

    // 9b. Aktiv Özü-Öyrənmə Dövrəsi (👍 Cavabı Təsdiqlə & 🎯 Ekspert Düzəlişi Öyrət)
    if (yol === "/api/oyren" && req.method === "POST") {
      const b = await govdeOxu(req);
      const { nov = "tesdiq", sual = "", cavab = "", duzelis = "" } = b;

      if (nov === "duzelis") {
        if (!duzelis || !duzelis.trim()) {
          return jsonCavab(res, 400, { ok: false, xeta: "Düzəliş mətni boş ola bilməz." });
        }
        const movzu = sual ? `[Mövzu: ${sual.slice(0, 130).replace(/\n/g, " ")}] → ` : "";
        const qizilMetn = `QIZIL QAYDA (Ekspert Düzəlişi): ${movzu}${duzelis.trim()}`;
        const yad = db.yaddasElaveEt({
          kateqoriya: "qayda",
          metn: qizilMetn,
          menbe: "Ekspert Əks-Əlaqə",
          vaciblik: 5
        });
        const keys = db.praktikaKeysElaveEt({
          basliq: `🎯 Ekspert Düzəlişi: ${(sual || duzelis).slice(0, 75)}`,
          sual: sual || "Ekspert Düzəlişi",
          cavab: duzelis.trim(),
          gonderen: "Ekspert Əks-Əlaqə",
          nov: "duzelis"
        });
        let yeniDusunmeQaydasi = null;
        try {
          yeniDusunmeQaydasi = await evolution.kokSebebAnaliziEt({
            sual: sual || "Ekspert Düzəlişi",
            sehvCavab: cavab || "",
            duzgunIzah: duzelis.trim()
          });
        } catch (_) {}
        try {
          db.bacariqQeydEt({
            movzu: (sual || duzelis).slice(0, 80),
            bal: 40,
            nov: "duzelis"
          });
        } catch (_) {}
        return jsonCavab(res, 200, {
          ok: true,
          yaddas: db.yaddaslariAl(),
          dusunme_qaydalari: db.dusunmeQaydalariniAl(),
          bacariq_xeritesi: cognition.bacariqXeritesiniSinxronEt(),
          yeni_dusunme_qaydasi: yeniDusunmeQaydasi,
          qovluqlar: db.qovluqlariAl(),
          statistika: db.statistikaAl(),
          elaveYaddas: yad,
          keysMenbeId: keys?.id || null
        });
      }

      // nov === "tesdiq" (Cavabı etalon keys kimi Təcrübə Bankına əlavə et və Bacarıq Xəritəsində gücləndir)
      try {
        if (sual) {
          db.bacariqQeydEt({
            movzu: sual.slice(0, 80),
            bal: 95,
            nov: "tesdiq"
          });
        }
      } catch (_) {}
      const qisaHisse = String(cavab || "")
        .split(/<DETALLI_ANALIZ>/i)[0]
        .replace(/###\s*📌?\s*Konkret və Qısa Cavab:?/i, "")
        .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "")
        .trim();

      const keys = db.praktikaKeysElaveEt({
        basliq: `✅ Təsdiqlənmiş Keys: ${(sual || qisaHisse).slice(0, 75)}`,
        sual: sual || "Təsdiqlənmiş Ekspert Sualı",
        cavab: qisaHisse || cavab,
        gonderen: "Ekspert Təsdiqi",
        nov: "tesdiq"
      });

      return jsonCavab(res, 200, {
        ok: true,
        yaddas: db.yaddaslariAl(),
        qovluqlar: db.qovluqlariAl(),
        statistika: db.statistikaAl(),
        keysMenbeId: keys?.id || null
      });
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

    // 12. Mühasibat və Əməkhaqqı Kalkulyatoru API
    if (yol === "/api/kalkulyator" && req.method === "POST") {
      const b = await govdeOxu(req);
      const calculator = require("./src/calculator");
      const netice = calculator.kalkulyatorEmalEt(b.metn || "");
      return jsonCavab(res, 200, { ok: true, ...netice });
    }

    // 13. Həftəlik Mühasibat Təcrübə Bülleteni API
    if (yol === "/api/bulleten" && (req.method === "GET" || req.method === "POST")) {
      const bulleten = require("./src/bulleten");
      const icmal = await bulleten.heftelikBulletenHazirla();
      return jsonCavab(res, 200, { ok: true, icmal });
    }

    // 14. Bilik Boşluqları (Knowledge Gap Log) API
    if (yol === "/api/bosluqlar" && req.method === "GET") {
      return jsonCavab(res, 200, { ok: true, bosluqlar: db.bilikBosluqlariniAl(30) });
    }

    if (yol.startsWith("/api/bosluqlar/") && req.method === "DELETE") {
      const id = decodeURIComponent(yol.split("/").pop());
      db.bilikBosluguHellEt(id);
      return jsonCavab(res, 200, { ok: true, bosluqlar: db.bilikBosluqlariniAl(30) });
    }

    // 15. Yaddaşın Özünü-Təmizləməsi (Memory Consolidation) API
    if (yol === "/api/yaddas/konsolidasiya" && req.method === "POST") {
      const consolidator = require("./src/memory-consolidator");
      const netice = await consolidator.yaddasiKonsolidasiyaEt({ aiIstifadeEt: true });
      return jsonCavab(res, 200, { ...netice, yaddas: db.yaddaslariAl() });
    }

    // 16. 1-Kliklə Baza Ehtiyat Nüsxəsi (SQLite Backup) və Bərpa (Restore) API
    if (yol === "/api/backup" && req.method === "GET") {
      const bkp = db.bazaBackupHazirla();
      res.writeHead(200, {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="${bkp.faylAdi}"`,
        "Content-Length": bkp.olcu,
        ...TEHLUKESIZLIK_BASLIQLARI
      });
      res.end(bkp.buffer);
      return;
    }

    if (yol === "/api/backup/berpa" && req.method === "POST") {
      const b = await govdeOxu(req, 50 * 1024 * 1024);
      if (!b.base64Data) {
        return jsonCavab(res, 400, { ok: false, xeta: "Backup faylı (base64Data) göndərilməyib." });
      }
      const buf = Buffer.from(b.base64Data, "base64");
      const net = db.bazaBackupBerpaEt(buf);
      return jsonCavab(res, 200, {
        ...net,
        mesaj: `Baza uğurla bərpa edildi! (${net.menbeSayi} mənbə, ${net.parcaSayi} parça, ${net.yaddasSayi} yaddaş)`
      });
    }

    // 16b. Mənbə Versiyaları və Audit Jurnalı API
    if (yol.startsWith("/api/menbeler/") && yol.endsWith("/versiyalar") && req.method === "GET") {
      const hisseler = yol.split("/");
      const id = decodeURIComponent(hisseler[3] || "");
      return jsonCavab(res, 200, { ok: true, versiyalar: db.menbeVersiyalariniAl(id) });
    }

    if (yol === "/api/audit" && req.method === "GET") {
      return jsonCavab(res, 200, { ok: true, jurnal: db.auditJurnaliniAl(50) });
    }

    // 17. Tam Semantik Vektor İndeksləməsi API
    if (yol === "/api/vektor/status" && req.method === "GET") {
      return jsonCavab(res, 200, { ok: true, ...ai.vektorIsiVeziyyetiAl() });
    }

    if (yol === "/api/vektor/yenile" && req.method === "POST") {
      const cari = ai.vektorIsiVeziyyetiAl();
      if (cari.gedir) {
        return jsonCavab(res, 200, { ok: true, gedir: true, mesaj: "Vektorlaşdırma artıq gedir.", ...cari });
      }
      ai.butunBazaniVektorlashdir({ batchOlcu: 5, gecikmeMs: 250 }).catch(() => {});
      return jsonCavab(res, 200, {
        ok: true,
        basladildi: true,
        mesaj: "Tam semantik vektorlaşdırma arxa planda başladıldı.",
        ...ai.vektorIsiVeziyyetiAl()
      });
    }

    // ---- STATİK FAYLLAR (/public) ----
    const nisbiYol = yol === "/" ? "index.html" : yol.replace(/^\/+/, "");
    const faylYolu = path.resolve(PUBLIC_DIR, nisbiYol);
    if (!faylYolu.startsWith(path.resolve(PUBLIC_DIR))) {
      res.writeHead(403, TEHLUKESIZLIK_BASLIQLARI);
      res.end("Qadağandır");
      return;
    }

    if (fs.existsSync(faylYolu) && fs.statSync(faylYolu).isFile()) {
      const uz = path.extname(faylYolu).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TIPLERI[uz] || "application/octet-stream",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        ...TEHLUKESIZLIK_BASLIQLARI
      });
      fs.createReadStream(faylYolu).pipe(res);
    } else {
      res.writeHead(404, TEHLUKESIZLIK_BASLIQLARI);
      res.end("Tapılmadı");
    }
  } catch (err) {
    jsonCavab(res, 500, { ok: false, xeta: err.message || "Daxili server xətası" });
  }
});

// ---- Global Server Qalxanı (Gözlənilməz xətalarda serverin çökməsinin qarşısını alır) ----
process.on("uncaughtException", err => {
  console.error("🛡️ [Global Qoruyucu - uncaughtException]:", err?.message || err);
});

process.on("unhandledRejection", reason => {
  console.error("🛡️ [Global Qoruyucu - unhandledRejection]:", reason?.message || reason);
});

function seliqeliDayandir(siqnal) {
  console.log(`\n🛑 [${siqnal}] Server səliqəli dayandırılır, SQLite WAL yaddaşa yazılır...`);
  try {
    db.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch (_) {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT", () => seliqeliDayandir("SIGINT"));
process.on("SIGTERM", () => seliqeliDayandir("SIGTERM"));

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`\n======================================================`);
    console.log(`🧠 BeyinAI v4.0 (Kitabxana + Özünü-İnkişaf Mühərriki) işə düşdü!`);
    console.log(`🌐 Ünvan: http://localhost:${PORT}`);
    console.log(`🛡️ Server Qalxanı: Rate-Limit + Təhlükəsiz Başlıqlar + Global Qoruyucu Aktiv`);
    console.log(`======================================================\n`);

    const tenz = db.tenzimlemeleriAl();
    if (tenz.tg_bot_token) {
      connectors.tgBaslat().catch(() => {});
    }
  });
}

module.exports = { server };
