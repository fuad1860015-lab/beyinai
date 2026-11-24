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

  console.log(`\n======================================================`);
  console.log(`📊 TEST NƏTİCƏSİ: ${kecen} keçdi, ${ugursuz} uğursuz`);
  console.log(`======================================================\n`);

  process.exit(ugursuz > 0 ? 1 : 0);
})();
