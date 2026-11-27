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

  CREATE TABLE IF NOT EXISTS menbe_versiyalari (
    id TEXT PRIMARY KEY,
    menbe_id TEXT NOT NULL,
    versiya_no INTEGER NOT NULL,
    ad TEXT NOT NULL,
    nov TEXT NOT NULL,
    olcu INTEGER DEFAULT 0,
    xulase TEXT DEFAULT '',
    meta TEXT DEFAULT '{}',
    xam_metn TEXT DEFAULT '',
    yaradildi INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_versiya_menbe ON menbe_versiyalari(menbe_id);

  CREATE TABLE IF NOT EXISTS audit_jurnali (
    id TEXT PRIMARY KEY,
    emeliyyat TEXT NOT NULL,
    obyekt_nov TEXT NOT NULL,
    obyekt_id TEXT DEFAULT '',
    detal TEXT DEFAULT '',
    yaradildi INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_tarix ON audit_jurnali(yaradildi);

  CREATE TABLE IF NOT EXISTS saheler (
    id TEXT PRIMARY KEY,
    ad TEXT NOT NULL,
    kod TEXT UNIQUE NOT NULL,
    ikon TEXT DEFAULT '📚',
    reng TEXT DEFAULT '#10b981',
    aciqlama TEXT DEFAULT '',
    esas_mi INTEGER DEFAULT 0,
    status TEXT DEFAULT 'aktiv',
    valideyn_id TEXT DEFAULT NULL,
    elaqe_derecesi INTEGER DEFAULT 100,
    yaradildi INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sahe_status ON saheler(status);
  CREATE INDEX IF NOT EXISTS idx_sahe_valideyn ON saheler(valideyn_id);

  CREATE TABLE IF NOT EXISTS sahe_movzulari (
    id TEXT PRIMARY KEY,
    sahe_id TEXT NOT NULL,
    movzu TEXT NOT NULL,
    status TEXT DEFAULT 'oyrenilib',
    menbe_sayi INTEGER DEFAULT 0,
    detal TEXT DEFAULT '',
    yaradildi INTEGER NOT NULL,
    FOREIGN KEY (sahe_id) REFERENCES saheler(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_sahe_movzu_sahe ON sahe_movzulari(sahe_id);

  CREATE TABLE IF NOT EXISTS simulyasiyalar (
    id TEXT PRIMARY KEY,
    sahe_id TEXT NOT NULL,
    basliq TEXT NOT NULL,
    ssenari TEXT NOT NULL,
    cavab TEXT DEFAULT '',
    audit_netice TEXT DEFAULT '',
    bal INTEGER DEFAULT 100,
    ugurlu_mu INTEGER DEFAULT 1,
    dersler TEXT DEFAULT '[]',
    menbe_idleri TEXT DEFAULT '[]',
    yaradildi INTEGER NOT NULL,
    FOREIGN KEY (sahe_id) REFERENCES saheler(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_simulyasiya_sahe ON simulyasiyalar(sahe_id);
  CREATE INDEX IF NOT EXISTS idx_simulyasiya_tarix ON simulyasiyalar(yaradildi);

  CREATE TABLE IF NOT EXISTS dusunme_qaydalari (
    id TEXT PRIMARY KEY,
    sahe_id TEXT DEFAULT 'vergi_muhasibat',
    sehv_koku TEXT NOT NULL,
    yoxlama_qaydasi TEXT NOT NULL,
    tetbiq_serti TEXT DEFAULT '',
    numune_sual TEXT DEFAULT '',
    aktiv INTEGER DEFAULT 1,
    istifade_sayi INTEGER DEFAULT 0,
    yaradildi INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dusunme_sahe ON dusunme_qaydalari(sahe_id);

  CREATE TABLE IF NOT EXISTS mubahiseli_dosyeler (
    id TEXT PRIMARY KEY,
    sahe_id TEXT DEFAULT 'vergi_muhasibat',
    movzu TEXT NOT NULL,
    sual TEXT NOT NULL,
    teref_a_mufettis TEXT NOT NULL,
    teref_b_muhasib TEXT NOT NULL,
    ekspert_qerari TEXT DEFAULT '',
    secilmis_movqe TEXT DEFAULT '',
    status TEXT DEFAULT 'gozleyir',
    bagli_maddeler TEXT DEFAULT '[]',
    yaradildi INTEGER NOT NULL,
    hell_tarixi INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_dosye_sahe_status ON mubahiseli_dosyeler(sahe_id, status);

  CREATE TABLE IF NOT EXISTS qanun_tesir_hesabatlari (
    id TEXT PRIMARY KEY,
    sahe_id TEXT DEFAULT 'vergi_muhasibat',
    sened_adi TEXT NOT NULL,
    deyisen_maddeler TEXT DEFAULT '[]',
    arxivlenen_yaddaslar TEXT DEFAULT '[]',
    xulase TEXT DEFAULT '',
    yaradildi INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_qanun_tesir_sahe ON qanun_tesir_hesabatlari(sahe_id);

  CREATE TABLE IF NOT EXISTS sahe_profilleri (
    sahe_id TEXT PRIMARY KEY,
    teref_a_rol TEXT NOT NULL,
    teref_b_rol TEXT NOT NULL,
    hakim_rol TEXT NOT NULL,
    eks_hucum_suali TEXT DEFAULT '',
    helledici_deyisenler TEXT DEFAULT '[]',
    numune_suallar TEXT DEFAULT '[]',
    sual_ipucu TEXT DEFAULT '',
    yaradildi INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sahe_bacariq_xeritesi (
    id TEXT PRIMARY KEY,
    sahe_id TEXT NOT NULL,
    movzu TEXT NOT NULL,
    ugurlu_say INTEGER DEFAULT 0,
    ugursuz_say INTEGER DEFAULT 0,
    duzelis_sayi INTEGER DEFAULT 0,
    son_bal INTEGER DEFAULT 75,
    deqiqlik_faizi INTEGER DEFAULT 75,
    seviyye TEXT DEFAULT 'orta',
    son_yenilenme INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bacariq_sahe ON sahe_bacariq_xeritesi(sahe_id, deqiqlik_faizi);
`);

// Sütun miqrasiyası: Köhnə bazalarda yaddas.etibar_seviyyesi və menbeler.etibar_seviyyesi yoxdursa əlavə et
try { db.exec("ALTER TABLE yaddas ADD COLUMN etibar_seviyyesi TEXT DEFAULT 'ai_sintezi';"); } catch (_) {}
try { db.exec("ALTER TABLE menbeler ADD COLUMN etibar_seviyyesi TEXT DEFAULT 'orijinal_menbe';"); } catch (_) {}

// İki-pilləli Yaddaş (Qaralama -> Qızıl Yaddaş) və Dövr üzrə Arxivləmə sütunları
try { db.exec("ALTER TABLE yaddas ADD COLUMN status TEXT DEFAULT 'tesdiqlenmis';"); } catch (_) {}
try { db.exec("ALTER TABLE yaddas ADD COLUMN bagli_maddeler TEXT DEFAULT '[]';"); } catch (_) {}
try { db.exec("ALTER TABLE yaddas ADD COLUMN quvvede_olma_dovru TEXT DEFAULT 'cari';"); } catch (_) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_yaddas_status ON yaddas(status);"); } catch (_) {}

// Kitabxana və Sahələr üçün sahe_id sütun miqrasiyaları
try { db.exec("ALTER TABLE qovluqlar ADD COLUMN sahe_id TEXT DEFAULT 'vergi_muhasibat';"); } catch (_) {}
try { db.exec("ALTER TABLE menbeler ADD COLUMN sahe_id TEXT DEFAULT 'vergi_muhasibat';"); } catch (_) {}
try { db.exec("ALTER TABLE parcalar ADD COLUMN sahe_id TEXT DEFAULT 'vergi_muhasibat';"); } catch (_) {}
try { db.exec("ALTER TABLE yaddas ADD COLUMN sahe_id TEXT DEFAULT 'vergi_muhasibat';"); } catch (_) {}
try { db.exec("ALTER TABLE sohbetler ADD COLUMN sahe_id TEXT DEFAULT 'vergi_muhasibat';"); } catch (_) {}
try { db.exec("ALTER TABLE bilik_bosluqlari ADD COLUMN sahe_id TEXT DEFAULT 'vergi_muhasibat';"); } catch (_) {}

try { db.exec("CREATE INDEX IF NOT EXISTS idx_menbeler_sahe ON menbeler(sahe_id);"); } catch (_) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_parcalar_sahe ON parcalar(sahe_id);"); } catch (_) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_yaddas_sahe ON yaddas(sahe_id);"); } catch (_) {}

// Təhlükəsiz SQLite Tranzaksiya sarğısı (yarımçıq yazılmaların qarşısını alır)
function tranzaksiyaIleIcraEt(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const netice = fn();
    db.exec("COMMIT");
    return netice;
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch (_) {}
    throw err;
  }
}

function auditQeydEt(emeliyyat, obyekt_nov, obyekt_id = "", detal = "") {
  try {
    const id = "aud-" + crypto.randomUUID().slice(0, 10);
    db.prepare(
      "INSERT INTO audit_jurnali (id, emeliyyat, obyekt_nov, obyekt_id, detal, yaradildi) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, emeliyyat, obyekt_nov, String(obyekt_id || ""), String(detal || "").slice(0, 400), Date.now());
  } catch (_) {}
}

function auditJurnaliniAl(limit = 50) {
  return db.prepare("SELECT * FROM audit_jurnali ORDER BY yaradildi DESC LIMIT ?").all(limit);
}

function menbeVersiyasiSaxla(movcudMenbe) {
  if (!movcudMenbe || !movcudMenbe.id) return null;
  const son = db.prepare("SELECT MAX(versiya_no) as v FROM menbe_versiyalari WHERE menbe_id = ?").get(movcudMenbe.id);
  const yeniNo = (son?.v || 0) + 1;
  const vid = "ver-" + crypto.randomUUID().slice(0, 10);
  db.prepare(`
    INSERT INTO menbe_versiyalari (id, menbe_id, versiya_no, ad, nov, olcu, xulase, meta, xam_metn, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    vid,
    movcudMenbe.id,
    yeniNo,
    movcudMenbe.ad || "",
    movcudMenbe.nov || "txt",
    movcudMenbe.olcu || 0,
    movcudMenbe.xulase || "",
    typeof movcudMenbe.meta === "string" ? movcudMenbe.meta : JSON.stringify(movcudMenbe.meta || {}),
    String(movcudMenbe.xam_metn || "").slice(0, 1500000),
    Date.now()
  );
  return { id: vid, versiya_no: yeniNo };
}

function menbeVersiyalariniAl(menbeId) {
  return db.prepare(
    "SELECT id, menbe_id, versiya_no, ad, nov, olcu, xulase, yaradildi FROM menbe_versiyalari WHERE menbe_id = ? ORDER BY versiya_no DESC"
  ).all(menbeId);
}

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
    aktiv_sahe_id: "vergi_muhasibat",
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

  // Kitabxana və Sahələr (Bilik İstiqamətləri) İlkin Toxumlama
  const saheSay = db.prepare("SELECT COUNT(*) as c FROM saheler").get().c;
  if (saheSay === 0) {
    const indi = Date.now();
    const saheElave = db.prepare(`
      INSERT INTO saheler (id, ad, kod, ikon, reng, aciqlama, esas_mi, status, valideyn_id, elaqe_derecesi, yaradildi)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    saheElave.run(
      "vergi_muhasibat",
      "Vergi və Mühasibatlıq",
      "vergi_muhasibat",
      "💼",
      "#10b981",
      "Azərbaycan Vergi Məcəlləsi, mühasibat uçotu, bəyannamələr və maliyyə hesabatları",
      1,
      "aktiv",
      null,
      100,
      indi
    );
    saheElave.run(
      "emek_mulki",
      "Əmək və Mülki Münasibətlər",
      "emek_mulki",
      "⚖️",
      "#6366f1",
      "Əmək Məcəlləsi, Mülki Məcəllə, əmək müqavilələri, kadr uçotu və kompensasiyalar",
      0,
      "aktiv",
      "vergi_muhasibat",
      85,
      indi + 1
    );
    saheElave.run(
      "dovlet_qerarlari",
      "Normativ və Hökumət Qərarları",
      "dovlet_qerarlari",
      "🏛️",
      "#f59e0b",
      "Nazirlər Kabinetinin qərarları, DSMF, İcbari Tibbi Sığorta qaydaları və rəsmi izahatlar",
      0,
      "aktiv",
      "vergi_muhasibat",
      80,
      indi + 2
    );

    const movzuElave = db.prepare(`
      INSERT INTO sahe_movzulari (id, sahe_id, movzu, status, menbe_sayi, detal, yaradildi)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    movzuElave.run("mov-1", "vergi_muhasibat", "Elektron Qaimə-Faktura və ƏDV Əvəzləşdirilməsi", "oyrenilib", 3, "Maddə 163, 175 və depozit hesabı qaydaları", indi);
    movzuElave.run("mov-2", "vergi_muhasibat", "Fərdi Sahibkarlar üzrə 75% Güzəşt və Gəlir Vergisi", "oyrenilib", 2, "Maddə 102.1.30, 45 000 AZN həddi və 3 işçi şərti", indi + 1);
    movzuElave.run("mov-3", "vergi_muhasibat", "Kassa İntizamı və Nağdsız Hesablaşmalar Limiti", "oyrenilib", 2, "Nağdsız hesablaşmalar haqqında qanun və cərimələr", indi + 2);
    movzuElave.run("mov-4", "emek_mulki", "Məzuniyyət və Son Haqq-Hesab Hesablanması Qaydaları", "oyrenilib", 2, "Əmək Məcəlləsi Maddə 140, əmsallar və kompensasiya", indi + 3);
    movzuElave.run("mov-5", "emek_mulki", "Əmək Müqavilələri və Bildiriş Alt-Sistemi", "oyrenilib", 1, "ƏMAS portalı və elektron qeydiyyat qaydaları", indi + 4);
    movzuElave.run("mov-6", "dovlet_qerarlari", "POS-terminal Quraşdırılması Qaydaları (219 saylı Qərar)", "oyrenilib", 1, "Nazirlər Kabinetinin 219 nömrəli qərarı və 2000 AZN dövriyyə", indi + 5);
  }

  // Baza boş olduqda (məs: Render deploy sıfırlamasından sonra) əsas qanunvericilik mənbələrini avtomatik bərpa et
  try {
    const menbeSay = db.prepare("SELECT COUNT(*) as c FROM menbeler").get().c;
    if (menbeSay === 0) {
      const { vergiYukle } = require("./vergi-yukle");
      if (typeof vergiYukle === "function") {
        vergiYukle();
      }
    }
  } catch (_) {}

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

  // Arxa plan sınaqlarından əsas söhbət ekranına düşmüş köhnə SINAQ SİMULYASİYASI qeydlərini təmizlə
  try {
    db.exec("DELETE FROM sohbetler WHERE metn LIKE 'SINAQ SİMULYASİYASI:%' OR metn = 'Üzr istəyirəm, amma bu mövzu barədə məlumatım yoxdur.';");
  } catch (_) {}

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

// ---- Kitabxana və Bilik Sahələri İdarəetməsi (Domain Spaces) ----

function saheleriAl() {
  return db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM menbeler m WHERE m.sahe_id = s.id) AS menbe_sayi,
      (SELECT COUNT(*) FROM sahe_movzulari sm WHERE sm.sahe_id = s.id) AS movzu_sayi,
      (SELECT COUNT(*) FROM yaddas y WHERE y.sahe_id = s.id) AS yaddas_sayi
    FROM saheler s
    ORDER BY s.esas_mi DESC, s.elaqe_derecesi DESC, s.yaradildi ASC
  `).all();
}

function aktivSaheIdAl() {
  const movcud = db.prepare("SELECT deyer FROM tenzimlemeler WHERE acar = 'aktiv_sahe_id'").get();
  return movcud?.deyer || "vergi_muhasibat";
}

function aktivSaheAl() {
  const aktivId = aktivSaheIdAl();
  const sahe = db.prepare("SELECT * FROM saheler WHERE id = ?").get(aktivId);
  if (sahe) return sahe;
  return db.prepare("SELECT * FROM saheler WHERE esas_mi = 1 LIMIT 1").get() || null;
}

function aktivSaheDeyis(saheId) {
  const sahe = db.prepare("SELECT * FROM saheler WHERE id = ?").get(saheId);
  if (!sahe) throw new Error("Sahə tapılmadı: " + saheId);
  db.prepare("INSERT OR REPLACE INTO tenzimlemeler (acar, deyer) VALUES ('aktiv_sahe_id', ?)").run(saheId);
  auditQeydEt("sahe_aktiv_deyis", "sahe", saheId, `Aktiv sahə dəyişdirildi: ${sahe.ad}`);
  parcaKesiniSifirla();
  return sahe;
}

function saheYarat({ ad, kod, ikon = "📚", reng = "#6366f1", aciqlama = "", esas_mi = 0, valideyn_id = null, elaqe_derecesi = 100 }) {
  if (!ad || !ad.trim()) throw new Error("Sahə adı boş ola bilməz.");
  const id = (kod || ad).toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 30) || ("sahe_" + crypto.randomUUID().slice(0, 8));
  const indi = Date.now();
  db.prepare(`
    INSERT INTO saheler (id, ad, kod, ikon, reng, aciqlama, esas_mi, status, valideyn_id, elaqe_derecesi, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'aktiv', ?, ?, ?)
  `).run(
    id,
    ad.trim(),
    kod ? kod.trim() : id,
    ikon,
    reng,
    aciqlama ? aciqlama.trim() : "",
    esas_mi ? 1 : 0,
    valideyn_id || null,
    Number(elaqe_derecesi) || 100,
    indi
  );
  auditQeydEt("sahe_yarat", "sahe", id, `Yeni bilik sahəsi yaradıldı: ${ad}`);
  return db.prepare("SELECT * FROM saheler WHERE id = ?").get(id);
}

function saheMovzulariAl(saheId = null) {
  if (saheId && saheId !== "all") {
    return db.prepare("SELECT * FROM sahe_movzulari WHERE sahe_id = ? ORDER BY yaradildi DESC").all(saheId);
  }
  return db.prepare("SELECT * FROM sahe_movzulari ORDER BY yaradildi DESC").all();
}

function saheMovzuElaveEt({ sahe_id, movzu, status = "oyrenilib", detal = "", menbe_sayi = 1 }) {
  if (!sahe_id || !movzu) return null;
  const movcud = db.prepare("SELECT id, menbe_sayi FROM sahe_movzulari WHERE sahe_id = ? AND LOWER(movzu) = LOWER(?)").get(sahe_id, movzu.trim());
  if (movcud) {
    db.prepare("UPDATE sahe_movzulari SET menbe_sayi = menbe_sayi + 1, detal = CASE WHEN ? != '' THEN ? ELSE detal END WHERE id = ?")
      .run(detal, detal, movcud.id);
    return db.prepare("SELECT * FROM sahe_movzulari WHERE id = ?").get(movcud.id);
  }
  const id = "mov-" + crypto.randomUUID().slice(0, 10);
  db.prepare(`
    INSERT INTO sahe_movzulari (id, sahe_id, movzu, status, menbe_sayi, detal, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, sahe_id, movzu.trim(), status, menbe_sayi, detal, Date.now());
  auditQeydEt("sahe_movzu_elave", "movzu", id, `Yeni mövzu öyrənildi: ${movzu} (Sahə: ${sahe_id})`);
  return { id, sahe_id, movzu: movzu.trim(), status, menbe_sayi, detal };
}

function icazeVerilenSaheIdleriAl(aktivSaheId = null) {
  const cariId = aktivSaheId || aktivSaheIdAl();
  const icaze = new Set([cariId]);
  // Əgər cari sahə əsas sahədirsə, ona bağlı bütün aktiv əlaqəli sahələri gətir
  const elaqeliler = db.prepare("SELECT id FROM saheler WHERE valideyn_id = ? AND status = 'aktiv'").all(cariId);
  for (const e of elaqeliler) icaze.add(e.id);
  // Əgər cari sahənin özü əlaqəli sahədirsə, valideynini də əlavə et
  const cari = db.prepare("SELECT valideyn_id FROM saheler WHERE id = ?").get(cariId);
  if (cari && cari.valideyn_id) icaze.add(cari.valideyn_id);
  return Array.from(icaze);
}

function simulyasiyaSaxla({
  id = null,
  sahe_id = null,
  basliq,
  ssenari,
  cavab = "",
  audit_netice = "",
  bal = 100,
  ugurlu_mu = 1,
  dersler = [],
  menbe_idleri = []
}) {
  const sid = id || "sim-" + crypto.randomUUID().slice(0, 10);
  const secilmisSahe = sahe_id || aktivSaheIdAl();
  const indi = Date.now();
  const cavabMetn = typeof cavab === "object" ? (cavab?.metn || JSON.stringify(cavab)) : String(cavab || "");
  const derslerJson = typeof dersler === "string" ? dersler : JSON.stringify(dersler || []);
  const menbelerJson = typeof menbe_idleri === "string" ? menbe_idleri : JSON.stringify(menbe_idleri || []);

  db.prepare(`
    INSERT INTO simulyasiyalar (id, sahe_id, basliq, ssenari, cavab, audit_netice, bal, ugurlu_mu, dersler, menbe_idleri, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sid, secilmisSahe, basliq, ssenari, cavabMetn, audit_netice, bal, ugurlu_mu ? 1 : 0, derslerJson, menbelerJson, indi);

  auditQeydEt("simulyasiya_icra", "simulyasiya", sid, `Simulyasiya sınağı tamamlandı: ${basliq} (Bal: ${bal}%)`);
  return { id: sid, sahe_id: secilmisSahe, basliq, ssenari, cavab, audit_netice, bal, ugurlu_mu, dersler, menbe_idleri, yaradildi: indi };
}

function simulyasiyalariAl(sahe_id = null, limit = 30) {
  const secilmisSahe = sahe_id && sahe_id !== "all" ? sahe_id : null;
  if (secilmisSahe) {
    return db.prepare("SELECT * FROM simulyasiyalar WHERE sahe_id = ? ORDER BY yaradildi DESC LIMIT ?").all(secilmisSahe, limit).map(s => ({
      ...s,
      dersler: JSON.parse(s.dersler || "[]"),
      menbe_idleri: JSON.parse(s.menbe_idleri || "[]")
    }));
  }
  return db.prepare("SELECT * FROM simulyasiyalar ORDER BY yaradildi DESC LIMIT ?").all(limit).map(s => ({
    ...s,
    dersler: JSON.parse(s.dersler || "[]"),
    menbe_idleri: JSON.parse(s.menbe_idleri || "[]")
  }));
}

function simulyasiyaDetaliAl(id) {
  const s = db.prepare("SELECT * FROM simulyasiyalar WHERE id = ?").get(id);
  if (!s) return null;
  return {
    ...s,
    dersler: JSON.parse(s.dersler || "[]"),
    menbe_idleri: JSON.parse(s.menbe_idleri || "[]")
  };
}

function simulyasiyaStatistikaAl(sahe_id = null) {
  const secilmisSahe = sahe_id && sahe_id !== "all" ? sahe_id : null;
  let sətirlər;
  if (secilmisSahe) {
    sətirlər = db.prepare("SELECT * FROM simulyasiyalar WHERE sahe_id = ?").all(secilmisSahe);
  } else {
    sətirlər = db.prepare("SELECT * FROM simulyasiyalar").all();
  }

  const umumi = sətirlər.length;
  if (umumi === 0) {
    return { umumi: 0, ugurlu: 0, ortaBal: 0, dersSayi: 0 };
  }

  let ugurlu = 0;
  let cemBal = 0;
  let dersSayi = 0;

  for (const s of sətirlər) {
    if (s.ugurlu_mu) ugurlu++;
    cemBal += (s.bal || 0);
    try {
      const d = JSON.parse(s.dersler || "[]");
      dersSayi += d.length;
    } catch (_) {}
  }

  return {
    umumi,
    ugurlu,
    ortaBal: Math.round(cemBal / umumi),
    dersSayi
  };
}

function bilikBosluqlariniMovzuTeklifineCevir(sahe_id = null) {
  const secilmisSahe = sahe_id || aktivSaheIdAl();
  const aciqlar = db.prepare("SELECT * FROM bilik_bosluqlari WHERE status = 'aciq'").all();
  const cevrilenler = [];

  for (const b of aciqlar) {
    const qisaAd = (b.movzu || b.sual).slice(0, 80);
    const movcud = db.prepare("SELECT id FROM sahe_movzulari WHERE sahe_id = ? AND LOWER(movzu) = LOWER(?)").get(secilmisSahe, qisaAd);
    if (!movcud) {
      const yeni = saheMovzuElaveEt({
        sahe_id: secilmisSahe,
        movzu: qisaAd,
        status: "teklif",
        detal: `Açıq sual əsasında təklif: "${b.sual}" (Soruşulma sayı: ${b.say || 1})`,
        menbe_sayi: 0
      });
      cevrilenler.push(yeni);
    }
  }
  return cevrilenler;
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

function menbeleriAl(qovluqId = null, saheId = null) {
  const icazeSaheler = saheId ? icazeVerilenSaheIdleriAl(saheId) : null;
  let sql = `
    SELECT id, qovluq_id, sahe_id, ad, nov, olcu, xulase, meta, aktiv, etibar_seviyyesi, yaradildi,
      (SELECT COUNT(*) FROM parcalar p WHERE p.menbe_id = menbeler.id) AS parca_sayi
    FROM menbeler
    WHERE 1=1
  `;
  const params = [];
  if (qovluqId && qovluqId !== "all") {
    sql += " AND qovluq_id = ?";
    params.push(qovluqId);
  }
  if (icazeSaheler && icazeSaheler.length > 0) {
    const pl = icazeSaheler.map(() => "?").join(",");
    sql += ` AND (sahe_id IS NULL OR sahe_id IN (${pl}))`;
    params.push(...icazeSaheler);
  }
  sql += " ORDER BY yaradildi DESC";
  return db.prepare(sql).all(...params).map(m => ({ ...m, meta: JSON.parse(m.meta || "{}") }));
}

function menbeDetaliAl(id) {
  const m = db.prepare("SELECT * FROM menbeler WHERE id = ?").get(id);
  if (!m) return null;
  m.meta = JSON.parse(m.meta || "{}");
  m.parcalar = db.prepare(
    "SELECT id, sira, basliq, metn, gonderen, tarix, sahe_id, meta FROM parcalar WHERE menbe_id = ? ORDER BY sira ASC"
  ).all(id).map(p => ({ ...p, meta: JSON.parse(p.meta || "{}") }));
  return m;
}

function menbeElaveEt({ qovluq_id, ad, nov, olcu = 0, xulase = "", meta = {}, xam_metn = "", parcalar = [], etibar_seviyyesi = "", sahe_id = null }) {
  const temizXam = String(xam_metn || "").slice(0, 3000000);
  const seviye = etibar_seviyyesi || (meta?.canli_oyrenme ? "ekspert_tesdiqli" : "orijinal_menbe");
  const secilmisSahe = sahe_id || aktivSaheIdAl();
  const indi = Date.now();
  let id = "menbe-" + crypto.randomUUID().slice(0, 10);

  tranzaksiyaIleIcraEt(() => {
    // Versiyalaşdırma + Dublikat qorunması: Eyni adlı sənəd varsa köhnəsini menbe_versiyalari cədvəlində arxivlə!
    if (temizXam.length > 40) {
      const movcudlar = db.prepare("SELECT * FROM menbeler WHERE qovluq_id = ?").all(qovluq_id);
      const cariIlk = temizXam.slice(0, 600);
      for (const m of movcudlar) {
        if (m.ad === ad || (m.xam_metn && m.xam_metn.length === temizXam.length && m.xam_metn.slice(0, 600) === cariIlk)) {
          menbeVersiyasiSaxla(m);
          db.prepare("DELETE FROM menbeler WHERE id = ?").run(m.id);
          id = m.id; // Eyni ID-ni qoru ki, köhnə versiyalarla əlaqə itməsin!
        }
      }
    }

    db.prepare(`
      INSERT INTO menbeler (id, qovluq_id, sahe_id, ad, nov, olcu, xulase, meta, xam_metn, aktiv, etibar_seviyyesi, yaradildi)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      qovluq_id,
      secilmisSahe,
      ad,
      nov,
      olcu,
      xulase,
      JSON.stringify(meta || {}),
      temizXam,
      seviye,
      indi
    );

    const parcaYaz = db.prepare(`
      INSERT INTO parcalar (id, menbe_id, qovluq_id, sahe_id, sira, basliq, metn, gonderen, tarix, meta, vektor, yaradildi)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < parcalar.length; i++) {
      const p = parcalar[i];
      const pid = "p-" + crypto.randomUUID().slice(0, 12);
      parcaYaz.run(
        pid,
        id,
        qovluq_id,
        secilmisSahe,
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
  });

  auditQeydEt("menbe_elave", "menbe", id, `${ad} (${nov}, ${parcalar.length} blok, ${seviye}, sahə: ${secilmisSahe})`);
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

  tranzaksiyaIleIcraEt(() => {
    // Köhnə versiyanı silmədən menbe_versiyalari cədvəlində arxivlə
    menbeVersiyasiSaxla(movcud);

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
  });

  auditQeydEt("menbe_yenile", "menbe", id, `${ad || movcud.ad} (${parcalar.length} blok — əvvəlki versiya arxivləndi)`);
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
    SELECT p.id, p.menbe_id, p.qovluq_id, p.sahe_id, p.sira, p.basliq, p.metn, p.gonderen, p.tarix, p.meta, p.vektor,
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
  sahe_id = null,
  gonderen = "",
  tarix_baslangic = "",
  tarix_son = "",
  menbe_nov = "",
  limit = 10
}) {
  const butunAktivler = parcaIndeksKesiniAl();
  const gonderenAxtar = gonderen && gonderen.trim() ? azKicilt(gonderen.trim()) : "";
  const tarixSonTam = tarix_son ? tarix_son + "T23:59:59" : "";

  // Sahə süzgəci: Yalnız aktiv və ya icazə verilən əlaqəli sahələrə aid olan parçaları axtarışa burax
  const icazeSaheler = icazeVerilenSaheIdleriAl(sahe_id);

  const hazirNamizedler = butunAktivler.filter(h => {
    const p = h.p;
    if (p.sahe_id && !icazeSaheler.includes(p.sahe_id)) return false;
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

function metndenMaddeleriCixar(metn = "") {
  return Array.from(
    new Set(
      Array.from(
        String(metn || "").matchAll(/(?:maddə\s*(\d+[0-9.-]*)|(\d+[0-9.-]*)\s*(?:-?[cç]ı|-?[cç]i|-?[cç]u|-?[cç]ü)?\s*maddə|\b(\d{1,3}\.\d+(?:\.\d+)*(?:-\d+)?)\b)/gi)
      ).map(m => (m[1] || m[2] || m[3] || "").replace(/\.$/, "")).filter(Boolean)
    )
  );
}

function yaddasFormatla(y) {
  let maddeler = [];
  try {
    maddeler = JSON.parse(y.bagli_maddeler || "[]");
  } catch (_) {}
  return {
    ...y,
    status: y.status || "tesdiqlenmis",
    quvvede_olma_dovru: y.quvvede_olma_dovru || "cari",
    bagli_maddeler: Array.isArray(maddeler) ? maddeler : []
  };
}

function yaddaslariAl(sahe_id = null, statusFilter = "tesdiqlenmis") {
  let statusSerti = "AND (status IS NULL OR status = 'tesdiqlenmis')";
  if (statusFilter === "hamisi") {
    statusSerti = "";
  } else if (statusFilter === "qaralama") {
    statusSerti = "AND status = 'qaralama'";
  } else if (statusFilter === "arxiv_dovr") {
    statusSerti = "AND status = 'arxiv_dovr'";
  } else if (statusFilter === "aktiv_ve_arxiv") {
    statusSerti = "AND (status IS NULL OR status IN ('tesdiqlenmis', 'arxiv_dovr'))";
  }

  let sətirlər;
  if (sahe_id && sahe_id !== "all") {
    const icaze = icazeVerilenSaheIdleriAl(sahe_id);
    const pl = icaze.map(() => "?").join(",");
    sətirlər = db.prepare(`SELECT * FROM yaddas WHERE (sahe_id IS NULL OR sahe_id IN (${pl})) ${statusSerti} ORDER BY vaciblik DESC, yaradildi DESC`).all(...icaze);
  } else {
    sətirlər = db.prepare(`SELECT * FROM yaddas WHERE 1=1 ${statusSerti} ORDER BY vaciblik DESC, yaradildi DESC`).all();
  }
  return sətirlər.map(yaddasFormatla);
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
  "mənfəət", "menfeet", "bəyannamə", "beyanname", "sənəd", "sened",
  "qaimə", "qaime", "mal", "mallar", "xidmət", "xidmet", "işlər", "isler",
  "alış", "alis", "satış", "satis", "hesab", "faktura", "alınan", "alinan"
]);

/**
 * Namizəd dərsin bazadakı rəsmi mənbə maddəsi ilə 100% hərfi-normativ təsdiqini yoxlayır
 */
function resmiMaddeIleTesdiqlenirmi(metn = "", sahe_id = null) {
  const maddeler = metndenMaddeleriCixar(metn);
  if (maddeler.length === 0) return { tesdiqlendi: false };

  const icaze = icazeVerilenSaheIdleriAl(sahe_id);
  const pl = icaze.map(() => "?").join(",");
  const resmiParcalar = db.prepare(`
    SELECT p.basliq, p.metn, m.ad as menbe_adi
    FROM parcalar p
    JOIN menbeler m ON m.id = p.menbe_id
    WHERE m.aktiv = 1
      AND (m.etibar_seviyyesi IS NULL OR m.etibar_seviyyesi = 'orijinal_menbe')
      AND (p.sahe_id IS NULL OR p.sahe_id IN (${pl}))
  `).all(...icaze);

  if (resmiParcalar.length === 0) return { tesdiqlendi: false };

  const metnKokler = sozKokleri(metn)
    .filter(k => k.kok.length >= 3 && !UMUMI_DOMEN_SOZLERI.has(k.kok) && !UMUMI_DOMEN_SOZLERI.has(k.tam));
  if (metnKokler.length === 0) return { tesdiqlendi: false };

  for (const mNo of maddeler) {
    const ana = mNo.split(".")[0];
    for (const p of resmiParcalar) {
      const birlesik = azKicilt(`${p.basliq || ""} ${p.metn || ""}`);
      const maddeVar = birlesik.includes(mNo.toLowerCase()) || new RegExp(`(?:maddə\\s+${ana}|\\b${ana}\\.)`, "i").test(birlesik);
      if (!maddeVar) continue;

      let uygun = 0;
      for (const k of metnKokler) {
        if (birlesik.includes(k.kok)) uygun++;
      }
      if (uygun / metnKokler.length >= 0.55) {
        return { tesdiqlendi: true, madde: mNo, menbe_adi: p.menbe_adi };
      }
    }
  }
  return { tesdiqlendi: false };
}

// Sualın mövzusuna, spesifik açar sözlərinə və maddə nömrələrinə görə ən aktual Uzunmüddətli Yaddaş (Qızıl Qaydalar) siyahısını seçir
function aktualYaddaslariAl(sorgu = "", limit = 15, sahe_id = null) {
  // Həm təsdiqlənmiş cari qaydaları, həm də tarixi vergi yoxlamaları üçün dövr üzrə arxivlənmiş qaydaları gətir (Qaralamalar heç vaxt Qızıl Qayda olmur!)
  const butun = yaddaslariAl(sahe_id, "aktiv_ve_arxiv");
  if (!sorgu || !sorgu.trim() || butun.length === 0) {
    return { siyahi: butun.filter(y => y.status !== "arxiv_dovr").slice(0, limit), uygunQizilQaydalar: [] };
  }

  const kicikSorgu = azKicilt(sorgu);
  // İnkar edilmiş sözləri aşkar et ("qaimə ilə yox", "qaiməsiz", "qaimə deyil")
  const inkarSozler = new Set();
  const inkarFrazalar = kicikSorgu.match(/([a-zçəğıöşü]+)\s+(?:ilə\s+yox|yox|deyil|olmadan|olmasa)/gi) || [];
  for (const f of inkarFrazalar) {
    const ilk = f.split(/\s+/)[0];
    if (ilk && ilk.length >= 3) inkarSozler.add(ilk);
  }
  const sizFrazalar = kicikSorgu.match(/([a-zçəğıöşü]{3,})(?:siz|suz|sız|süz)\b/gi) || [];
  for (const f of sizFrazalar) {
    const kok = f.replace(/(?:siz|suz|sız|süz)$/i, "");
    if (kok.length >= 3) inkarSozler.add(kok);
  }

  const kokler = sozKokleri(sorgu).filter(k => !inkarSozler.has(k.kok) && !inkarSozler.has(k.tam));
  const spesifikKokSayi = kokler.filter(k => !UMUMI_DOMEN_SOZLERI.has(k.kok) && !UMUMI_DOMEN_SOZLERI.has(k.tam)).length;
  const sorguMaddeler = metndenMaddeleriCixar(sorgu);
  const kecmisDovrSorgusu = /\b(201\d|202[0-5]|keçmiş|əvvəlki|köhnə\s*redaksiya|ötən\s*il)\b/i.test(sorgu);

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
      if (yAz.includes(mNo) || (y.bagli_maddeler || []).includes(mNo) || new RegExp(`\\b${ana}\\b`).test(yAz)) {
        maddeUygun++;
      }
    }

    const isArxiv = y.status === "arxiv_dovr";
    const isSistem = y.menbe === "Sistem Qaydası";
    const isQizil = y.metn.startsWith("QIZIL QAYDA") || y.menbe === "Ekspert Əks-Əlaqə" || y.menbe === "Birbaşa Təlimat" || y.etibar_seviyyesi === "is_siyaseti";
    const arxivDuzelisi = isArxiv ? (kecmisDovrSorgusu ? 10 : -8) : 0;
    const bal = (spesifikUygun * 18) + (umumiUygun * 3) + (maddeUygun * 30) + (isQizil ? 6 : 0) + (isSistem ? 8 : 0) + (y.vaciblik || 3) + arxivDuzelisi;

    const gorunenMetn = isArxiv
      ? `[KÖHNƏ REDAKSİYA / DÖVR: ${y.quvvede_olma_dovru || "əvvəlki dövr"} — Yalnız keçmiş dövr yoxlamaları üçün!] ${y.metn}`
      : y.metn;

    return {
      ...y,
      metn: gorunenMetn,
      _spesifikUygun: spesifikUygun,
      _umumiUygun: umumiUygun,
      _uygunAcar: spesifikUygun + umumiUygun,
      _maddeUygun: maddeUygun,
      _bal: bal
    };
  });

  qiymetli.sort((a, b) => b._bal - a._bal || b.vaciblik - a.vaciblik || b.yaradildi - a.yaradildi);

  // Yalnız həqiqətən sualın spesifik mövzusuna aid olan cari Qızıl Qaydaları seç (arxiv qaydalarını yalnız keçmiş dövr soruşulduqda əlavə et)
  const uygunQizilQaydalar = qiymetli.filter(y => {
    if (y.menbe === "Sistem Qaydası") return false;
    if (y.status === "arxiv_dovr" && !kecmisDovrSorgusu) return false;
    const yAz = azKicilt(y.metn || "");
    for (const ink of inkarSozler) {
      if (yAz.includes(ink)) return false;
    }
    if (y._maddeUygun > 0) return true;
    if (y._spesifikUygun >= 2) return true;
    if (spesifikKokSayi === 1 && y._spesifikUygun === 1 && y._umumiUygun >= 1) return true;
    return false;
  }).slice(0, 4);

  return {
    siyahi: qiymetli.filter(y => y.status !== "arxiv_dovr" || kecmisDovrSorgusu || y._maddeUygun > 0).slice(0, limit),
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

function yaddasElaveEt({
  kateqoriya = "fakt",
  metn,
  menbe = "Söhbət",
  vaciblik = 3,
  etibar_seviyyesi = "",
  sahe_id = null,
  status = "",
  bagli_maddeler = null,
  quvvede_olma_dovru = "cari"
}) {
  if (!metn || !metn.trim()) return null;
  const təmiz = metn.trim();
  const secilmisSahe = sahe_id || aktivSaheIdAl();

  let seviye =
    etibar_seviyyesi ||
    (menbe === "Ekspertin İş Siyasəti"
      ? "is_siyaseti"
      : menbe === "Birbaşa Təlimat" || menbe === "Ekspert Əks-Əlaqə" || menbe === "Telegram Ekspert Təsdiqi" || menbe === "Əl ilə əlavə"
        ? "ekspert_tesdiqli"
        : menbe === "Sistem Qaydası"
          ? "orijinal_menbe"
          : menbe === "Xarici Ekspert Şərhi"
            ? "ekspert_serhi_ferziyye"
            : "ai_sintezi");

  const maddelerArr = Array.isArray(bagli_maddeler) ? bagli_maddeler : metndenMaddeleriCixar(təmiz);
  const maddelerJson = JSON.stringify(maddelerArr);

  // İki-mərhələli yaddaş qərarı ("Qaralama Dəftəri -> Qızıl Yaddaş")
  let sonStatus = status || "";
  if (!sonStatus) {
    const aiMenbeleri = new Set(["Simulyasiya Sınağı", "Xarici Ekspert Şərhi", "AI Fərziyyəsi", "AI Qaralama", "Avtonom Tədqiqat", "Agent Analizi"]);
    if (seviye === "ekspert_serhi_ferziyye") {
      // Açıq internet / ekspert şərhləri hər zaman Qaralama kimi saxlanır (rəsmi qanun deyil!)
      sonStatus = "qaralama";
    } else if (aiMenbeleri.has(menbe)) {
      // Rəsmi maddə ilə 100% hərfi-normativ təsdiq varsa birbaşa Qızıl Yaddaşa keçir, yoxdursa Qaralamada gözləyir!
      const resmiYoxlama = resmiMaddeIleTesdiqlenirmi(təmiz, secilmisSahe);
      if (resmiYoxlama.tesdiqlendi) {
        sonStatus = "tesdiqlenmis";
        seviye = "orijinal_menbe";
      } else {
        sonStatus = "qaralama";
      }
    } else {
      sonStatus = "tesdiqlenmis";
    }
  } else if (sonStatus === "qaralama" && seviye !== "ekspert_serhi_ferziyye") {
    const resmiYoxlama = resmiMaddeIleTesdiqlenirmi(təmiz, secilmisSahe);
    if (resmiYoxlama.tesdiqlendi) {
      sonStatus = "tesdiqlenmis";
      seviye = "orijinal_menbe";
    }
  }

  const movcud = db.prepare("SELECT * FROM yaddas WHERE LOWER(metn) = LOWER(?) AND (status IS NULL OR status != 'arxiv_dovr')").get(təmiz);
  if (movcud) return yaddasFormatla(movcud);

  // Semantik / açar söz oxşarlığı yoxlaması (Yalnız cari dövr qeydləri arasında; tarixi arxiv_dovr heç vaxt əzilməməlidir!)
  const yeniKokler = new Set(sozKokleri(təmiz).map(k => k.normKok).filter(k => k.length >= 3));
  if (yeniKokler.size >= 3 && sonStatus !== "arxiv_dovr") {
    const butunYaddas = db.prepare("SELECT * FROM yaddas WHERE status IS NULL OR status != 'arxiv_dovr'").all();
    for (const y of butunYaddas) {
      const kohneKokler = new Set(sozKokleri(y.metn).map(k => k.normKok).filter(k => k.length >= 3));
      if (kohneKokler.size < 3) continue;
      let kesisme = 0;
      for (const k of yeniKokler) {
        if (kohneKokler.has(k)) kesisme++;
      }
      const oxsarliq = kesisme / Math.min(yeniKokler.size, kohneKokler.size);
      if (oxsarliq >= 0.68) {
        // Təsdiqlənmiş / Qızıl Qayda / İş Siyasəti heç vaxt Qaralama və ya AI sintezi ilə əzilməməlidir!
        const kohneTesdiqli = (y.status || "tesdiqlenmis") === "tesdiqlenmis";
        if (kohneTesdiqli && sonStatus === "qaralama") {
          return yaddasFormatla(y);
        }
        if ((y.etibar_seviyyesi === "ekspert_tesdiqli" || y.etibar_seviyyesi === "is_siyaseti" || y.metn.startsWith("QIZIL QAYDA")) && (seviye === "ai_sintezi" || seviye === "ekspert_serhi_ferziyye")) {
          return yaddasFormatla(y);
        }
        const indi = Date.now();
        const yekunStatus = kohneTesdiqli ? "tesdiqlenmis" : sonStatus;
        db.prepare(
          "UPDATE yaddas SET kateqoriya = ?, metn = ?, menbe = ?, vaciblik = ?, etibar_seviyyesi = ?, sahe_id = ?, status = ?, bagli_maddeler = ?, quvvede_olma_dovru = ?, yaradildi = ? WHERE id = ?"
        ).run(kateqoriya, təmiz, menbe, Math.max(vaciblik, y.vaciblik || 3), seviye, secilmisSahe, yekunStatus, maddelerJson, quvvede_olma_dovru, indi, y.id);
        return { id: y.id, kateqoriya, metn: təmiz, menbe, vaciblik, etibar_seviyyesi: seviye, sahe_id: secilmisSahe, status: yekunStatus, bagli_maddeler: maddelerArr, quvvede_olma_dovru, yaradildi: indi };
      }
    }
  }

  const id = "yad-" + crypto.randomUUID().slice(0, 8);
  const yaradildi = Date.now();
  db.prepare(
    "INSERT INTO yaddas (id, sahe_id, kateqoriya, metn, menbe, vaciblik, etibar_seviyyesi, status, bagli_maddeler, quvvede_olma_dovru, yaradildi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, secilmisSahe, kateqoriya, təmiz, menbe, vaciblik, seviye, sonStatus, maddelerJson, quvvede_olma_dovru, yaradildi);
  return { id, sahe_id: secilmisSahe, kateqoriya, metn: təmiz, menbe, vaciblik, etibar_seviyyesi: seviye, status: sonStatus, bagli_maddeler: maddelerArr, quvvede_olma_dovru, yaradildi };
}

function qaralamaYaddaslariAl(sahe_id = null) {
  return yaddaslariAl(sahe_id, "qaralama");
}

function arxivYaddaslariAl(sahe_id = null) {
  return yaddaslariAl(sahe_id, "arxiv_dovr");
}

function qaralamaTesdiqle(id) {
  if (!id) return null;
  const movcud = db.prepare("SELECT * FROM yaddas WHERE id = ?").get(id);
  if (!movcud) return null;
  const indi = Date.now();
  const yeniEtibar = movcud.etibar_seviyyesi === "orijinal_menbe" ? "orijinal_menbe" : "ekspert_tesdiqli";
  db.prepare("UPDATE yaddas SET status = 'tesdiqlenmis', etibar_seviyyesi = ?, vaciblik = MAX(vaciblik, 4), yaradildi = ? WHERE id = ?")
    .run(yeniEtibar, indi, id);
  auditQeydEt("qaralama_tesdiq", "yaddas", id, `Qaralama qayda Qızıl Yaddaşa təsdiqləndi: ${(movcud.metn || "").slice(0, 80)}`);
  return yaddasFormatla(db.prepare("SELECT * FROM yaddas WHERE id = ?").get(id));
}

function qaralamaReddEt(id) {
  if (!id) return null;
  auditQeydEt("qaralama_redd", "yaddas", id, "Namizəd qaralama qayda rədd edilərək silindi");
  return db.prepare("DELETE FROM yaddas WHERE id = ?").run(id);
}

// ---- "Mən Niyə Səhv Etdim?" — Metodoloji Düşünmə və Yoxlama Qaydaları ----
function dusunmeQaydasiElaveEt({
  sahe_id = null,
  sehv_koku,
  yoxlama_qaydasi,
  tetbiq_serti = "",
  numune_sual = ""
}) {
  if (!sehv_koku || !yoxlama_qaydasi) return null;
  const secilmisSahe = sahe_id || aktivSaheIdAl();
  const temizQayda = yoxlama_qaydasi.trim();
  const temizKok = sehv_koku.trim();

  // Eyni qayda artıq varsa istifadə sayını artır
  const movcudlar = db.prepare("SELECT * FROM dusunme_qaydalari WHERE sahe_id = ?").all(secilmisSahe);
  const yeniKokler = new Set(sozKokleri(temizQayda).map(k => k.normKok).filter(k => k.length >= 3));
  for (const m of movcudlar) {
    if (azKicilt(m.yoxlama_qaydasi) === azKicilt(temizQayda)) return m;
    const mKokler = new Set(sozKokleri(m.yoxlama_qaydasi).map(k => k.normKok).filter(k => k.length >= 3));
    if (yeniKokler.size >= 3 && mKokler.size >= 3) {
      let kesisme = 0;
      for (const k of yeniKokler) if (mKokler.has(k)) kesisme++;
      if (kesisme / Math.min(yeniKokler.size, mKokler.size) >= 0.72) {
        db.prepare("UPDATE dusunme_qaydalari SET istifade_sayi = istifade_sayi + 1 WHERE id = ?").run(m.id);
        return db.prepare("SELECT * FROM dusunme_qaydalari WHERE id = ?").get(m.id);
      }
    }
  }

  const id = "meta-" + crypto.randomUUID().slice(0, 8);
  const indi = Date.now();
  db.prepare(`
    INSERT INTO dusunme_qaydalari (id, sahe_id, sehv_koku, yoxlama_qaydasi, tetbiq_serti, numune_sual, aktiv, istifade_sayi, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)
  `).run(id, secilmisSahe, temizKok, temizQayda, String(tetbiq_serti || "").trim(), String(numune_sual || "").trim(), indi);
  auditQeydEt("dusunme_qaydasi_elave", "dusunme_qaydasi", id, `Kök-səbəb qaydası: ${temizKok.slice(0, 90)}`);
  return { id, sahe_id: secilmisSahe, sehv_koku: temizKok, yoxlama_qaydasi: temizQayda, tetbiq_serti, numune_sual, aktiv: 1, istifade_sayi: 1, yaradildi: indi };
}

function dusunmeQaydalariniAl(sahe_id = null, yalnızAktiv = true) {
  const aktivSerti = yalnızAktiv ? "AND aktiv = 1" : "";
  if (sahe_id && sahe_id !== "all") {
    const icaze = icazeVerilenSaheIdleriAl(sahe_id);
    const pl = icaze.map(() => "?").join(",");
    return db.prepare(`SELECT * FROM dusunme_qaydalari WHERE sahe_id IN (${pl}) ${aktivSerti} ORDER BY istifade_sayi DESC, yaradildi DESC`).all(...icaze);
  }
  return db.prepare(`SELECT * FROM dusunme_qaydalari WHERE 1=1 ${aktivSerti} ORDER BY istifade_sayi DESC, yaradildi DESC`).all();
}

function dusunmeQaydasiSil(id) {
  return db.prepare("DELETE FROM dusunme_qaydalari WHERE id = ?").run(id);
}

// ---- "Boz Zonalar" — Mübahisəli Məsələ Dosyeləri və Ekspertin İş Siyasəti ----
function mubahiseliDosyeYarat({
  sahe_id = null,
  movzu,
  sual,
  teref_a_mufettis,
  teref_b_muhasib,
  bagli_maddeler = []
}) {
  if (!movzu || !sual) return null;
  const secilmisSahe = sahe_id || aktivSaheIdAl();
  const movcud = db.prepare("SELECT * FROM mubahiseli_dosyeler WHERE sahe_id = ? AND LOWER(movzu) = LOWER(?) AND status = 'gozleyir'").get(secilmisSahe, movzu.trim());
  if (movcud) {
    return { ...movcud, bagli_maddeler: JSON.parse(movcud.bagli_maddeler || "[]") };
  }

  const maddeler = Array.isArray(bagli_maddeler) && bagli_maddeler.length > 0 ? bagli_maddeler : metndenMaddeleriCixar(`${movzu} ${sual} ${teref_a_mufettis} ${teref_b_muhasib}`);
  const id = "boz-" + crypto.randomUUID().slice(0, 8);
  const indi = Date.now();
  db.prepare(`
    INSERT INTO mubahiseli_dosyeler (id, sahe_id, movzu, sual, teref_a_mufettis, teref_b_muhasib, ekspert_qerari, secilmis_movqe, status, bagli_maddeler, yaradildi, hell_tarixi)
    VALUES (?, ?, ?, ?, ?, ?, '', '', 'gozleyir', ?, ?, 0)
  `).run(id, secilmisSahe, movzu.trim(), sual.trim(), String(teref_a_mufettis || "").trim(), String(teref_b_muhasib || "").trim(), JSON.stringify(maddeler), indi);
  auditQeydEt("boz_zona_acildi", "mubahiseli_dosye", id, `Yeni Boz Zona dosyesi açıldı: ${movzu}`);
  return { id, sahe_id: secilmisSahe, movzu: movzu.trim(), sual: sual.trim(), teref_a_mufettis, teref_b_muhasib, status: "gozleyir", bagli_maddeler: maddeler, yaradildi: indi };
}

function mubahiseliDosyeleriAl(sahe_id = null, status = null) {
  let statusSerti = "";
  const args = [];
  if (sahe_id && sahe_id !== "all") {
    const icaze = icazeVerilenSaheIdleriAl(sahe_id);
    const pl = icaze.map(() => "?").join(",");
    args.push(...icaze);
    if (status) {
      statusSerti = "AND status = ?";
      args.push(status);
    }
    return db.prepare(`SELECT * FROM mubahiseli_dosyeler WHERE sahe_id IN (${pl}) ${statusSerti} ORDER BY yaradildi DESC`).all(...args).map(d => ({
      ...d,
      bagli_maddeler: JSON.parse(d.bagli_maddeler || "[]")
    }));
  }
  if (status) {
    statusSerti = "WHERE status = ?";
    args.push(status);
  }
  return db.prepare(`SELECT * FROM mubahiseli_dosyeler ${statusSerti} ORDER BY yaradildi DESC`).all(...args).map(d => ({
    ...d,
    bagli_maddeler: JSON.parse(d.bagli_maddeler || "[]")
  }));
}

function mubahiseliDosyeQerarVer(id, { secilmis_movqe = "teref_b", ekspert_qerari = "" } = {}) {
  const dosye = db.prepare("SELECT * FROM mubahiseli_dosyeler WHERE id = ?").get(id);
  if (!dosye) return null;

  let yekunQerar = String(ekspert_qerari || "").trim();
  if (!yekunQerar) {
    yekunQerar = secilmis_movqe === "teref_a" ? dosye.teref_a_mufettis : dosye.teref_b_muhasib;
  }

  const indi = Date.now();
  db.prepare(`
    UPDATE mubahiseli_dosyeler
    SET secilmis_movqe = ?, ekspert_qerari = ?, status = 'hell_edildi', hell_tarixi = ?
    WHERE id = ?
  `).run(secilmis_movqe, yekunQerar, indi, id);

  // Ekspertin İş Siyasəti kimi birbaşa Qızıl Yaddaşa həkk et!
  const maddeler = JSON.parse(dosye.bagli_maddeler || "[]");
  const siyasetYaddasi = yaddasElaveEt({
    sahe_id: dosye.sahe_id,
    kateqoriya: "qayda",
    metn: `QIZIL QAYDA [EKSPERTİN İŞ SİYASƏTİ — "${dosye.movzu}"]: ${yekunQerar}`,
    menbe: "Ekspertin İş Siyasəti",
    vaciblik: 5,
    etibar_seviyyesi: "is_siyaseti",
    status: "tesdiqlenmis",
    bagli_maddeler: maddeler
  });

  auditQeydEt("boz_zona_qerar", "mubahiseli_dosye", id, `Ekspertin iş siyasəti təsdiqləndi: ${dosye.movzu}`);
  return {
    dosye: { ...dosye, secilmis_movqe, ekspert_qerari: yekunQerar, status: "hell_edildi", hell_tarixi: indi, bagli_maddeler: maddeler },
    siyasetYaddasi
  };
}

// ---- Qanun Dəyişikliyi Zamanı Dövr üzrə Arxivləmə və Təsir Hesabatı ----
function maddelereBagliYaddaslariArxivle({
  sahe_id = null,
  deyisenMaddeler = [],
  kohneDovrEtiketi = `${new Date().getFullYear() - 1}-ci ilədək qüvvədə olub`,
  senedAdi = "Yeni Qanun Redaksiyası",
  xulase = ""
}) {
  if (!Array.isArray(deyisenMaddeler) || deyisenMaddeler.length === 0) {
    return { hesabatId: null, arxivlenenSay: 0, arxivlenenler: [] };
  }
  const secilmisSahe = sahe_id || aktivSaheIdAl();
  const aktivYaddaslar = yaddaslariAl(secilmisSahe, "tesdiqlenmis");
  const arxivlenenler = [];

  for (const y of aktivYaddaslar) {
    if (y.menbe === "Sistem Qaydası") continue;
    const yAz = azKicilt(y.metn || "");
    const yMaddeler = y.bagli_maddeler || [];

    const tesirlendi = deyisenMaddeler.some(mNo => {
      const temizNo = String(mNo).trim();
      if (!temizNo) return false;
      if (yMaddeler.includes(temizNo)) return true;
      return new RegExp(`(?:maddə\\s*${temizNo.replace(/\./g, "\\.")}\\b|\\b${temizNo.replace(/\./g, "\\.")}\\b)`, "i").test(yAz);
    });

    if (tesirlendi) {
      db.prepare("UPDATE yaddas SET status = 'arxiv_dovr', quvvede_olma_dovru = ? WHERE id = ?")
        .run(kohneDovrEtiketi, y.id);
      arxivlenenler.push({ id: y.id, metn: y.metn, evvelki_dovr: kohneDovrEtiketi });
    }
  }

  const hid = "qth-" + crypto.randomUUID().slice(0, 8);
  const indi = Date.now();
  const yekunXulase = xulase || `"${senedAdi}" üzrə Maddə ${deyisenMaddeler.join(", ")} yeniləndi. Keçmiş 3 illik vergi yoxlamaları üçün ${arxivlenenler.length} əvvəlki qayda "${kohneDovrEtiketi}" etiketi ilə arxivdə saxlanıldı.`;

  db.prepare(`
    INSERT INTO qanun_tesir_hesabatlari (id, sahe_id, sened_adi, deyisen_maddeler, arxivlenen_yaddaslar, xulase, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(hid, secilmisSahe, senedAdi, JSON.stringify(deyisenMaddeler), JSON.stringify(arxivlenenler), yekunXulase, indi);

  auditQeydEt("qanun_deyisikliyi_arxiv", "qanun_tesir", hid, yekunXulase);

  return {
    hesabatId: hid,
    senedAdi,
    deyisenMaddeler,
    kohneDovrEtiketi,
    arxivlenenSay: arxivlenenler.length,
    arxivlenenler,
    xulase: yekunXulase,
    yaradildi: indi
  };
}

function qanunTesirHesabatlariniAl(sahe_id = null, limit = 15) {
  if (sahe_id && sahe_id !== "all") {
    return db.prepare("SELECT * FROM qanun_tesir_hesabatlari WHERE sahe_id = ? ORDER BY yaradildi DESC LIMIT ?").all(sahe_id, limit).map(h => ({
      ...h,
      deyisen_maddeler: JSON.parse(h.deyisen_maddeler || "[]"),
      arxivlenen_yaddaslar: JSON.parse(h.arxivlenen_yaddaslar || "[]")
    }));
  }
  return db.prepare("SELECT * FROM qanun_tesir_hesabatlari ORDER BY yaradildi DESC LIMIT ?").all(limit).map(h => ({
    ...h,
    deyisen_maddeler: JSON.parse(h.deyisen_maddeler || "[]"),
    arxivlenen_yaddaslar: JSON.parse(h.arxivlenen_yaddaslar || "[]")
  }));
}

// ---- Sahə üzrə Müstəqil Düşünmə Profili və Bacarıq (Güclü/Zəif Mövzular) Xəritəsi ----
function saheProfiliSaxla({
  sahe_id,
  teref_a_rol,
  teref_b_rol,
  hakim_rol,
  eks_hucum_suali = "",
  helledici_deyisenler = [],
  numune_suallar = [],
  sual_ipucu = ""
}) {
  if (!sahe_id) return null;
  const indi = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO sahe_profilleri
      (sahe_id, teref_a_rol, teref_b_rol, hakim_rol, eks_hucum_suali, helledici_deyisenler, numune_suallar, sual_ipucu, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sahe_id,
    teref_a_rol || "🔎 Sərt Risk və Səhv Tənqidçisi",
    teref_b_rol || "🛠️ Praktik Həll Qurucusu",
    hakim_rol || "🎯 Baş Ekspert (Yekun Qərar)",
    eks_hucum_suali || "",
    JSON.stringify(Array.isArray(helledici_deyisenler) ? helledici_deyisenler : []),
    JSON.stringify(Array.isArray(numune_suallar) ? numune_suallar : []),
    sual_ipucu || "",
    indi
  );
  return saheProfiliAl(sahe_id);
}

function saheProfiliAl(sahe_id = null) {
  const secilmis = sahe_id || aktivSaheIdAl();
  const s = db.prepare("SELECT * FROM sahe_profilleri WHERE sahe_id = ?").get(secilmis);
  if (!s) return null;
  return {
    ...s,
    helledici_deyisenler: JSON.parse(s.helledici_deyisenler || "[]"),
    numune_suallar: JSON.parse(s.numune_suallar || "[]")
  };
}

function bacariqSeviyyesiHesabla(faiz, duzelisSayi = 0, sonNov = "") {
  if (sonNov === "duzelis" || sonNov === "bosluq" || faiz < 70) return "zeif";
  if (faiz >= 85 && duzelisSayi === 0) return "guclu";
  if (faiz >= 88) return "guclu";
  return "orta";
}

function bacariqQeydEt({ sahe_id = null, movzu, bal = 75, nov = "simulyasiya" }) {
  const secilmisSahe = sahe_id || aktivSaheIdAl();
  const temizMovzu = String(movzu || "").replace(/^[🎯✅🔍💬🔀]+\s*/, "").trim().slice(0, 95);
  if (!temizMovzu || temizMovzu.length < 4) return null;

  const indi = Date.now();
  const movcudlar = db.prepare("SELECT * FROM sahe_bacariq_xeritesi WHERE sahe_id = ?").all(secilmisSahe);
  const yeniNorm = azNormallashdir(temizMovzu);

  let uygun = movcudlar.find(m => {
    const mNorm = azNormallashdir(m.movzu);
    return mNorm === yeniNorm || (yeniNorm.length > 14 && (mNorm.includes(yeniNorm.slice(0, 22)) || yeniNorm.includes(mNorm.slice(0, 22))));
  });

  const emeliyyatBali =
    nov === "tesdiq" ? 95 :
    nov === "duzelis" ? 40 :
    nov === "bosluq" ? 35 :
    Math.max(0, Math.min(100, Number(bal) || 75));

  if (uygun) {
    const ugurluArt = emeliyyatBali >= 75 ? 1 : 0;
    const ugursuzArt = emeliyyatBali < 70 ? 1 : 0;
    const duzelisArt = nov === "duzelis" ? 1 : 0;
    const yeniUgurlu = (uygun.ugurlu_say || 0) + ugurluArt;
    const yeniUgursuz = (uygun.ugursuz_say || 0) + ugursuzArt;
    const yeniDuzelis = (uygun.duzelis_sayi || 0) + duzelisArt;
    // Son nəticəyə 55%, əvvəlki orta səviyyəyə 45% çəki veririk ki, həm düzəlişlər, həm də məşq irəliləyişi dərhal hiss olunsun
    const yeniFaiz = Math.max(20, Math.min(100, Math.round(uygun.deqiqlik_faizi * 0.45 + emeliyyatBali * 0.55)));
    const yeniSeviyye = bacariqSeviyyesiHesabla(yeniFaiz, yeniDuzelis, nov === "simulyasiya" && emeliyyatBali >= 80 ? "" : nov);

    db.prepare(`
      UPDATE sahe_bacariq_xeritesi
      SET ugurlu_say = ?, ugursuz_say = ?, duzelis_sayi = ?, son_bal = ?, deqiqlik_faizi = ?, seviyye = ?, son_yenilenme = ?
      WHERE id = ?
    `).run(yeniUgurlu, yeniUgursuz, yeniDuzelis, emeliyyatBali, yeniFaiz, yeniSeviyye, indi, uygun.id);

    return db.prepare("SELECT * FROM sahe_bacariq_xeritesi WHERE id = ?").get(uygun.id);
  }

  const id = "komp-" + crypto.randomUUID().slice(0, 8);
  const ugurlu = emeliyyatBali >= 75 ? 1 : 0;
  const ugursuz = emeliyyatBali < 70 ? 1 : 0;
  const duzelis = nov === "duzelis" ? 1 : 0;
  const seviyye = bacariqSeviyyesiHesabla(emeliyyatBali, duzelis, nov);

  db.prepare(`
    INSERT INTO sahe_bacariq_xeritesi
      (id, sahe_id, movzu, ugurlu_say, ugursuz_say, duzelis_sayi, son_bal, deqiqlik_faizi, seviyye, son_yenilenme)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, secilmisSahe, temizMovzu, ugurlu, ugursuz, duzelis, emeliyyatBali, emeliyyatBali, seviyye, indi);

  return db.prepare("SELECT * FROM sahe_bacariq_xeritesi WHERE id = ?").get(id);
}

function bacariqXeritesiniAl(sahe_id = null) {
  const secilmisSahe = sahe_id || aktivSaheIdAl();
  const siyahi = db.prepare(`
    SELECT * FROM sahe_bacariq_xeritesi
    WHERE sahe_id = ?
    ORDER BY deqiqlik_faizi ASC, son_yenilenme DESC
  `).all(secilmisSahe);

  const zeifSay = siyahi.filter(x => x.seviyye === "zeif").length;
  const ortaSay = siyahi.filter(x => x.seviyye === "orta").length;
  const gucluSay = siyahi.filter(x => x.seviyye === "guclu").length;
  const ortaDeqiqlik = siyahi.length > 0
    ? Math.round(siyahi.reduce((c, x) => c + (x.deqiqlik_faizi || 0), 0) / siyahi.length)
    : 0;

  return {
    sahe_id: secilmisSahe,
    movzular: siyahi,
    xulase: { cemi: siyahi.length, zeifSay, ortaSay, gucluSay, ortaDeqiqlik }
  };
}

function zeifMovzulariAl(sahe_id = null, limit = 5) {
  const secilmisSahe = sahe_id || aktivSaheIdAl();
  return db.prepare(`
    SELECT * FROM sahe_bacariq_xeritesi
    WHERE sahe_id = ? AND (seviyye = 'zeif' OR deqiqlik_faizi < 78)
    ORDER BY deqiqlik_faizi ASC, duzelis_sayi DESC, son_yenilenme DESC
    LIMIT ?
  `).all(secilmisSahe, limit);
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

function sohbetleriAl(qovluq_id = "all", limit = 60, sahe_id = null) {
  const secilmisSahe = sahe_id || aktivSaheIdAl();
  let sql = `
    SELECT * FROM (
      SELECT * FROM sohbetler
      WHERE (qovluq_id = ? OR ? = 'all')
        AND (sahe_id IS NULL OR sahe_id = ? OR sahe_id = 'all')
      ORDER BY yaradildi DESC
      LIMIT ?
    ) ORDER BY yaradildi ASC
  `;
  return db.prepare(sql).all(qovluq_id || "all", qovluq_id || "all", secilmisSahe, limit).map(s => ({
    ...s,
    sitatlar: JSON.parse(s.sitatlar || "[]")
  }));
}

function sohbetElaveEt({ qovluq_id = "all", rol, metn, sitatlar = [], sahe_id = null }) {
  const id = "msg-" + crypto.randomUUID().slice(0, 10);
  const secilmisSahe = sahe_id || aktivSaheIdAl();
  const yaradildi = Date.now();
  db.prepare(`
    INSERT INTO sohbetler (id, qovluq_id, sahe_id, rol, metn, sitatlar, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, qovluq_id || "all", secilmisSahe, rol, metn, JSON.stringify(sitatlar || []), yaradildi);
  return { id, qovluq_id: qovluq_id || "all", sahe_id: secilmisSahe, rol, metn, sitatlar, yaradildi };
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

// ---- Baza Yedəkləmə (Backup) və Bərpa (Restore) ----
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

/**
 * Backup (.sqlite) faylından bütün əsas cədvəlləri tranzaksiya ilə təhlükəsiz bərpa edir (serveri söndürmədən!)
 */
function bazaBackupBerpaEt(sqliteBuffer) {
  if (!Buffer.isBuffer(sqliteBuffer) || sqliteBuffer.length < 1024) {
    throw new Error("Etibarsız SQLite backup faylı.");
  }
  const basliq = sqliteBuffer.subarray(0, 16).toString("utf8");
  if (!basliq.startsWith("SQLite format 3")) {
    throw new Error("Göndərilən fayl həqiqi SQLite3 bazası deyil.");
  }

  const tmpYol = path.join(DATA_DIR, `restore_tmp_${Date.now()}.sqlite`);
  fs.writeFileSync(tmpYol, sqliteBuffer);

  let backupDb = null;
  try {
    backupDb = new DatabaseSync(tmpYol, { readOnly: true });
    const qovluqlar = backupDb.prepare("SELECT * FROM qovluqlar").all();
    const menbeler = backupDb.prepare("SELECT * FROM menbeler").all();
    const parcalar = backupDb.prepare("SELECT * FROM parcalar").all();
    const yaddaslar = backupDb.prepare("SELECT * FROM yaddas").all();
    let bosluqlar = [];
    try { bosluqlar = backupDb.prepare("SELECT * FROM bilik_bosluqlari").all(); } catch (_) {}

    tranzaksiyaIleIcraEt(() => {
      db.exec("PRAGMA foreign_keys = OFF;");
      db.exec("DELETE FROM parcalar; DELETE FROM menbeler; DELETE FROM qovluqlar; DELETE FROM yaddas; DELETE FROM bilik_bosluqlari;");

      const qYaz = db.prepare("INSERT OR REPLACE INTO qovluqlar (id, ad, ikon, reng, aciqlama, yaradildi) VALUES (?, ?, ?, ?, ?, ?)");
      for (const q of qovluqlar) qYaz.run(q.id, q.ad, q.ikon || "📁", q.reng || "#6366f1", q.aciqlama || "", q.yaradildi || Date.now());

      const mYaz = db.prepare("INSERT OR REPLACE INTO menbeler (id, qovluq_id, ad, nov, olcu, xulase, meta, xam_metn, aktiv, etibar_seviyyesi, yaradildi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const m of menbeler) mYaz.run(m.id, m.qovluq_id, m.ad, m.nov, m.olcu || 0, m.xulase || "", m.meta || "{}", m.xam_metn || "", m.aktiv ?? 1, m.etibar_seviyyesi || "orijinal_menbe", m.yaradildi || Date.now());

      const pYaz = db.prepare("INSERT OR REPLACE INTO parcalar (id, menbe_id, qovluq_id, sira, basliq, metn, gonderen, tarix, meta, vektor, yaradildi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const p of parcalar) pYaz.run(p.id, p.menbe_id, p.qovluq_id, p.sira || 1, p.basliq || "", p.metn || "", p.gonderen || "", p.tarix || "", p.meta || "{}", p.vektor || null, p.yaradildi || Date.now());

      const yYaz = db.prepare("INSERT OR REPLACE INTO yaddas (id, kateqoriya, metn, menbe, vaciblik, etibar_seviyyesi, yaradildi) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const y of yaddaslar) yYaz.run(y.id, y.kateqoriya || "fakt", y.metn, y.menbe || "Backup", y.vaciblik || 3, y.etibar_seviyyesi || "ai_sintezi", y.yaradildi || Date.now());

      const bYaz = db.prepare("INSERT OR REPLACE INTO bilik_bosluqlari (id, sual, movzu, menbe, say, status, yaradildi, son_sorulma) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const b of bosluqlar) bYaz.run(b.id, b.sual, b.movzu || "", b.menbe || "Backup", b.say || 1, b.status || "aciq", b.yaradildi || Date.now(), b.son_sorulma || Date.now());

      db.exec("PRAGMA foreign_keys = ON;");
    });

    auditQeydEt("baza_berpa", "baza", "beyin.sqlite", `Backup bərpa edildi: ${menbeler.length} mənbə, ${parcalar.length} parça, ${yaddaslar.length} yaddaş`);
    parcaKesiniSifirla();
    return {
      ok: true,
      qovluqSayi: qovluqlar.length,
      menbeSayi: menbeler.length,
      parcaSayi: parcalar.length,
      yaddasSayi: yaddaslar.length
    };
  } finally {
    try { if (backupDb) backupDb.close(); } catch (_) {}
    try { if (fs.existsSync(tmpYol)) fs.unlinkSync(tmpYol); } catch (_) {}
  }
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

// İlkin təməl metodoloji yoxlama qaydaları (əgər cədvəl boşdursa)
try {
  const dqSay = db.prepare("SELECT COUNT(*) as c FROM dusunme_qaydalari").get().c;
  if (dqSay === 0) {
    dusunmeQaydasiElaveEt({
      sahe_id: "vergi_muhasibat",
      sehv_koku: "Ümumi vergi dərəcəsinə baxıb xüsusi istisna bəndini və subyektin hüquqi statusunu (fərdi sahibkar vs hüquqi şəxs) yoxlamamaq",
      yoxlama_qaydasi: "Vergi dərəcəsi və ya güzəşt tətbiq etməzdən əvvəl subyektin statusunu, illik dövriyyə həddini və maddənin xüsusi istisna alt-bəndlərini (məs: 102.1.30 vs 102.1.30-1) mütləq çarpaz yoxla.",
      tetbiq_serti: "Güzəşt, azadolma və dərəcə suallarında"
    });
    dusunmeQaydasiElaveEt({
      sahe_id: "vergi_muhasibat",
      sehv_koku: "Əməliyyatın sənəd tarixi ilə ödəniş və dəqiqləşmə tarixini eyni ay kimi fərz etmək",
      yoxlama_qaydasi: "Fərqli aylarda baş verən əməliyyatlarda (qaimə ləğvi, ƏDV əvəzləşdirilməsi, kassa və ya depozit ödənişi) bütün şərtlərin tamamlandığı ən son tarixi və dəyişikliyin baş verdiyi cari hesabat dövrünü əsas götür.",
      tetbiq_serti: "Qaimə, ƏDV əvəzləşdirilməsi və bəyannamə dövrü suallarında"
    });
  }
} catch (_) {}

function statistikaAl() {
  const qovluqSayi = db.prepare("SELECT COUNT(*) as c FROM qovluqlar").get().c;
  const menbeSayi = db.prepare("SELECT COUNT(*) as c FROM menbeler").get().c;
  const parcaSayi = db.prepare("SELECT COUNT(*) as c FROM parcalar").get().c;
  const yaddasSayi = db.prepare("SELECT COUNT(*) as c FROM yaddas WHERE status IS NULL OR status = 'tesdiqlenmis'").get().c;
  const qaralamaSayi = db.prepare("SELECT COUNT(*) as c FROM yaddas WHERE status = 'qaralama'").get().c;
  const arxivYaddasSayi = db.prepare("SELECT COUNT(*) as c FROM yaddas WHERE status = 'arxiv_dovr'").get().c;
  const dusunmeQaydaSayi = db.prepare("SELECT COUNT(*) as c FROM dusunme_qaydalari WHERE aktiv = 1").get().c;
  const mubahiseliSayi = db.prepare("SELECT COUNT(*) as c FROM mubahiseli_dosyeler WHERE status = 'gozleyir'").get().c;
  const bosluqSayi = db.prepare("SELECT COUNT(*) as c FROM bilik_bosluqlari WHERE status = 'aciq'").get().c;
  const vektorluSay = db.prepare("SELECT COUNT(*) as c FROM parcalar WHERE vektor IS NOT NULL AND length(vektor) > 10").get().c;
  const saheSayi = db.prepare("SELECT COUNT(*) as c FROM saheler").get().c;
  const movzuSayi = db.prepare("SELECT COUNT(*) as c FROM sahe_movzulari").get().c;
  const aktivSahe = aktivSaheAl();
  return {
    qovluqSayi,
    menbeSayi,
    parcaSayi,
    yaddasSayi,
    qaralamaSayi,
    arxivYaddasSayi,
    dusunmeQaydaSayi,
    mubahiseliSayi,
    bosluqSayi,
    vektorluSay,
    saheSayi,
    movzuSayi,
    aktivSahe
  };
}

module.exports = {
  db,
  DB_PATH,
  azKicilt,
  azNormallashdir,
  azKokCixar,
  sozKokleri,
  metndenMaddeleriCixar,
  resmiMaddeIleTesdiqlenirmi,
  tenzimlemeleriAl,
  tenzimlemeYenile,
  saheleriAl,
  aktivSaheIdAl,
  aktivSaheAl,
  aktivSaheDeyis,
  saheYarat,
  saheMovzulariAl,
  saheMovzuElaveEt,
  icazeVerilenSaheIdleriAl,
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
  qaralamaYaddaslariAl,
  arxivYaddaslariAl,
  qaralamaTesdiqle,
  qaralamaReddEt,
  aktualYaddaslariAl,
  yaddasElaveEt,
  yaddasRedakteEt,
  yaddasSil,
  dusunmeQaydasiElaveEt,
  dusunmeQaydalariniAl,
  dusunmeQaydasiSil,
  mubahiseliDosyeYarat,
  mubahiseliDosyeleriAl,
  mubahiseliDosyeQerarVer,
  maddelereBagliYaddaslariArxivle,
  qanunTesirHesabatlariniAl,
  saheProfiliSaxla,
  saheProfiliAl,
  bacariqQeydEt,
  bacariqXeritesiniAl,
  zeifMovzulariAl,
  praktikaKeysElaveEt,
  bilikBosluguQeydEt,
  bilikBosluqlariniAl,
  bilikBosluguHellEt,
  bilikBosluqlariniTemizle,
  bazaBackupHazirla,
  bazaBackupBerpaEt,
  tranzaksiyaIleIcraEt,
  menbeVersiyalariniAl,
  auditQeydEt,
  auditJurnaliniAl,
  vektorStatistikasiAl,
  vektorsuzParcalariAl,
  sohbetleriAl,
  sohbetElaveEt,
  sohbetleriTemizle,
  simulyasiyaSaxla,
  simulyasiyalariAl,
  simulyasiyaDetaliAl,
  simulyasiyaStatistikaAl,
  bilikBosluqlariniMovzuTeklifineCevir,
  statistikaAl
};
