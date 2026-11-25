// BeyinAI — Rəsmi Maaş, Məzuniyyət və Son Haqq-Hesab Hesabat Generatoru (Payroll & Settlement Engine)
// AR Əmək Məcəlləsi (Maddə 140, 144, 172) və Vergi Məcəlləsi (Maddə 101.1-1) standartlarına tam uyğundur.
"use strict";

const calc = require("./calculator");

/**
 * İş stajı aylarını və qazanılmış məzuniyyət günlərini hesablayır
 * Əmək Məcəlləsi Maddə 144: İş ili dövründə 15 təqvim günündən çox olan müddət tam aya yuvarlaqlaşdırılır.
 */
function stajVeMezuniyyetGunleriHesabla({
  iseQebulTarixi,
  isdenCixmaTarixi = new Date(),
  illikMezuniyyetGun = 21,
  istifadeEdilmisGun = 0
}) {
  const basla = new Date(iseQebulTarixi);
  const bitir = new Date(isdenCixmaTarixi);
  if (isNaN(basla.getTime()) || isNaN(bitir.getTime())) {
    return {
      stajAylari: 12,
      qazanilmisGun: illikMezuniyyetGun,
      qaliqGun: Math.max(0, illikMezuniyyetGun - istifadeEdilmisGun)
    };
  }

  let ilFerqi = bitir.getFullYear() - basla.getFullYear();
  let ayFerqi = bitir.getMonth() - basla.getMonth();
  let gunFerqi = bitir.getDate() - basla.getDate();

  if (gunFerqi < 0) {
    ayFerqi -= 1;
    gunFerqi += 30;
  }
  if (ayFerqi < 0) {
    ilFerqi -= 1;
    ayFerqi += 12;
  }

  let cemiAylar = (ilFerqi * 12) + ayFerqi;
  // 15 gündən çoxdursa tam ay sayılır
  if (gunFerqi >= 15) {
    cemiAylar += 1;
  }
  cemiAylar = Math.max(1, cemiAylar);

  // Hər aya düşən gün norması: illikMezuniyyetGun / 12
  const ayBasiNorma = illikMezuniyyetGun / 12;
  const qazanilmisGun = Number((cemiAylar * ayBasiNorma).toFixed(2));
  const qaliqGun = Math.max(0, Number((qazanilmisGun - istifadeEdilmisGun).toFixed(2)));

  return {
    stajAylari: cemiAylar,
    stajIli: ilFerqi,
    stajQaliqAyi: ayFerqi,
    stajQaliqGunu: gunFerqi,
    illikMezuniyyetGun,
    istifadeEdilmisGun,
    qazanilmisGun,
    qaliqGun
  };
}

/**
 * Ətraflı Son Haqq-Hesab və Maaş Cədvəli Qurur
 */
function sonHaqqHesabHesabatiQur({
  isciAd = "Mütəxəssis",
  vezife = "Əməkdaş",
  sektor = "ozel", // "ozel" (qeyri-neft/qeyri-dövlət) və ya "dovlet"
  maas = 1000,
  maasTipi = "gross", // "gross" və ya "net"
  iseQebulTarixi = "",
  isdenCixmaTarixi = "",
  ayIsGunleri = 22,
  islenmisIsGunleri = 22,
  illikMezuniyyetGun = 21,
  istifadeEdilmisGun = 0
}) {
  let grossAyliq = 0;
  if (maasTipi === "net") {
    const netG = sektor === "dovlet"
      ? calc.maasNetdenGrossaDovlet(maas)
      : calc.maasNetdenGrossaOzel(maas);
    grossAyliq = netG.gross;
  } else {
    grossAyliq = Number(maas) || 0;
  }

  // 1) Cari ay üzrə işlənmiş günlərə mütənasib əməkhaqqı
  const nisbet = ayIsGunleri > 0 ? Math.min(1, Math.max(0, islenmisIsGunleri / ayIsGunleri)) : 1;
  const cariAyGrossMaas = Number((grossAyliq * nisbet).toFixed(2));

  // 2) Staj və istifadə edilməmiş məzuniyyət günləri
  const staj = stajVeMezuniyyetGunleriHesabla({
    iseQebulTarixi: iseQebulTarixi || new Date(Date.now() - 365 * 24 * 3600 * 1000),
    isdenCixmaTarixi: isdenCixmaTarixi || new Date(),
    illikMezuniyyetGun,
    istifadeEdilmisGun
  });

  // 3) İstifadə edilməmiş məzuniyyət kompensasiyası (Maddə 140 / 144: grossAyliq / 30.4 * qaliqGun)
  const gunlukOrtaQazanc = Number((grossAyliq / 30.4).toFixed(2));
  const kompensasiyaGross = Number((gunlukOrtaQazanc * staj.qaliqGun).toFixed(2));

  // 4) Cəmi hesablanmış Gross məbləğ
  const yekunCemiGross = Number((cariAyGrossMaas + kompensasiyaGross).toFixed(2));

  // 5) Vergi və fond tutulmaları
  const tutulmaNetice = sektor === "dovlet"
    ? calc.maasGrossdanNeteDovlet(yekunCemiGross)
    : calc.maasGrossdanNeteOzel(yekunCemiGross);

  // Ayrı-ayrı hissələrin tutulmalarını da mütənasib çıxaraq
  const cariAyNet = sektor === "dovlet"
    ? calc.maasGrossdanNeteDovlet(cariAyGrossMaas).net
    : calc.maasGrossdanNeteOzel(cariAyGrossMaas).net;

  const kompensasiyaNet = Number((tutulmaNetice.net - cariAyNet).toFixed(2));

  // Formal Rəsmi Hesabat Mətni (Markdown)
  const markdownHesabat = `
### 📑 RƏSMİ SON HAQQ-HESAB VƏ ƏMƏKHAQQI ÇIXARIŞI
**İşçi:** ${isciAd} | **Vəzifə:** ${vezife}  
**Sektor:** ${sektor === "ozel" ? "Qeyri-dövlət / Qeyri-neft (Güzəştli rejim)" : "Dövlət / Neft-qaz"}  
**Tarix Aralığı:** ${iseQebulTarixi || "—"} ➔ ${isdenCixmaTarixi || "Cari dövr"} (${staj.stajAylari} ay staj)

---

#### 1. Hesablanmış Məbləğlər (Gross):
| Təyinat | Hesablama Qaydası | Məbləğ (AZN) |
| :--- | :--- | :--- |
| **Cari ayın əməkhaqqı** | ${grossAyliq} AZN × (${islenmisIsGunleri}/${ayIsGunleri} iş günü) | **${cariAyGrossMaas} AZN** |
| **İstifadə edilməmiş məzuniyyət kompensasiyası** | ${gunlukOrtaQazanc} AZN/gün × ${staj.qaliqGun} gün (Maddə 144) | **${kompensasiyaGross} AZN** |
| **CƏMİ HESABLANMIŞ (GROSS):** | Maddə 140, 144, 172 | **${yekunCemiGross} AZN** |

#### 2. İşçidən Tutulan Məcburi Ödənişlər:
- **Gəlir Vergisi (Maddə 101.1-1):** ${tutulmaNetice.gelirVergisi} AZN
- **DSMF Sığorta Haqqı (3% / 10%):** ${tutulmaNetice.dsmfIsci} AZN
- **İşsizlikdən Sığorta Haqqı (0.5%):** ${tutulmaNetice.issizlikIsci} AZN
- **İcbari Tibbi Sığorta (İTS - 2%):** ${tutulmaNetice.itsIsci} AZN
- **CƏMİ İŞÇİ TUTULMALARI:** **${tutulmaNetice.cemiIsciTutulma} AZN**

---

### 💵 ƏLƏ VERİLƏCƏK YEKUN MƏBLƏĞ (NET):
# **${tutulmaNetice.net} AZN**
*(O cümlədən: cari ay maaşı Net: ${cariAyNet} AZN, Məzuniyyət kompensasiyası Net: ${kompensasiyaNet} AZN)*

---

#### 3. İşəgötürənin Məcburi Xərcləri (Şirkət Büdcəsi):
- **İşəgötürən DSMF:** ${tutulmaNetice.dsmfIsegoturen} AZN
- **İşəgötürən İşsizlik (0.5%):** ${tutulmaNetice.issizlikIsegoturen} AZN
- **İşəgötürən İTS (2%):** ${tutulmaNetice.itsIsegoturen} AZN
- **Şirkətin Ümumi Xərci:** **${tutulmaNetice.umumiXerc} AZN**

*(Qanuni Müddət: Əmək Məcəlləsinin 172-ci maddəsinə əsasən son haqq-hesab işçinin sonuncu iş günündən gec olmayaraq tam ödənilməlidir).*
`.trim();

  // Çap / PDF üçün Səliqəli HTML Şablonu
  const htmlCixarisi = `
<!DOCTYPE html>
<html lang="az">
<head>
  <meta charset="utf-8">
  <title>Son Haqq-Hesab Çıxarışı — ${isciAd}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; line-height: 1.5; }
    .basliq { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px; }
    .basliq h2 { margin: 0; font-size: 20px; }
    .rekvizit { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 16px; background: #f8fafc; padding: 10px 14px; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
    .yekun-qutu { background: #ecfdf5; border: 1.5px solid #10b981; padding: 14px; border-radius: 8px; text-align: center; margin-bottom: 16px; }
    .yekun-net { font-size: 24px; font-weight: bold; color: #047857; margin-top: 4px; }
    .qeyd { font-size: 11.5px; color: #64748b; margin-top: 12px; }
    @media print { body { padding: 0; } .yekun-qutu { border-color: #000; } }
  </style>
</head>
<body>
  <div class="basliq">
    <h2>SON HAQQ-HESAB VƏ ƏMƏKHAQQI HESABAT VƏRƏQƏSİ</h2>
    <div style="font-size:12px; color:#64748b; margin-top:4px;">Azərbaycan Respublikasının Əmək və Vergi Qanunvericiliyinə uyğun çıxarış</div>
  </div>
  <div class="rekvizit">
    <div><strong>İşçi:</strong> ${isciAd} (${vezife})</div>
    <div><strong>Dövr:</strong> ${iseQebulTarixi || "—"} — ${isdenCixmaTarixi || "Cari"}</div>
    <div><strong>Staj:</strong> ${staj.stajAylari} ay</div>
  </div>
  <table>
    <tr><th>Təyinat</th><th>Hesablama Şərtləri</th><th>Məbləğ (AZN)</th></tr>
    <tr><td>Cari ayın əməkhaqqı</td><td>${islenmisIsGunleri}/${ayIsGunleri} iş günü</td><td>${cariAyGrossMaas} AZN</td></tr>
    <tr><td>İstifadə edilməmiş məzuniyyət</td><td>${gunlukOrtaQazanc} AZN × ${staj.qaliqGun} gün (Maddə 144)</td><td>${kompensasiyaGross} AZN</td></tr>
    <tr style="font-weight:bold; background:#f8fafc;"><td>CƏMİ GROSS</td><td>Maddə 140, 144</td><td>${yekunCemiGross} AZN</td></tr>
  </table>
  <table>
    <tr><th>İşçidən Tutulmalar</th><th>Dərəcə</th><th>Məbləğ (AZN)</th></tr>
    <tr><td>Gəlir Vergisi</td><td>Maddə 101.1-1 (0% / 14%)</td><td>${tutulmaNetice.gelirVergisi} AZN</td></tr>
    <tr><td>DSMF (Sosial Sığorta)</td><td>3% / 10%</td><td>${tutulmaNetice.dsmfIsci} AZN</td></tr>
    <tr><td>İşsizlikdən Sığorta</td><td>0.5%</td><td>${tutulmaNetice.issizlikIsci} AZN</td></tr>
    <tr><td>İcbari Tibbi Sığorta (İTS)</td><td>2%</td><td>${tutulmaNetice.itsIsci} AZN</td></tr>
    <tr style="font-weight:bold; background:#f8fafc;"><td>CƏMİ TUTULMALAR</td><td></td><td>${tutulmaNetice.cemiIsciTutulma} AZN</td></tr>
  </table>
  <div class="yekun-qutu">
    <div style="font-size:13px; font-weight:600; text-transform:uppercase;">Ödəniləcək Yekun Məbləğ (Net Ödəniş):</div>
    <div class="yekun-net">${tutulmaNetice.net} AZN</div>
  </div>
  <div class="qeyd">
    * Əmək Məcəlləsinin 172-ci maddəsinə əsasən, işçi ilə son haqq-hesab onun işdən çıxdığı sonuncu iş günündən gec olmayaraq tam ödənilməlidir.
  </div>
</body>
</html>
`.trim();

  return {
    isciAd,
    vezife,
    sektor,
    grossAyliq,
    cariAyGrossMaas,
    kompensasiyaGross,
    yekunCemiGross,
    gunlukOrtaQazanc,
    staj,
    tutulma: tutulmaNetice,
    netYekun: tutulmaNetice.net,
    cariAyNet,
    kompensasiyaNet,
    markdownHesabat,
    htmlCixarisi
  };
}

module.exports = {
  stajVeMezuniyyetGunleriHesabla,
  sonHaqqHesabHesabatiQur
};
