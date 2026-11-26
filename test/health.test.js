// BeyinAI — Vahid Avtomatik Sağlamlıq və Keyfiyyət Test Paketi (npm test)
"use strict";

const assert = require("node:assert/strict");

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

  await test("5. Mühasibat Kalkulyatoru (1500 Net -> 1698.29 Gross & Məzuniyyət)", () => {
    const netRes = calc.kalkulyatorEmalEt("hesabla maas 1500 net");
    assert.equal(netRes.netice.net, 1500);
    assert.equal(netRes.netice.gross, 1698.29);
    assert.equal(netRes.netice.gelirVergisi, 0);

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
      gozlenilenMaddeler: ["102.1.30"],
      kritikMeqamlar: ["45 000 AZN-dək dövriyyəsi olan 13 xidmət sahəsində işçi sayı tələbi yoxdur (0 işçi ilə tətbiq edilir)"]
    });
    assert.strictEqual(sehvQiymet.ugurlu_mu, false, "3 işçi tələsi olan səhv cavab kəsilməlidir");
    assert.ok(sehvQiymet.cixarilmisDersler.length > 0, "Səhvdən avtomatik düzəliş dərsi çıxarılmalıdır");

    // 3) Düzgün həllin qiymətləndirilməsi
    const duzgunCavab = "Vergi Məcəlləsinin 102.1.30-cu maddəsinə əsasən 45 000 AZN-dək dövriyyəsi olan 13 fəaliyyət növündə işçi sayı tələbi yoxdur (0 işçi ilə tətbiq edilir) və 75% gəlir vergisi güzəşti tətbiq olunur.";
    const duzgunQiymet = simulator.helliQiymetlendir({
      cavab: duzgunCavab,
      gozlenilenMaddeler: ["102.1.30"],
      kritikMeqamlar: ["45 000 AZN-dək dövriyyəsi olan 13 xidmət sahəsində işçi sayı tələbi yoxdur (0 işçi ilə tətbiq edilir)"]
    });
    assert.strictEqual(duzgunQiymet.ugurlu_mu, true, "Düzgün həll uğurlu qeydə alınmalıdır");
    assert.ok(duzgunQiymet.bal >= 85, "Düzgün həllin balı 85%-dən yüksək olmalıdır");

    // 4) Baza saxlanışı və statistika yoxlanışı
    const simQeyd = db.simulyasiyaSaxla({
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

  console.log(`\n======================================================`);
  console.log(`📊 TEST NƏTİCƏSİ: ${kecen} keçdi, ${ugursuz} uğursuz`);
  console.log(`======================================================\n`);

  process.exit(ugursuz > 0 ? 1 : 0);
})();
