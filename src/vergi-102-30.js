const { db } = require("./db");
const crypto = require("node:crypto");

const chunkId = "parca-vergi-102-1-30-45000";
const basliq = "Maddə 102.1.30. 45 000 AZN-dək dövriyyəsi olan fərdi sahibkarlar üzrə 75% vergi güzəşti və 13 fəaliyyət sahəsi";
const metn = `Maddə 102.1.30. Fərdi mikro sahibkarlar üçün 45 000 manatlıq xüsusi vergi azadolması:
Təqvim ili ərzində xərclər nəzərə alınmadan əldə etdiyi gəlirlərinin həcmi 45 000 manatadək olan fiziki şəxslərin (fərdi sahibkarların) müəyyən edilmiş xidmət sahələrindən əldə etdikləri gəlirlərinin 75 faizi gəlir vergisindən azaddır.

BU GÜZƏŞTİN ƏSAS ŞƏRTLƏRİ:
1. Şəxs: Yalnız fərdi sahibkar (fiziki şəxs) kimi qeydiyyatda olan mikro sahibkar olmalıdır.
2. Dövriyyə: İllik gəlir (xərclər çıxılmadan) maksimum 45 000 manat olmalıdır.
3. İşçi tələbi: İŞÇİ SAYI TƏLƏBİ YOXDUR (sahibkar təkbaşına, 0 muzdlu işçi ilə çalışa bilər; 3 işçi saxlamaq məcburiyyəti yoxdur).
4. Müəyyən edilmiş konkret 13 xidmət sahəsi:
   1) Proqram təminatının işlənməsi və proqramlaşdırma sahəsində xidmətlər (IT, developer, proqramçılar);
   2) Layihə-dizayn və dekorasiya xidmətləri;
   3) Tərcümə xidməti;
   4) Reklam xidməti;
   5) Araşdırma və elmi tədqiqat sahəsində fəaliyyət;
   6) Elm, təhsil, mədəniyyət və idman sahəsində göstərilən xidmətlər (müəllimlər, repetitorlar, məşqçilər);
   7) Hüquq, sərbəst auditor, mühasibat və maliyyə sahəsi üzrə məsləhət xidmətləri;
   8) Jurnalistlərin fəaliyyəti;
   9) Bazar konyunkturunun öyrənilməsi (marketinq araşdırmaları);
   10) Qiymətləndirmə fəaliyyəti;
   11) Kuryer fəaliyyəti və sifarişlərin çatdırılması (avtonəqliyyatla yükdaşımalar istisna olmaqla);
   12) Turizm bələdçiliyi (bələdçilər və tur rəhbərləri);
   13) Xidmətlərin ixracı (ölkə xaricinə göstərilən xidmətlər).

MƏHDUDİYYƏTLƏR VƏ İSTİSNALAR:
- Əvvəlki işəgötürən faktoru: Əgər şəxs əmək müqaviləsinə xitam verdikdən sonra 1 il ərzində əvvəlki işəgötürəninə xidmət göstərərsə, bu güzəşt tətbiq edilmir.
- Digər fəaliyyətlə qarışıq olduqda: Yuxarıdakı 13 sahədən əldə olunan gəlir ümumi gəlirin ən azı 50 faizini təşkil etməlidir.`;

// Parçanı bazaya yazaq və ya yeniləyək
db.prepare("DELETE FROM parcalar WHERE id = ?").run(chunkId);
db.prepare(`
  INSERT INTO parcalar (id, menbe_id, qovluq_id, sira, basliq, metn, gonderen, tarix, meta, vektor, yaradildi)
  VALUES (?, 'menbe-vergi-mecellesi', 'qovluq-is', 6, ?, ?, 'AR Vergi Məcəlləsi', '2026', '{}', NULL, ?)
`).run(chunkId, basliq, metn, Date.now());

console.log("✅ Maddə 102.1.30 (45 000 AZN və 13 sahə) bazaya daxil edildi!");
