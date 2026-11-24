// BeyinAI — Yaddaşın Özünü-Təmizləməsi və Konsolidasiyası (Memory Consolidation Engine)
// Təkrarlanan, köhnəlmiş və bir-biri ilə ziddiyyət təşkil edən yaddaş qeydlərini aşkarlayır,
// birləşdirir və yeniləri ilə əvəzləyir.
"use strict";

const db = require("./db");
const ai = require("./ai");

let sonAvtoVaxt = 0;

/**
 * İki mətn arasında kök-söz əsaslı Jaccard oxşarlığı hesablayır (0..1)
 */
function metnOxsarligi(metn1, metn2) {
  const k1 = new Set(db.sozKokleri(metn1 || "").map(x => x.normKok).filter(x => x.length >= 3));
  const k2 = new Set(db.sozKokleri(metn2 || "").map(x => x.normKok).filter(x => x.length >= 3));
  if (k1.size === 0 || k2.size === 0) return 0;

  let kesisme = 0;
  for (const w of k1) {
    if (k2.has(w)) kesisme++;
  }
  const birlesme = k1.size + k2.size - kesisme;
  return birlesme > 0 ? kesisme / birlesme : 0;
}

/**
 * 1-ci Mərhələ: Lokal sürətli dublikat təmizliyi (API çağırışı olmadan)
 */
function lokalDublikatlariTemizle() {
  const butun = db.yaddaslariAl(); // vaciblik DESC, yaradildi DESC
  // Ən yeni və yüksək vaciblikli qeydləri üstün tut
  const siralanmis = [...butun].sort((a, b) => (b.vaciblik - a.vaciblik) || (b.yaradildi - a.yaradildi));

  const saxlanilanlar = [];
  const silinenler = [];

  for (const q of siralanmis) {
    const qNorm = db.azNormallashdir(q.metn);
    let dublikatdir = false;

    for (const s of saxlanilanlar) {
      const sNorm = db.azNormallashdir(s.metn);
      if (qNorm === sNorm || (qNorm.length > 15 && sNorm.includes(qNorm)) || metnOxsarligi(q.metn, s.metn) >= 0.70) {
        dublikatdir = true;
        break;
      }
    }

    if (dublikatdir) {
      db.yaddasSil(q.id);
      silinenler.push(q);
    } else {
      saxlanilanlar.push(q);
    }
  }

  return { saxlanilanlar, silinenler };
}

/**
 * 2-ci Mərhələ: AI əsaslı dərin konsolidasiya (ziddiyyət aşkarlama və birləşdirmə)
 */
async function yaddasiKonsolidasiyaEt({ aiIstifadeEt = true } = {}) {
  const baslangicSay = db.yaddaslariAl().length;
  if (baslangicSay < 2) {
    return {
      ok: true,
      evvelSay: baslangicSay,
      sonraSay: baslangicSay,
      silinenSay: 0,
      birlesdirilenSay: 0,
      ziddiyyetler: [],
      hesabat: `🧠 Yaddaşda cəmi ${baslangicSay} qeyd var — təmizləməyə ehtiyac yoxdur.`
    };
  }

  // 1) Lokal dublikat təmizliyi
  const lokal = lokalDublikatlariTemizle();
  let silinenSay = lokal.silinenler.length;
  let birlesdirilenSay = 0;
  const ziddiyyetler = [];

  const qalanlar = db.yaddaslariAl();
  const tenz = db.tenzimlemeleriAl();

  // 2) AI Ziddiyyət və Birləşdirmə Analizi (4+ qeyd varsa)
  if (aiIstifadeEt && qalanlar.length >= 4 && (tenz.gemini_api_key || process.env.GEMINI_API_KEY || tenz.groq_api_key)) {
    const siyahi = qalanlar.map(q => {
      const tarix = new Date(q.yaradildi || Date.now()).toISOString().slice(0, 10);
      return `[ID: ${q.id}] (Tarix: ${tarix}, Vaciblik: ${q.vaciblik}, Kateqoriya: ${q.kateqoriya}): ${q.metn}`;
    }).join("\n");

    const sistemPromptu = `Sən AI Yaddaş Konsolidasiya Mühərrikisən.
Sənə istifadəçinin uzunmüddətli yaddaş qeydləri verilir.
Vəzifən:
1. Bir-birini təkrarlayan və ya eyni mövzunu parçalayan qeydləri birləşdir.
2. Əgər KÖHNƏ qeyd ilə YENİ qeyd arasında ziddiyyət varsa (məs: əvvəl 15% yazılıb, yeni tarixdə 10% deyilib), köhnə ziddiyyətli qeydi silinəcəklərə əlavə et və bunu "ziddiyyetler" siyahısında izah et.
3. Fərqli, unikal və vacib qaydaları QƏTİYYƏN silmə!

YALNIZ AŞAĞIDAKI JSON FORMATINDA CAVAB VER (başqa heç bir mətn yazma):
{
  "silinecek_idler": ["id1"],
  "birlesdirilecekler": [
    {
      "kohne_idler": ["id2", "id3"],
      "yeni_metn": "Birləşdirilmiş daha dəqiq qayda mətni",
      "kateqoriya": "qayda",
      "vaciblik": 5
    }
  ],
  "ziddiyyetler": ["Açıqlama (əgər varsa)"]
}`;

    try {
      const xam = await ai.llmCagir({
        sistemPromptu,
        istifadeciPromptu: `YADDAŞ QEYDLƏRİ:\n${siyahi}`,
        tenz,
        derinRejim: false
      });

      if (xam) {
        const jsonMatch = String(xam).match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const movcudIdSet = new Set(qalanlar.map(q => q.id));

          // Ziddiyyətli/köhnəlmiş qeydləri sil
          if (Array.isArray(parsed.silinecek_idler)) {
            for (const id of parsed.silinecek_idler) {
              if (movcudIdSet.has(id)) {
                db.yaddasSil(id);
                movcudIdSet.delete(id);
                silinenSay++;
              }
            }
          }

          // Birləşdirmələri icra et
          if (Array.isArray(parsed.birlesdirilecekler)) {
            for (const b of parsed.birlesdirilecekler) {
              const kecerliKohne = (b.kohne_idler || []).filter(id => movcudIdSet.has(id));
              if (kecerliKohne.length >= 2 && b.yeni_metn && String(b.yeni_metn).trim().length >= 8) {
                for (const id of kecerliKohne) {
                  db.yaddasSil(id);
                  movcudIdSet.delete(id);
                }
                db.yaddasElaveEt({
                  kateqoriya: b.kateqoriya || "qayda",
                  metn: String(b.yeni_metn).trim(),
                  menbe: "Yaddaş Konsolidasiyası",
                  vaciblik: Math.min(5, Math.max(3, Number(b.vaciblik) || 5))
                });
                birlesdirilenSay++;
              }
            }
          }

          if (Array.isArray(parsed.ziddiyyetler)) {
            for (const z of parsed.ziddiyyetler) {
              if (z && String(z).trim()) ziddiyyetler.push(String(z).trim());
            }
          }
        }
      }
    } catch (_) {
      // AI əlçatan deyilsə, lokal təmizlik nəticəsi ilə davam et
    }
  }

  const sonraSay = db.yaddaslariAl().length;
  sonAvtoVaxt = Date.now();

  let hesabat =
    `🧬 <b>Yaddaşın Özünü-Təmizləməsi Tamamlandı!</b>\n\n` +
    `• 📊 <b>Əvvəlki qeyd sayı:</b> ${baslangicSay}\n` +
    `• ✅ <b>Təmizlənmədən sonra:</b> ${sonraSay}\n` +
    `• 🗑️ <b>Silinən dublikat/köhnə qeyd:</b> ${silinenSay}\n` +
    `• 🔗 <b>Birləşdirilən qayda qrupu:</b> ${birlesdirilenSay}`;

  if (ziddiyyetler.length > 0) {
    hesabat += `\n\n⚖️ <b>Həll Edilən Ziddiyyətlər:</b>\n` + ziddiyyetler.map(z => `  • ${z}`).join("\n");
  } else if (silinenSay === 0 && birlesdirilenSay === 0) {
    hesabat += `\n\n✨ <i>Bütün yaddaş qeydləriniz təmizdir, dublikat və ya ziddiyyət aşkarlanmadı.</i>`;
  }

  return {
    ok: true,
    evvelSay: baslangicSay,
    sonraSay,
    silinenSay,
    birlesdirilenSay,
    ziddiyyetler,
    hesabat
  };
}

/**
 * Arxa planda avtomatik konsolidasiya yoxlanışı (yaddaş şişdikdə özü işə düşür)
 */
function avtoKonsolidasiyaYoxla() {
  const indi = Date.now();
  const say = db.yaddaslariAl().length;
  // 15+ qeyd olduqda və son 12 saatda təmizlənməyibsə arxa planda işə sal
  if (say >= 15 && indi - sonAvtoVaxt > 12 * 60 * 60 * 1000) {
    sonAvtoVaxt = indi;
    yaddasiKonsolidasiyaEt({ aiIstifadeEt: true }).catch(() => {});
  }
}

module.exports = {
  metnOxsarligi,
  lokalDublikatlariTemizle,
  yaddasiKonsolidasiyaEt,
  avtoKonsolidasiyaYoxla
};
