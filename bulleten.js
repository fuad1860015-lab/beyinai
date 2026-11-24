// BeyinAI — Həftəlik Mühasibat və Vergi Təcrübəsi Bülleteni (Weekly Digest)
// Toplanmış real qrup müzakirələrindən və təcrübə bankından ən vacib keysləri seçib xülasələşdirir
"use strict";

const db = require("./db");
const ai = require("./ai");

async function heftelikBulletenHazirla() {
  // 1. Bazadan qrup təcrübələri və çat parçalarını al
  let parcalar = [];
  try {
    parcalar = db.db.prepare(`
      SELECT p.id, p.basliq, p.metn, p.gonderen, p.tarix, p.meta
      FROM parcalar p
      WHERE p.qovluq_id = 'qovluq-praktika' OR p.qovluq_id = 'qovluq-cat'
      ORDER BY p.id DESC
      LIMIT 25
    `).all();
  } catch (_) {
    parcalar = [];
  }

  const tenz = db.tenzimlemeleriAl();

  // Əgər bazada qrup keysləri varsa, onları AI ilə təhlil et
  if (parcalar && parcalar.length > 0) {
    const keysMetni = parcalar.map((p, idx) => {
      return `--- KEYS #${idx + 1} (${p.tarix || "Tarix yoxdur"}) ---\nMüəllif/Qrup: ${p.gonderen || "Mühasib"}\nMəzmun: ${p.metn.slice(0, 500)}`;
    }).join("\n\n");

    const sistemPromptu = `Sən Azərbaycanın baş vergi, mühasibatlıq və kadr auditorusan.
Sənə mühasiblərin Telegram və WhatsApp qruplarındakı canlı təcrübələri, çətinlikləri və həll yolları verilir.
Sənin vəzifən bu materiallar əsasında yüksək səviyyəli "📰 HƏFTƏLİK MÜHASİBAT VƏ VERGİ TƏCRÜBƏ BÜLLETENİ" hazırlamaqdır.

TƏLƏB OLUNAN FORMAT:
📰 <b>HƏFTƏLİK MÜHASİBAT VƏ VERGİ TƏCRÜBƏSİ BÜLLETENİ</b>
<i>(Qrup və kanallardan süzülmüş ən vacib canlı keyslər)</i>

Hər bir seçilmiş keys üçün:
🔹 <b>Keys #[№]: [Qısa və konkret mövzu]</b>
• <b>📌 Problem:</b> Mühasibin qarşılaşdığı çətinlik və ya sual.
• <b>⚖️ Qanun & Portal Reallığı:</b> Məcəllənin maddəsi və ya e-taxes/e-gov portalının davranışı.
• <b>💡 Praktiki Həll:</b> Digər təcrübəli həmkarların tapdığı real çıxış yolu.

Sonda:
🎯 <b>Həftənin Əsas Mühasibat Qaydası:</b> Mühasiblərə səhv etməmək üçün 1-2 cümləlik qızıl məsləhət.

Qeyd: Dili çox peşəkar, aydın, Azərbaycan dilində və Telegram üçün səliqəli HTML formatında yaz.`;

    try {
      const cavab = await ai.llmCagir({
        sistemPromptu,
        istifadeciPromptu: `BU HƏFTƏNİN TOPLANMIŞ QRUP KEYSLƏRİ:\n\n${keysMetni}\n\nZəhmət olmasa yuxarıdakı formatda həftəlik bülleteni hazırla.`,
        tenz
      });

      return cavab.metn || cavab;
    } catch (_) {
      // Fallback
    }
  }

  // Əgər bazada hələ kifayət qədər qrup keysi yoxdursa, aktual qanunvericilik və praktiki bülleten qaytar
  return (
    `📰 <b>HƏFTƏLİK MÜHASİBAT VƏ VERGİ TƏCRÜBƏSİ BÜLLETENİ</b>\n` +
    `<i>(Praktiki Təcrübə Bankı İcmalı)</i>\n\n` +
    `🔹 <b>Keys #1: e-Taxes Portalında Düzəliş Qaimələri və ƏDV Depoziti</b>\n` +
    `• <b>📌 Problem:</b> Düzəliş qaiməsi təsdiqlənərkən ƏDV depozit hesabında bloklanma yaranması.\n` +
    `• <b>⚖️ Qanun & Portal:</b> ƏDV Məcəlləsinin 175-ci maddəsinə görə depozit ödənişi təsdiqlənmədən əvəzləşdirmə qüvvəyə minmir.\n` +
    `• <b>💡 Praktiki Həll:</b> Əvvəlcə əsas məbləğ üzrə qaimə təsdiqlənməli, dərhal sonra ƏDV depozitindən artıq ödənilmiş məbləğin geri qaytarılması və ya növbəti dövrə keçirilməsi üçün sistemdə ərizə göndərilməlidir.\n\n` +
    `🔹 <b>Keys #2: Qeyri-neft Özəl Sektorunda 8000 AZN Güzəşti və Son Dövriyyə Hədləri</b>\n` +
    `• <b>📌 Problem:</b> Şirkətin dövriyyəsi və ya fəaliyyət növü dəyişdikdə işçilərin gəlir vergisi güzəştinin itirilməsi qorxusu.\n` +
    `• <b>⚖️ Qanun:</b> Vergi Məcəlləsinin 101.1-1 maddəsi üzrə 8000 AZN-dək gəlir vergisi 0% təşkil edir, yalnız DSMF, İşsizlik və İTS tutulur.\n` +
    `• <b>💡 Praktiki Həll:</b> İqtisadi fəaliyyət kodunun (NACE) portalda düzgün seçilməsi və xidmət müqaviləsi ilə əmək müqaviləsinin fərqləndirilməsi kameral bildiriş riskini 90% azaldır.\n\n` +
    `🔹 <b>Keys #3: Nağdsız Hesablaşmalar Qanunu və POS-terminal Limitləri</b>\n` +
    `• <b>📌 Problem:</b> Aylıq 15 000 / 30 000 AZN nağdlaşdırma və nağd əməliyyat hədlərinin aşılması.\n` +
    `• <b>💡 Praktiki Həll:</b> Təhtəlhesab şəxslərə verilən vəsaitlərin 5 bank günü ərzində avans hesabatı ilə bağlanması və POS qəbzlərinin fiskal çeklərlə arxivlənməsi yoxlamalarda ən etibarlı qalxandır.\n\n` +
    `🎯 <b>Həftənin Qızıl Qaydası:</b>\n` +
    `<i>"Hər bir əməliyyat yalnız bank çıxarışı ilə deyil, mütləq təsdiqlənmiş elektron qaimə və qarşılıqlı üzləşmə aktı ilə sənədləşdirilməlidir."</i>\n\n` +
    `💡 <i>Qruplardan maraqlı müzakirələri bota "Forward" etdikcə, növbəti həftəlik bülletenlər birbaşa sizin topladığınız real keyslərdən tərtib olunacaq!</i>`
  );
}

module.exports = {
  heftelikBulletenHazirla
};
