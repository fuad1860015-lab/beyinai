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
`);

function ilkinBazaHazirla() {
  const say = db.prepare("SELECT COUNT(*) as c FROM qovluqlar").get().c;
  if (say === 0) {
    const indi = Date.now();
    const elaveEt = db.prepare(
      "INSERT INTO qovluqlar (id, ad, ikon, reng, aciqlama, yaradildi) VALUES (?, ?, ?, ?, ?, ?)"
    );
    elaveEt.run("qovluq-is", "İş və Mühasibatlıq", "💼", "#6366f1", "Müqavilələr, qaimələr, hesab-fakturalar və iş sənədləri", indi);
    elaveEt.run("qovluq-cat", "WhatsApp və Telegram", "💬", "#10b981", "Mesaj çıxarışları, qrup müzakirələri və səsli qeydlər", indi + 1);
    elaveEt.run("qovluq-sexsi", "Şəxsi Qeydlər və Linklər", "🧠", "#f59e0b", "Məqalələr, YouTube videoları, kitablar və şəxsi fikirlər", indi + 2);
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

function qovluqSil(id) {
  return db.prepare("DELETE FROM qovluqlar WHERE id = ?").run(id);
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

  return menbeDetaliAl(id);
}

function parcaVektorYenile(parcaId, vektor) {
  db.prepare("UPDATE parcalar SET vektor = ? WHERE id = ?").run(JSON.stringify(vektor), parcaId);
}

function menbeAktivlikDeyis(id, aktiv) {
  db.prepare("UPDATE menbeler SET aktiv = ? WHERE id = ?").run(aktiv ? 1 : 0, id);
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

  return menbeDetaliAl(id);
}

function menbeSil(id) {
  return db.prepare("DELETE FROM menbeler WHERE id = ?").run(id);
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

function azKokCixar(soz) {
  let s = azKicilt(soz).trim();
  if (s.length <= 4) return s;

  // Ardıcıl 2 qat şəkilçi soyulması (məs: "mülkiyyətlərindən" -> "mülkiyyətlər" -> "mülkiyyət")
  for (let qat = 0; qat < 2; qat++) {
    let deyishdi = false;
    for (const sek of AZ_SEKILCILER) {
      if (s.length - sek.length >= 4 && s.endsWith(sek)) {
        s = s.slice(0, s.length - sek.length);
        // Sait düşməsi və ya samit əvəzlənməsi: "qərarı" -> "qərar", "hüququndan" -> "hüquq"
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

// Sözün mətndə neçə dəfə keçdiyini sayır
function tezlikSay(metn, altSoz) {
  if (!altSoz || altSoz.length < 2) return 0;
  let say = 0, pos = 0;
  while (true) {
    const idx = metn.indexOf(altSoz, pos);
    if (idx === -1) break;
    say++;
    pos = idx + altSoz.length;
  }
  return say;
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
  let sql = `
    SELECT p.id, p.menbe_id, p.qovluq_id, p.sira, p.basliq, p.metn, p.gonderen, p.tarix, p.meta, p.vektor,
           m.ad AS menbe_adi, m.nov AS menbe_novu
    FROM parcalar p
    JOIN menbeler m ON m.id = p.menbe_id
    WHERE m.aktiv = 1
  `;
  const params = [];

  if (qovluq_id && qovluq_id !== "all") {
    sql += " AND p.qovluq_id = ?";
    params.push(qovluq_id);
  }
  if (menbe_nov) {
    sql += " AND m.nov = ?";
    params.push(menbe_nov);
  }
  if (gonderen && gonderen.trim()) {
    sql += " AND LOWER(p.gonderen) LIKE ?";
    params.push(`%${azKicilt(gonderen.trim())}%`);
  }
  if (tarix_baslangic) {
    sql += " AND p.tarix >= ?";
    params.push(tarix_baslangic);
  }
  if (tarix_son) {
    sql += " AND p.tarix <= ?";
    params.push(tarix_son + "T23:59:59");
  }

  const namizedler = db.prepare(sql).all(...params);
  if (namizedler.length === 0) return [];

  const kokler = sozKokleri(sorgu);
  const N = namizedler.length;

  // Sorğuda birbaşa çəkilən Maddə nömrələrini (məs: "Maddə 163", "175-ci maddə", "102.1.30") çıxar
  const sorguMaddeNomreleri = Array.from(
    String(sorgu || "").matchAll(/(?:maddə\s*(\d+[0-9.-]*)|(\d+[0-9.-]*)\s*(?:-?[cç]ı|-?[cç]i|-?[cç]u|-?[cç]ü)?\s*maddə|\b(\d{1,3}\.\d+(?:\.\d+)*)\b)/gi)
  ).map(m => (m[1] || m[2] || m[3] || "").replace(/\.$/, "")).filter(Boolean);

  // Hər parça üçün başlıq + mətni kiçilt (fayl adını bura qatma ki, bütün səhifələr eyni balı almasın!)
  const hazirNamizedler = namizedler.map(p => {
    const basliqAz = azKicilt(p.basliq || "");
    const basliqNorm = azNormallashdir(basliqAz);
    const yalnızMetnAz = azKicilt((p.basliq ? p.basliq + "\n" : "") + p.metn + " " + p.gonderen);
    const yalnızMetnNorm = azNormallashdir(yalnızMetnAz);
    const menbeAdNorm = azNormallashdir(p.menbe_adi);
    return { p, basliqAz, basliqNorm, yalnızMetnAz, yalnızMetnNorm, menbeAdNorm };
  });

  // Hər açar söz üçün IDF (Inverse Document Frequency) hesabla:
  const idfMap = kokler.map(k => {
    let df = 0;
    for (const h of hazirNamizedler) {
      if (h.yalnızMetnAz.includes(k.kok) || h.yalnızMetnNorm.includes(k.normKok)) {
        df++;
      }
    }
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    return { ...k, df, idf: Math.max(0.2, idf) };
  });

  const qiymetlendirilmish = hazirNamizedler.map(({ p, basliqAz, basliqNorm, yalnızMetnAz, yalnızMetnNorm, menbeAdNorm }) => {
    let bm25Bal = 0;
    let tapilanAcarSayi = 0;

    for (const k of idfMap) {
      const tamSay = tezlikSay(yalnızMetnAz, k.tam);
      const kokSay = tezlikSay(yalnızMetnAz, k.kok) || tezlikSay(yalnızMetnNorm, k.normKok);

      if (tamSay > 0 || kokSay > 0) {
        tapilanAcarSayi++;
        const tf = tamSay * 1.5 + kokSay;
        const tfNorm = (tf * 2.2) / (tf + 1.2);
        bm25Bal += k.idf * tfNorm;

        // Əgər açar söz birbaşa bölmə/maddə başlığında ("Maddə 163. Vergi tutulan dövriyyənin dəqiqləşdirilməsi") keçirsə, güclü başlıq bonusu ver!
        if (basliqAz.includes(k.kok) || basliqNorm.includes(k.normKok)) {
          bm25Bal += k.idf * 0.9;
        }
      } else if (menbeAdNorm.includes(k.normKok)) {
        bm25Bal += 0.1;
      }

      if (p.gonderen && azNormallashdir(p.gonderen).includes(k.normKok)) {
        bm25Bal += k.idf * 1.5;
      }
    }

    // Birbaşa Maddə nömrəsi uyğunluğu bonusu (məs: sorğuda "Maddə 163" və ya "163.2" varsa və bu parça həmin maddədirsə)
    for (const mNom of sorguMaddeNomreleri) {
      const anaMadde = mNom.split(".")[0];
      const maddeBasliqRegex = new RegExp(`\\bmadd[əe]\\s*${anaMadde.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.|\\s|$)`, "i");
      if (maddeBasliqRegex.test(p.basliq || "") || maddeBasliqRegex.test(p.metn.slice(0, 200))) {
        bm25Bal += 12.0;
      }
      if (p.metn.includes(mNom + ".")) {
        bm25Bal += 8.0;
      }
    }

    // Çox sayda fərqli açar sözü eyni anda ehtiva edən parçalara koordinasiya bonusu ver
    if (tapilanAcarSayi >= 2) {
      bm25Bal *= 1 + (tapilanAcarSayi * 0.25);
    }

    let vektorBal = 0;
    if (sorguVektoru && p.vektor) {
      try {
        const pv = JSON.parse(p.vektor);
        vektorBal = Math.max(0, kosinusOxsharlighi(sorguVektoru, pv));
      } catch (_) {}
    }

    const yekunBal = sorguVektoru && vektorBal > 0
      ? (vektorBal * 5.0) + bm25Bal
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
      meta: JSON.parse(p.meta || "{}"),
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
  const maddeMatch = String(basliq || "").match(/^(Maddə\s+\d+[0-9.-]*\.)/i);
  if (maddeMatch && maddeMatch[1]) {
    const eyniMadde = db.prepare(`
      SELECT p.*, m.ad AS menbe_adi, m.nov AS menbe_novu
      FROM parcalar p
      JOIN menbeler m ON m.id = p.menbe_id
      WHERE p.menbe_id = ? AND (p.basliq LIKE ? OR p.sira IN (?, ?))
      ORDER BY p.sira ASC
      LIMIT 4
    `).all(menbe_id, `${maddeMatch[1]}%`, sira - 1, sira + 1);
    if (eyniMadde.length > 0) return eyniMadde;
  }
  return db.prepare(`
    SELECT p.*, m.ad AS menbe_adi, m.nov AS menbe_novu
    FROM parcalar p
    JOIN menbeler m ON m.id = p.menbe_id
    WHERE p.menbe_id = ? AND p.sira IN (?, ?)
    ORDER BY p.sira ASC
  `).all(menbe_id, sira - 1, sira + 1);
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

function yaddasElaveEt({ kateqoriya = "fakt", metn, menbe = "Söhbət", vaciblik = 3 }) {
  if (!metn || !metn.trim()) return null;
  const təmiz = metn.trim();
  const movcud = db.prepare("SELECT id FROM yaddas WHERE LOWER(metn) = LOWER(?)").get(təmiz);
  if (movcud) return movcud;

  const id = "yad-" + crypto.randomUUID().slice(0, 8);
  const yaradildi = Date.now();
  db.prepare(
    "INSERT INTO yaddas (id, kateqoriya, metn, menbe, vaciblik, yaradildi) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, kateqoriya, təmiz, menbe, vaciblik, yaradildi);
  return { id, kateqoriya, metn: təmiz, menbe, vaciblik, yaradildi };
}

function yaddasSil(id) {
  return db.prepare("DELETE FROM yaddas WHERE id = ?").run(id);
}

function sohbetleriAl(qovluq_id = "all", limit = 60) {
  return db.prepare(`
    SELECT * FROM sohbetler
    WHERE qovluq_id = ?
    ORDER BY yaradildi ASC
    LIMIT ?
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

function statistikaAl() {
  const qovluqSayi = db.prepare("SELECT COUNT(*) as c FROM qovluqlar").get().c;
  const menbeSayi = db.prepare("SELECT COUNT(*) as c FROM menbeler").get().c;
  const parcaSayi = db.prepare("SELECT COUNT(*) as c FROM parcalar").get().c;
  const yaddasSayi = db.prepare("SELECT COUNT(*) as c FROM yaddas").get().c;
  return { qovluqSayi, menbeSayi, parcaSayi, yaddasSayi };
}

module.exports = {
  db,
  azKicilt,
  azNormallashdir,
  azKokCixar,
  sozKokleri,
  tenzimlemeleriAl,
  tenzimlemeYenile,
  qovluqlariAl,
  qovluqYarat,
  qovluqSil,
  menbeleriAl,
  menbeDetaliAl,
  menbeElaveEt,
  menbeYenile,
  parcaVektorYenile,
  menbeAktivlikDeyis,
  menbeSil,
  hibridAxtar,
  qonsuParcalariAl,
  bazadaVektorVarmi,
  istirakcilariAl,
  yaddaslariAl,
  yaddasElaveEt,
  yaddasSil,
  sohbetleriAl,
  sohbetElaveEt,
  sohbetleriTemizle,
  statistikaAl
};
