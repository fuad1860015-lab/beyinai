// BeyinAI — Vahid Avtomatik Sağlamlıq və Keyfiyyət Test Paketi (npm test)
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Testlər REAL bazaya toxunmur: müvəqqəti surətlə, açarsız və internetsiz işləyir
const testQovlugu = fs.mkdtempSync(path.join(os.tmpdir(), "beyin-test-"));
for (const f of ["beyin.sqlite", "beyin.sqlite-wal", "beyin.sqlite-shm"]) {
  const s = path.join(__dirname, "..", "data", f);
  if (fs.existsSync(s)) fs.copyFileSync(s, path.join(testQovlugu, f));
}
process.env.BEYIN_DATA_DIR = testQovlugu;
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TG_BOT_TOKEN;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  if (/^http:\/\/(?:127\.0\.0\.1|localhost)[:/]/.test(String(u))) return realFetch(u, o);
  throw new Error("test: xarici şəbəkə bağlıdır");
};

let kecen = 0;
let ugursuz = 0;

async function test(ad, fn) {
  try {
    await fn();
    kecen++;
    console.log(`  ✅ ${ad}`);
  } catch (err) {
    ugursuz++;
    console.error(`  ❌ ${ad}: ${err.message}`);
  }
}

(async () => {
  console.log("\n🧪 BeyinAI Avtomatik Sistem Testləri Başlayır...\n");

  const db = require("../src/db");
  assert.equal(path.resolve(path.dirname(db.DB_PATH)), path.resolve(testQovlugu), "Test bazası ayrıca olmalıdır");
  db.tenzimlemeYenile({ gemini_api_key: "", groq_api_key: "", tg_bot_token: "", tg_son_chat_id: "", tg_bildiris_chat_id: "", dusunen_rejim: "0", oyrenme_limiti: "0", mena_yoxlamasi: "0" });
  const ai = require("../src/ai");
  const agent = require("../src/agent");
  const parsers = require("../src/parsers");
  const calc = require("../src/calculator");
  const tts = require("../src/tts");
  const bulleten = require("../src/bulleten");
  const consolidator = require("../src/memory-consolidator");

  await test("1. SQLite Baza və Qovluq Strukturu (qovluq-praktika mövcuddur)", () => {
    const qovluqlar = db.qovluqlariAl();
    assert.ok(qovluqlar.length >= 4, "Minimum 4 qovluq olmalıdır");
    assert.ok(qovluqlar.some(q => q.id === "qovluq-praktika"), "qovluq-praktika tapılmadı");
  });

  await test("2. 1-Kliklə Baza Backup Funksiyası (WAL Checkpoint + Buffer)", () => {
    const bkp = db.bazaBackupHazirla();
    assert.ok(bkp.buffer.length > 4096, "Backup faylı çox kiçikdir");
    assert.ok(bkp.faylAdi.endsWith(".sqlite"), "Fayl adı .sqlite ilə bitməlidir");
  });

  await test("3. Semantik Vektor Statistikası və İndeks API-si", () => {
    const vStat = db.vektorStatistikasiAl();
    assert.equal(typeof vStat.cemi, "number");
    assert.equal(typeof vStat.vektorlu, "number");
    assert.equal(typeof ai.butunBazaniVektorlashdir, "function");
  });

  await test("4. Ağıllı Çat Zibil Süzgəci (85% boş mesaj təmizliyi)", () => {
    const xam = [
      { gonderen: "A", tarix: "2026-11-24 10:00", metn: "Salam aleykum hər kəsə" },
      { gonderen: "B", tarix: "2026-11-24 10:01", metn: "Çox sağ olun" },
      { gonderen: "C", tarix: "2026-11-24 10:02", metn: "Ok" },
      { gonderen: "D", tarix: "2026-11-24 10:05", metn: "e-taxes portalında ƏDV qaimə ləğvi zamanı depozit hesabı necə işləyir?" }
    ];
    const temiz = parsers.chatZibilleriniTemizle(xam);
    assert.equal(temiz.length, 1, "Yalnız 1 faydalı mesaj qalmalı idi");
    const parcalar = parsers.sohbetPenceresiYarat(xam, "Test Qrup");
    assert.ok(parcalar[0].basliq.includes("Praktiki Keys"), "Praktiki Keys etiketi qoyulmalıdır");
  });

  await test("5. Mühasibat Kalkulyatoru (il üzrə dərəcələr, rəqəm oxuma, məzuniyyət)", () => {
    const netRes = calc.kalkulyatorEmalEt("hesabla maas 1500 net");
    assert.ok(Math.abs(netRes.netice.net - 1500) <= 0.01);
    // 2026: 2500-dək 3% (200 AZN güzəşt) — VM 101.1-1.1
    const g1500 = calc.maasGrossdanNeteOzel(1500, 2026);
    assert.equal(g1500.gelirVergisi, 39);
    assert.equal(g1500.net, 1287.5);
    assert.equal(calc.maasGrossdanNeteOzel(3000, 2026).net, 2521.5);
    assert.equal(calc.maasGrossdanNeteOzel(8000, 2026).gelirVergisi, 625);
    assert.equal(calc.maasGrossdanNeteOzel(1500, 2027).gelirVergisi, 65);
    for (const n of [400, 1500, 2500, 5000, 12000]) {
      assert.ok(Math.abs(calc.maasNetdenGrossaOzel(n, 2026).net - n) <= 0.01, `net->gross ${n}`);
      assert.ok(Math.abs(calc.maasNetdenGrossaDovlet(n, 2026).net - n) <= 0.01, `dövlət net->gross ${n}`);
    }
    assert.equal(calc.kalkulyatorEmalEt("hesabla maaş 1 500 gross").netice.gross, 1500);
    assert.equal(calc.kalkulyatorEmalEt("hesabla maaş 1,500 gross").netice.gross, 1500);
    assert.equal(calc.kalkulyatorEmalEt("hesabla 2027-ci ildə 1500 gross maaş").netice.il, 2027);
    assert.equal(calc.kalkulyatorEmalEt("hesabla maaş 3000 net dövlət").netice.sektor, "dovlet");
    assert.equal(calc.kalkulyatorEmalEt("hesabla maaş 1500 və 2000 gross").nov, "xeta");
    assert.equal(calc.kalkulyatorSorgusudurmu("İllik dövriyyəsi 250000 manat gross olan şirkət ƏDV qeydiyyatına düşməlidirmi?"), false);

    const mezRes = calc.kalkulyatorEmalEt("hesabla mezuniyyet 1200 maas 21 gun");
    assert.equal(mezRes.netice.maas, 1200);
    assert.equal(mezRes.netice.gunler, 21);
    assert.equal(mezRes.netice.gross, 828.95);
  });

  await test("6. İki-Mərhələli Tənqidçi Müfəttiş (Hallüsinasiya Qalxanı)", async () => {
    const cp = await agent.criticPassIleYoxla({
      sual: "ƏDV dəqiqləşdirilməsi",
      ilkinCavab: "Vergi Məcəlləsinin Maddə 163.2 və Maddə 888.7 əsasında aparılır.",
      sitatlar: [{ nomre: 1, basliq: "Maddə 163.2", metn: "Maddə 163.2 qaydası", huquqi_pille: 1, huquqi_etiket: "Rəsmi" }],
      aktivDerinRejim: false
    });
    assert.ok(cp.tesdiqlenmemisMaddeler.includes("888.7"), "Uydurma 888.7 maddəsi tutulmalı idi");
    assert.ok(!cp.tesdiqlenmemisMaddeler.includes("163.2"), "Real 163.2 maddəsi səhv sayılmamalı idi");
  });

  await test("7. Bilik Boşluğu Qeydiyyatı (Knowledge Gap Log)", () => {
    const testSual = "__TEST_BOSLUQ__ Xüsusi nadir vergi halı testi";
    const g1 = db.bilikBosluguQeydEt({ sual: testSual, menbe: "AvtoTest" });
    const g2 = db.bilikBosluguQeydEt({ sual: testSual, menbe: "AvtoTest" });
    assert.ok(g2.say >= g1.say, "Təkrar sorulanda say artmalıdır");
    db.db.prepare("DELETE FROM bilik_bosluqlari WHERE id = ?").run(g1.id);
  });

  await test("8. Yaddaşın Özünü-Təmizləməsi (Memory Consolidation)", () => {
    const oxsarliq = consolidator.metnOxsarligi(
      "ƏDV bəyannaməsi hər ayın 20-nə qədər təqdim edilir",
      "ƏDV bəyannaməsi ayın 20-nə qədər təqdim edilir"
    );
    assert.ok(oxsarliq >= 0.7, "Oxşar qaydalar aşkarlanmalıdır");
  });

  await test("9. TTS Səsli Cavab Mətn Təmizləyicisi & Həftəlik Bülleten", () => {
    const temiz = tts.metniSesUcuntemizle("<b>Salam</b> [1] ### Test");
    assert.ok(!temiz.includes("<b>") && !temiz.includes("[1]"), "HTML və sitat nömrələri təmizlənməlidir");
    assert.equal(typeof bulleten.heftelikBulletenHazirla, "function");
  });

  await test("10. Telegram Uzun Mesaj Bölməsi (3800 simvol limiti, kəsilmədən)", () => {
    const connectors = require("../src/connectors");
    const uzunMetn = Array.from({ length: 120 }, (_, i) => `Abzas #${i + 1}: Vergi Məcəlləsinin tələbləri və praktiki nümunələr üzrə ətraflı təhlil mətni.`).join("\n\n");
    const hisseler = connectors.tgMesajiHisselereBol(uzunMetn, 3800);
    assert.ok(hisseler.length >= 3, "Uzun mesaj ən azı 3 hissəyə bölünməli idi");
    for (const h of hisseler) {
      assert.ok(h.length <= 3800, "Heç bir hissə 3800 simvolu keçməməlidir");
    }
  });

  await test("11. Kalkulyator Yalançı Tutma Qorunması (Hüquqi sualları AI-a buraxır)", () => {
    assert.equal(calc.kalkulyatorSorgusudurmu("Məzuniyyət günləri neçə gündür? 21 yoxsa 30?"), false);
    assert.equal(calc.kalkulyatorSorgusudurmu("İşçinin maaşından icbari tibbi sığorta necə tutulur?"), false);
    assert.equal(calc.kalkulyatorSorgusudurmu("hesabla maaş 1500 net"), true);
    assert.equal(calc.kalkulyatorSorgusudurmu("hesabla məzuniyyət 1200 maaş 21 gün"), true);
  });

  await test("12. CSV Cədvəl Oxuyucusu (Ayırıcı, dırnaqlı xana, sütun-dəyər bağlanması)", async () => {
    const parsers = require("../src/parsers");
    const csvBuf = Buffer.from('\uFEFF"Ad, Soyad";VÖEN;Məbləğ\n"Əliyev, Vəli";1234567890;1500 AZN\n"Həsənov, Rauf";2098765432;2400 AZN', "utf8");
    const res = await parsers.faylEmalEt({ buffer: csvBuf, faylAdi: "vergi_cedveli.csv", mimeType: "text/csv" });
    assert.strictEqual(res.nov, "csv", "CSV faylı 'csv' növü ilə tanınmalıdır");
    assert.strictEqual(res.meta.setir_sayi, 2, "2 məlumat sətri olmalıdır");
    assert.strictEqual(res.meta.sutun_sayi, 3, "3 sütun olmalıdır");
    assert.strictEqual(res.meta.ayirici, ";", "Nöqtəli-vergül ayırıcısı avtomatik tanınmalıdır");
    assert.ok(res.xam_metn.includes("VÖEN: 1234567890"), "Sütun adı dəyərlə bağlanmalıdır");
    assert.ok(res.xam_metn.includes("Əliyev, Vəli"), "Dırnaq içindəki vergül pozulmamalıdır");
  });

  await test("13. Mənbə Versiyalaşdırılması, Tranzaksiya, Audit Jurnalı və Etibar Səviyyəsi", () => {
    const ad = "__test_versiya_senedi.txt";
    const m1 = db.menbeElaveEt({
      qovluq_id: "qovluq-sexsi",
      ad,
      nov: "txt",
      olcu: 120,
      xulase: "Versiya 1",
      xam_metn: "Birinci versiya mətn bloku 1234567890 vergi qanunu sınaq mətni.",
      parcalar: [{ basliq: "V1", metn: "Birinci versiya mətn bloku." }]
    });
    assert.strictEqual(m1.etibar_seviyyesi, "orijinal_menbe");

    const m2 = db.menbeYenile({
      id: m1.id,
      ad,
      nov: "txt",
      olcu: 140,
      xulase: "Versiya 2",
      xam_metn: "İkinci yenilənmiş versiya mətn bloku 9876543210 vergi qanunu sınaq mətni.",
      parcalar: [{ basliq: "V2", metn: "İkinci versiya mətn bloku." }]
    });
    const versiyalar = db.menbeVersiyalariniAl(m2.id);
    assert.ok(versiyalar.length >= 1, "Əvvəlki versiya menbe_versiyalari cədvəlində saxlanılmalıdır");

    const audit = db.auditJurnaliniAl(5);
    assert.ok(audit.length > 0, "Audit jurnalında əməliyyat qeydə alınmalıdır");

    // Test qalıqlarını təmizlə
    db.menbeSil(m2.id);
    db.db.prepare("DELETE FROM menbe_versiyalari WHERE menbe_id = ?").run(m2.id);
  });

  await test("14. Baza Backup Bərpa Validasiyası (Etibarsız faylı rədd edir)", () => {
    assert.throws(() => {
      db.bazaBackupBerpaEt(Buffer.from("bu sqlite fayli deyil"));
    }, /Etibarsız|SQLite3/);
  });

  await test("15. Kitabxana və Bilik Sahələri Strukturu & Müstəqil Sahə Təcridi (Domain Isolation)", () => {
    const saheler = db.saheleriAl();
    assert.ok(saheler.length >= 3, "Ən azı 3 ilkin sahə mövcud olmalıdır");
    const vergiSahe = saheler.find(s => s.id === "vergi_muhasibat");
    assert.ok(vergiSahe, "Vergi və Mühasibatlıq sahəsi mövcud olmalıdır");
    assert.strictEqual(vergiSahe.esas_mi, 1, "Vergi sahəsi əsas sahə olmalıdır");

    // İcazə verilən sahələri yoxla (Vergi üçün Əmək və Qərarlar əlaqəlidir)
    const icazeliler = db.icazeVerilenSaheIdleriAl("vergi_muhasibat");
    assert.ok(icazeliler.includes("vergi_muhasibat"));
    assert.ok(icazeliler.includes("emek_mulki"));

    // Təcrid testi: Proqramlaşdırma sahəsində test sənədi yaradırıq
    const itMenbe = db.menbeElaveEt({
      qovluq_id: "qovluq-sexsi",
      sahe_id: "proqramlasdirma",
      ad: "__test_python_kod.py",
      nov: "txt",
      olcu: 90,
      xulase: "Python script",
      xam_metn: "def hesablar(): return [1, 2, 3] # python django kod sınağı",
      parcalar: [{ basliq: "Python Kod", metn: "def hesablar(): return [1, 2, 3] python django kod sınağı" }]
    });

    // 1) Vergi sahəsində axtarış aparırıq: Proqramlaşdırma sənədi GƏLMƏMƏLİDİR!
    const vergiAxtaris = db.hibridAxtar({
      sorgu: "python django kod",
      sahe_id: "vergi_muhasibat"
    });
    const itTapildi = vergiAxtaris.some(p => p.menbe_id === itMenbe.id);
    assert.strictEqual(itTapildi, false, "Kənar 'proqramlasdirma' sənədi vergi sahəsinin axtarışına qətiyyən sızmamalıdır!");

    // 2) Öz sahəsində ('proqramlasdirma') axtarış aparırıq: Tapılmalıdır!
    const itAxtaris = db.hibridAxtar({
      sorgu: "python django kod",
      sahe_id: "proqramlasdirma"
    });
    assert.ok(itAxtaris.some(p => p.menbe_id === itMenbe.id), "Öz sahəsində axtarış zamanı sənəd tapılmalıdır");

    // Test sənədini təmizlə
    db.menbeSil(itMenbe.id);
  });

  await test("16. Sərhəd Qoruyucusu (Relevance Guard) və Avtomatik Mövzu Öyrənmə", () => {
    const domainGuard = require("../src/domain-guard");

    // Vergi mətni üçün uyğunluq
    const vergiQiymet = domainGuard.saheUygunluguQiymetlendir({
      metn: "Maddə 163 üzrə elektron qaimə-faktura ləğv edilərkən ƏDV əvəzləşdirilməsi və depozit hesabı tənzimlənir.",
      basliq: "Vergi Əməliyyatları",
      aktivSaheId: "vergi_muhasibat"
    });
    assert.strictEqual(vergiQiymet.uygundur, true, "Vergi mətni aktiv vergi sahəsinə tam uyğun olmalıdır");
    assert.ok(vergiQiymet.elaqeDerecesi >= 70, "Əlaqə dərəcəsi 70%-dən yüksək olmalıdır");

    // Kənar proqramlaşdırma mətni üçün təcrid
    const itQiymet = domainGuard.saheUygunluguQiymetlendir({
      metn: "Docker container deployment kubernetes cluster react component nodejs api endpoint backend",
      basliq: "Server Setup Guide",
      aktivSaheId: "vergi_muhasibat"
    });
    assert.strictEqual(itQiymet.uygundur, false, "Kənar proqramlaşdırma mətni vergi sahəsindən təcrid edilməlidir");
    assert.strictEqual(itQiymet.hedefSaheId, "proqramlasdirma");

    // Avtomatik Mövzu Öyrənmə testi
    const oyrenilenler = domainGuard.movzuTapVeOyren({
      metn: "Maddə 163. Vergi tutulan dövriyyənin dəqiqləşdirilməsi qaydaları və elektron qaimə-faktura şərtləri.",
      basliq: "Vergi Məcəlləsi",
      sahe_id: "vergi_muhasibat"
    });
    assert.ok(oyrenilenler.length >= 1, "Mətndən avtomatik mövzular çıxarılmalıdır");
    assert.ok(oyrenilenler.some(m => m.movzu.includes("163") || m.movzu.includes("Qaimə")), "Maddə 163 və ya Qaimə mövzusu öyrənilməlidir");
  });

  await test("17. Sınaq və Praktiki Təcrübə Simulyatoru (Autonomous Case-Solver & Error-Learning)", () => {
    const simulator = require("../src/simulator");

    // 1) Ssenarilər bankının yoxlanışı
    const ssenariler = simulator.ssenarileriAl("vergi_muhasibat");
    assert.ok(ssenariler.length >= 4, "Vergi sahəsi üçün ən azı 4 standart sınaq keysi olmalıdır");

    // 2) Həllin qiymətləndirilməsi və səhv tutma (Level C Error-Learning)
    const sehvCavab = "Fərdi sahibkarlarda 45 000 AZN güzəşt üçün mütləq 3 işçi tələb olunur və Maddə 102.1.30 yalnız işçi olduqda tətbiq edilir.";
    const sehvQiymet = simulator.helliQiymetlendir({
      cavab: sehvCavab,
      gozlenilenMaddeler: ["102.1.30-1"],
      kritikMeqamlar: ["45 000 AZN-dək dövriyyəsi olan 13 xidmət sahəsində işçi sayı tələbi yoxdur (0 işçi ilə tətbiq edilir)"]
    });
    assert.strictEqual(sehvQiymet.ugurlu_mu, false, "3 işçi tələsi olan səhv cavab kəsilməlidir");
    assert.ok(sehvQiymet.cixarilmisDersler.length > 0, "Səhvdən avtomatik düzəliş dərsi çıxarılmalıdır");

    // 3) Düzgün həllin qiymətləndirilməsi
    const duzgunCavab = "Vergi Məcəlləsinin 102.1.30-cu maddəsinə əsasən 45 000 AZN-dək dövriyyəsi olan 13 fəaliyyət növündə işçi sayı tələbi yoxdur (0 işçi ilə tətbiq edilir) və 75% gəlir vergisi güzəşti tətbiq olunur.";
    const duzgunQiymet = simulator.helliQiymetlendir({
      cavab: duzgunCavab,
      gozlenilenMaddeler: ["102.1.30-1"],
      kritikMeqamlar: ["45 000 AZN-dək dövriyyəsi olan 13 xidmət sahəsində işçi sayı tələbi yoxdur (0 işçi ilə tətbiq edilir)"]
    });
    assert.strictEqual(duzgunQiymet.ugurlu_mu, true, "Düzgün həll uğurlu qeydə alınmalıdır");
    assert.ok(duzgunQiymet.bal >= 85, "Düzgün həllin balı 85%-dən yüksək olmalıdır");

    // 4) Baza saxlanışı və statistika yoxlanışı
    const simQeyd = db.simulyasiyaSaxla({
      yoxlanib: 1,
      sahe_id: "vergi_muhasibat",
      basliq: "Mikro Sahibkar Sınağı",
      ssenari: "Konsaltinq 0 işçi keysi",
      cavab: duzgunCavab,
      audit_netice: "Uğurlu həll",
      bal: 95,
      ugurlu_mu: 1,
      dersler: duzgunQiymet.cixarilmisDersler
    });
    assert.ok(simQeyd.id.startsWith("sim-"), "Simulyasiya ID-si sim- prefiksi ilə başlamalıdır");

    const stat = db.simulyasiyaStatistikaAl("vergi_muhasibat");
    assert.ok(stat.umumi >= 1, "Simulyasiya statistikası ən azı 1 sınaq göstərməlidir");
    assert.ok(stat.ortaBal >= 70, "Orta bal düzgün hesablanmalıdır");
  });

  await test("18. Bilik Boşluğunun Avtomatik Tədqiqat və Mövzu Təklifinə Çevrilməsi", () => {
    const simulator = require("../src/simulator");

    // Açıq bilik boşluğu qeyd edirik
    const testBosluq = db.bilikBosluguQeydEt({
      sual: "Kriptovalyuta əməliyyatlarından əldə edilən gəlirlərin vergiyə cəlb edilməsi qaydaları",
      movzu: "Kriptovalyuta Vergisi",
      menbe: "İstifadəçi Sualı"
    });
    assert.ok(testBosluq && testBosluq.id, "Bilik boşluğu qeyd edilməlidir");

    // Avtomatik tədqiqat dövrəsini işə salırıq
    const netice = simulator.bilikBosluqlariniAvtoTedqiqEt("vergi_muhasibat");
    assert.ok(netice.aciqBosluqSayi >= 1, "Ən azı 1 açıq boşluq aşkar edilməlidir");

    // Mövzular cədvəlində 'teklif' statuslu mövzunun yarandığını yoxlayırıq
    const movzular = db.saheMovzulariAl("vergi_muhasibat");
    const teklifTapildi = movzular.some(m => m.status === "teklif" && m.movzu.includes("Kriptovalyuta"));
    assert.strictEqual(teklifTapildi, true, "Bilik boşluğu avtomatik sahənin tədqiqat təklifinə ('teklif') çevrilməlidir");

    // Təmizlik
    db.bilikBosluguHellEt(testBosluq.id);
  });

  await test("19. Maaş, Məzuniyyət və Son Haqq-Hesab Hesabat Generatoru (Payroll Engine)", () => {
    const payroll = require("../src/payroll");

    const hh = payroll.sonHaqqHesabHesabatiQur({
      isciAd: "Rəşad Əliyev",
      vezife: "Aparıcı Mühasib",
      sektor: "ozel",
      maas: 1500,
      maasTipi: "gross",
      iseQebulTarixi: "2024-01-01",
      isdenCixmaTarixi: "2025-01-01",
      ayIsGunleri: 22,
      islenmisIsGunleri: 22,
      illikMezuniyyetGun: 21,
      istifadeEdilmisGun: 0
    });

    assert.strictEqual(hh.staj.stajAylari, 12, "1 illik staj 12 ay hesablanmalıdır");
    assert.strictEqual(hh.staj.qaliqGun, 21, "İstifadə edilməmiş gün 21 olmalıdır");
    assert.ok(hh.kompensasiyaGross > 0, "Məzuniyyət kompensasiyası hesablanmalıdır");
    assert.ok(hh.netYekun > 0, "Yekun Net məbləğ hesablanmalıdır");
    assert.ok(hh.markdownHesabat.includes("RƏSMİ SON HAQQ-HESAB"), "Markdown hesabat mətni yaranmalıdır");
    assert.ok(hh.htmlCixarisi.includes("<!DOCTYPE html>"), "Çap/PDF üçün rəsmi HTML çıxarışı yaranmalıdır");
  });

  await test("20. Planlaşdırıcı (Scheduler) və Azərbaycan Vergi Təqvimi İzləyicisi", async () => {
    const scheduler = require("../src/scheduler");

    // 1) Vergi Təqvimi statusu (20 May simulyasiyası)
    const teqvim = scheduler.vergiTeqvimiStatusu(new Date("2026-05-20"));
    assert.ok(teqvim && teqvim.tarix, "Təqvim tarixi düzgün formalaşmalıdır");
    assert.ok(teqvim.yaxinOlanlar.some(y => y.ad.includes("ƏDV") || y.ad.includes("ÖMV")), "20-ci gün üçün ƏDV/ÖMV son tarixi aşkar edilməlidir");

    // 2) Daxili bildiriş qeydiyyatı
    scheduler.bildirisQeydEt({
      nov: "avto_tedqiqat",
      basliq: "Test Bildirişi",
      metn: "Avtonom sınaq tamamlandı",
      seviyye: "ugurlu"
    });
    const notifs = scheduler.vebBildirisleriAl();
    assert.ok(notifs.some(n => n.basliq === "Test Bildirişi"), "Yeni bildiriş növbədə olmalıdır");

    // 3) Avtonom tədqiqat dövrəsinin icrası
    const dovrNetice = await scheduler.avtoTedqiqatDovresiCalisdir({ mecburidir: true });
    assert.strictEqual(dovrNetice.icraOlundu, true, "Məcburi dövrə uğurla tamamlanmalıdır");
  });

  await test("21. İki-Pilləli Yaddaş ('Qaralama Dəftəri → Qızıl Yaddaş') Həyat Dövrü", () => {
    const unikal = "__TEST_QARALAMA_" + Date.now() + "__";
    const qar = db.yaddasElaveEt({
      sahe_id: "vergi_muhasibat",
      kateqoriya: "praktika",
      metn: `${unikal} Xarici məqalədən götürülmüş eksperimental şərh və fərziyyə qeydi`,
      menbe: "Xarici Ekspert Şərhi",
      etibar_seviyyesi: "ekspert_serhi_ferziyye"
    });

    assert.strictEqual(qar.status, "qaralama", "Ekspert şərhi əvvəlcə Qaralama Dəftərinə düşməlidir");

    // Qızıl Yaddaşda (təsdiqlənmiş siyahıda) görünməməlidir!
    const qizilSiyahi = db.yaddaslariAl("vergi_muhasibat");
    assert.strictEqual(qizilSiyahi.some(y => y.id === qar.id), false, "Təsdiqlənməmiş qaralama Qızıl Yaddaşa sızmamalıdır");

    // Qaralama siyahısında görünməlidir
    const qarSiyahi = db.qaralamaYaddaslariAl("vergi_muhasibat");
    assert.strictEqual(qarSiyahi.some(y => y.id === qar.id), true, "Qaralama dəftərində görünməlidir");

    // İstifadəçi təsdiqlədikdə Qızıl Yaddaşa keçməlidir
    const tesdiq = db.qaralamaTesdiqle(qar.id);
    assert.strictEqual(tesdiq.status, "tesdiqlenmis", "Təsdiqdən sonra Qızıl Yaddaşa keçməlidir");
    assert.strictEqual(db.yaddaslariAl("vergi_muhasibat").some(y => y.id === qar.id), true, "Artıq Qızıl Yaddaşda olmalıdır");

    db.yaddasSil(qar.id);
  });

  await test("22. 'Mən Niyə Səhv Etdim?' Kök-Səbəb Təhlili və Düşünmə Alqoritmi", async () => {
    const evolution = require("../src/evolution");

    const qayda = await evolution.kokSebebAnaliziEt({
      sual: "Qaimə ləğv edildikdə hansı ayın bəyannaməsi dəyişir?",
      sehvCavab: "Maddə 163-ə görə əvvəlki ayın bəyannaməsi dəqiqləşdirilir.",
      duzgunIzah: "Xeyr, burada xüsusi istisna var: Maddə 163.2 və Maddə 72.4-1 əsasında dəyişikliyin baş verdiyi cari ayın hesabat dövründə nəzərə alınır.",
      sahe_id: "vergi_muhasibat",
      llmIstifadeEt: false
    });

    assert.ok(qayda && qayda.id.startsWith("meta-"), "Metodoloji düşünmə qaydası yaradılmalıdır");
    assert.ok(qayda.sehv_koku.length > 10 && qayda.yoxlama_qaydasi.length > 15, "Səhv kökü və alqoritmik yoxlama qaydası dolu olmalıdır");

    const siyahi = db.dusunmeQaydalariniAl("vergi_muhasibat");
    assert.ok(siyahi.some(q => q.id === qayda.id), "Yeni qayda aktiv düşünmə alqoritmi siyahısında olmalıdır");

    db.dusunmeQaydasiSil(qayda.id);
  });

  await test("23. Qanun Dəyişikliyi Zamanı Dövr üzrə Arxivləmə və 3 İllik Tarixi Yaddaş", () => {
    const evolution = require("../src/evolution");

    // 1) Cari dövr üçün Maddə 999.1 üzrə təsdiqlənmiş Qızıl Qayda yaradaq
    const kohneQayda = db.yaddasElaveEt({
      sahe_id: "vergi_muhasibat",
      kateqoriya: "qayda",
      metn: "QIZIL QAYDA: Maddə 999.1 üzrə xüsusi sınaq həddi 45 000 AZN təşkil edir.",
      menbe: "Birbaşa Təlimat",
      vaciblik: 5
    });
    assert.strictEqual(kohneQayda.status, "tesdiqlenmis");

    // 2) Yeni il dəyişiklik sənədi gəlir və Maddə 999.1 yenilənir
    const tesir = evolution.qanunDeyisikliyiYoxlaVeArxivle({
      senedAdi: "Vergi Məcəlləsində 2027-ci il dəyişikliklər haqqında Qanun",
      xamMetn: "Maddə 999.1 aşağıdakı yeni redaksiyada verilsin: Maddə 999.1 üzrə hədd 60 000 AZN müəyyən edilir.",
      sahe_id: "vergi_muhasibat"
    });

    assert.strictEqual(tesir.deyisiklikTapildi, true, "Qanun dəyişikliyi aşkar edilməlidir");
    assert.ok(tesir.arxivlenenSay >= 1, "Köhnə maddəyə bağlı qayda arxivlənməlidir");

    // 3) Köhnə qayda silinməməli, 'arxiv_dovr' olaraq 3 illik yoxlamalar üçün saxlanmalıdır!
    const arxivler = db.arxivYaddaslariAl("vergi_muhasibat");
    const tapilanArxiv = arxivler.find(y => y.id === kohneQayda.id);
    assert.ok(tapilanArxiv, "Köhnə qayda tarixçə kimi arxivdə qalmalıdır");
    assert.ok(tapilanArxiv.quvvede_olma_dovru.includes("2026"), "Qüvvədə olma dövrü qeyd edilməlidir");

    // 4) Keçmiş dövr (məs: 2024) soruşulduqda tarixi qayda aktual kontekstə gəlməlidir
    const kecmisKontekst = db.aktualYaddaslariAl("2024-cü ildə Maddə 999.1 üzrə hədd nə qədər idi?", 10, "vergi_muhasibat");
    assert.ok(kecmisKontekst.siyahi.some(y => y.id === kohneQayda.id), "Keçmiş il sualında arxiv dövrünün qaydası tapılmalıdır");

    // Təmizlik
    db.yaddasSil(kohneQayda.id);
    if (tesir.hesabatId) {
      db.db.prepare("DELETE FROM qanun_tesir_hesabatlari WHERE id = ?").run(tesir.hesabatId);
    }
  });

  await test("24. Boz Zona Dosyesi, Ekspertin İş Siyasəti, İyerarxik Tədqiqat və 3-Pilləli Növbə", async () => {
    const webResearcher = require("../src/web-researcher");
    const simulator = require("../src/simulator");
    const scheduler = require("../src/scheduler");

    // 1) Açıq mənbədən gələn ekspert şərhi simulyasiyası (rəsmi sayt tapılmadıqda 2-ci qat işə düşür)
    let cagirilisSayi = 0;
    const saxtaFetch = async () => {
      cagirilisSayi++;
      if (cagirilisSayi === 1) {
        // 1-ci qat (rəsmi dövlət saytları): nəticə yoxdur
        return { ok: true, text: async () => "<html><body></body></html>" };
      }
      // 2-ci qat (ekspert məqalələri): qeyri-rəsmi şərh tapılır
      return {
        ok: true,
        text: async () => `
          <div class="result__body">
            <a class="result__a" href="https://muhasib-bloq.example.com/mezuniyyet-bonus">Ekspert Məqaləsi</a>
            <div class="result__snippet">Rüblük mükafatların orta əməkhaqqı hesablanmasında nəzərə alınması barədə müxtəlif praktiki yanaşmalar mövcuddur.</div>
          </div>`
      };
    };

    const arasdirma = await webResearcher.bosluguIyerarxikArasdir({
      sual: "__TEST_BOZ__ Rüblük qeyri-müntəzəm mükafatın kompensasiyada nəzərə alınması",
      movzu: "__TEST_BOZ_MOVZU__",
      sahe_id: "vergi_muhasibat",
      fetchFn: saxtaFetch
    });

    assert.strictEqual(arasdirma.qat, "ekspert_serhi_ferziyye", "Rəsmi mənbə olmadıqda 2-ci qat (ekspert şərhi) işləməlidir");
    assert.strictEqual(arasdirma.yaddasQeydi.status, "qaralama", "Ekspert şərhi Qaralamaya düşməlidir");
    assert.ok(arasdirma.yaddasQeydi.metn.includes("RƏSMİ QANUN DEYİL"), "Fərziyyə xəbərdarlıq damğası vurulmalıdır");
    assert.ok(arasdirma.bozZonaDosyesi && arasdirma.bozZonaDosyesi.id, "Avtomatik Boz Zona Dosyesi açılmalıdır");

    // 2) Ekspert Boz Zonada qərar verir -> "Ekspertin İş Siyasəti" kimi Qızıl Yaddaşa düşür
    const qerar = db.mubahiseliDosyeQerarVer(arasdirma.bozZonaDosyesi.id, {
      secilmis_movqe: "teref_b"
    });
    assert.strictEqual(qerar.dosye.status, "hell_edildi");
    assert.strictEqual(qerar.siyasetYaddasi.etibar_seviyyesi, "is_siyaseti");
    assert.strictEqual(qerar.siyasetYaddasi.status, "tesdiqlenmis");

    // 3) Dinamik Çarpaz Maddə Keysi Generatoru
    const dinamikKeys = simulator.carpazMaddelerdenDinamikKeysYarat("vergi_muhasibat");
    assert.ok(dinamikKeys && dinamikKeys.nov === "carpaz_madde", "Çarpaz maddələrdən dinamik keys yaranmalıdır");
    assert.ok(dinamikKeys.gozlenilenMaddeler.length >= 2, "Ən azı 2 fərqli maddə kəsişdirilməlidir");

    // 4) 3-Pilləli Prioritet Növbəsi (Açıq boşluq olduqda Prioritet 1 seçilməlidir)
    const testGap = db.bilikBosluguQeydEt({ sual: "__TEST_PRIORITET_1__ Nadir gömrük ƏDV sualı", menbe: "Test" });
    const pNetice = await scheduler.avtoTedqiqatDovresiCalisdir({
      mecburidir: true,
      fetchFn: async () => ({ ok: true, text: async () => "<html></html>" })
    });
    assert.strictEqual(pNetice.prioritet, "1_bilik_boslugu", "Açıq bilik boşluğu varkən 1-ci prioritet icra olunmalıdır");

    // Təmizlik
    if (arasdirma.yaddasQeydi?.id) db.yaddasSil(arasdirma.yaddasQeydi.id);
    if (qerar.siyasetYaddasi?.id) db.yaddasSil(qerar.siyasetYaddasi.id);
    if (arasdirma.bozZonaDosyesi?.id) db.db.prepare("DELETE FROM mubahiseli_dosyeler WHERE id = ?").run(arasdirma.bozZonaDosyesi.id);
    db.db.prepare("DELETE FROM mubahiseli_dosyeler WHERE sual LIKE '__TEST_%'").run();
    db.db.prepare("DELETE FROM sahe_movzulari WHERE movzu LIKE '__TEST_%'").run();
    if (testGap?.id) db.db.prepare("DELETE FROM bilik_bosluqlari WHERE id = ?").run(testGap.id);
  });

  await test("25. Uçdan-Uca Canlı HTTP Server İnteqrasiyası (Bootstrap, Təkamül API, UI v5.1)", async () => {
    const { server } = require("../server");
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const bazaUrl = `http://127.0.0.1:${port}`;

    try {
      // 1) Ana səhifə və v5.1 UI aktivliyi
      const htmlRes = await fetch(`${bazaUrl}/`);
      const html = await htmlRes.text();
      assert.strictEqual(htmlRes.status, 200);
      assert.ok(html.includes("bacariqXeritesiQabi") && html.includes("app.js?v=5.1"), "Yeni v5.1 UI panelləri yüklənməlidir");

      // 2) /api/bootstrap bütöv inteqrasiya cavabı
      const bootRes = await fetch(`${bazaUrl}/api/bootstrap`);
      const boot = await bootRes.json();
      assert.strictEqual(boot.ok, true);
      assert.ok(Array.isArray(boot.qaralamalar), "Bootstrap qaralamalar siyahısını qaytarmalıdır");
      assert.ok(Array.isArray(boot.dusunme_qaydalari), "Bootstrap düşünmə qaydalarını qaytarmalıdır");
      assert.ok(Array.isArray(boot.mubahiseli_dosyeler), "Bootstrap boz zona dosyelərini qaytarmalıdır");
      assert.ok(boot.aktiv_sahe_profili && boot.aktiv_sahe_profili.teref_a_rol, "Bootstrap aktiv sahənin tənqidçi profilini qaytarmalıdır");
      assert.ok(boot.bacariq_xeritesi && Array.isArray(boot.bacariq_xeritesi.movzular), "Bootstrap bacarıq xəritəsini qaytarmalıdır");

      // 3) /api/tekamul/veziyyet API marşrutu
      const tekRes = await fetch(`${bazaUrl}/api/tekamul/veziyyet?sahe_id=vergi_muhasibat`);
      const tek = await tekRes.json();
      assert.strictEqual(tek.ok, true);
      assert.ok(tek.dusunme_qaydalari.length >= 2, "İlkin metodoloji yoxlama qaydaları aktiv olmalıdır");
    } finally {
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  });

  await test("26. Universal Sahə Avto-Qurucusu və Sahəyə Uyğun Əks-Hücum Tənqidçisi", async () => {
    const cognition = require("../src/cognition");
    const simulator = require("../src/simulator");

    const kod = "test_proqram_" + Date.now();
    const yeniSahe = db.saheYarat({
      ad: "Proqramlaşdırma və Sistem Arxitekturası " + Date.now(),
      kod,
      aciqlama: "Backend server, verilənlər bazası və API təhlükəsizliyi",
      ikon: "💻"
    });

    try {
      const profil = await cognition.yeniSaheniAvtoQurasdir(yeniSahe, { llmIstifadeEt: false });
      assert.ok(profil && profil.teref_a_rol.includes("Təhlükəsizlik"), "Proqramlaşdırma sahəsi üçün uyğun Əks-Hücum Tənqidçisi qurulmalıdır");
      assert.ok(profil.teref_b_rol.includes("Memar"), "Proqramlaşdırma sahəsi üçün Sistem Memarı rolu qurulmalıdır");
      assert.ok(profil.helledici_deyisenler.length >= 2, "Sahənin həlledici dəyişənləri avtomatik təyin olunmalıdır");

      const qaydalar = db.dusunmeQaydalariniAl(yeniSahe.id);
      assert.ok(qaydalar.length >= 1, "Yeni sahə üçün ilkin yoxlama alqoritmi avtomatik yaradılmalıdır");

      const ssenariler = simulator.ssenarileriAl(yeniSahe.id);
      assert.ok(ssenariler.length >= 2, "Yeni sahə üçün dinamik sınaq ssenariləri hazır olmalıdır");
    } finally {
      db.db.prepare("DELETE FROM sahe_profilleri WHERE sahe_id = ?").run(yeniSahe.id);
      db.db.prepare("DELETE FROM sahe_bacariq_xeritesi WHERE sahe_id = ?").run(yeniSahe.id);
      db.db.prepare("DELETE FROM dusunme_qaydalari WHERE sahe_id = ?").run(yeniSahe.id);
      db.db.prepare("DELETE FROM sahe_movzulari WHERE sahe_id = ?").run(yeniSahe.id);
      db.db.prepare("DELETE FROM saheler WHERE id = ?").run(yeniSahe.id);
    }
  });

  await test("27. Yarımçıq Sual Analizi və 'Əgər Şərt A → X, Şərt B → Y' Qərar Ağacı", () => {
    const cognition = require("../src/cognition");

    // 1) Yarımçıq sual detektoru (həm vergi, həm də ümumi sahədə)
    const icareAnaliz = cognition.yarimciqSualAnalizEt({
      sual: "İcarə müqaviləsindən nə qədər vergi tutulur?",
      saheId: "vergi_muhasibat"
    });
    assert.strictEqual(icareAnaliz.yarimciqdir, true, "Subyekti göstərilməyən yarımçıq icarə sualı aşkarlanmalıdır");
    assert.ok(icareAnaliz.lokalQerarAgaciBloku.includes("Qərar Ağacı") && icareAnaliz.lokalQerarAgaciBloku.includes("Əgər"), "Qərar ağacı bloku qurulmalıdır");
    assert.ok(icareAnaliz.lokalQerarAgaciBloku.includes("Dəqiqləşdirici Sual"), "Dəqiqləşdirici sual göstərilməlidir");

    // 2) Tam detallı sualda lazımsız yarımçıq rejimi açmamalıdır
    const tamAnaliz = cognition.yarimciqSualAnalizEt({
      sual: "ƏDV ödəyicisi olan MMC VÖEN-siz fiziki şəxsdən aylıq 1500 AZN qeyri-yaşayış sahəsi icarəyə götürdükdə Maddə 124 üzrə nə qədər ÖMV tutur?",
      saheId: "vergi_muhasibat"
    });
    assert.strictEqual(tamAnaliz.yarimciqdir, false, "Bütün detalları verilmiş sual yarımçıq sayılmamalıdır");
  });

  await test("28. 'Harada Güclüyəm / Zəifəm' Bacarıq Xəritəsi və Hədəfli Zəif Mövzu Məşqi", () => {
    const cognition = require("../src/cognition");

    const testMovzu = "__TEST_ZEIF_MOVZU_TRANSFER_QIYMETI__";
    try {
      const qeyd = db.bacariqQeydEt({
        sahe_id: "vergi_muhasibat",
        movzu: testMovzu,
        bal: 40,
        nov: "duzelis"
      });
      assert.strictEqual(qeyd.seviyye, "zeif", "Ekspert düzəlişi edilən mövzu 'zeif' kimi işarələnməlidir");

      const zeifler = db.zeifMovzulariAl("vergi_muhasibat", 5);
      assert.ok(zeifler.some(z => z.id === qeyd.id), "Zəif mövzular siyahısına düşməlidir");

      const sinaq = cognition.zeifMovzudanSinaqYarat("vergi_muhasibat");
      assert.strictEqual(sinaq.nov, "zeif_movzu", "Zəif mövzudan hədəfli sınaq yaranmalıdır");
      assert.ok(sinaq.basliq.includes("Zəif Mövzu Məşqi"), "Sınaq başlığı hədəfli məşqi göstərməlidir");
    } finally {
      db.db.prepare("DELETE FROM sahe_bacariq_xeritesi WHERE movzu LIKE '__TEST_ZEIF_%'").run();
    }
  });

  await test("29. Niyyət Təyini, Salamlaşma Qorunması və RAG Relevanlıq Baryeri", async () => {
    const agent = require("../src/agent");

    // 1) Salamlaşma sualı hüquqi cərimə maddəsi ilə cavablanmamalıdır
    const salamRes = await agent.agentSualCavabla({
      sual: "Salam, necəsən? Özünü təqdim et.",
      sohbetdeSaxla: false
    });
    assert.strictEqual(salamRes.cavab.model, "BeyinAI Universal Köməkçi");
    assert.ok(salamRes.cavab.metn.includes("Universal Şəxsi AI Asistantınız"), "Salamlaşma cavabı universal köməkçi təqdimatı olmalıdır");
    assert.ok(!salamRes.cavab.metn.includes("Maddə 49"), "Salamlaşmaya vergi cəriməsi çıxarılmamalıdır");
    assert.strictEqual(salamRes.sitatlar.length, 0, "Salamlaşmada heç bir baza sitatı olmamalıdır");

    // 2) Kənar mövzulu sual (Python) əlaqəsiz vergi götürülməsi maddələrini sitat gətirməməlidir
    const kənarRes = await agent.agentSualCavabla({
      sual: "Mənə Python-da funksiya nümunəsi yaz",
      sohbetdeSaxla: false
    });
    assert.ok(!kənarRes.cavab.metn.includes("Maddə 43"), "Kənar suala əlaqəsiz Maddə 43 əlavə edilməməlidir");
  });

  await test("30. İnkar Frazaları (qaimə ilə yox), NKA Çeki (Maddə 109.8) və Təbii İntellektual Sintez", async () => {
    const agent = require("../src/agent");

    const res = await agent.agentSualCavabla({
      sual: "qaimə ilə yox, kassa çeki ilə alınan mal, xidmət mənfəət bəyannaməsində xərcə yazıla bilərmi, hansı şərtlərlə, hansı məbləğdə",
      sohbetdeSaxla: false
    });

    // 1) Əlaqəsiz aksiz qaydası cavaba qarışmamalıdır
    assert.ok(!res.cavab.metn.includes("Aksizli"), "Əlaqəsiz aksizli mallar qaydası çıxarılmamalıdır");

    // 2) Axtarış Maddə 109.8-in mətnini tapmalıdır
    assert.ok(res.sitatlar.some(s => /109\.8/.test(`${s.basliq} ${s.metn}`)), "Maddə 109.8 mənbələrdə olmalıdır");

    // 3) AI əlçatan deyilsə hazır "hökm" verilmir və bu açıq bildirilir
    assert.equal(res.aiCavabVerdi, false);
    assert.ok(res.cavab.metn.includes("AI cavab vermədi"));
    assert.notEqual(res.etibarliliqKod, "yuksek");
  });

  await test("31. Sual öyrənilmir; yalnız açıq əmr qalıcı qayda yaradır", async () => {
    const agent = require("../src/agent");
    const say = () => db.yaddaslariAl("vergi_muhasibat").length;
    for (const sual of [
      "Bu xərc mənfəət vergisində gəlirdən çıxılan xərc kimi qəbul edilir?",
      "ƏDV-ni nağd ödəmək səhvdir, yoxsa qanun buna icazə verir?",
      "Müqavilədə tarix göstərilməyibsə bu düzgün deyil sayılır"
    ]) {
      const evvel = say();
      await agent.agentSualCavabla({ sual, sahe_id: "vergi_muhasibat", sohbetdeSaxla: false });
      assert.equal(say(), evvel, `Sual qalıcı yaddaşa yazıldı: ${sual}`);
    }
    assert.equal(agent.oyrenmeNiyyetiTeyinEt("Bu hesablama səhvdir, güzəşt işçi sayından asılıdır.").duzelisNamizedi, true);
    assert.ok(agent.oyrenmeNiyyetiTeyinEt("Düzəliş: güzəşt üçün ən azı 3 işçi lazımdır.").duzelisEmri);
  });

  await test("32. AI-nin çıxardığı qeyd rəsmi maddəyə oxşasa da təsdiqsiz qalıcı olmur", () => {
    for (const menbe of ["Agent Analizi", "Avtonom Tədqiqat", "Simulyasiya Sınağı", "Avto-Öyrənmə (x)"]) {
      const y = db.yaddasElaveEt({ metn: `__T32 ${menbe} Kənd təsərrüfatı istehsalçıları torpaq vergisindən tam azaddır (Maddə 206).`, menbe, status: "tesdiqlenmis", etibar_seviyyesi: "orijinal_menbe" });
      assert.equal(y.status, "qaralama", menbe);
      assert.notEqual(y.etibar_seviyyesi, "orijinal_menbe");
    }
  });

  await test("33. Fərqli rəqəmli qaydalar ayrı qalır; silinən qeyd geri qaytarılır", async () => {
    const a = db.yaddasElaveEt({ metn: "__T33 Alfa müştərisinə endirim dərəcəsi 5 faiz tətbiq olunsun", menbe: "Əl ilə əlavə" });
    const b = db.yaddasElaveEt({ metn: "__T33 Alfa müştərisinə endirim dərəcəsi 25 faiz tətbiq olunsun", menbe: "Əl ilə əlavə" });
    assert.notEqual(a.id, b.id);
    await consolidator.yaddasiKonsolidasiyaEt({ aiIstifadeEt: false });
    assert.ok(db.yaddaslariAl().some(y => y.id === a.id) && db.yaddaslariAl().some(y => y.id === b.id));
    db.yaddasSil(a.id);
    assert.ok(!db.yaddaslariAl().some(y => y.id === a.id));
    assert.ok(db.yaddasZibiliAl().some(y => y.id === a.id));
    assert.equal(db.yaddasBerpaEt(a.id).status, "tesdiqlenmis");
  });

  await test("34. Şəxsi qeyd qanun dəyişikliyi sayılmır; eyni adlı qeyd köhnəni silmir", () => {
    const evolution = require("../src/evolution");
    const t = evolution.qanunDeyisikliyiYoxlaVeArxivle({ senedAdi: "Şəxsi fikrim", xamMetn: "Cədvəldə dəyişiklik lazımdır. Maddə 175 və 163.2 barədə sonra baxacam.", sahe_id: "vergi_muhasibat" });
    assert.equal(t.deyisiklikTapildi, false);
    const mk = (m) => db.menbeElaveEt({ qovluq_id: "qovluq-sexsi", ad: "__T34 Qeyd", nov: "qeyd", xam_metn: m, parcalar: [{ metn: m }] });
    const n1 = mk("Birinci qeyd: görüş cümə günü saat 16:00-da olacaq, unutma bunu.");
    const n2 = mk("İkinci qeyd: ofis üçün üç noutbuk sifariş edilməlidir bu həftə.");
    assert.notEqual(n1.id, n2.id);
    assert.ok(db.menbeDetaliAl(n1.id));
  });

  await test("35. Ehtiyat nüsxədən bərpa qaralamaları təsdiqlənmiş etmir", () => {
    const say = () => JSON.stringify(db.db.prepare("SELECT status, sahe_id, COUNT(*) c FROM yaddas GROUP BY 1,2 ORDER BY 1,2").all());
    const evvel = say();
    db.bazaBackupBerpaEt(db.bazaBackupHazirla().buffer);
    assert.equal(say(), evvel);
  });

  await test("36. Cavab yoxlaması uydurma maddə və rəqəmi tutur", () => {
    const agent = require("../src/agent");
    const kontekst = "Maddə 105. Verginin dərəcələri\n105.1. Müəssisələrin mənfəətindən 20 faiz dərəcəsi ilə vergi tutulur.";
    const duz = agent.cavabiMenbeyleTutusdur({ cavab: "Maddə 105.1 üzrə dərəcə 20%-dir.", kontekst });
    assert.deepEqual([duz.tapilmayanMaddeler, duz.tapilmayanReqemler], [[], []]);
    const sehv = agent.cavabiMenbeyleTutusdur({ cavab: "Maddə 105.9 üzrə dərəcə 25%-dir, cərimə 700 manatdır.", kontekst });
    assert.deepEqual(sehv.tapilmayanMaddeler, ["105.9"]);
    assert.equal(sehv.tapilmayanReqemler.length, 2);
  });

  await test("37. Araşdırma yalnız qaralama yaradır, boşluq açıq qalır; saxta rəsmi ünvan tanınmır", async () => {
    const web = require("../src/web-researcher");
    assert.equal(web.linkResmidirmi("https://www.taxes.gov.az/az/page"), true);
    assert.equal(web.linkResmidirmi("https://taxes.gov.az.saxta.com/x"), false);
    assert.equal(web.linkResmidirmi("https://saxta.com/?s=e-qanun.az"), false);
    const gap = db.bilikBosluguQeydEt({ sual: "__T37 nadir rüsum sualı haqqında araşdırma", menbe: "Test" });
    const fetchFn = async (u) => ({ ok: true, text: async () => String(u).includes("duckduckgo")
      ? '<div class="result__body"><a class="result__a" href="https://taxes.gov.az/x">Rəsmi</a><div class="result__snippet">nadir rüsum</div></div>'
      : "<p>Nadir rüsum sualı üzrə rəsmi izah mətni buradadır.</p>" });
    const n = await web.bosluguIyerarxikArasdir({ bosluqId: gap.id, sual: gap.sual, sahe_id: "vergi_muhasibat", fetchFn });
    assert.equal(n.yaddasQeydi.status, "qaralama");
    assert.ok(n.yaddasQeydi.metn.includes("rəsmi izah mətni"));
    const aciq = () => db.bilikBosluqlariniAl(100).some(b => b.id === gap.id);
    assert.ok(aciq(), "Təsdiqdən əvvəl boşluq açıq qalmalıdır");
    db.qaralamaTesdiqle(n.yaddasQeydi.id);
    assert.ok(!aciq(), "Təsdiqdən sonra bağlanmalıdır");
  });

  await test("38. Yoxlanmamış sınaq 'uğurlu' sayılmır və statistikaya düşmür", async () => {
    const simulator = require("../src/simulator");
    const evvel = db.simulyasiyaStatistikaAl("vergi_muhasibat").umumi;
    const n = await simulator.simulyasiyaIcraEt({ ssenariId: "sim-case-1", saheId: "vergi_muhasibat" });
    assert.equal(n.yoxlanib, 0);
    assert.equal(n.ugurlu_mu, 0);
    assert.equal(n.saxlanilanDersler.length, 0);
    assert.equal(db.simulyasiyaStatistikaAl("vergi_muhasibat").umumi, evvel);
  });

  await test("39. Müfəttişin sübutsuz 'düzəlişi' rədd edilir, sübutlu olan qəbul edilir", () => {
    const agent = require("../src/agent");
    const sitatlar = [
      { nomre: 1, basliq: "Maddə 58. Sanksiyalar", metn: "58.10. işəgötürənə hər bir belə şəxs üzrə birinci dəfə yol verdikdə 2000 manat, ikinci dəfə yol verdikdə 4000 manat, üç və daha çox dəfə yol verdikdə 6000 manat məbləğində maliyyə sanksiyası tətbiq edilir." },
      { nomre: 2, basliq: "Maddə 115. Təmir xərcləri", metn: "115.1. binalar qalıq dəyərinin 2 faizi, maşınlar 5 faizi həddi ilə məhdudlaşdırılır." },
      { nomre: 3, basliq: "Maddə 220. Dərəcələr", metn: "220.1-1. ticarət fəaliyyəti üzrə 6 faiz dərəcə ilə hesablanır." }
    ];
    const cavab = "Maddə 58.10: 2000, 4000, 6000 manat. Maddə 115.1: 2 faiz və 5 faiz.";
    const yoxla = (d) => agent.criticDuzelisiniYoxla(d, sitatlar, cavab);
    // canlı imtahanda çıxan yanlış iddialar
    assert.equal(yoxla({ qeyd: "Cari qanunvericiliyə görə 1-ci dəfə 4000, 2-ci dəfə 6000, 3-cü halda 8000 manatdır.", menbe_nomresi: 1, sitat: "birinci dəfə yol verdikdə 2000 manat, ikinci dəfə" }), null);
    assert.equal(yoxla({ qeyd: "Maddə 115.1-ə dəyişikliklə vahid 6 faizlik hədd müəyyən edilib.", menbe_nomresi: 2, sitat: "binalar qalıq dəyərinin 2 faizi, maşınlar 5 faizi" }), null);
    assert.equal(yoxla({ qeyd: "Maddə 115.1-ə dəyişikliklə vahid 6 faizlik hədd müəyyən edilib.", menbe_nomresi: 3, sitat: "ticarət fəaliyyəti üzrə 6 faiz dərəcə ilə" }), null);
    assert.equal(yoxla({ qeyd: "İstinad edilən mənbə mövcud deyil, düzəliş lazımdır.", menbe_nomresi: 1, sitat: "mətndə olmayan uydurma sitat parçası burada" }), null);
    // əsaslandırılmış qeyd
    const duz = yoxla({ qeyd: "Maddə 58.10-da sanksiya hər bir belə şəxs üzrə tətbiq olunur, bu şərt yazılmayıb.", menbe_nomresi: 1, sitat: "işəgötürənə hər bir belə şəxs üzrə birinci dəfə" });
    assert.equal(duz.nomre, 1);
  });

  await test("40. Əsas cavab və detallı hissə ayrı yoxlanır; faktiki suala əlavə sual açılmır", () => {
    const agent = require("../src/agent");
    const cognition = require("../src/cognition");
    const h = agent.cavabiHisselereAyir("Əsas 20%.\n<DETALLI_ANALIZ>Maddə 58.1 50%.</DETALLI_ANALIZ>\n<NOVBETI_SUALLAR>- 99%?</NOVBETI_SUALLAR>");
    assert.ok(h.esas.includes("20%") && !h.esas.includes("58.1") && !h.esas.includes("99%"));
    assert.ok(h.detalli.includes("58.1"));
    for (const sual of ["ƏDV neçə faizdir?", "Vergi orqanı neçə il ərzində vergini yenidən hesablaya bilər?", "Sadələşdirilmiş verginin əsas dərəcəsi nə qədərdir?"]) {
      assert.equal(cognition.yarimciqSualAnalizEt({ sual, saheId: "vergi_muhasibat" }).yarimciqdir, false, sual);
    }
  });

  await test("41. Limit və məşğulluq verən model bir müddət ötürülür", async () => {
    const aiM = require("../src/ai");
    aiM.modelFasileleriniSifirla();
    const siyahi = ["m1", "m2", "m3"];
    await aiM.xetayaGoreFasile("m1", new Response('{"error":{"details":[{"retryDelay":"30s"}]}}', { status: 429 }));
    await aiM.xetayaGoreFasile("m2", new Response("busy", { status: 503 }));
    assert.deepEqual(aiM.sinanacaqModeller(siyahi), ["m3"]);
    await aiM.xetayaGoreFasile("m3", new Response("busy", { status: 503 }));
    assert.equal(aiM.sinanacaqModeller(siyahi).length, 2);
    aiM.modelFasileleriniSifirla();
  });

  await test("42. Düşünən assistent: özü oxuyur, özünü yoxlayır, razılıqsız öyrənmir", async () => {
    const agent = require("../src/agent");
    const dusunen = require("../src/dusunen");
    require("../src/ai").modelFasileleriniSifirla();
    const kohneFetch = globalThis.fetch;
    const sorgular = [];
    let ssenari = [];
    const model = (parts) => new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts } }] }), { status: 200 });
    const cagir = (name, args, id) => ({ functionCall: { name, args, id }, thoughtSignature: "imza-" + id });
    globalThis.fetch = async (u, o) => {
      if (!String(u).includes("generateContent")) throw new Error("bağlı");
      const govde = JSON.parse(o.body);
      sorgular.push(govde);
      return model(ssenari.shift()(govde));
    };
    db.tenzimlemeYenile({ gemini_api_key: "TEST-KEY-0123456789012345", dusunen_rejim: "1" });
    try {
      // 1) maddəni özü oxuyur, uydurma rəqəmi özü düzəldir, öyrəndiyini yalnız təklif edir
      ssenari = [
        () => [cagir("madde_oxu", { nomre: "105.1" }, "a1")],
        () => [cagir("yadda_saxla_teklif", { metn: "__T42 İstifadəçinin şirkəti MMC formasındadır", nov: "haqqimda" }, "a2")],
        () => [{ text: "Mənfəət vergisi 27 faizdir [1]." }],
        (g) => {
          assert.ok(JSON.stringify(g.contents.at(-1)).includes("özünüyoxlama"));
          return [{ text: "Mənfəət vergisi 20 faizdir [1]. Şirkətinizin MMC olduğunu yadda saxlayım?" }];
        }
      ];
      const n = await agent.agentSualCavabla({ sual: "Bizim MMC mənfəətdən nə qədər vergi ödəməlidir?", sahe_id: "vergi_muhasibat", sohbetdeSaxla: false });
      assert.equal(n.dusunenRejim, true);
      assert.ok(n.cavab.metn.includes("20 faiz") && !n.cavab.metn.includes("27 faiz"));
      assert.ok(!n.cavab.metn.includes("Konkret və Qısa Cavab"));
      assert.equal(n.etibarliliqKod, "yuksek");
      assert.ok(n.sitatlar.some(s => /105/.test(s.basliq)));
      const imzaQayidib = sorgular[1].contents.some(c => c.parts.some(p => p.thoughtSignature === "imza-a1"));
      assert.ok(imzaQayidib, "Düşüncə imzası modelə qaytarılmalıdır");
      const teklif = db.qaralamaYaddaslariAl("vergi_muhasibat").find(y => y.metn.includes("__T42"));
      assert.ok(teklif, "Öyrənilən şey təklif kimi qalmalıdır");

      assert.ok(n.cavab.metn.includes("Yadda saxlamağı təklif edirəm") && n.cavab.metn.includes("__T42"), "Təklifin mətni istifadəçiyə göstərilməlidir");
      db.sohbetElaveEt({ rol: "user", metn: "Bizim MMC mənfəətdən nə qədər vergi ödəməlidir?", sahe_id: "vergi_muhasibat" });
      db.sohbetElaveEt({ rol: "assistant", metn: n.cavab.metn, sahe_id: "vergi_muhasibat" });

      // 2) razılıq verilməyibsə model özü təsdiqləyə bilməz
      ssenari = [() => [cagir("qeydi_tesdiqle", { id: teklif.id }, "b1")], () => [{ text: "Yaxşı." }]];
      await agent.agentSualCavabla({ sual: "Bəs ƏDV barədə nə deyə bilərsən?", sahe_id: "vergi_muhasibat", sohbetdeSaxla: false });
      assert.ok(db.qaralamaYaddaslariAl("vergi_muhasibat").some(y => y.id === teklif.id));

      // 3) "bəli" deyəndə yaddaşa keçir, "unut" deyəndə zibil qutusuna gedir
      ssenari = [() => [cagir("qeydi_tesdiqle", { id: teklif.id }, "c1")], () => [{ text: "Yadda saxladım." }]];
      await agent.agentSualCavabla({ sual: "Bəli, yadda saxla", sahe_id: "vergi_muhasibat", sohbetdeSaxla: false });
      assert.ok(db.yaddaslariAl("vergi_muhasibat").some(y => y.id === teklif.id));
      ssenari = [(g) => { assert.ok(g.systemInstruction.parts[0].text.includes("__T42")); return [cagir("qeydi_unut", { id: teklif.id }, "d1")]; }, () => [{ text: "Unutdum." }]];
      await agent.agentSualCavabla({ sual: "Onu unut", sahe_id: "vergi_muhasibat", sohbetdeSaxla: false });
      assert.ok(db.yaddasZibiliAl().some(y => y.id === teklif.id));
      assert.equal(dusunen.razilasir("yox, lazım deyil"), false);

      // 4) AI əlçatmazdırsa köhnə yol işləyir
      require("../src/ai").modelFasileleriniSifirla();
      globalThis.fetch = async () => { throw new Error("bağlı"); };
      const f2 = await agent.agentSualCavabla({ sual: "ƏDV neçə faizdir?", sahe_id: "vergi_muhasibat", sohbetdeSaxla: false });
      assert.equal(f2.aiCavabVerdi, false);
    } finally {
      globalThis.fetch = kohneFetch;
      db.tenzimlemeYenile({ gemini_api_key: "", dusunen_rejim: "0" });
      require("../src/ai").modelFasileleriniSifirla();
    }
  });

  await test("43. Canlı sınaqdakı hallar: mövzudan çıxma, razılıq boşluğu, maaş izahı", async () => {
    const agent = require("../src/agent");
    const dusunen = require("../src/dusunen");
    const calcM = require("../src/calculator");
    require("../src/ai").modelFasileleriniSifirla();
    const kohneFetch = globalThis.fetch;
    let ssenari = [];
    globalThis.fetch = async (u, o) => {
      if (!String(u).includes("generateContent")) throw new Error("bağlı");
      const parts = ssenari.shift()(JSON.parse(o.body));
      return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts } }] }), { status: 200 });
    };
    db.tenzimlemeYenile({ gemini_api_key: "TEST-KEY-0123456789012345", dusunen_rejim: "1" });
    const sor = (sual) => agent.agentSualCavabla({ sual, sahe_id: "vergi_muhasibat", sohbetdeSaxla: false });
    try {
      // a) özünüyoxlamadan sonra model başqa mövzuya keçirsə, ilk cavab qalır
      const ilk = "İcarəyə verən VÖEN-li sahibkardırsa, icarə haqqının ödənilməsi zamanı sahibkarın qeydiyyatını və icarə müqaviləsini yoxlayın. Güman edirəm 77 faiz məsələsi də var.";
      ssenari = [
        () => [{ text: ilk }],
        (g) => {
          assert.ok(g.contents.at(-1).parts[0].text.includes("Bəs o adam VÖEN-li sahibkar olsa?"), "Özünüyoxlama sualı xatırlatmalıdır");
          return [{ text: "Kassa çeki ilə alınan mallar üzrə gəlirdən çıxılan xərclər iki faizlə məhdudlaşır, xidmətlər isə çıxılmır." }];
        }
      ];
      const r = await sor("Bəs o adam VÖEN-li sahibkar olsa?");
      assert.ok(r.cavab.metn.startsWith("İcarəyə verən VÖEN-li"), "Mövzudan çıxan variant qəbul edilməməlidir");

      // b) eyni cavabda həm təklif, həm təsdiq mümkün deyil
      let tesdiqNeticesi = "";
      ssenari = [
        () => [{ functionCall: { name: "yadda_saxla_teklif", args: { metn: "__T43 İstifadəçi ofisi Gəncədə icarəyə götürür", nov: "haqqimda" }, id: "1" } }],
        (g) => {
          const id = g.contents.at(-1).parts[0].functionResponse.response.result.id;
          return [{ functionCall: { name: "qeydi_tesdiqle", args: { id }, id: "2" } }];
        },
        (g) => { tesdiqNeticesi = JSON.stringify(g.contents.at(-1)); return [{ text: "Qeyd etdim." }]; }
      ];
      const r2 = await sor("Bəli, yadda saxla.");
      assert.ok(tesdiqNeticesi.includes("görməyib"));
      const q = db.qaralamaYaddaslariAl("vergi_muhasibat").find(y => y.metn.includes("__T43"));
      assert.ok(q, "Göstərilməmiş təklif qaralamada qalmalıdır");

      // göstəriləndən sonra qısa "bəli, yadda saxla" onu təsdiqləyir (model alət çağırmasa belə)
      db.sohbetElaveEt({ rol: "assistant", metn: r2.cavab.metn, sahe_id: "vergi_muhasibat" });
      ssenari = [() => [{ text: "Yadda saxladım." }]];
      await sor("Bəli, yadda saxla.");
      assert.ok(db.yaddaslariAl("vergi_muhasibat").some(y => y.id === q.id));

      // c) qanun müddəası yaddaşa təklif olunmur
      let redd = "";
      ssenari = [
        () => [{ functionCall: { name: "yadda_saxla_teklif", args: { metn: "VÖEN-li sahibkara ödənişdə 14% vergi tutulmur", nov: "haqqimda" }, id: "3" } }],
        (g) => { redd = JSON.stringify(g.contents.at(-1)); return [{ text: "Aydındır." }]; }
      ];
      await sor("Aydın oldu, davam edək.");
      assert.ok(redd.includes("qanun müddəasıdır"));

      // d) istifadəçinin faktı model unutsa da təklif olunur
      ssenari = [() => [{ text: "Qəbul etdim." }]];
      const r3 = await sor("Nəzərə al ki, şirkətim ƏDV ödəyicisidir və 4 işçimiz var.");
      assert.ok(r3.cavab.metn.includes("şirkətim ƏDV ödəyicisidir və 4 işçimiz var"));
      assert.equal(dusunen.istifadeciFakti("Mənfəət vergisi 18 faizdir, elə deyil?"), null);

      // e) kalkulyator izahı sektorun öz dərəcələrini yazır
      const izah = calcM.hesablamaIzahi(calcM.maasGrossdanNeteOzel(3000, 2026)).join(" | ");
      assert.ok(izah.includes("75 manat + 2500-dən yuxarı hissənin 10%-i = 125 manat"), izah);
      assert.ok(!izah.includes("25%") && !izah.includes("14%"));
      assert.ok(calcM.hesablamaIzahi(calcM.maasGrossdanNeteDovlet(3000, 2026)).join(" ").includes("25%-i"));
    } finally {
      globalThis.fetch = kohneFetch;
      db.tenzimlemeYenile({ gemini_api_key: "", dusunen_rejim: "0" });
      require("../src/ai").modelFasileleriniSifirla();
    }
  });

  await test("44. Gündəlik icmal: dəyişiklik tarixləri, uyğunsuzluq, gündə bir bildiriş, 'icmal göndər'", async () => {
    const icmal = require("../src/icmal");
    const scheduler = require("../src/scheduler");
    const agent = require("../src/agent");
    const sahe = db.saheYarat({ ad: "T44 sınaq sahəsi", kod: "t44_" + Date.now() });
    const mk = (ad, metn, parcalar) => db.menbeElaveEt({ qovluq_id: "qovluq-is", sahe_id: sahe.id, ad, nov: "txt", xam_metn: metn, parcalar });
    const bend = "Maddə 900. Sınaq dərəcəsi\n900.1. Vergi 12 faiz dərəcə ilə tutulur.\n900.1-1. Güzəştli dərəcə 6 faizdir.\n900.2. Başqa hal 30 faiz.\n(900.1-ci maddəyə dəyişiklik 2027-ci il yanvarın 1-dən qüvvəyə minir.)";
    const resmi = mk("T44 Məcəlləsi", bend + "\n" + "x ".repeat(32000), [{ basliq: "Maddə 900. Sınaq dərəcəsi", metn: bend }]);
    mk("T44 icmal xülasəsi", "1. Maddə 900.1 (köhnə):\n- Vergi 25% tutulur.\n- Güzəştli 6 faiz.\n2. Başqa bölmə\n- 99% sığorta", [{ metn: "xülasə" }]);

    const h = icmal.icmalHazirla({ saheId: sahe.id, vaxt: Date.parse("2026-11-27T06:00:00Z") });
    assert.deepEqual(h.deyisiklikler.map(d => [d.tarix, d.qalan, d.maddeler]), [["2027-01-01", 35, ["900.1"]]]);
    assert.deepEqual(h.ziddiyyetler.map(z => [z.madde, z.faizler]), [["900.1", ["25"]]]);
    assert.equal(h.xerite.cemi, 1);
    icmal.maddeBaxildi(sahe.id, "900.1");
    assert.equal(icmal.xeriteXulasesi(sahe.id).baxilan, 1);

    for (const s of ["icmal göndər", "İcmal göndər.", "/icmal", "gündəlik icmalı ver"]) assert.ok(icmal.icmalEmridirmi(s), s);
    for (const s of ["icmal vergi nədir?", "Bu icmal səhvdir, göndər düzəlişi"]) assert.ok(!icmal.icmalEmridirmi(s), s);
    const r = await agent.agentSualCavabla({ sual: "icmal göndər", sahe_id: sahe.id, sohbetdeSaxla: false });
    assert.ok(r.icmal && r.cavab.metn.includes("Gündəlik icmal"));

    const kohneSahe = db.aktivSaheIdAl();
    db.aktivSaheDeyis(sahe.id);
    try {
      db.tenzimlemeYenile({ icmal_son_acar: "" });
      const say = () => scheduler.vebBildirisleriAl().filter(b => b.nov === "icmal").length;
      const evvel = say();
      assert.ok(scheduler.gundelikIcmalYoxla());
      assert.equal(scheduler.gundelikIcmalYoxla(), null);
      assert.equal(say(), evvel + 1);
      assert.ok(db.db.prepare("SELECT COUNT(*) c FROM bildirisler").get().c >= 1, "Bildiriş bazada qalmalıdır");
    } finally {
      db.aktivSaheDeyis(kohneSahe);
      db.menbeSil(resmi.id);
    }
  });

  await test("45. Öyrənmə dövrəsi: yalnız sitatla sübut olunan fikir saxlanılır, mətn dəyişəndə yenidən öyrənilir", async () => {
    const oyrenme = require("../src/oyrenme");
    const icmal = require("../src/icmal");
    const agent = require("../src/agent");
    require("../src/ai").modelFasileleriniSifirla();
    const sahe = db.saheYarat({ ad: "T45 sınaq sahəsi", kod: "t45_" + Date.now() });
    const m901 = "901.1. Güzəşt yalnız orta aylıq işçi sayı 3 nəfərdən az olmayan şəxslərə tətbiq edilir və gəlirin 75 faizi vergidən azaddır.";
    const m902 = "902.1. Hesabat rüb başa çatdıqdan sonrakı ayın 20-dək 901-ci maddəyə uyğun təqdim edilir.";
    const qur = (a) => db.menbeElaveEt({ qovluq_id: "qovluq-is", sahe_id: sahe.id, ad: "T45 Məcəlləsi", nov: "txt", xam_metn: "x ".repeat(32000) + `\nMaddə 901. Güzəşt\n${a}\nMaddə 902. Hesabat\n${m902}\n`,
      parcalar: [{ basliq: "Maddə 901. Güzəşt", metn: a }, { basliq: "Maddə 902. Hesabat", metn: m902 }] });
    const menbe = qur(m901);
    const kohneFetch = globalThis.fetch;
    const gonderilen = [];
    let cavabQur = null;
    globalThis.fetch = async (u, o) => {
      if (!String(u).includes("generateContent")) throw new Error("bağlı");
      const govde = JSON.parse(o.body);
      gonderilen.push(govde.contents[0].parts[0].text);
      return cavabQur(String(u));
    };
    const json = (obj) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
    db.tenzimlemeYenile({ gemini_api_key: "TEST-KEY-0123456789012345", oyrenme_limiti: "5" });
    try {
      // üstünlük: istinad edilən 901 birinci, sizin baxdığınız maddə hamıdan öndə
      assert.equal(oyrenme.novbetiMovzular(sahe.id, 2)[0].madde, "901");
      icmal.maddeBaxildi(sahe.id, "902");
      assert.equal(oyrenme.novbetiMovzular(sahe.id, 2)[0].madde, "902");

      cavabQur = () => json({
        fikirler: [
          { fikir: "Güzəşt üçün ən azı 3 işçi lazımdır, 75 faiz azaddır.", sitat: "orta aylıq işçi sayı 3 nəfərdən az olmayan şəxslərə tətbiq edilir və gəlirin 75 faizi" },
          { fikir: "Güzəşt 50 faizdir və işçi şərti yoxdur.", sitat: "orta aylıq işçi sayı 3 nəfərdən az olmayan şəxslərə tətbiq edilir" },
          { fikir: "Uydurma qayda barədə fikir.", sitat: "mətndə heç olmayan uydurma sitat parçasıdır" }
        ],
        sual: "2 işçi ilə olarmı?", cavab: "Olmaz, ən azı 3 nəfər tələb olunur.", cavab_sitati: "orta aylıq işçi sayı 3 nəfərdən az olmayan",
        aydin_olmayan: ["Orta say necə hesablanır?"]
      });
      const movzu = oyrenme.novbetiMovzular(sahe.id, 5).find(x => x.madde === "901");
      const n = await oyrenme.movzunuOyren(sahe.id, movzu, db.tenzimlemeleriAl());
      assert.deepEqual([n.ok, n.fikirSayi, n.redd], [true, 1, 2]);
      const q = oyrenme.maddeQeydleri(sahe.id, "901.1");
      assert.equal(q.length, 1);
      assert.ok(!JSON.stringify(q).includes("50 faiz"));
      assert.ok(!oyrenme.novbetiMovzular(sahe.id, 5).some(x => x.madde === "901"), "Öyrənilmiş maddə təkrar seçilməməlidir");

      const goster = await agent.agentSualCavabla({ sual: "nə öyrəndin 901", sahe_id: sahe.id, sohbetdeSaxla: false });
      assert.ok(goster.cavab.metn.includes("ən azı 3 işçi") && goster.cavab.metn.includes("Sitat"));
      const icm = icmal.metnKimi(icmal.icmalHazirla({ saheId: sahe.id }));
      assert.ok(icm.includes("Son sutkada öyrəndiklərim") && icm.includes("Orta say necə hesablanır?"));

      // limit dolubsa sessiya dayanır, heç nə uydurulmur
      require("../src/ai").modelFasileleriniSifirla();
      gonderilen.length = 0;
      cavabQur = () => new Response('{"error":"quota PerDay"}', { status: 429 });
      const s = await oyrenme.oyrenmeSessiyasi({ saheId: sahe.id, say: 5, fasileMs: 0 });
      assert.equal(s.oyrenilen.length, 0);
      assert.ok(gonderilen.length <= 2, "Limitdən sonra başqa mövzular sınanmamalıdır");
      assert.ok(gonderilen.every(g => g.includes("902.1.")), "Yalnız rəsmi maddə mətni göndərilməlidir");

      // mətn dəyişəndə köhnə qeyd etibarsız olur və maddə yenidən növbəyə düşür
      qur(m901.replace("3 nəfərdən", "5 nəfərdən"));
      assert.equal(oyrenme.maddeQeydleri(sahe.id, "901").length, 0);
      assert.ok(oyrenme.novbetiMovzular(sahe.id, 5).some(x => x.madde === "901"));

      for (const [e, nov] of [["öyrən", "oyren"], ["Nə öyrəndin?", "goster"], ["qeydi sil 901", "sil"]]) assert.equal(oyrenme.emriTani(e)?.nov, nov, e);
      assert.equal(oyrenme.emriTani("ƏDV-ni necə öyrənim?"), null);
      db.tenzimlemeYenile({ oyrenme_limiti: "0" });
      assert.equal(oyrenme.aktivdirmi(), false);
    } finally {
      globalThis.fetch = kohneFetch;
      db.tenzimlemeYenile({ gemini_api_key: "", oyrenme_limiti: "0" });
      db.menbeSil(menbe.id);
      db.db.prepare("DELETE FROM bilik_qeydleri WHERE sahe_id = ?").run(sahe.id);
      require("../src/ai").modelFasileleriniSifirla();
    }
  });

  await test("46. Öyrənmə keyfiyyəti: təkrarsız mətn, bənddən bölmə, dəyişiklik qeydi, əhatə, boş sualların atılması", async () => {
    const oyrenme = require("../src/oyrenme");
    const icmal = require("../src/icmal");
    require("../src/ai").modelFasileleriniSifirla();
    const sahe = db.saheYarat({ ad: "T46 sınaq sahəsi", kod: "t46_" + Date.now() });
    const bend = (n) => `910.${n}. Sınaq bəndi nömrə ${n} üzrə hesabat ${n} gün ərzində təqdim edilməlidir və bu müddət uzadılmır.`;
    const bendler = Array.from({ length: 90 }, (_, i) => bend(i + 1));
    const qeydSetri = "* (910.80-ci maddəyə edilmiş dəyişiklik 2027-ci il yanvarın 1-dən qüvvəyə minir.)";
    bendler.splice(80, 0, qeydSetri);
    const govde = `Maddə 910. Uzun maddə\n${bendler.join("\n")}\nXII fəsil. Başqa fəsil\nfəsil mətni`;
    const menbe = db.menbeElaveEt({ qovluq_id: "qovluq-is", sahe_id: sahe.id, ad: "T46 Məcəlləsi", nov: "txt", xam_metn: "x ".repeat(32000) + "\n" + govde,
      parcalar: [{ basliq: "Maddə 910. Uzun maddə", metn: govde.slice(0, 3000) }, { basliq: "Maddə 910. Uzun maddə (Hissə 2)", metn: govde.slice(2700) }] });
    const kohneFetch = globalThis.fetch;
    try {
      const metn = oyrenme.maddeMetinleri(icmal.saheMenbeleri(sahe.id)).get("910").metn;
      assert.equal(metn.split(bend(20)).length - 1, 1, "Mətn təkrarlanmamalıdır");
      assert.ok(!metn.includes("fəsil mətni"));
      const hisseler = oyrenme.hisselereBol(metn);
      assert.ok(hisseler.length >= 2 && hisseler.every(h => h.length <= 4500));
      assert.ok(hisseler.slice(1).every(h => /^(?:\*|910\.)/.test(h)), "Hissə bəndin əvvəlindən başlamalıdır");

      // dəyişiklik qeydi olan hissə birinci seçilir
      const movzu = oyrenme.novbetiMovzular(sahe.id, 1)[0];
      assert.ok(movzu.metn.includes(qeydSetri) && movzu.hisse > 1, `hisse ${movzu.hisse}`);

      db.tenzimlemeYenile({ gemini_api_key: "TEST-KEY-0123456789012345", oyrenme_limiti: "12" });
      globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        fikirler: [{ fikir: "Hesabat 80 gün ərzində verilməlidir.", sitat: "Sınaq bəndi nömrə 80 üzrə hesabat 80 gün ərzində təqdim edilməlidir" }],
        aydin_olmayan: ["132-ci maddə", "Bu müddət bayram günlərində necə hesablanır?"]
      }) }] } }] }), { status: 200 });
      const n = await oyrenme.movzunuOyren(sahe.id, movzu, db.tenzimlemeleriAl());
      assert.equal(n.ehateSayi, 1);
      assert.ok(n.bendSayi > 5 && n.deyisiklikSayi === 1);
      const q = oyrenme.maddeQeydleri(sahe.id, "910")[0];
      assert.deepEqual(q.aydin_olmayan, ["Bu müddət bayram günlərində necə hesablanır?"]);
      assert.ok(q.deyisiklikler[0].includes("qüvvəyə minir"));
      const goster = await oyrenme.emriIcraEt({ nov: "goster", madde: "910" }, sahe.id);
      assert.ok(goster.includes("Dəyişiklik qeydləri") && goster.includes("bənddən 1-i"));
      assert.equal(oyrenme.limitAl({}), 12);
    } finally {
      globalThis.fetch = kohneFetch;
      db.tenzimlemeYenile({ gemini_api_key: "", oyrenme_limiti: "0" });
      db.menbeSil(menbe.id);
      db.db.prepare("DELETE FROM bilik_qeydleri WHERE sahe_id = ?").run(sahe.id);
      require("../src/ai").modelFasileleriniSifirla();
    }
  });

  await test("47. Öyrənmə dəqiqliyi: itmiş şərt/istisna/metod qanun mətni ilə əvəzlənir, sitat tam qalır", async () => {
    const oyrenme = require("../src/oyrenme");
    require("../src/ai").modelFasileleriniSifirla();
    const sahe = db.saheYarat({ ad: "T47 sınaq sahəsi", kod: "t47_" + Date.now() });
    const giris = "914.1. Amortizasiya olunan aktivlər üzrə düz xətt metodu ilə illik normalar aşağıdakı kimi müəyyən edilir:[8]";
    const norma = "914.1.1. digər əsas vəsaitlər – 14 il.";
    const istisnali = "914.2. Hüdud daxilində geri alınma ödənişləri (artan dəyər istisna olmaqla) dividend sayılmır, ehtiyat hesabı istisna olmaqla.";
    const uzun = `914.3. Sahibkar ${"uzun şərtlər siyahısına uyğun olan və ".repeat(14)}qeydiyyatda olan şəxs ayırmanın 40 faizini çıxır.`;
    const sade = "914.4. Təqdim edilən vəsaitdən yaranan fərq gəlirə daxil edilir.";
    const maddeMetni = ["Maddə 914. Amortizasiya", giris, norma, istisnali, uzun, sade].join("\n");
    const hisseMetni = [norma, istisnali, uzun, sade].join("\n"); // giriş cümləsi əvvəlki hissədə qalıb

    assert.deepEqual(oyrenme.sitatinYeri(maddeMetni, norma, hisseMetni).giris, [giris.replace("[8]", "")]);
    assert.deepEqual(oyrenme.sitatinYeri(maddeMetni, sade, hisseMetni).giris, []);
    assert.deepEqual(oyrenme.itenSertler(sade, "Yaranan fərq gəlirə daxil edilir."), []);
    assert.ok(oyrenme.itenSertler("2026-cı il yanvarın 1-dən sonra ayrılan vəsait", "Ayrılan vəsait").includes("tarix şərti düşüb"));

    const movzu = { madde: "914", basliq: "Amortizasiya", hisse: 2, hisse_sayi: 2, imza: "t47", metn: hisseMetni, maddeMetni, sebeb: "sınaq" };
    const json = (obj) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
    const teklif = {
      fikirler: [
        { fikir: "Digər əsas vəsaitlərin amortizasiya müddəti 14 ildir.", sitat: norma },
        { fikir: "Hüdud daxilində geri alınma ödənişləri (artan dəyər istisna olmaqla) dividend sayılmır.", sitat: istisnali },
        { fikir: "Sahibkar ayırmanın 40 faizini çıxır.", sitat: uzun },
        { fikir: "Vəsait təqdim ediləndə yaranan fərq gəlirə daxil edilir.", sitat: sade }
      ],
      sual: "Müddət neçə ildir?", cavab: "Digər əsas vəsaitlər üçün 14 il.", cavab_sitati: norma
    };
    const sorgular = [];
    const kohneFetch = globalThis.fetch;
    let yoxlayici = () => json({ neticeler: [{ n: 1, uygun: false, sebeb: "kimə aid olduğu düşüb" }, { n: 2, uygun: true }] });
    globalThis.fetch = async (u, o) => {
      const metn = JSON.parse(o.body).contents[0].parts[0].text;
      sorgular.push(metn);
      return metn.startsWith("### CÜT") ? yoxlayici() : json(teklif);
    };
    db.tenzimlemeYenile({ gemini_api_key: "TEST-KEY-0123456789012345", oyrenme_limiti: "5" });
    try {
      const n = await oyrenme.movzunuOyren(sahe.id, movzu, db.tenzimlemeleriAl());
      assert.ok(sorgular[0].includes("<KONTEKST>") && sorgular[0].includes("düz xətt metodu"), "Giriş cümləsi modelə verilməlidir");
      assert.equal(sorgular.length, 2);
      assert.ok(!sorgular[1].includes("14 ildir"), "Proqramın tutduğu fikir ikinci yoxlamaya göndərilmir");
      assert.deepEqual([n.ok, n.fikirSayi, n.metnSayi, n.redd], [true, 4, 3, 0]);
      const q = oyrenme.sonQeydler(sahe.id, 0, 1)[0];
      const [a, b, c, d] = q.fikirler;
      assert.ok(a.resmi_metn && a.sebeb.includes("metod") && a.fikir.includes("düz xətt metodu") && a.fikir.includes("14 il"));
      assert.ok(b.resmi_metn && b.sebeb.includes("istisna") && b.fikir.includes("ehtiyat hesabı istisna olmaqla"));
      assert.ok(c.resmi_metn && c.sebeb === "kimə aid olduğu düşüb" && c.fikir.includes("qeydiyyatda olan"));
      assert.ok(!d.resmi_metn && !d.yoxlanmayib);
      assert.ok(c.sitat.length > 500 && c.sitat.endsWith("40 faizini çıxır."), "Sitat kəsilməməlidir");
      assert.equal(q.cavab, "", "Şərti itmiş cavab saxlanılmır");

      // ikinci yoxlama alınmasa fikir "yoxlanmayıb" kimi nişanlanır
      require("../src/ai").modelFasileleriniSifirla();
      yoxlayici = () => new Response('{"error":"quota PerDay"}', { status: 429 });
      const n2 = await oyrenme.movzunuOyren(sahe.id, movzu, db.tenzimlemeleriAl());
      assert.deepEqual([n2.ok, n2.metnSayi, n2.yoxlanmayanSayi], [true, 2, 2]);
      assert.ok(oyrenme.sonQeydler(sahe.id, 0, 1)[0].fikirler[3].yoxlanmayib);
    } finally {
      globalThis.fetch = kohneFetch;
      db.tenzimlemeYenile({ gemini_api_key: "", oyrenme_limiti: "0" });
      db.db.prepare("DELETE FROM bilik_qeydleri WHERE sahe_id = ?").run(sahe.id);
      require("../src/ai").modelFasileleriniSifirla();
    }
  });

  await test("48. Cavabın mənaca yoxlanması: istinad olunan bənd və ümumi qayda oxunur, təhlil saxlanılır, eyni suala eyni cavab", async () => {
    const yoxlayici = require("../src/yoxlayici");
    require("../src/ai").modelFasileleriniSifirla();
    const sahe = db.saheYarat({ ad: "T48 sınaq sahəsi", kod: "t48_" + Date.now() });
    const b928 = "920.8. Uçotda olmayan fiziki şəxslərdən alış aktı əsasında və ya vergi ödəyicilərindən bu Məcəllənin 921.1-ci maddəsinə uyğun çek əsasında malların alınması üzrə xərclərin yuxarı həddi, daşınmaz əmlak istisna olmaqla, hər bir hal üzrə 2 faizdir.";
    const b921 = "921.1. Çekdə aşağıdakı məlumatlar olmalıdır:";
    const b9211 = "921.1.1. çeki verən vergi ödəyicisinin adı və VÖEN-i.";
    const b9151 = "915.1. Gəlirlə bağlı xərclər qaydasında rəsmiləşdirildikdə gəlirdən çıxılır.";
    const govde = `Maddə 915. Ümumi\n${b9151}\nMaddə 920. Xərclər\n920.1. Ümumi qayda.\n${b928}\n920.9. Başqa qayda.\nMaddə 921. Çek\n${b921}\n${b9211}\n`;
    const qur = (g) => db.menbeElaveEt({ qovluq_id: "qovluq-is", sahe_id: sahe.id, ad: "T48 Məcəlləsi", nov: "txt", xam_metn: "x ".repeat(32000) + "\n" + g,
      parcalar: [{ basliq: "Maddə 920. Xərclər", metn: b928 }, { basliq: "Maddə 921. Çek", metn: `${b921}\n${b9211}` }] });
    let menbe = qur(govde);

    assert.deepEqual(yoxlayici.daxiliIstinadlar(`${b928} Qanunun 3.5-ci maddəsi`), ["921.1"]);
    const bendi = yoxlayici.bendMetni(govde, "920.8");
    assert.ok(bendi.includes("hər bir hal üzrə") && !bendi.includes("Başqa qayda"));

    const qaralama = "Bəli, mal və xidmətlər xərcə yazılır, çekdə sizin VÖEN olmalıdır (Maddə 920.8).";
    const rey1 = {
      cavab: "Mallar üzrə bəli, amma hədd var (Maddə 920.8).",
      dayaqlar: [{ blok: 1, sitat: "malların alınması üzrə xərclərin yuxarı həddi, daşınmaz əmlak istisna olmaqla" }],
      daha_oxu: ["915.1"], mulahize_var: false, hisseler: [{ hisse: "xidmət", acar_soz: "xidmət", bend: "920.8" }]
    };
    const tehlil = "Mallar üzrə bəli: hər bir hal üzrə 2 faizlik hədd var, daşınmaz əmlak istisna olmaqla (Maddə 920.8).\n\nXidmət barədə ayrıca bənd görmürəm. Fikrimcə, ümumi qayda işləyir: xərc düzgün rəsmiləşdirilməlidir (Maddə 915.1). Mən olsam, xidmət üçün qaimə istərdim.";
    const rey2 = {
      cavab: `${tehlil} [1]`,
      dayaqlar: [
        { blok: 2, sitat: "malların alınması üzrə xərclərin yuxarı həddi, daşınmaz əmlak istisna olmaqla, hər bir hal üzrə 2 faizdir" },
        { blok: 1, sitat: "Gəlirlə bağlı xərclər qaydasında rəsmiləşdirildikdə gəlirdən çıxılır" },
        { blok: 1, sitat: "çekdə alıcının VÖEN-i mütləq göstərilməlidir" }
      ],
      mulahize_var: true, duzelisler: ["xidmət hissəsi ümumi qayda ilə izah edildi"]
    };
    const sorgular = [];
    let yoxlayiciCavabi = (metn) => (metn.includes("<PROQRAM QEYDİ>") ? rey2 : rey1);
    const kohneFetch = globalThis.fetch;
    const gem = (metn) => new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: metn }] } }] }), { status: 200 });
    globalThis.fetch = async (u, o) => {
      if (!String(u).includes("generateContent")) throw new Error("bağlı");
      const g = JSON.parse(o.body);
      const yoxlamadir = Boolean(g.systemInstruction?.parts?.[0]?.text.includes("<QARALAMA> sənin köməkçinin"));
      const metn = g.contents.at(-1).parts[0].text || "";
      sorgular.push({ yoxlamadir, metn });
      if (!yoxlamadir) return gem(qaralama);
      const c = yoxlayiciCavabi(metn);
      return c ? gem(JSON.stringify(c)) : new Response('{"error":"quota PerDay"}', { status: 429 });
    };
    db.tenzimlemeYenile({ gemini_api_key: "TEST-KEY-0123456789012345", dusunen_rejim: "1", mena_yoxlamasi: "1" });
    const sual = "qaimə yox, kassa çeki ilə alınan mal, xidmət xərcə yazıla bilərmi";
    const sor = () => agent.agentSualCavabla({ sual, sahe_id: sahe.id, sohbetdeSaxla: false });
    try {
      const n = await sor();
      const [y1, y2] = sorgular.filter(s => s.yoxlamadir).map(s => s.metn);
      assert.ok(y1.includes(b928) && y1.includes(b9211), "Bənd və istinad etdiyi bənd tam verilməlidir");
      assert.ok(y1.includes("<QARALAMA>") && y1.includes(sual) && !y1.includes(b9151));
      assert.ok(y1.includes("920.1. Ümumi qayda."), "Maddənin ümumi bəndi verilməlidir");
      assert.ok(y2.includes('"xidmət" sözü yoxdur'), "Hissəyə aid olmayan bənd geri qaytarılmalıdır");
      assert.ok(y2.includes(b9151), "İstənilən ümumi qayda oxunub ikinci turda verilməlidir");
      const m = n.cavab.metn;
      assert.ok(m.startsWith(tehlil), `Təhlil olduğu kimi qalmalıdır: ${m}`);
      assert.ok(!m.includes("[1]") && !m.includes("⚠️") && !m.includes("Alıcının VÖEN"), m);
      assert.ok(m.indexOf("<DETALLI_ANALIZ>") > m.indexOf("Mən olsam") && m.includes(b928));
      assert.equal(n.etibarliliqKod, "orta");
      assert.ok(n.sitatlar.some(s => s.basliq === "Maddə 920.8") && n.sitatlar.some(s => s.basliq === "Maddə 915.1"));

      const sayi = sorgular.length;
      const tekrar = await sor();
      assert.equal(sorgular.length, sayi, "Eyni sual üçün yeni sorğu getməməlidir");
      assert.equal(tekrar.cavab.metn, m);

      // qanun mətni dəyişəndə saxlanmış cavab işlənmir; uydurma rəqəm və düşən şərt düzəlməsə açıq qeyd edilir
      menbe = qur(govde.replace("2 faizdir", "3 faizdir"));
      require("../src/ai").modelFasileleriniSifirla();
      yoxlayiciCavabi = () => ({ cavab: "Bəli, təxminən 777 manatlıq hədd var.", dayaqlar: [{ blok: 1, sitat: "malların alınması üzrə xərclərin yuxarı həddi" }] });
      const n2 = await sor();
      const turlar = sorgular.slice(sayi).filter(s => s.yoxlamadir);
      assert.equal(turlar.length, 2, "Problem tapılanda bir dəfə geri qaytarılır");
      assert.ok(turlar[1].metn.includes("777 manat") && turlar[1].metn.includes("istisna düşüb"));
      assert.ok(n2.cavab.metn.includes("təsdiqləyə bilmədim") && n2.cavab.metn.includes("istisna düşüb") && n2.cavab.metn.includes("<DETALLI_ANALIZ>"), n2.cavab.metn);
      const sayi2 = sorgular.length;
      await sor();
      assert.ok(sorgular.length > sayi2, "Xəbərdarlıqlı cavab saxlanılmır");

      // yoxlama alınmasa açıq nişanlanır
      require("../src/ai").modelFasileleriniSifirla();
      yoxlayiciCavabi = () => null;
      const n3 = await sor();
      assert.ok(n3.etibarliliq.includes("yoxlanmayıb") && n3.cavab.metn.includes("sizin VÖEN"));

      assert.equal(yoxlayici.keshlenebilir("bəs bu halda xidmət üzrə hansı hədd tətbiq olunur"), false);
      const tg = require("../src/connectors").telegramCavabiFormatla;
      if (tg) assert.ok(!tg("Hədd var [109.8, 2] və [1].").qisa.includes("["));
    } finally {
      globalThis.fetch = kohneFetch;
      db.tenzimlemeYenile({ gemini_api_key: "", dusunen_rejim: "0", mena_yoxlamasi: "0" });
      db.menbeSil(menbe.id);
      db.db.prepare("DELETE FROM yoxlanmis_cavablar WHERE sahe_id = ?").run(sahe.id);
      require("../src/ai").modelFasileleriniSifirla();
    }
  });

  await test("49. Beyin: bəndlər və istinadlar proqramla tapılır, uydurma qeyd atılır, dosye cavaba verilir, mətn dəyişəndə işlənmir", async () => {
    const beyin = require("../src/beyin");
    require("../src/ai").modelFasileleriniSifirla();
    const sahe = db.saheYarat({ ad: "T49 sınaq sahəsi", kod: "t49_" + Date.now() });
    const b1 = "930.1. Gəlirlə bağlı xərclər sənədlə rəsmiləşdirildikdə gəlirdən çıxılır.";
    const b8 = "931.8. Bu Məcəllənin 932.1-ci maddəsinə uyğun kassa çeki ilə alınan malların xərci hər bir hal üzrə 2 faizlə məhdudlaşır.";
    const b9 = "932.1. Kassa çekində satıcının VÖEN-i olmalıdır.";
    const govde = `Maddə 930. Xərclər\n${b1}\nMaddə 931. Məhdudiyyət\n${b8}\nMaddə 932. Çek\n${b9}\n`;
    const qur = (g) => db.menbeElaveEt({ qovluq_id: "qovluq-is", sahe_id: sahe.id, ad: "T49 Məcəlləsi", nov: "txt", xam_metn: "x ".repeat(32000) + "\n" + g,
      parcalar: [{ basliq: "Maddə 930. Xərclər", metn: b1 }, { basliq: "Maddə 931. Məhdudiyyət", metn: b8 }, { basliq: "Maddə 932. Çek", metn: b9 }] });
    let menbe = qur(govde);

    assert.deepEqual(beyin.istinadlar("bu Məcəllənin 14-cü, 14-1-ci və 67-ci maddələri").sort(), ["14", "14-1", "67"]);
    assert.deepEqual(beyin.subyektler(b8), { mal: true, xidmet: false });
    const t = beyin.bendleriTopla(sahe.id, ["930", "931"]);
    assert.deepEqual(t.bendler.map(b => b.bend), ["930.1", "931.8", "932.1"]);
    assert.deepEqual(t.elaqeler, [{ menbe: "931.8", hedef: "932.1" }]);

    const kartlar = { kartlar: [
      { bend: "930.1", ad: "Xərclərin ümumi qaydası", qayda: "Gəlirlə bağlı xərc sənədlə rəsmiləşdirildikdə gəlirdən çıxılır." },
      { bend: "931.8", ad: "Kassa çeki limiti", qayda: "Kassa çeki ilə alınan mal və xidmət xərci 2 faizlə məhdudlaşır." },
      { bend: "932.1", ad: "Çekin rekvizitləri", qayda: "Kassa çekində satıcının VÖEN-i olmalıdır." }
    ] };
    const dosye = {
      umumi_qaydalar: [{ metn: "Xərc rəsmiləşdirilməlidir.", bendler: ["930.1"] }],
      xususi_qaydalar: [
        { metn: "Kassa çeki ilə alınan mallarda hər bir hal üzrə 2 faiz həddi var.", bendler: ["931.8"] },
        { metn: "Uydurma 777 manatlıq hədd var.", bendler: ["931.8"] },
        { metn: "Olmayan bənddən qayda.", bendler: ["999.1"] }
      ],
      elaqeler: [{ menbe: "931.8", hedef: "930.1", nov: "xüsusi hal", izah: "Mallar üçün əlavə hədd qoyur." }],
      suallar: [{ sual: "Kassa çeki ilə alınan xidmət xərci necə olur?", cavab: "Ayrıca bənd yoxdur, ümumi qayda işləyir.", bendler: ["930.1"] }],
      aciq_suallar: [{ sual: "Kassa çeki xidmət üçün kifayətdirmi?", mulahize: "Fikrimcə, qaimə daha etibarlıdır.", bendler: ["930.1"] }]
    };
    const sorgular = [];
    const kohneFetch = globalThis.fetch;
    const gem = (metn) => new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: metn }] } }] }), { status: 200 });
    globalThis.fetch = async (u, o) => {
      if (!String(u).includes("generateContent")) throw new Error("bağlı");
      const g = JSON.parse(o.body);
      const sistem = g.systemInstruction.parts[0].text;
      sorgular.push({ sistem, metn: g.contents.at(-1).parts[0].text || "" });
      if (sistem.includes("bilik kartı")) return gem(JSON.stringify(kartlar));
      if (sistem.includes("\"dosye\" hazırla")) return gem(JSON.stringify(dosye));
      if (sistem.includes("<QARALAMA> sənin köməkçinin")) return gem(JSON.stringify({ cavab: "Mallar üzrə hər bir hal üzrə 2 faiz həddi var (Maddə 931.8).", dayaqlar: [{ blok: 1, sitat: "malların xərci hər bir hal üzrə 2 faizlə məhdudlaşır" }] }));
      return gem("Hədd 2 faizdir (Maddə 931.8).");
    };
    db.tenzimlemeYenile({ gemini_api_key: "TEST-KEY-0123456789012345" });
    try {
      const n = await beyin.qur({ saheId: sahe.id, fasileMs: 0, movzu: "xercler" });
      assert.equal(n.ok, false, "Mövzu maddələri sahədə yoxdursa beyin qurulmur");
      beyin.MOVZULAR.t49 = { ad: "Kassa çeki xərcləri", maddeler: ["930", "931"] };
      const n2 = await beyin.qur({ saheId: sahe.id, fasileMs: 0, movzu: "t49" });
      assert.deepEqual([n2.ok, n2.kartSayi, n2.izahliKart, n2.atilan, n2.qaydaSayi], [true, 3, 2, 2, 2], JSON.stringify(n2));
      const d = beyin.dosyeler(sahe.id)[0];
      assert.ok(d.kartlar.find(k => k.bend === "931.8").sebeb.includes("xidmət"), "Mətndə olmayan subyekt əlavə edən izah rədd edilir");
      assert.ok(!JSON.stringify(d.dosye).includes("777"));
      assert.ok(beyin.dosyeMetni(d).includes("Açıq qalan suallar"));

      const sual = "kassa çeki ilə alınan xidmət xərci gəlirdən çıxılırmı";
      const k = beyin.kontekstQur(sual, sahe.id);
      assert.ok(k && k.bendler.includes("930.1") && k.bendler.includes("931.8"), JSON.stringify(k?.bendler));
      assert.ok(k.metn.includes("mətndə \"mal\" var, \"xidmət\" yoxdur") && k.metn.includes("qaimə daha etibarlıdır"));
      assert.equal(beyin.kontekstQur("hava bu gün necədir", sahe.id), null);
      assert.equal(beyin.kontekstQur(sual, sahe.id, { beyin_rejim: "0" }), null);

      sorgular.length = 0;
      db.tenzimlemeYenile({ dusunen_rejim: "1", mena_yoxlamasi: "1" });
      const c = await agent.agentSualCavabla({ sual, sahe_id: sahe.id, sohbetdeSaxla: false });
      assert.ok(sorgular[0].sistem.includes("<BEYIN>") && sorgular[0].sistem.includes("Kassa çeki xərcləri"));
      assert.ok(sorgular.at(-1).metn.includes("<DOSYE") && sorgular.at(-1).metn.includes(b1), "Yoxlayıcıya dosye və ümumi bənd verilməlidir");
      assert.ok(c.dusunmeAddimlari.some(a => a.startsWith("🧠 Beynimdən")));
      const emr = await agent.agentSualCavabla({ sual: "beyin göstər", sahe_id: sahe.id, sohbetdeSaxla: false });
      assert.ok(emr.cavab.metn.includes("Kassa çeki xərcləri"));

      db.menbeSil(menbe.id);
      menbe = qur(govde.replace("2 faizlə", "3 faizlə"));
      assert.equal(beyin.kontekstQur(sual, sahe.id), null, "Mətn dəyişibsə köhnə dosye işlənmir");
    } finally {
      globalThis.fetch = kohneFetch;
      delete beyin.MOVZULAR.t49;
      db.tenzimlemeYenile({ gemini_api_key: "", dusunen_rejim: "0", mena_yoxlamasi: "0" });
      db.menbeSil(menbe.id);
      for (const c of ["beyin_kartlari", "beyin_elaqeleri", "beyin_dosyeleri", "yoxlanmis_cavablar"]) db.db.prepare(`DELETE FROM ${c} WHERE sahe_id = ?`).run(sahe.id);
      require("../src/ai").modelFasileleriniSifirla();
    }
  });

  try { db.db.close(); fs.rmSync(testQovlugu, { recursive: true, force: true }); } catch (_) {}

  console.log(`\n======================================================`);
  console.log(`📊 TEST NƏTİCƏSİ: ${kecen} keçdi, ${ugursuz} uğursuz`);
  console.log(`======================================================\n`);

  process.exit(ugursuz > 0 ? 1 : 0);
})();
