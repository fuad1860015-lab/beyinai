// Mərkəzi Beyin Verilənlər Bazası (Lokal SQLite — node:sqlite)
// BM25 / IDF + Azərbaycan Dili Morfoloji Kök Axtarışı + Semantik Vektor + Metadata Filtrləmə
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "beyin.sqlite");
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS qovluqlar (
    id TEXT PRIMARY KEY,
    ad TEXT NOT NULL,
    ikon TEXT DEFAULT '📁',
    reng TEXT DEFAULT '#6366f1',
    aciqlama TEXT DEFAULT '',
    yaradildi INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS menbeler (
    id TEXT PRIMARY KEY,
    qovluq_id TEXT NOT NULL,
    ad TEXT NOT NULL,
    nov TEXT NOT NULL,
    olcu INTEGER DEFAULT 0,
    xulase TEXT DEFAULT '',
    meta TEXT DEFAULT '{}',
    xam_metn TEXT DEFAULT '',
    aktiv INTEGER DEFAULT 1,
    yaradildi INTEGER NOT NULL,
    FOREIGN KEY (qovluq_id) REFERENCES qovluqlar(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS parcalar (
    id TEXT PRIMARY KEY,
    menbe_id TEXT NOT NULL,
    qovluq_id TEXT NOT NULL,
    sira INTEGER NOT NULL,
    basliq TEXT DEFAULT '',
    metn TEXT NOT NULL,
    gonderen TEXT DEFAULT '',
    tarix TEXT DEFAULT '',
    meta TEXT DEFAULT '{}',
    vektor TEXT DEFAULT NULL,
    yaradildi INTEGER NOT NULL,
    FOREIGN KEY (menbe_id) REFERENCES menbeler(id) ON DELETE CASCADE,
    FOREIGN KEY (qovluq_id) REFERENCES qovluqlar(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_parcalar_menbe ON parcalar(menbe_id);
  CREATE INDEX IF NOT EXISTS idx_parcalar_qovluq ON parcalar(qovluq_id);
  CREATE INDEX IF NOT EXISTS idx_parcalar_gonderen ON parcalar(gonderen);
  CREATE INDEX IF NOT EXISTS idx_parcalar_tarix ON parcalar(tarix);

  CREATE TABLE IF NOT EXISTS yaddas (
    id TEXT PRIMARY KEY,
    kateqoriya TEXT DEFAULT 'fakt',
    metn TEXT NOT NULL,
    menbe TEXT DEFAULT 'Söhbət',
    vaciblik INTEGER DEFAULT 3,
    yaradildi INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sohbetler (
    id TEXT PRIMARY KEY,
    qovluq_id TEXT DEFAULT 'all',
    rol TEXT NOT NULL,
    metn TEXT NOT NULL,
    sitatlar TEXT DEFAULT '[]',
    yaradildi INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tenzimlemeler (
    acar TEXT PRIMARY KEY,
    deyer TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bilik_bosluqlari (
    id TEXT PRIMARY KEY,
    sual TEXT NOT NULL,
    movzu TEXT DEFAULT '',
    menbe TEXT DEFAULT 'Söhbət',
    say INTEGER DEFAULT 1,
    status TEXT DEFAULT 'aciq',
    yaradildi INTEGER NOT NULL,
    son_sorulma INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bosluq_status ON bilik_bosluqlari(status);
`);

function ilkinBazaHazirla() {
  const say = db.prepare("SELECT COUNT(*) as c FROM qovluqlar").get().c;
  if (say === 0) {
    const indi = Date.now();
    const elaveEt = db.prepare(
      "INSERT INTO qovluqlar (id, ad, ikon, reng, aciqlama, yaradildi) VALUES (?, ?, ?, ?, ?, ?)"
    );
    elaveEt.run("qovluq-is", "İş və Mühasibatlıq", "💼", "#6366f1", "Müqavilələr, qaimələr, hesab-fakturalar və iş sənədləri", indi);
    elaveEt.run("qovluq-praktika", "Mühasibatlıq Praktikası və Təcrübə Bankı", "💡", "#059669", "Qrup və kanallardan süzülmüş real mühasib təcrübələri, keyslər və həllər", indi + 1);
    elaveEt.run("qovluq-cat", "WhatsApp və Telegram", "💬", "#10b981", "Mesaj çıxarışları, qrup müzakirələri və səsli qeydlər", indi + 2);
    elaveEt.run("qovluq-sexsi", "Şəxsi Qeydlər və Linklər", "🧠", "#f59e0b", "Məqalələr, YouTube videoları, kitablar və şəxsi fikirlər", indi + 3);
  }

  const varsayilanTenzimlemeler = {
    ai_provayder: "gemini",
    gemini_api_key: "",
    gemini_model: "gemini-3-flash-preview",
    derin_rejim: "1",
    groq_api_key: "",
    groq_model: "llama-3.3-70b-versatile",
    ollama_url: "http://127.0.0.1:11434",
    ollama_model: "llama3.2",
    ollama_embed_model: "nomic-embed-text",
    tg_bot_token: "",
    tg_avto_qovluq: "qovluq-cat",
    avto_yaddas: "1",
    sistem_telimati: "Sən istifadəçinin şəxsi AI asistantı və İkinci Beynisən. Cavablarını dəqiq, aydın və Azərbaycan dilində ver."
  };

  const yoxla = db.prepare("SELECT deyer FROM tenzimlemeler WHERE acar = ?");
  const yaz = db.prepare("INSERT OR REPLACE INTO tenzimlemeler (acar, deyer) VALUES (?, ?)");
  for (const [k, v] of Object.entries(varsayilanTenzimlemeler)) {
    const movcud = yoxla.get(k);
    if (!movcud) {
      yaz.run(k, v);
    } else if (k === "gemini_model" && (movcud.deyer === "gemini-2.5-flash" || movcud.deyer === "gemini-flash-lite-latest")) {
      yaz.run(k, "gemini-3-flash-preview");
    }
  }

  // Səhvən "Şəxsi Qeydlər" (qovluq-sexsi) qovluğuna düşmüş Vergi Məcəlləsi və rəsmi qanun sənədlərini "İş və Mühasibatlıq" (qovluq-is) qovluğuna köçür
  const sehvenSexsideOlanlar = db.prepare(
    "SELECT id FROM menbeler WHERE qovluq_id = 'qovluq-sexsi' AND (LOWER(ad) LIKE '%vergi%' OR LOWER(ad) LIKE '%məcəllə%' OR LOWER(ad) LIKE '%qaimə%')"
  ).all();
  for (const m of sehvenSexsideOlanlar) {
    db.prepare("UPDATE menbeler SET qovluq_id = 'qovluq-is' WHERE id = ?").run(m.id);
    db.prepare("UPDATE parcalar SET qovluq_id = 'qovluq-is' WHERE menbe_id = ?").run(m.id);
  }

  // Yaddaşdakı məlum köhnə/ziddiyyətli və təkrar qeydləri təmizlə (Maddə 175.8 ilə ziddiyyət təşkil edən yad-5c28774c və təkrar 45000/aksiz/limit qeydləri)
  const silinecekYaddasIdler = ["yad-5c28774c", "yad-e4adadc1", "yad-8eec3b73", "yad-ec83f70c", "yad-92ad2108", "yad-43d7d1af"];
  const yadSilStmt = db.prepare("DELETE FROM yaddas WHERE id = ?");
  for (const yid of silinecekYaddasIdler) {
    yadSilStmt.run(yid);
  }

  // Mövcud qanun parçalarının başlıqlarına içindəki alt-bənd nömrələrini (məs: [Bənd: 102.1.29–102.1.30-1]) avtomatik əlavə et
  const maddeParcalari = db.prepare("SELECT id, basliq, metn FROM parcalar WHERE basliq LIKE 'Maddə %' AND basliq NOT LIKE '%[Bənd:%'").all();
  if (maddeParcalari.length > 0) {
    const basliqYenileStmt = db.prepare("UPDATE parcalar SET basliq = ? WHERE id = ?");
    for (const p of maddeParcalari) {
      const anaMatch = String(p.basliq || "").match(/^Maddə\s+(\d+[0-9-]*)/i);
      if (!anaMatch || !anaMatch[1]) continue;
      const anaNo = anaMatch[1];
      const bendRegex = new RegExp(`\\b(${anaNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+(?:\\.\\d+)*(?:-\\d+)?)\\b`, "g");
      const bendler = Array.from(new Set(Array.from(String(p.metn || "").matchAll(bendRegex)).map(m => m[1])));
      if (bendler.length === 1) {
        basliqYenileStmt.run(`${p.basliq} [Bənd: ${bendler[0]}]`, p.id);
      } else if (bendler.length > 1) {
        basliqYenileStmt.run(`${p.basliq} [Bənd: ${bendler[0]}–${bendler[bendler.length - 1]}]`, p.id);
      }
    }
  }
}

ilkinBazaHazirla();

function tenzimlemeleriAl() {
  const sətirlər = db.prepare("SELECT acar, deyer FROM tenzimlemeler").all();
  const nət = {};
  for (const s of sətirlər) nət[s.acar] = s.deyer;
  return nət;
}

function tenzimlemeYenile(yeniler) {
  const yaz = db.prepare("INSERT OR REPLACE INTO tenzimlemeler (acar, deyer) VALUES (?, ?)");
  for (const [k, v] of Object.entries(yeniler)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      yaz.run(k, String(v));
    }
  }
  return tenzimlemeleriAl();
}

function qovluqlariAl() {
  return db.prepare(`
    SELECT q.*,
      (SELECT COUNT(*) FROM menbeler m WHERE m.qovluq_id = q.id) AS menbe_sayi,
      (SELECT COUNT(*) FROM parcalar p WHERE p.qovluq_id = q.id) AS parca_sayi
    FROM qovluqlar q
    ORDER BY q.yaradildi ASC
  `).all();
}

function qovluqYarat({ ad, ikon = "📁", reng = "#6366f1", aciqlama = "" }) {
  const id = "qovluq-" + crypto.randomUUID().slice(0, 8);
  const yaradildi = Date.now();
  db.prepare(
    "INSERT INTO qovluqlar (id, ad, ikon, reng, aciqlama, yaradildi) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, ad.trim(), ikon, reng, aciqlama, yaradildi);
  return { id, ad: ad.trim(), ikon, reng, aciqlama, yaradildi, menbe_sayi: 0, parca_sayi: 0 };
}

const SISTEM_QOVLUQLARI = new Set(["qovluq-is", "qovluq-praktika", "qovluq-cat", "qovluq-sexsi"]);

// Yaddaş-Daxili Normallaşdırılmış Parça İndeksi Keşi (20x daha sürətli axtarış üçün)
let _parcaIndeksKesi = null;
function parcaKesiniSifirla() {
  _parcaIndeksKesi = null;
}

function qovluqSil(id) {
  if (SISTEM_QOVLUQLARI.has(id)) {
    throw new Error("Əsas sistem qovluqları silinə bilməz.");
  }
  // Qovluq silinməzdən əvvəl içindəki mənbələri itməməsi üçün "qovluq-is" qovluğuna köçür
  db.prepare("UPDATE menbeler SET qovluq_id = 'qovluq-is' WHERE qovluq_id = ?").run(id);
  db.prepare("UPDATE parcalar SET qovluq_id = 'qovluq-is' WHERE qovluq_id = ?").run(id);
  parcaKesiniSifirla();
  return db.prepare("DELETE FROM qovluqlar WHERE id = ?").run(id);
}

function menbeQovluqDeyis(id, yeniQovluqId) {
  if (!id || !yeniQovluqId) return;
  db.prepare("UPDATE menbeler SET qovluq_id = ? WHERE id = ?").run(yeniQovluqId, id);
  db.prepare("UPDATE parcalar SET qovluq_id = ? WHERE menbe_id = ?").run(yeniQovluqId, id);
  parcaKesiniSifirla();
}

function menbeleriAl(qovluqId = null) {
  if (qovluqId && qovluqId !== "all") {
    return db.prepare(`
      SELECT id, qovluq_id, ad, nov, olcu, xulase, meta, aktiv, yaradildi,
        (SELECT COUNT(*) FROM parcalar p WHERE p.menbe_id = menbeler.id) AS parca_sayi
      FROM menbeler
      WHERE qovluq_id = ?
      ORDER BY yaradildi DESC
    `).all(qovluqId).map(m => ({ ...m, meta: JSON.parse(m.meta || "{}") }));
  }
  return db.prepare(`
    SELECT id, qovluq_id, ad, nov, olcu, xulase, meta, aktiv, yaradildi,
      (SELECT COUNT(*) FROM parcalar p WHERE p.menbe_id = menbeler.id) AS parca_sayi
    FROM menbeler
    ORDER BY yaradildi DESC
  `).all().map(m => ({ ...m, meta: JSON.parse(m.meta || "{}") }));
}

function menbeDetaliAl(id) {
  const m = db.prepare("SELECT * FROM menbeler WHERE id = ?").get(id);
  if (!m) return null;
  m.meta = JSON.parse(m.meta || "{}");
  m.parcalar = db.prepare(
    "SELECT id, sira, basliq, metn, gonderen, tarix, meta FROM parcalar WHERE menbe_id = ? ORDER BY sira ASC"
  ).all(id).map(p => ({ ...p, meta: JSON.parse(p.meta || "{}") }));
  return m;
}

function menbeElaveEt({ qovluq_id, ad, nov, olcu = 0, xulase = "", meta = {}, xam_metn = "", parcalar = [] }) {
  const temizXam = String(xam_metn || "").slice(0, 3000000);

  // Dublikat yoxlaması: Eyni ad və ya eyni mətn artıq bazada varsa, köhnəsini yenilə ki təkrarlanma olmasın
  if (temizXam.length > 80) {
    const movcudlar = db.prepare("SELECT id, ad, substr(xam_metn, 1, 600) as ilk, length(xam_metn) as uz FROM menbeler WHERE qovluq_id = ?").all(qovluq_id);
    const cariIlk = temizXam.slice(0, 600);
    for (const m of movcudlar) {
      if (m.ad === ad || (m.uz === temizXam.length && m.ilk === cariIlk)) {
        db.prepare("DELETE FROM menbeler WHERE id = ?").run(m.id);
      }
    }
  }

  const id = "menbe-" + crypto.randomUUID().slice(0, 10);
  const indi = Date.now();

  db.prepare(`
    INSERT INTO menbeler (id, qovluq_id, ad, nov, olcu, xulase, meta, xam_metn, aktiv, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    id,
    qovluq_id,
    ad,
    nov,
    olcu,
    xulase,
    JSON.stringify(meta || {}),
    temizXam,
    indi
  );

  const parcaYaz = db.prepare(`
    INSERT INTO parcalar (id, menbe_id, qovluq_id, sira, basliq, metn, gonderen, tarix, meta, vektor, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < parcalar.length; i++) {
    const p = parcalar[i];
    const pid = "p-" + crypto.randomUUID().slice(0, 12);
    parcaYaz.run(
      pid,
      id,
      qovluq_id,
      i + 1,
      p.basliq || `${ad} #${i + 1}`,
      p.metn || "",
      p.gonderen || "",
      p.tarix || "",
      JSON.stringify(p.meta || {}),
      p.vektor ? JSON.stringify(p.vektor) : null,
      indi + i
    );
  }

  parcaKesiniSifirla();
  const yeniMenbe = menbeDetaliAl(id);

  // Avtonom Öyrənmə: Yeni sənəd və ya çat yüklənəndə onun pasportundakı ən vacib qaydaları avtomatik Uzunmüddətli Yaddaşa çıxar
  try {
    const avtoQaydalar = meta?.pasport?.avto_qaydalar;
    if (Array.isArray(avtoQaydalar) && avtoQaydalar.length > 0 && ad !== "📘 Təsdiqlənmiş Ekspert Keysləri və Düzəlişlər Bankı") {
      for (const q of avtoQaydalar.slice(0, 3)) {
        yaddasElaveEt({
          kateqoriya: "qayda",
          metn: q,
          menbe: `Avto-Öyrənmə (${String(ad).slice(0, 28)})`,
          vaciblik: 3
        });
      }
    }
  } catch (_) {}

  return yeniMenbe;
}

function parcaVektorYenile(parcaId, vektor) {
  db.prepare("UPDATE parcalar SET vektor = ? WHERE id = ?").run(JSON.stringify(vektor), parcaId);
  parcaKesiniSifirla();
}

function menbeAktivlikDeyis(id, aktiv) {
  db.prepare("UPDATE menbeler SET aktiv = ? WHERE id = ?").run(aktiv ? 1 : 0, id);
  parcaKesiniSifirla();
}

function menbeYenile({ id, ad, nov, olcu = 0, xulase = "", meta = {}, xam_metn = "", parcalar = [] }) {
  const movcud = menbeDetaliAl(id);
  if (!movcud) throw new Error("Mənbə tapılmadı.");

  const temizXam = String(xam_metn || "").slice(0, 3000000);
  const indi = Date.now();

  db.prepare(`
    UPDATE menbeler
    SET ad = ?, nov = ?, olcu = ?, xulase = ?, meta = ?, xam_metn = ?
    WHERE id = ?
  `).run(
    ad || movcud.ad,
    nov || movcud.nov,
    olcu || Buffer.byteLength(temizXam, "utf8"),
    xulase || movcud.xulase,
    JSON.stringify(meta || {}),
    temizXam,
    id
  );

  // Köhnə parçaları sil və yenilərini daxil et
  db.prepare("DELETE FROM parcalar WHERE menbe_id = ?").run(id);

  const parcaYaz = db.prepare(`
    INSERT INTO parcalar (id, menbe_id, qovluq_id, sira, basliq, metn, gonderen, tarix, meta, vektor, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < parcalar.length; i++) {
    const p = parcalar[i];
    const pid = "p-" + crypto.randomUUID().slice(0, 12);
    parcaYaz.run(
      pid,
      id,
      movcud.qovluq_id,
      i + 1,
      p.basliq || `${ad || movcud.ad} #${i + 1}`,
      p.metn || "",
      p.gonderen || "",
      p.tarix || "",
      JSON.stringify(p.meta || {}),
      p.vektor ? JSON.stringify(p.vektor) : null,
      indi + i
    );
  }

  parcaKesiniSifirla();
  const yeniMenbe = menbeDetaliAl(id);

  // Avtonom Öyrənmə: Yeni sənəd və ya çat yüklənəndə onun pasportundakı ən vacib qaydaları avtomatik Uzunmüddətli Yaddaşa çıxar
  try {
    const avtoQaydalar = meta?.pasport?.avto_qaydalar;
    if (Array.isArray(avtoQaydalar) && avtoQaydalar.length > 0 && ad !== "📘 Təsdiqlənmiş Ekspert Keysləri və Düzəlişlər Bankı") {
      for (const q of avtoQaydalar.slice(0, 3)) {
        yaddasElaveEt({
          kateqoriya: "qayda",
          metn: q,
          menbe: `Avto-Öyrənmə (${String(ad).slice(0, 28)})`,
          vaciblik: 3
        });
      }
    }
  } catch (_) {}

  return yeniMenbe;
}

function menbeSil(id) {
  const res = db.prepare("DELETE FROM menbeler WHERE id = ?").run(id);
  parcaKesiniSifirla();
  return res;
}

// ---- BM25 + IDF + Azərbaycan Dili Morfoloji Kök Mühərriki ----

function azKicilt(s) {
  return String(s || "")
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("az");
}

function azNormallashdir(metn) {
  return azKicilt(metn)
    .replace(/ə/g, "e")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g");
}

// Azərbaycan dilində hal, cəm, mənsubiyyət və şəxs şəkilçilərini soyub sözün dəqiq kökünü tapır
const AZ_SEKILCILER = [
  "larından", "lərindən", "larında", "lərində", "larının", "lərinin", "larımıza", "lərimizə",
  "dakılar", "dəkilər", "duqları", "dükləri", "dıqları", "dikləri", "acaqlar", "əcəklər",
  "lardan", "lərdən", "lardan", "lərdə", "larda", "ların", "lərin", "larla", "lərlə",
  "ımızdan", "imizdən", "umuzdan", "ümüzdən", "ğından", "yindən", "sindən", "sından",
  "undakı", "ündəki", "ındakı", "indəki", "dakı", "dəki",
  "ndan", "ndən", "ndan", "sına", "sinə", "sını", "sini", "sunu", "sünü",
  "ndan", "ndən", "ında", "ində", "unda", "ündə", "ının", "inin", "unun", "ünün",
  "dan", "dən", "tən", "tan", "nın", "nin", "nun", "nün", "lar", "lər",
  "lıq", "lik", "luq", "lük", "sız", "siz", "suz", "süz", "cıl", "cil",
  "mış", "miş", "muş", "müş", "acaq", "əcək", "malı", "məli", "dır", "dir", "dur", "dür",
  "la", "lə", "da", "də", "na", "nə", "ya", "yə", "ın", "in", "un", "ün",
  "nı", "ni", "nu", "nü", "sı", "si", "su", "sü", "a", "ə", "ı", "i", "u", "ü"
];

// Sonu -ə/-a/-lə/-la ilə bitən və şəkilçi soyularkən zədələnməməli olan əsas hüquqi/mühasibatlıq söz kökləri
const QORUNAN_SOZ_KOKLERI = [
  "müqavilə", "bəyannamə", "müəssisə", "müavinət", "müzakirə", "mübadilə",
  "məcəllə", "məhkəmə", "mərhələ", "məsələ", "məntəqə", "maddə",
  "qaimə", "cərimə", "idarə", "icarə", "əlavə", "vasitə", "vəzifə",
  "layihə", "xəzinə", "səhifə", "dərəcə", "nəticə", "bölmə", "sahə", "xassə"
];

// 3 hərfli vacib domen söz kökləri (hal və cəm şəkilçiləri soyulduqda dəqiq kökə düşməsi üçün)
const QISA_DOMEN_KOKLERI = ["mal", "pul", "akt", "pay", "kod", "haq", "il", "ay", "iş"];

function azKokCixar(soz) {
  let s = azKicilt(soz).trim();
  if (s.length <= 2) return s;

  // 1) Qorunan söz köklərini yoxla (məs: "müqavilənin" -> "müqavilə", "qaimələr" -> "qaimə")
  for (const qKok of QORUNAN_SOZ_KOKLERI) {
    if (s === qKok) return qKok;
    if (s.startsWith(qKok) && s.length > qKok.length) {
      const qaliq = s.slice(qKok.length);
      if (AZ_SEKILCILER.includes(qaliq) || /^(?:lər|lar|nin|nın|dən|dan|yə|ya|də|da|si|sı|ni|nı)/.test(qaliq)) {
        return qKok;
      }
    }
  }

  // 2) 3 hərfli domen köklərini yoxla (məs: "malların" -> "mal", "aktın" -> "akt", "puldan" -> "pul")
  for (const qisa of QISA_DOMEN_KOKLERI) {
    if (s === qisa) return qisa;
    if (s === "işçi" || s.startsWith("işçi")) break; // "işçilərin" -> "işçi" qalsın
    if (s.startsWith(qisa) && s.length > qisa.length) {
      const qaliq = s.slice(qisa.length);
      if (AZ_SEKILCILER.includes(qaliq) || /^(?:lar|lər)(?:ın|in|dan|dən|da|də|a|ə)?$/.test(qaliq)) {
        return qisa;
      }
    }
  }

  if (s.length <= 4) return s;

  // 3) Ardıcıl 2 qat şəkilçi soyulması (məs: "mülkiyyətlərindən" -> "mülkiyyətlər" -> "mülkiyyət")
  for (let qat = 0; qat < 2; qat++) {
    let deyishdi = false;
    for (const sek of AZ_SEKILCILER) {
      if (s.length - sek.length >= 4 && s.endsWith(sek)) {
        s = s.slice(0, s.length - sek.length);
        deyishdi = true;
        break;
      }
    }
    if (!deyishdi) break;
  }
  return s;
}

const DAYANACAQ_SOZLER = new Set([
  "və", "ve", "ilə", "ile", "üçün", "ucun", "bu", "o", "mən", "men", "sən", "sen",
  "nə", "ne", "nələr", "neler", "necə", "nece", "haqqında", "haqqinda", "barədə", "barede",
  "bağlı", "bagli", "əlaqədar", "olan", "kimi", "daha", "çox", "cox", "var", "yox",
  "idi", "isə", "ise", "mənə", "mene", "görə", "gore", "hansı", "hansi", "hansılar",
  "nədir", "nedir", "yazılıb", "yazilib", "deyilib", "deyib", "olunub", "edilib",
  "məlumat", "melumat", "ver", "göstər", "goster", "çıxar", "cixar", "tap", "izah", "et",
  "bütün", "butun", "hər", "her", "bir", "iki", "belə", "bele", "ki", "də", "da"
]);

function sozKokleri(sorgu) {
  const xamSozler = azKicilt(sorgu)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(s => s.length >= 2 && !DAYANACAQ_SOZLER.has(s));

  const nət = [];
  for (const s of xamSozler) {
    const kok = azKokCixar(s);
    if (DAYANACAQ_SOZLER.has(kok)) continue;
    const normTam = azNormallashdir(s);
    const normKok = azNormallashdir(kok);
    nət.push({ tam: s, kok, normTam, normKok });
  }
  return nət;
}

function kosinusOxsharlighi(v1, v2) {
  if (!Array.isArray(v1) || !Array.isArray(v2) || v1.length !== v2.length || v1.length === 0) return 0;
  let skalyar = 0, n1 = 0, n2 = 0;
  for (let i = 0; i < v1.length; i++) {
    skalyar += v1[i] * v2[i];
    n1 += v1[i] * v1[i];
    n2 += v2[i] * v2[i];
  }
  const mexrec = Math.sqrt(n1) * Math.sqrt(n2);
  return mexrec === 0 ? 0 : skalyar / mexrec;
}

// Sözün mətndə neçə dəfə keçdiyini sayır (qısa sözlərdə söz başlanğıcı sərhədini qoruyur ki, "mal" -> "kameral" və ya "is" -> "istisna" içində səhv tapılmasın)
function herfVeyaReqemdirmi(ch) {
  if (!ch) return false;
  return /[\p{L}\p{N}]/u.test(ch);
}

function tezlikSay(metn, altSoz) {
  if (!altSoz || altSoz.length < 2) return 0;
  const qisaSozdur = altSoz.length <= 3;
  let say = 0, pos = 0;
  while (true) {
    const idx = metn.indexOf(altSoz, pos);
    if (idx === -1) break;
    if (qisaSozdur && idx > 0 && herfVeyaReqemdirmi(metn[idx - 1])) {
      pos = idx + altSoz.length;
      continue;
    }
    say++;
    pos = idx + altSoz.length;
  }
  return say;
}

function parcaIndeksKesiniAl() {
  if (_parcaIndeksKesi) return _parcaIndeksKesi;
  const rows = db.prepare(`
    SELECT p.id, p.menbe_id, p.qovluq_id, p.sira, p.basliq, p.metn, p.gonderen, p.tarix, p.meta, p.vektor,
           m.ad AS menbe_adi, m.nov AS menbe_novu
    FROM parcalar p
    JOIN menbeler m ON m.id = p.menbe_id
    WHERE m.aktiv = 1
  `).all();

  _parcaIndeksKesi = rows.map(p => {
    const basliqAz = azKicilt(p.basliq || "");
    const basliqNorm = azNormallashdir(basliqAz);
    const gonderenAz = azKicilt(p.gonderen || "");
    const gonderenNorm = azNormallashdir(gonderenAz);
    const yalnızMetnAz = azKicilt((p.basliq ? p.basliq + "\n" : "") + p.metn + " " + p.gonderen);
    const yalnızMetnNorm = azNormallashdir(yalnızMetnAz);
    const menbeAdAz = azKicilt(p.menbe_adi || "");
    const menbeAdNorm = azNormallashdir(menbeAdAz);
    let parsedMeta = {};
    try { parsedMeta = JSON.parse(p.meta || "{}"); } catch (_) {}
    let parsedVektor = null;
    if (p.vektor) {
      try { parsedVektor = JSON.parse(p.vektor); } catch (_) {}
    }
    return {
      p,
      basliqAz,
      basliqNorm,
      gonderenAz,
      gonderenNorm,
      yalnızMetnAz,
      yalnızMetnNorm,
      menbeAdAz,
      menbeAdNorm,
      parsedMeta,
      parsedVektor
    };
  });
  return _parcaIndeksKesi;
}

function hibridAxtar({
  sorgu = "",
  sorguVektoru = null,
  qovluq_id = "all",
  gonderen = "",
  tarix_baslangic = "",
  tarix_son = "",
  menbe_nov = "",
  limit = 10
}) {
  const butunAktivler = parcaIndeksKesiniAl();
  const gonderenAxtar = gonderen && gonderen.trim() ? azKicilt(gonderen.trim()) : "";
  const tarixSonTam = tarix_son ? tarix_son + "T23:59:59" : "";

  const hazirNamizedler = butunAktivler.filter(h => {
    const p = h.p;
    if (qovluq_id && qovluq_id !== "all") {
      if (qovluq_id === "qovluq-is") {
        if (p.qovluq_id !== "qovluq-is" && p.qovluq_id !== "qovluq-praktika") return false;
      } else if (p.qovluq_id !== qovluq_id) {
        return false;
      }
    }
    if (menbe_nov && p.menbe_novu !== menbe_nov) return false;
    if (gonderenAxtar && !h.gonderenAz.includes(gonderenAxtar)) return false;
    if (tarix_baslangic && (p.tarix || "") < tarix_baslangic) return false;
    if (tarixSonTam && (p.tarix || "") > tarixSonTam) return false;
    return true;
  });

  if (hazirNamizedler.length === 0) return [];

  const kokler = sozKokleri(sorgu);
  const N = hazirNamizedler.length;

  // Sorğuda birbaşa çəkilən Maddə nömrələrini (məs: "Maddə 163", "175-ci maddə", "102.1.30") çıxar
  const sorguMaddeNomreleri = Array.from(
    new Set(
      Array.from(
        String(sorgu || "").matchAll(/(?:maddə\s*(\d+[0-9.-]*)|(\d+[0-9.-]*)\s*(?:-?[cç]ı|-?[cç]i|-?[cç]u|-?[cç]ü)?\s*maddə|\b(\d{1,3}\.\d+(?:\.\d+)*)\b)/gi)
      ).map(m => (m[1] || m[2] || m[3] || "").replace(/\.$/, "")).filter(Boolean)
    )
  );
  const unikalAnaMaddeler = Array.from(new Set(sorguMaddeNomreleri.map(m => m.split(".")[0]).filter(Boolean)));

  // Sorğuda spesifik məcəllə adı çəkilibsə (məs: "Əmək Məcəlləsi"), maddə nömrəsi bonusunu başqa məcəlləyə ("Vergi Məcəlləsi") vermə!
  const sorguKicik = azKicilt(sorgu);
  const sorguEmekMecellesidir = /əmək\s*məcəllə/i.test(sorguKicik) && !/vergi\s*məcəllə/i.test(sorguKicik);
  const sorguMulkiMecelledir = /mülki\s*məcəllə/i.test(sorguKicik) && !/vergi\s*məcəllə/i.test(sorguKicik);
  const sorguKonstitusiyadir = /konstitusiya/i.test(sorguKicik) && !/vergi/i.test(sorguKicik);

  // Hər açar söz üçün IDF (Inverse Document Frequency) hesabla:
  const idfMap = kokler.map(k => {
    let df = 0;
    for (const h of hazirNamizedler) {
      if (tezlikSay(h.yalnızMetnAz, k.kok) > 0 || (k.kok.length > 2 && tezlikSay(h.yalnızMetnNorm, k.normKok) > 0)) {
        df++;
      }
    }
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    return { ...k, df, idf: Math.max(0.2, idf) };
  });

  const qiymetlendirilmish = hazirNamizedler.map(({ p, basliqAz, basliqNorm, gonderenNorm, yalnızMetnAz, yalnızMetnNorm, menbeAdAz, menbeAdNorm, parsedMeta, parsedVektor }) => {
    let bm25Bal = 0;
    let tapilanAcarSayi = 0;

    for (const k of idfMap) {
      const tamSay = tezlikSay(yalnızMetnAz, k.tam);
      // 2 hərfli köklərdə ("iş" -> "is") normKok yoxlamasını bağla ki, "istisna"/"sistem" sözləri ilə qarışmasın
      const kokSay = tezlikSay(yalnızMetnAz, k.kok) || (k.kok.length >= 3 ? tezlikSay(yalnızMetnNorm, k.normKok) : 0);

      if (tamSay > 0 || kokSay > 0) {
        tapilanAcarSayi++;
        const tf = tamSay * 1.5 + kokSay;
        const tfNorm = (tf * 2.2) / (tf + 1.2);
        bm25Bal += k.idf * tfNorm;

        // Əgər açar söz birbaşa bölmə/maddə başlığında ("Maddə 163. Vergi tutulan dövriyyənin dəqiqləşdirilməsi") keçirsə, güclü başlıq bonusu ver!
        if (tezlikSay(basliqAz, k.kok) > 0 || (k.kok.length >= 3 && tezlikSay(basliqNorm, k.normKok) > 0)) {
          bm25Bal += k.idf * 1.1;
        }
      } else if (k.kok.length >= 3 && menbeAdNorm.includes(k.normKok)) {
        bm25Bal += 0.1;
      }

      if (gonderenNorm && k.kok.length >= 3 && gonderenNorm.includes(k.normKok)) {
        bm25Bal += k.idf * 1.5;
      }
    }

    // Mənbənin sorğudakı məcəllə ilə uyğun olub-olmadığını yoxla
    const menbeVergidir = /vergi/i.test(menbeAdAz);
    const mecelleZiddiyyeti =
      (sorguEmekMecellesidir && menbeVergidir) ||
      (sorguMulkiMecelledir && menbeVergidir) ||
      (sorguKonstitusiyadir && menbeVergidir);

    if (!mecelleZiddiyyeti) {
      // 1) Unikal ana maddə başlığı uyğunluğu bonusu (hər ana maddə üçün yalnız 1 dəfə!)
      for (const anaMadde of unikalAnaMaddeler) {
        const maddeBasliqRegex = new RegExp(`\\bmadd[əe]\\s*${anaMadde.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.|\\s|–|-|$)`, "i");
        if (maddeBasliqRegex.test(p.basliq || "") || maddeBasliqRegex.test(p.metn.slice(0, 200))) {
          bm25Bal += 10.0;
        }
      }
      // 2) Alt-bənd uyğunluğu (məs: "163.2" və ya "102.1.30")
      for (const mNom of sorguMaddeNomreleri) {
        if (mNom.includes(".") && (p.metn.includes(mNom) || (p.basliq && p.basliq.includes(mNom)))) {
          bm25Bal += 6.0;
        }
      }
    }

    // Çox sayda fərqli açar sözü eyni anda ehtiva edən parçalara balanslı koordinasiya bonusu ver (maksimum 1.85x)
    if (tapilanAcarSayi >= 2) {
      bm25Bal *= Math.min(1.85, 1 + ((tapilanAcarSayi - 1) * 0.12));
    }

    let vektorBal = 0;
    if (sorguVektoru && parsedVektor) {
      vektorBal = Math.max(0, kosinusOxsharlighi(sorguVektoru, parsedVektor));
    }

    const yekunBal = sorguVektoru && vektorBal > 0
      ? (vektorBal * 8.0) + bm25Bal
      : bm25Bal;

    return {
      id: p.id,
      menbe_id: p.menbe_id,
      qovluq_id: p.qovluq_id,
      sira: p.sira,
      basliq: p.basliq,
      metn: p.metn,
      gonderen: p.gonderen,
      tarix: p.tarix,
      menbe_adi: p.menbe_adi,
      menbe_novu: p.menbe_novu,
      meta: parsedMeta,
      bal: Number(yekunBal.toFixed(4)),
      tapilanAcarSayi
    };
  });

  qiymetlendirilmish.sort((a, b) => b.bal - a.bal || a.sira - b.sira);

  // Dublikat mətnli parçaları süz ki, eyni cümlə fərqli sitat nömrələri ilə təkrar çıxmasın
  const gorulmusMetnler = new Set();
  const benzersizler = [];
  for (const item of qiymetlendirilmish) {
    if (item.bal <= 0) continue;
    const imza = azNormallashdir(item.metn).replace(/\s+/g, " ").trim().slice(0, 140);
    if (!gorulmusMetnler.has(imza)) {
      gorulmusMetnler.add(imza);
      benzersizler.push(item);
    }
  }

  // Yalnız həqiqətən mövzuya aid olanları (> 0.25 bal) qaytar
  const ciddiUygunlar = benzersizler.filter(x => x.bal >= 0.25);
  if (ciddiUygunlar.length > 0) {
    return ciddiUygunlar.slice(0, limit);
  }

  return benzersizler.slice(0, limit);
}

function qonsuParcalariAl(menbe_id, sira, basliq = "") {
  if (!menbe_id || typeof sira !== "number") return [];
  // 1) Əgər parça konkret bir Maddəyə (məs: "Maddə 158." və ya "Maddə 218–221.") aiddirsə, YALNIZ həmin maddənin digər hissələrini gətir
  const maddeMatch = String(basliq || "").match(/^(Maddə\s+\d+[0-9.–-]*\.?)/i);
  if (maddeMatch && maddeMatch[1]) {
    return db.prepare(`
      SELECT p.*, m.ad AS menbe_adi, m.nov AS menbe_novu
      FROM parcalar p
      JOIN menbeler m ON m.id = p.menbe_id
      WHERE p.menbe_id = ? AND p.sira != ? AND p.basliq LIKE ?
      ORDER BY p.sira ASC
      LIMIT 3
    `).all(menbe_id, sira, `${maddeMatch[1]}%`);
  }
  // 2) Adi sənəd və ya çat parçalarında yalnız eyni bölmənin davamı olan ("... — Hissə N" və ya "... (Hissə N)") qonşu parçaları birləşdir
  const bazaBasliq = String(basliq || "")
    .replace(/\s*(?:\(Hissə\s*\d+\)|—\s*Hissə\s*\d+|#\d+)\s*$/i, "")
    .trim();
  if (bazaBasliq.length >= 4) {
    return db.prepare(`
      SELECT p.*, m.ad AS menbe_adi, m.nov AS menbe_novu
      FROM parcalar p
      JOIN menbeler m ON m.id = p.menbe_id
      WHERE p.menbe_id = ? AND p.sira IN (?, ?) AND p.basliq LIKE ?
      ORDER BY p.sira ASC
    `).all(menbe_id, sira - 1, sira + 1, `${bazaBasliq}%`);
  }
  return [];
}

// Qanun maddəsi daxilində çəkilən çarpaz istinadları (məs: "Bu Məcəllənin 163-cü maddəsində", "158.1-ci maddəsində") avtomatik tapıb gətirir
function carpazMaddeleriAl(metn, menbe_id) {
  if (!metn || !menbe_id) return [];
  const istinadRegex = /(?:bu\s+Məcəllənin\s+|Məcəllənin\s+)(\d{1,3})(?:\.\d+)*(?:-\d+)?(?:-c[ıiuü]\s+maddə)?|\b(\d{1,3})(?:\.\d+)+(?:-c[ıiuü])?\s+maddə/gi;
  const tapilanAnaMaddeler = new Set();
  for (const m of String(metn).matchAll(istinadRegex)) {
    const no = m[1] || m[2];
    if (no) tapilanAnaMaddeler.add(no);
  }
  if (tapilanAnaMaddeler.size === 0) return [];

  const netice = [];
  const stmt = db.prepare(`
    SELECT p.*, m.ad AS menbe_adi, m.nov AS menbe_novu
    FROM parcalar p
    JOIN menbeler m ON m.id = p.menbe_id
    WHERE p.menbe_id = ? AND p.basliq LIKE ?
    ORDER BY p.sira ASC
    LIMIT 1
  `);

  for (const no of Array.from(tapilanAnaMaddeler).slice(0, 3)) {
    const row = stmt.get(menbe_id, `Maddə ${no}.%`);
    if (row) netice.push(row);
  }
  return netice;
}

function bazadaVektorVarmi() {
  const row = db.prepare("SELECT 1 FROM parcalar WHERE vektor IS NOT NULL LIMIT 1").get();
  return Boolean(row);
}

function istirakcilariAl(qovluq_id = "all") {
  let sql = "SELECT DISTINCT gonderen FROM parcalar WHERE gonderen != ''";
  const params = [];
  if (qovluq_id && qovluq_id !== "all") {
    sql += " AND qovluq_id = ?";
    params.push(qovluq_id);
  }
  const sətirlər = db.prepare(sql).all(...params);
  const adlar = new Set();
  for (const s of sətirlər) {
    s.gonderen.split(",").forEach(a => {
      const t = a.trim();
      if (t) adlar.add(t);
    });
  }
  return Array.from(adlar).sort((a, b) => a.localeCompare(b, "az"));
}

function yaddaslariAl() {
  return db.prepare("SELECT * FROM yaddas ORDER BY vaciblik DESC, yaradildi DESC").all();
}

// Hər vergi/hüquq sualında keçən ümumi sözlər — bunlar təkbaşına başqa mövzunun Qızıl Qaydasını aktivləşdirməməlidir
const UMUMI_DOMEN_SOZLERI = new Set([
  "vergi", "verg", "manat", "azn", "ödəyici", "odeyici", "ödəyicisi", "odeyicisi",
  "şəxs", "sexs", "fiziki", "hüquqi", "huquqi", "fərdi", "ferdi", "sahibkar",
  "maddə", "madde", "madd", "məcəllə", "mecelle", "qanun", "faiz", "tətbiq", "tetbiq",
  "əsasən", "esasen", "olduqda", "halda", "hallar", "görə", "gore", "üzrə", "uzre",
  "aylıq", "ayliq", "illik", "gəlir", "gelir", "məbləğ", "mebleg", "hüquq", "huquq",
  "şərt", "sert", "qayda", "əməliyyat", "emeliyyat", "hesabat", "dövr", "dovr",
  "xərc", "xerc", "xərclər", "xercler", "ödəniş", "odenis", "şirkət", "sirket",
  "mənfəət", "menfeet", "bəyannamə", "beyanname", "sənəd", "sened"
]);

// Sualın mövzusuna, spesifik açar sözlərinə və maddə nömrələrinə görə ən aktual Uzunmüddətli Yaddaş (Qızıl Qaydalar) siyahısını seçir
function aktualYaddaslariAl(sorgu = "", limit = 15) {
  const butun = yaddaslariAl();
  if (!sorgu || !sorgu.trim() || butun.length === 0) {
    return { siyahi: butun.slice(0, limit), uygunQizilQaydalar: [] };
  }

  const kokler = sozKokleri(sorgu);
  const spesifikKokSayi = kokler.filter(k => !UMUMI_DOMEN_SOZLERI.has(k.kok) && !UMUMI_DOMEN_SOZLERI.has(k.tam)).length;

  const sorguMaddeler = Array.from(
    new Set(
      Array.from(
        String(sorgu).matchAll(/(?:maddə\s*(\d+[0-9.-]*)|(\d+[0-9.-]*)\s*(?:-?[cç]ı|-?[cç]i|-?[cç]u|-?[cç]ü)?\s*maddə|\b(\d{1,3}\.\d+(?:\.\d+)*)\b)/gi)
      ).map(m => (m[1] || m[2] || m[3] || "").replace(/\.$/, "")).filter(Boolean)
    )
  );

  const qiymetli = butun.map(y => {
    const yAz = azKicilt(y.metn || "");
    const yNorm = azNormallashdir(yAz);
    let spesifikUygun = 0;
    let umumiUygun = 0;
    let maddeUygun = 0;

    for (const k of kokler) {
      const tapildi = tezlikSay(yAz, k.kok) > 0 || (k.kok.length >= 3 && tezlikSay(yNorm, k.normKok) > 0);
      if (tapildi) {
        if (UMUMI_DOMEN_SOZLERI.has(k.kok) || UMUMI_DOMEN_SOZLERI.has(k.tam)) {
          umumiUygun++;
        } else {
          spesifikUygun++;
        }
      }
    }

    for (const mNo of sorguMaddeler) {
      const ana = mNo.split(".")[0];
      if (yAz.includes(mNo) || new RegExp(`\\b${ana}\\b`).test(yAz)) {
        maddeUygun++;
      }
    }

    const isSistem = y.menbe === "Sistem Qaydası";
    const isQizil = y.metn.startsWith("QIZIL QAYDA") || y.menbe === "Ekspert Əks-Əlaqə" || y.menbe === "Birbaşa Təlimat";
    const bal = (spesifikUygun * 18) + (umumiUygun * 3) + (maddeUygun * 30) + (isQizil ? 6 : 0) + (isSistem ? 8 : 0) + (y.vaciblik || 3);

    return {
      ...y,
      _spesifikUygun: spesifikUygun,
      _umumiUygun: umumiUygun,
      _uygunAcar: spesifikUygun + umumiUygun,
      _maddeUygun: maddeUygun,
      _bal: bal
    };
  });

  qiymetli.sort((a, b) => b._bal - a._bal || b.vaciblik - a.vaciblik || b.yaradildi - a.yaradildi);

  // Yalnız həqiqətən sualın spesifik mövzusuna aid olan Qızıl Qaydaları seç (ümumi "vergi/manat" sözlərinə görə əlaqəsiz qaydaları qatma!)
  const uygunQizilQaydalar = qiymetli.filter(y => {
    if (y.menbe === "Sistem Qaydası") return false;
    if (y._maddeUygun > 0) return true;
    if (y._spesifikUygun >= 2) return true;
    if (spesifikKokSayi === 1 && y._spesifikUygun === 1 && y._umumiUygun >= 1) return true;
    return false;
  }).slice(0, 3);

  return {
    siyahi: qiymetli.slice(0, limit),
    uygunQizilQaydalar
  };
}

// İstifadəçinin təsdiqlədiyi (👍) və ya düzəliş etdiyi (🎯) keysləri birbaşa "Mühasibatlıq Praktikası və Təcrübə Bankı"na (qovluq-praktika) əlavə edir
function praktikaKeysElaveEt({ basliq, sual = "", cavab = "", gonderen = "Ekspert Təsdiqi", nov = "tesdiq" }) {
  const temizCavab = String(cavab || "").trim();
  if (!temizCavab) return null;

  const qovluq_id = "qovluq-praktika";
  const bankAd = "📘 Təsdiqlənmiş Ekspert Keysləri və Düzəlişlər Bankı";
  const tarix = new Date().toISOString().replace("T", " ").slice(0, 16);

  const etiket = nov === "duzelis" ? "🎯 [Ekspert Düzəlişi / Qızıl Qayda]" : "✅ [Təsdiqlənmiş Praktiki Keys]";
  const tamMetn = `${etiket}\nSual / Mövzu: ${sual || basliq}\nDəqiq Qərar / Həll: ${temizCavab}`;
  const parcaBasliq = basliq || `${nov === "duzelis" ? "🎯 Qızıl Qayda" : "💼 Praktiki Keys"}: ${(sual || temizCavab).slice(0, 75)}`;

  let movcud = db.prepare("SELECT * FROM menbeler WHERE qovluq_id = ? AND ad = ?").get(qovluq_id, bankAd);

  if (!movcud) {
    return menbeElaveEt({
      qovluq_id,
      ad: bankAd,
      nov: "qeyd",
      olcu: Buffer.byteLength(tamMetn, "utf8"),
      xulase: "İstifadəçi və ekspert tərəfindən təsdiqlənmiş real sual-cavab keysləri və düzəlişlər",
      meta: { praktika: true, canli_oyrenme: true },
      xam_metn: tamMetn,
      parcalar: [
        {
          basliq: parcaBasliq,
          metn: tamMetn,
          gonderen,
          tarix,
          meta: { praktika: true, nov }
        }
      ]
    });
  }

  // Eyni sual üzrə köhnə keys varsa yenilə, yoxdursa yeni parça kimi əlavə et
  const movcudParcalar = db.prepare("SELECT id, sira, basliq, metn FROM parcalar WHERE menbe_id = ? ORDER BY sira ASC").all(movcud.id);
  const sualKicik = azKicilt(sual || basliq).slice(0, 90);
  const tapilanKohne = sualKicik.length > 12
    ? movcudParcalar.find(p => azKicilt(p.metn).includes(sualKicik))
    : null;

  if (tapilanKohne) {
    db.prepare("UPDATE parcalar SET basliq = ?, metn = ?, gonderen = ?, tarix = ?, yaradildi = ? WHERE id = ?")
      .run(parcaBasliq, tamMetn, gonderen, tarix, Date.now(), tapilanKohne.id);
  } else {
    const yeniSira = movcudParcalar.length + 1;
    const pid = "p-" + crypto.randomUUID().slice(0, 12);
    db.prepare(`
      INSERT INTO parcalar (id, menbe_id, qovluq_id, sira, basliq, metn, gonderen, tarix, meta, vektor, yaradildi)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `).run(
      pid,
      movcud.id,
      qovluq_id,
      yeniSira,
      parcaBasliq,
      tamMetn,
      gonderen,
      tarix,
      JSON.stringify({ praktika: true, nov }),
      Date.now()
    );
  }

  db.prepare(`
    UPDATE menbeler
    SET xam_metn = substr(xam_metn || char(10) || char(10) || ?, 1, 3000000),
        olcu = olcu + ?
    WHERE id = ?
  `).run(tamMetn, Buffer.byteLength(tamMetn, "utf8"), movcud.id);

  parcaKesiniSifirla();
  return menbeDetaliAl(movcud.id);
}

function yaddasElaveEt({ kateqoriya = "fakt", metn, menbe = "Söhbət", vaciblik = 3 }) {
  if (!metn || !metn.trim()) return null;
  const təmiz = metn.trim();
  const movcud = db.prepare("SELECT id FROM yaddas WHERE LOWER(metn) = LOWER(?)").get(təmiz);
  if (movcud) return movcud;

  // Semantik / açar söz oxşarlığı yoxlaması: Eyni mövzuda təkrar və ya yenilənmiş qayda varsa, köhnəsini yenilə ki baza ziddiyyətli dublikatlarla dolmasın
  const yeniKokler = new Set(sozKokleri(təmiz).map(k => k.normKok).filter(k => k.length >= 3));
  if (yeniKokler.size >= 3) {
    const butunYaddas = db.prepare("SELECT id, metn, vaciblik FROM yaddas").all();
    for (const y of butunYaddas) {
      const kohneKokler = new Set(sozKokleri(y.metn).map(k => k.normKok).filter(k => k.length >= 3));
      if (kohneKokler.size < 3) continue;
      let kesisme = 0;
      for (const k of yeniKokler) {
        if (kohneKokler.has(k)) kesisme++;
      }
      const oxsarliq = kesisme / Math.min(yeniKokler.size, kohneKokler.size);
      if (oxsarliq >= 0.68) {
        // Əgər köhnə qeyd "QIZIL QAYDA"dırsa və yeni gələn adi avtomatik analizdirsə, Qızıl Qaydanı qoru
        if (y.metn.startsWith("QIZIL QAYDA") && !təmiz.startsWith("QIZIL QAYDA") && menbe !== "Birbaşa Təlimat") {
          return { id: y.id, kateqoriya, metn: y.metn, menbe, vaciblik: y.vaciblik };
        }
        const indi = Date.now();
        db.prepare(
          "UPDATE yaddas SET kateqoriya = ?, metn = ?, menbe = ?, vaciblik = ?, yaradildi = ? WHERE id = ?"
        ).run(kateqoriya, təmiz, menbe, Math.max(vaciblik, y.vaciblik || 3), indi, y.id);
        return { id: y.id, kateqoriya, metn: təmiz, menbe, vaciblik, yaradildi: indi };
      }
    }
  }

  const id = "yad-" + crypto.randomUUID().slice(0, 8);
  const yaradildi = Date.now();
  db.prepare(
    "INSERT INTO yaddas (id, kateqoriya, metn, menbe, vaciblik, yaradildi) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, kateqoriya, təmiz, menbe, vaciblik, yaradildi);
  return { id, kateqoriya, metn: təmiz, menbe, vaciblik, yaradildi };
}

function yaddasRedakteEt(id, { kateqoriya, metn }) {
  if (!id || !metn || !metn.trim()) return null;
  const temiz = metn.trim();
  if (kateqoriya) {
    db.prepare("UPDATE yaddas SET kateqoriya = ?, metn = ?, yaradildi = ? WHERE id = ?")
      .run(kateqoriya, temiz, Date.now(), id);
  } else {
    db.prepare("UPDATE yaddas SET metn = ?, yaradildi = ? WHERE id = ?")
      .run(temiz, Date.now(), id);
  }
  return db.prepare("SELECT * FROM yaddas WHERE id = ?").get(id);
}

function yaddasSil(id) {
  return db.prepare("DELETE FROM yaddas WHERE id = ?").run(id);
}

function sohbetleriAl(qovluq_id = "all", limit = 60) {
  return db.prepare(`
    SELECT * FROM (
      SELECT * FROM sohbetler
      WHERE qovluq_id = ?
      ORDER BY yaradildi DESC
      LIMIT ?
    ) ORDER BY yaradildi ASC
  `).all(qovluq_id || "all", limit).map(s => ({
    ...s,
    sitatlar: JSON.parse(s.sitatlar || "[]")
  }));
}

function sohbetElaveEt({ qovluq_id = "all", rol, metn, sitatlar = [] }) {
  const id = "msg-" + crypto.randomUUID().slice(0, 10);
  const yaradildi = Date.now();
  db.prepare(`
    INSERT INTO sohbetler (id, qovluq_id, rol, metn, sitatlar, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, qovluq_id || "all", rol, metn, JSON.stringify(sitatlar || []), yaradildi);
  return { id, qovluq_id: qovluq_id || "all", rol, metn, sitatlar, yaradildi };
}

function sohbetleriTemizle(qovluq_id = "all") {
  return db.prepare("DELETE FROM sohbetler WHERE qovluq_id = ?").run(qovluq_id || "all");
}

// ---- Bilik Boşluqlarının İzlənməsi (Knowledge Gap Log) ----
function bilikBosluguQeydEt({ sual, movzu = "", menbe = "Söhbət" }) {
  const temizSual = String(sual || "").trim();
  if (!temizSual || temizSual.length < 6) return null;

  const indi = Date.now();
  const yeniNorm = azNormallashdir(temizSual);
  const aciqlar = db.prepare("SELECT * FROM bilik_bosluqlari WHERE status = 'aciq'").all();

  // Oxşar sual artıq varsa sayını artır
  for (const b of aciqlar) {
    const movcudNorm = azNormallashdir(b.sual);
    if (movcudNorm === yeniNorm || (yeniNorm.length > 15 && (movcudNorm.includes(yeniNorm) || yeniNorm.includes(movcudNorm)))) {
      db.prepare("UPDATE bilik_bosluqlari SET say = say + 1, son_sorulma = ? WHERE id = ?").run(indi, b.id);
      return { ...b, say: (b.say || 1) + 1, son_sorulma: indi };
    }
  }

  const id = "gap-" + crypto.randomUUID().slice(0, 8);
  const qisaMovzu = movzu || temizSual.slice(0, 70);
  db.prepare(`
    INSERT INTO bilik_bosluqlari (id, sual, movzu, menbe, say, status, yaradildi, son_sorulma)
    VALUES (?, ?, ?, ?, 1, 'aciq', ?, ?)
  `).run(id, temizSual, qisaMovzu, menbe, indi, indi);

  return { id, sual: temizSual, movzu: qisaMovzu, menbe, say: 1, status: "aciq", yaradildi: indi, son_sorulma: indi };
}

function bilikBosluqlariniAl(limit = 20) {
  return db.prepare(`
    SELECT * FROM bilik_bosluqlari
    WHERE status = 'aciq'
    ORDER BY say DESC, son_sorulma DESC
    LIMIT ?
  `).all(limit);
}

function bilikBosluguHellEt(id) {
  return db.prepare("UPDATE bilik_bosluqlari SET status = 'hell_edildi' WHERE id = ?").run(id);
}

function bilikBosluqlariniTemizle() {
  return db.prepare("DELETE FROM bilik_bosluqlari").run();
}

// ---- Baza Yedəkləmə (Backup) və Vektor Statistikası ----
function bazaBackupHazirla() {
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch (_) {}
  const buffer = fs.readFileSync(DB_PATH);
  const tarix = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  return {
    faylAdi: `beyinai_backup_${tarix}.sqlite`,
    yol: DB_PATH,
    olcu: buffer.length,
    buffer
  };
}

function vektorStatistikasiAl() {
  const cemi = db.prepare("SELECT COUNT(*) as c FROM parcalar").get().c;
  const vektorlu = db.prepare("SELECT COUNT(*) as c FROM parcalar WHERE vektor IS NOT NULL AND length(vektor) > 10").get().c;
  const qaliq = Math.max(0, cemi - vektorlu);
  const faiz = cemi > 0 ? Math.round((vektorlu / cemi) * 100) : 100;
  return { cemi, vektorlu, qaliq, faiz };
}

function vektorsuzParcalariAl(limit = 1000) {
  return db.prepare(`
    SELECT id, basliq, gonderen, metn
    FROM parcalar
    WHERE vektor IS NULL OR length(vektor) <= 10
    ORDER BY id ASC
    LIMIT ?
  `).all(limit);
}

function statistikaAl() {
  const qovluqSayi = db.prepare("SELECT COUNT(*) as c FROM qovluqlar").get().c;
  const menbeSayi = db.prepare("SELECT COUNT(*) as c FROM menbeler").get().c;
  const parcaSayi = db.prepare("SELECT COUNT(*) as c FROM parcalar").get().c;
  const yaddasSayi = db.prepare("SELECT COUNT(*) as c FROM yaddas").get().c;
  const bosluqSayi = db.prepare("SELECT COUNT(*) as c FROM bilik_bosluqlari WHERE status = 'aciq'").get().c;
  const vektorluSay = db.prepare("SELECT COUNT(*) as c FROM parcalar WHERE vektor IS NOT NULL AND length(vektor) > 10").get().c;
  return { qovluqSayi, menbeSayi, parcaSayi, yaddasSayi, bosluqSayi, vektorluSay };
}

module.exports = {
  db,
  DB_PATH,
  azKicilt,
  azNormallashdir,
  azKokCixar,
  sozKokleri,
  tenzimlemeleriAl,
  tenzimlemeYenile,
  qovluqlariAl,
  qovluqYarat,
  qovluqSil,
  menbeQovluqDeyis,
  menbeleriAl,
  menbeDetaliAl,
  menbeElaveEt,
  menbeYenile,
  parcaVektorYenile,
  menbeAktivlikDeyis,
  menbeSil,
  parcaKesiniSifirla,
  hibridAxtar,
  qonsuParcalariAl,
  carpazMaddeleriAl,
  bazadaVektorVarmi,
  istirakcilariAl,
  yaddaslariAl,
  aktualYaddaslariAl,
  yaddasElaveEt,
  yaddasRedakteEt,
  yaddasSil,
  praktikaKeysElaveEt,
  bilikBosluguQeydEt,
  bilikBosluqlariniAl,
  bilikBosluguHellEt,
  bilikBosluqlariniTemizle,
  bazaBackupHazirla,
  vektorStatistikasiAl,
  vektorsuzParcalariAl,
  sohbetleriAl,
  sohbetElaveEt,
  sohbetleriTemizle,
  statistikaAl
};
