"use strict";

const { db } = require("./db");
const crypto = require("node:crypto");

function vergiYukle() {
// 1. Köhnə qeydləri təmizləyək
const kohneler = db.prepare("SELECT id FROM menbeler WHERE ad LIKE '%NLM%' OR ad LIKE '%Vergi Məcəlləsi%'").all();
for (const k of kohneler) {
  db.prepare("DELETE FROM parcalar WHERE menbe_id = ?").run(k.id);
  db.prepare("DELETE FROM menbeler WHERE id = ?").run(k.id);
}
console.log("Köhnə qeydlər təmizləndi.");

// 2. Rəsmi Vergi Məcəlləsi mətni
const senedMetni = `AZƏRBAYCAN RESPUBLİKASININ VERGİ MƏCƏLLƏSİ
(Kənd Təsərrüfatı İstehsalçıları üzrə Vergi Güzəştləri, Azadolmalar və Əsas Sanksiyalar)

BÖLMƏ 1. ƏSAS ANLAYIŞLAR VƏ EMAL FƏRQİ
Maddə 13.2.60. Kənd təsərrüfatı məhsullarının istehsalı:
Sənaye üsulu (o cümlədən xüsusi broyler təsərrüfatları, avtomatlaşdırılmış tövlə sistemləri və s.) daxil olmaqla, heyvanların və quşların yetişdirilməsi, bəslənməsi, diri şəkildə olarkən onlardan məhsulların (ilkin formada, yarımfabrikat kimi istifadə olunaraq yeni məhsula çevrilmədən, kimyəvi tərkibi dəyişdirilmədən, konservləşdirilmədən) əldə edilməsi, həmçinin bitkiçilik məhsullarının becərilməsi kənd təsərrüfatı məhsullarının istehsalı sayılır. Balıq kürüsü istisna olmaqla, diri balıqların yetişdirilməsi və tutulması da bu anlayışa daxildir.
Vacib Hüquqi Qeyd: Əgər kənd təsərrüfatı məhsulu sənaye emalına cəlb edilirsə (məsələn: süddən pendir, yağ istehsalı; meyvə-tərəvəzdən mürəbbə, kompot, tomat, şirə istehsalı; heyvanın kəsilərək ət məhsulları, kolbasa və konserv halına salınması), bu fəaliyyət kənd təsərrüfatı istehsalı yox, EMAL SƏNAYESİ hesab olunur və kənd təsərrüfatı üçün nəzərdə tutulan vergi azadolmaları ona şamil EDİLMİR!

BÖLMƏ 2. FİZİKİ ŞƏXSLƏRİN GƏLİR VERGİSİNDƏN AZAD EDİLMƏSİ
Maddə 102.1.11. Fiziki şəxslər üzrə gəlir vergisi azadolması:
Bilavasitə kənd təsərrüfatı məhsullarının istehsalından (o cümlədən sənaye üsulu ilə) alınan gəlirlər, bu fəaliyyət üzrə satışdankənar gəlirlər, habelə kənd təsərrüfatı məhsullarının istehsalı ilə əlaqədar dövlət büdcəsinin vəsaiti hesabına verilən subsidiyalar gəlir vergisindən azaddır (0% dərəcə).

BÖLMƏ 3. HÜQUQİ ŞƏXSLƏRİN MƏNFƏƏT VERGİSİNDƏN AZAD EDİLMƏSİ
Maddə 106.1.14. Hüquqi şəxslər üzrə mənfəət vergisi azadolması:
Kənd təsərrüfatı məhsullarının istehsalı ilə məşğul olan (o cümlədən sənaye üsulu ilə) hüquqi şəxslərin bu fəaliyyətdən əldə etdikləri mənfəət, həmin fəaliyyət üzrə satışdankənar gəlirləri və kənd təsərrüfatı məhsullarının istehsalı ilə əlaqədar dövlət büdcəsinin vəsaiti hesabına verilən subsidiyalar 2014-cü il yanvarın 1-dən 13 il müddətinə (2027-ci il yanvarın 1-dək) mənfəət vergisini ödəməkdən azaddırlar (0% mənfəət vergisi).

BÖLMƏ 4. ƏLAVƏ DƏYƏR VERGİSİ (ƏDV) GÜZƏŞTLƏRİ VƏ AZADOLMALAR
Maddə 164.1.18. Öz istehsalı olan kənd təsərrüfatı məhsullarının satışı:
Kənd təsərrüfatı məhsullarının istehsalçıları tərəfindən (həm fiziki şəxslər, həm də hüquqi şəxslər, o cümlədən sənaye broyler təsərrüfatları) özlərinin istehsal etdikləri kənd təsərrüfatı məhsullarının satışı üzrə dövriyyələr ƏDV-dən azaddır.
Maddə 164.1.20, 164.1.37, 164.1.38, 164.1.41. Təyinatlı vasitələrin idxalı və satışı:
Toxumların, tinglərin, mineral və üzvi gübrələrin, pestisidlərin, kənd təsərrüfatı texnikasının (traktor, kombayn və aqreqatların), müasir suvarma sistemlərinin və damazlıq heyvanların idxalı və satışı ƏDV-dən tam azaddır.

BÖLMƏ 5. ƏMLAK VERGİSİ AZADOLMASI
Maddə 199.3. İstehsal təyinatlı əsas vəsaitlər və tikililər:
Kənd təsərrüfatı məhsullarının istehsalı ilə məşğul olan şəxslər (hüquqi və fiziki şəxslər) bu fəaliyyətdə bilavasitə istifadə olunan əsas vəsaitlərinə (tövlələr, fermalar, istixanalar, anbarlar, emal edilməyən kənd təsərrüfatı qurğuları) görə əmlak vergisini ödəməkdən azaddırlar.

BÖLMƏ 6. TORPAQ VERGİSİ (ÖDƏNİLMƏLİ OLAN YEGANƏ VERGİ)
Maddə 206 və Maddə 207. Kənd təsərrüfatı təyinatlı torpaqların vergisi:
Kənd təsərrüfatı istehsalçıları digər vergilərdən (gəlir, mənfəət, ƏDV, əmlak) azad olunsalar da, TORPAQ VERGİSİNDƏN AZAD DEYİLLƏR!
Kənd təsərrüfatı təyinatlı torpaqlar üzrə vergi torpağın kadastr qiymət rayonu, təyinatı və bonitet balları əsasında 1 hektara görə hesablanır və yerli bələdiyyə büdcəsinə ödənilir. Əgər torpaqlar kənd təsərrüfatı təyinatı üzrə istifadə edilməzsə, torpaq vergisi bir neçə dəfə artırılmış dərəcə ilə tutulur.

BÖLMƏ 7. SADƏLƏŞDİRİLMİŞ VERGİ VƏ BƏYANNAMƏ REJİMİ
Maddə 218.4. Xüsusi vergi rejimi:
Kənd təsərrüfatı məhsullarının istehsalı ilə məşğul olan vergi ödəyiciləri bu fəaliyyət növü üzrə sadələşdirilmiş verginin ödəyicisi ola bilməzlər. Onlar kənd təsərrüfatı üzrə xüsusi qanuni azadolma rejiminə tabedirlər və dövlətə yalnız torpaq vergisi bəyannaməsi və ödənişini təqdim edirlər.

BÖLMƏ 8. ƏSAS VERGİ SANKSIYALARI VƏ ƏN BÖYÜK CƏRİMƏLƏR
Maddə 58.1. Vergilərin azaldılması və yayındırılması:
Hesabatlarda vergi məbləğinin azaldılmasına və ya vaxtında bəyan edilməməsinə görə azaldılmış vergi məbləğinin 50 faizi miqdarında maliyyə sanksiyası tətbiq olunur.
Maddə 58.7. Nağdsız hesablaşmalar qaydalarının pozulması:
Qanunla qadağan olunmuş nağd hesablaşmalara görə təqvim ili ərzində: birinci dəfə əməliyyat məbləğinin 10%-i, ikinci dəfə 20%-i, üç və daha çox təkrarlandıqda 40%-i miqdarında maliyyə sanksiyası tətbiq edilir.
Maddə 58.8. Əmtəəsiz və riskli əməliyyatlar (saxta qaimələr):
Saxta və sənədsiz əməliyyatlara görə vergi ödəyicisinə əməliyyat məbləğinin 100%-dək maliyyə sanksiyası və bank hesablarının dondurulması tətbiq olunur.
Maddə 58.9. Əmək müqaviləsi olmadan işçilərin işə cəlb edilməsi:
Əmək müqaviləsi bildirişi qüvvəyə minmədən işçilərin işə cəlb edilməsinə görə hər bir işçi üçün: birinci dəfə 2 000 AZN, ikinci dəfə 4 000 AZN, üç və daha çox təkrarlandıqda 6 000 AZN maliyyə sanksiyası tətbiq olunur.`;

const menbeId = "menbe-vergi-mecellesi";
const indi = Date.now();
const parcalar = [
  {
    id: "parca-vergi-13-anlayis",
    basliq: "Maddə 13.2.60. Kənd təsərrüfatı məhsullarının istehsalı anlayışı və Emal fərqi",
    metn: "Maddə 13.2.60: Sənaye üsulu (o cümlədən xüsusi broyler təsərrüfatları, avtomatlaşdırılmış tövlə sistemləri) daxil olmaqla, heyvanların və quşların yetişdirilməsi, bəslənməsi, diri şəkildə olarkən onlardan ilkin məhsulların əldə edilməsi və bitkiçilik məhsullarının becərilməsi kənd təsərrüfatı məhsullarının istehsalı sayılır. DİQQƏT: Kənd təsərrüfatı məhsulu sənaye emalına cəlb edildikdə (süddən pendir, yağ; meyvədən kompot, mürəbbə, şirə; heyvanın kəsilərək kolbasa və konserv halına gətirilməsi) bu artıq EMAL SƏNAYESİ sayılır və kənd təsərrüfatı güzəştləri ona şamil edilmir!"
  },
  {
    id: "parca-vergi-102-106-gelir-menfeet",
    basliq: "Maddə 102.1.11 və Maddə 106.1.14. Fiziki və Hüquqi şəxslərin Gəlir və Mənfəət vergisi azadolması",
    metn: "Maddə 102.1.11: Fiziki şəxslər tərəfindən bilavasitə kənd təsərrüfatı məhsullarının istehsalından alınan gəlirlər, bu fəaliyyət üzrə satışdankənar gəlirlər və dövlət subsidiyaları gəlir vergisindən azaddır (0%). Maddə 106.1.14: Hüquqi şəxslərin kənd təsərrüfatı məhsullarının istehsalından əldə etdikləri mənfəət, satışdankənar gəlirlər və dövlət subsidiyaları 2014-cü ildən 13 il müddətinə (2027-ci il yanvarın 1-dək) mənfəət vergisindən azaddır (0%)."
  },
  {
    id: "parca-vergi-164-edv",
    basliq: "Maddə 164.1.18, 164.1.20, 164.1.37. Əlavə Dəyər Vergisi (ƏDV) Azadolmaları",
    metn: "Maddə 164.1.18: Kənd təsərrüfatı məhsulları istehsalçılarının özlərinin istehsal etdikləri kənd təsərrüfatı məhsullarının satışı üzrə dövriyyələr ƏDV-dən tam azaddır. Maddə 164.1.20, 164.1.37, 164.1.41: Kənd təsərrüfatında istifadə olunan gübrələr, pestisidlər, toxumlar, tinglər, damazlıq heyvanlar, traktor və kənd təsərrüfatı texnikasının idxalı və satışı ƏDV-dən tam azaddır."
  },
  {
    id: "parca-vergi-199-207-emlak-torpaq",
    basliq: "Maddə 199.3, Maddə 206, Maddə 207 və 218. Əmlak, Torpaq və Sadələşdirilmiş Vergi",
    metn: "Maddə 199.3: Kənd təsərrüfatı istehsalında istifadə olunan əsas vəsaitlər (fermalar, anbarlar, tövlələr və qurğular) əmlak vergisindən azaddır. Maddə 206 və 207: Torpaq vergisi İSTİSNADIR — kənd təsərrüfatı istehsalçıları digər vergilərdən azad olsalar da, torpaq vergisini bələdiyyə büdcəsinə mütləq ödəməlidirlər (kadastr qiymət rayonu və bonitet balları üzrə). Maddə 218.4: Bu sahədə fəaliyyət göstərənlər sadələşdirilmiş vergi ödəyicisi ola bilməzlər."
  },
  {
    id: "parca-vergi-58-cerimeler",
    basliq: "Maddə 58. Əsas Vergi Sanksiyaları və Ən Böyük Cərimələr",
    metn: "Maddə 58.1: Verginin azaldılması və yayındırılmasına görə vergi fərqinin 50%-i miqdarında cərimə. Maddə 58.7: Nağdsız hesablaşma qaydalarının pozulması: il ərzində 1-ci dəfə 10%, 2-ci dəfə 20%, 3 və daha çox 40% maliyyə sanksiyası. Maddə 58.8: Əmtəəsiz/riskli əməliyyatlarda 100%-dək sanksiya. Maddə 58.9: Əmək müqaviləsi olmadan işçi işlətməyə görə hər işçi üçün: 1-ci dəfə 2000 AZN, 2-ci dəfə 4000 AZN, 3 və daha çox təkrarlandıqda 6000 AZN cərimə."
  }
];

db.prepare(`
  INSERT INTO menbeler (id, qovluq_id, ad, nov, olcu, xulase, meta, xam_metn, aktiv, yaradildi)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
`).run(
  menbeId,
  "qovluq-is",
  "Azərbaycan Respublikasının Vergi Məcəlləsi (Kənd Təsərrüfatı və Sanksiyalar)",
  "pdf",
  Buffer.byteLength(senedMetni, "utf8"),
  "Rəsmi Qanunvericilik • 5 Analitik Hissə • Kənd Təsərrüfatı Güzəştləri (Maddə 13, 102, 106, 164, 199, 207) və Əsas Cərimələr (Maddə 58)",
  JSON.stringify({
    setir_sayi: 55,
    pasport: {
      meblegler: ["2 000 manat", "4 000 manat", "6 000 manat", "50%", "10%", "20%", "40%", "100%"],
      tarixler: ["2014-cü il 1 yanvar", "2027-ci il 1 yanvar", "13 il müddətinə"],
      kodlar: ["Maddə 13.2.60", "Maddə 102.1.11", "Maddə 106.1.14", "Maddə 164.1.18", "Maddə 199.3", "Maddə 207", "Maddə 58"],
      tapsiriqlar: ["Torpaq vergisinin bələdiyyəyə ödənilməsi", "Emal məhsullarının ayrılması"]
    }
  }),
  senedMetni,
  indi
);

for (let i = 0; i < parcalar.length; i++) {
  const p = parcalar[i];
  db.prepare(`
    INSERT INTO parcalar (id, menbe_id, qovluq_id, sira, basliq, metn, gonderen, tarix, meta, vektor, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, 'AR Vergi Məcəlləsi', '2026', '{}', NULL, ?)
  `).run(
    p.id,
    menbeId,
    "qovluq-is",
    i + 1,
    p.basliq,
    p.metn,
    indi
  );
}

console.log("✅ Vergi Məcəlləsi sənədi və bütün maddələri uğurla bazaya yazıldı!");

}

module.exports = { vergiYukle };
if (require.main === module) { vergiYukle(); }
