const { db } = require("./db");

const chunkId = "parca-pos-terminal-qaydasi-219";
const basliq = "Nazirlər Kabinetinin 219 nömrəli Qərarı. POS-terminalların quraşdırılması məcburi olan obyektlər və 2 000 AZN həddi";
const metn = `AZƏRBAYCAN RESPUBLİKASI NAZİRLƏR KABİNETİNİN 219 NÖMRƏLİ QƏRARI
(“Azərbaycan Respublikasının ərazisində POS-terminalların quraşdırılması məcburi olan obyektlərin müəyyən edilməsi barədə”)

POS-TERMİNAL QURAŞDIRILMASI MƏCBURİ OLAN SAHƏLƏR VƏ HƏDLƏR:

1. DÖVRİYYƏSİNDƏN ASILI OLMAYARAQ POS-TERMİNAL MƏCBURİ OLANLAR:
- Əlavə dəyər vergisi (ƏDV) ödəyicisi olan bütün təsərrüfat subyektləri;
- Dərman vasitələrinin pərakəndə satışı (bütün apteklər);
- Yanacaqdoldurma və qazdoldurma məntəqələri;
- Şadlıq sarayları, restoranlar və mehmanxanalar (otellər);
- Avtomobil satışı mərkəzləri və avtosalonlar.

2. DÖVRİYYƏ HƏDDİNƏ ƏSASƏN MƏCBURİ OLANLAR (2 000 AZN QAYDASI):
- ƏDV ödəyicisi olmayan (məsələn: sadələşdirilmiş vergi və ya gəlir vergisi ödəyicisi olan) pərakəndə ticarət, ictimai iaşə və məişət xidməti obyektlərində:
  RÜB ƏRZİNDƏ ORTA AYLİQ DÖVRİYYƏ 2 000 MANATDAN ARTIQ OLDUQDA POS-terminalın quraşdırılması və nağdsız ödənişlərin qəbulu MƏCBURİDİR!
  (Orta aylıq dövriyyə = Rüb ərzindəki ümumi dövriyyə / 3).

3. İSTİSNALAR (KİMLƏRƏ POS-TERMİNAL MƏCBURİ DEYİL):
- Rüblük orta aylıq dövriyyəsi 2 000 manatdan az olan qeyri-ƏDV ödəyiciləri;
- Qəzet və jurnalların pərakəndə satışı köşkləri;
- Səyyar və mövsümi ticarət aparanlar;
- Kənd təsərrüfatı bazarlarında fərdi piştaxtalarda kənd təsərrüfatı məhsulları satan fiziki şəxslər.

MƏSULİYYƏT VƏ CƏRİMƏLƏR (Vergi Məcəlləsi, Maddə 58.7):
POS-terminalın quraşdırılmamasına və ya nağdsız ödənişdən imtina edilməsinə görə təqvim ili ərzində:
- 1-ci dəfə: 1 000 AZN;
- 2-ci dəfə: 3 000 AZN;
- 3 və daha çox dəfə: 6 000 AZN maliyyə sanksiyası tətbiq olunur.`;

db.prepare("DELETE FROM parcalar WHERE id = ?").run(chunkId);
db.prepare(`
  INSERT INTO parcalar (id, menbe_id, qovluq_id, sira, basliq, metn, gonderen, tarix, meta, vektor, yaradildi)
  VALUES (?, 'menbe-vergi-mecellesi', 'qovluq-is', 7, ?, ?, 'AR Nazirlər Kabineti', '2026', '{}', NULL, ?)
`).run(chunkId, basliq, metn, Date.now());

console.log("✅ POS-terminal qaydası (NK 219 və 2000 AZN həddi) bazaya daxil edildi!");
