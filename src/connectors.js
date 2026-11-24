// Canlı Telegram və WhatsApp İnteqrasiya Modulu
// 1) Telegram Bot / Forward Qəbuledicisi (Long-Polling — heç bir xarici kitabxana olmadan)
//    Bota yönləndirilən (forward) mesajlar, səsli qeydlər (voice), şəkillər və sənədlər avtomatik bazaya düşür.
// 2) WhatsApp Web Canlı Körpü (Bookmarklet / Web-Sync və API qəbuledicisi)
"use strict";

const db = require("./db");
const ai = require("./ai");
const parsers = require("./parsers");

let tgVeziyyet = {
  aktiv: false,
  botAdi: "",
  botIstifadeciAdi: "",
  sonUpdateId: 0,
  qebulEdilenSay: 0,
  sonMesajTarixi: null,
  xeta: null
};

let tgTimer = null;
let tgGedir = false;

async function tgFaylEndir(token, fileId) {
  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, {
    signal: AbortSignal.timeout(15000)
  });
  const info = await infoRes.json();
  if (!info.ok || !info.result?.file_path) {
    throw new Error("Telegram fayl yolu alına bilmədi.");
  }
  const fileUrl = `https://api.telegram.org/file/bot${token}/${info.result.file_path}`;
  const dataRes = await fetch(fileUrl, { signal: AbortSignal.timeout(30000) });
  if (!dataRes.ok) throw new Error("Telegram faylı endirilə bilmədi.");
  const arrBuf = await dataRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrBuf),
    faylYolu: info.result.file_path
  };
}

const crypto = require("node:crypto");

const tgDetalliYaddas = new Map();
setInterval(() => {
  const indi = Date.now();
  for (const [k, v] of tgDetalliYaddas.entries()) {
    if (indi - v.vaxt > 2 * 60 * 60 * 1000) tgDetalliYaddas.delete(k);
  }
}, 30 * 60 * 1000).unref();

function telegramCavabiFormatla(xamMetn, sitatlar = []) {
  if (!xamMetn) return { qisa: "", genis: null, suallar: [] };

  let metn = String(xamMetn);

  // 1. Detallı Analiz blokunu çıxar
  let genisMetn = "";
  const detalMatch = metn.match(/<DETALLI_ANALIZ>([\s\S]*?)<\/DETALLI_ANALIZ>/i);
  if (detalMatch) {
    genisMetn = detalMatch[1].trim();
    metn = metn.replace(/<DETALLI_ANALIZ>[\s\S]*?<\/DETALLI_ANALIZ>/i, "").trim();
  }

  // 2. Növbəti Suallar blokunu çıxar
  const novbetiSuallar = [];
  const sualMatch = metn.match(/<NOVBETI_SUALLAR>([\s\S]*?)<\/NOVBETI_SUALLAR>/i);
  if (sualMatch) {
    const lines = sualMatch[1].split("\n");
    lines.forEach(l => {
      const t = l.replace(/^[-*•\d.)\s]+/, "").trim();
      if (t && t.length > 5) novbetiSuallar.push(t);
    });
    metn = metn.replace(/<NOVBETI_SUALLAR>[\s\S]*?<\/NOVBETI_SUALLAR>/i, "").trim();
  }

  // 3. Yaddaş və qalıq teqləri təmizlə
  metn = metn.replace(/<YADDAŞ(?:\s+[^>]+)?>[\s\S]*?<\/YADDAŞ>/gi, "").trim();
  genisMetn = genisMetn.replace(/<YADDAŞ(?:\s+[^>]+)?>[\s\S]*?<\/YADDAŞ>/gi, "").trim();

  // 4. Telegram üçün təmizləyici funksiya
  const formatla = (str) => {
    return str
      .replace(/^###\s*📌?\s*Konkret və Qısa Cavab:?/im, "📌 <b>Konkret Cavab:</b>")
      .replace(/^###\s*🔍?\s*Geniş Təhlil[^\n]*/im, "🔍 <b>Geniş Hüquqi Təhlil və Şərtlər:</b>")
      .replace(/^#{1,4}\s*(.+)$/gm, (_, t) => "\n<b>" + t.trim() + "</b>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/^[-*]\s+/gm, "• ")
      .replace(/<(?!\/?(?:b|strong|i|em|code|pre|a)\b)[^>]+>/gi, "")
      .replace(/\[\d+\]/g, "")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  let qisaCavab = formatla(metn);

  // Mənbə xülasəsi
  if (sitatlar && sitatlar.length > 0) {
    const menbeAdlari = [...new Set(sitatlar.slice(0, 3).map(s => {
      const m = s.basliq?.match(/^(Maddə\s+\d+[0-9.-]*)/i);
      return m ? m[1] : (s.menbe_adi || s.basliq || "").slice(0, 25);
    }))].filter(Boolean);
    if (menbeAdlari.length > 0) {
      qisaCavab += "\n\n📚 <b>Əsas:</b> " + menbeAdlari.join(", ");
    }
  }

  // Əlaqəli suallar
  if (novbetiSuallar.length > 0) {
    qisaCavab += "\n\n💡 <b>Əlaqəli suallar:</b>\n" + novbetiSuallar.slice(0, 2).map((s, idx) => `${idx + 1}. ${s}`).join("\n");
  }

  return {
    qisa: qisaCavab,
    genis: genisMetn ? formatla(genisMetn) : null,
    suallar: novbetiSuallar
  };
}

// Uzun Telegram mesajlarını 3800 simvol limitinə görə sətir/abzas sonlarından səliqəli bölür (HTML teqlərini qırmadan!)
function tgMesajiHisselereBol(metn, maks = 3800) {
  const tam = String(metn || "").trim();
  if (!tam) return [];
  if (tam.length <= maks) return [tam];

  const hisseler = [];
  let qalan = tam;

  while (qalan.length > maks) {
    let kesim = qalan.lastIndexOf("\n\n", maks);
    if (kesim < Math.floor(maks * 0.45)) {
      kesim = qalan.lastIndexOf("\n", maks);
    }
    if (kesim < Math.floor(maks * 0.45)) {
      kesim = qalan.lastIndexOf(" ", maks);
    }
    if (kesim <= 0) {
      kesim = maks;
    }

    hisseler.push(qalan.slice(0, kesim).trim());
    qalan = qalan.slice(kesim).trim();
  }
  if (qalan) hisseler.push(qalan);
  return hisseler;
}

async function tgTekMesajGonder(token, chatId, parcaMetn, secimler = {}) {
  const body = {
    chat_id: chatId,
    text: parcaMetn,
    parse_mode: "HTML",
    ...secimler
  };
  let res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000)
  });
  let data = await res.json();
  if (!data.ok && data.description?.includes("can't parse entities")) {
    delete body.parse_mode;
    body.text = parcaMetn.replace(/<[^>]+>/g, "");
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000)
    });
    data = await res.json();
  }
  return data;
}

async function tgMesajGonder(token, chatId, metn, secimler = {}) {
  try {
    const hisseler = tgMesajiHisselereBol(metn, 3800);
    let sonCavab = null;
    for (let i = 0; i < hisseler.length; i++) {
      const sonuncudur = i === hisseler.length - 1;
      // Düymələri (reply_markup) yalnız sonuncu hissənin altına qoy
      sonCavab = await tgTekMesajGonder(token, chatId, hisseler[i], sonuncudur ? secimler : {});
    }
    return sonCavab;
  } catch (_) {}
}

async function tgSenedGonder(token, chatId, buffer, faylAdi, caption = "") {
  try {
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("document", new Blob([buffer], { type: "application/octet-stream" }), faylAdi);
    if (caption) {
      formData.append("caption", caption.slice(0, 1024));
      formData.append("parse_mode", "HTML");
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(30000)
    });
    return await res.json();
  } catch (e) {
    return { ok: false, description: e.message };
  }
}

// Canlı gələn mesajı Mərkəzi Beyinə əlavə edir (Yaxın vaxtda gələn ardıcıl Forward müzakirələrini vahid "Praktiki Keys" blokunda birləşdirir!)
function canliMesajiBazayaYaz({ platforma = "Telegram", qovluq_id, gonderen, tarix, metn, basliq }) {
  // Boş salam-sağol mesajlarını süz
  if (typeof parsers.chatZibilleriniTemizle === "function") {
    const süzülmüş = parsers.chatZibilleriniTemizle([{ metn }]);
    if (süzülmüş.length === 0) return null;
  }

  const menbeler = db.menbeleriAl(qovluq_id);
  const canliAd = qovluq_id === "qovluq-praktika"
    ? `💼 Canlı ${platforma} Təcrübə və Keys Axını`
    : `📡 Canlı ${platforma} Axını`;
  let movcud = menbeler.find(m => m.ad === canliAd);
  const tamMetn = `[${tarix}] ${gonderen}: ${metn}`;
  const indi = Date.now();

  if (!movcud) {
    const yeni = db.menbeElaveEt({
      qovluq_id,
      ad: canliAd,
      nov: platforma.toLowerCase(),
      olcu: Buffer.byteLength(tamMetn, "utf8"),
      xulase: `Canlı ${platforma} bağlantısı vasitəsilə toplanan real müzakirələr, praktiki keyslər və səsli qeydlər`,
      meta: { platforma, canli: true, praktika: qovluq_id === "qovluq-praktika" },
      xam_metn: tamMetn,
      parcalar: [
        {
          basliq: basliq || `${canliAd} (${tarix})`,
          metn: tamMetn,
          gonderen,
          tarix
        }
      ]
    });
    ai.menbeVektorlashdir(yeni).catch(() => {});
    return yeni;
  }

  // Sonuncu parçanı yoxla: Əgər son 4 dəqiqə ərzində göndərilibsə və uzunluğu < 1500 simvoldursa, ardıcıl sual-cavab müzakirəsi kimi həmin parçaya birləşdir!
  const sonParca = db.db.prepare(
    "SELECT * FROM parcalar WHERE menbe_id = ? ORDER BY sira DESC LIMIT 1"
  ).get(movcud.id);

  if (sonParca && (indi - (sonParca.yaradildi || 0) < 4 * 60 * 1000) && (sonParca.metn || "").length < 1500) {
    const birlesikMetn = `${sonParca.metn}\n${tamMetn}`;
    const kimlerSet = new Set(
      String(sonParca.gonderen || "")
        .split(",")
        .map(x => x.trim())
        .filter(Boolean)
    );
    if (gonderen) kimlerSet.add(gonderen);
    const yeniKimler = Array.from(kimlerSet).join(", ");

    // İlk sətirdən mövzu başlığı çıxar
    const ilkMesajMetni = birlesikMetn.replace(/^\[\d[^\]]*\]\s*[^:]+:\s*/, "").split("\n")[0].slice(0, 65).trim();
    const yeniBasliq = qovluq_id === "qovluq-praktika"
      ? `💼 Praktiki Keys (${yeniKimler}): ${ilkMesajMetni}`
      : sonParca.basliq;

    db.db.prepare(`
      UPDATE parcalar
      SET basliq = ?, metn = ?, gonderen = ?, yaradildi = ?
      WHERE id = ?
    `).run(yeniBasliq, birlesikMetn, yeniKimler, indi, sonParca.id);

    db.db.prepare(`
      UPDATE menbeler
      SET xam_metn = substr(xam_metn || char(10) || ?, 1, 3000000),
          olcu = olcu + ?
      WHERE id = ?
    `).run(tamMetn, Buffer.byteLength(tamMetn, "utf8"), movcud.id);

    ai.vektorYarat(birlesikMetn).then(v => {
      if (v) db.parcaVektorYenile(sonParca.id, v);
    }).catch(() => {});

    if (typeof db.parcaKesiniSifirla === "function") db.parcaKesiniSifirla();
    return movcud;
  }

  // Yeni müstəqil müzakirə parçası yarat
  const yeniSira = (sonParca?.sira || 0) + 1;
  const pid = "p-" + crypto.randomUUID().slice(0, 12);
  const yeniParcaBasliq = qovluq_id === "qovluq-praktika"
    ? `💼 Praktiki Keys (${gonderen}): ${metn.slice(0, 65).replace(/\n/g, " ")}`
    : (basliq || `${canliAd} #${yeniSira}`);

  db.db.prepare(`
    INSERT INTO parcalar (id, menbe_id, qovluq_id, sira, basliq, metn, gonderen, tarix, meta, vektor, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
  `).run(
    pid,
    movcud.id,
    qovluq_id,
    yeniSira,
    yeniParcaBasliq,
    tamMetn,
    gonderen,
    tarix,
    JSON.stringify({ platforma, canli: true, praktika: qovluq_id === "qovluq-praktika" }),
    indi
  );

  // Mənbənin ümumi xam_metn və ölçü sütunlarını da yenilə
  db.db.prepare(`
    UPDATE menbeler
    SET xam_metn = substr(xam_metn || char(10) || ?, 1, 3000000),
        olcu = olcu + ?
    WHERE id = ?
  `).run(tamMetn, Buffer.byteLength(tamMetn, "utf8"), movcud.id);

  if (typeof db.parcaKesiniSifirla === "function") db.parcaKesiniSifirla();
  ai.vektorYarat(`${gonderen}: ${metn}`).then(v => {
    if (v) db.parcaVektorYenile(pid, v);
  }).catch(() => {});

  return movcud;
}

async function tgUpdateEmalEt(token, update) {
  // Callback query (İnline düymə basıldıqda)
  if (update.callback_query) {
    const cb = update.callback_query;
    const cbChatId = cb.message?.chat?.id;
    const data = cb.data || "";

    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: cb.id }),
      signal: AbortSignal.timeout(5000)
    }).catch(() => {});

    if (data.startsWith("det_")) {
      const detalId = data.replace("det_", "");
      const qeyd = tgDetalliYaddas.get(detalId);
      if (qeyd && qeyd.metn && cbChatId) {
        await tgMesajGonder(token, cbChatId, qeyd.metn);
      } else if (cbChatId) {
        await tgMesajGonder(token, cbChatId, "ℹ️ Bu sualın detallı təhlili üçün sualı yenidən göndərə bilərsiniz.");
      }
    } else if (data.startsWith("tts_")) {
      const detalId = data.replace("tts_", "");
      const qeyd = tgDetalliYaddas.get(detalId);
      if (qeyd && cbChatId) {
        try {
          const tts = require("./tts");
          await tgMesajGonder(token, cbChatId, "🎙️ Səsli mesaj hazırlanır...");
          const audioBuf = await tts.metniSeseCevir(qeyd.qisa || qeyd.metn);
          await tts.tgSesliMesajGonder(token, cbChatId, audioBuf, "🎙️ Səsli Cavab (BeyinAI)");
        } catch (err) {
          await tgMesajGonder(token, cbChatId, `⚠️ Səs yaradılarkən xəta: ${err.message}`);
        }
      }
    } else if (data.startsWith("ok_")) {
      const detalId = data.replace("ok_", "");
      const qeyd = tgDetalliYaddas.get(detalId);
      if (qeyd && cbChatId && typeof db.praktikaKeysElaveEt === "function") {
        const temizCavab = (qeyd.qisa || qeyd.metn || "").replace(/<[^>]+>/g, "");
        db.praktikaKeysElaveEt({
          basliq: `✅ Təsdiqlənmiş Keys: ${(qeyd.sual || "").slice(0, 75)}`,
          sual: qeyd.sual || "Telegram Ekspert Sualı",
          cavab: temizCavab,
          gonderen: "Telegram Ekspert Təsdiqi",
          nov: "tesdiq"
        });

        // Həmçinin Yaddaşa Qızıl Qayda kimi əlavə edərək gələcək suallarda prioritet verək
        if (typeof db.yaddasElaveEt === "function" && qeyd.sual && qeyd.sual.length > 10) {
          db.yaddasElaveEt({
            kateqoriya: "qayda",
            metn: `QIZIL QAYDA (Ekspert Təsdiqi): Mövzu: "${qeyd.sual.slice(0, 100)}" → Nəticə: ${temizCavab.slice(0, 250)}`,
            menbe: "Telegram Ekspert Təsdiqi",
            vaciblik: 5
          });
        }

        await tgMesajGonder(
          token,
          cbChatId,
          "✅ <b>Təsdiqləndi və Yaddaşa Həkk Olundu!</b>\nBu cavab həm <b>Təcrübə Bankı</b>na etalon keys kimi yazıldı, həm də gələcək suallar üçün <b>Daimi Qızıl Qayda</b> kimi qeyd edildi."
        );
      }
    } else if (data.startsWith("bad_")) {
      const detalId = data.replace("bad_", "");
      const qeyd = tgDetalliYaddas.get(detalId);
      if (qeyd && qeyd.sual && cbChatId) {
        await tgMesajGonder(token, cbChatId, "🔄 <b>Sualınız yenidən oxunur və daha dərindən (fərqli bucaqdan + Tənqidçi Müfəttişlə) təkrar araşdırılır...</b>");
        try {
          const agent = require("./agent");
          const yeniNet = await agent.agentSualCavabla({
            sual: qeyd.sual,
            qovluq_id: "all",
            derin_rejim: true,
            yenidenArasdir: true,
            evvelkiCavab: qeyd.qisa || qeyd.metn || ""
          });
          const formatlanmis = telegramCavabiFormatla(yeniNet.cavab.metn, yeniNet.sitatlar);
          const yeniId = crypto.randomUUID().slice(0, 8);
          tgDetalliYaddas.set(yeniId, {
            vaxt: Date.now(),
            sual: qeyd.sual,
            qisa: formatlanmis.qisa,
            metn: formatlanmis.genis || formatlanmis.qisa
          });
          const duymeler = [];
          if (formatlanmis.genis) {
            duymeler.push([{ text: "🔍 Geniş Təhlil və Praktiki Nümunə", callback_data: `det_${yeniId}` }]);
          }
          duymeler.push([
            { text: "🎙️ Səslə Dinlə", callback_data: `tts_${yeniId}` },
            { text: "👍 Doğrudur", callback_data: `ok_${yeniId}` },
            { text: "👎 Bəyənmədim", callback_data: `bad_${yeniId}` }
          ]);
          const etibarSetri = yeniNet.etibarliliq ? `\n\n🛡️ <b>Etibarlılıq:</b> ${yeniNet.etibarliliq}` : "";
          await tgMesajGonder(
            token,
            cbChatId,
            `🔄 <b>Yenidən Dərin Araşdırma Nəticəsi:</b>\n\n${formatlanmis.qisa}${etibarSetri}`,
            { reply_markup: { inline_keyboard: duymeler } }
          );
        } catch (err) {
          await tgMesajGonder(token, cbChatId, `⚠️ Yenidən araşdırma zamanı xəta: ${err.message}`);
        }
      } else if (cbChatId) {
        await tgMesajGonder(token, cbChatId, "ℹ️ Bu sualın müddəti bitib — zəhmət olmasa sualı yenidən yazın.");
      }
    }
    return;
  }

  const msg = update.message || update.channel_post;
  if (!msg) return;

  const chatId = msg.chat.id;
  const tenz = db.tenzimlemeleriAl();
  const qovluq_id = tenz.tg_avto_qovluq || "qovluq-cat";

  // Göndərən və ya Forward edilən şəxsin adını müəyyən et
  let gonderen =
    msg.forward_sender_name ||
    (msg.forward_from ? [msg.forward_from.first_name, msg.forward_from.last_name].filter(Boolean).join(" ") : "") ||
    (msg.forward_from_chat ? msg.forward_from_chat.title : "") ||
    [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") ||
    "Telegram İstifadəçisi";

  const tarixSan = msg.forward_date || msg.date || Math.floor(Date.now() / 1000);
  const tarix = new Date(tarixSan * 1000).toISOString().replace("T", " ").slice(0, 16);

  const metn = (msg.text || msg.caption || "").trim();

  const isForward = !!(
    msg.forward_date ||
    msg.forward_from ||
    msg.forward_from_chat ||
    msg.forward_sender_name ||
    msg.forward_signature
  );

  // 0) Telegram Komandaları və Birbaşa Sual-Cavab
  if (metn === "/start") {
    await tgMesajGonder(
      token,
      chatId,
      "🧠 Salam! Mən sizin Şəxsi AI Agentiniz və Mühasibatlıq Köməkçinizəm.\n\n" +
      "Mənə istənilən mövzuda (Vergi, Əmək, Mühasibatlıq, Sənədlər) sual verə, səsli mesaj ata və ya PDF/Word sənədləri göndərə bilərsiniz.\n\n" +
      "📌 <b>Xüsusi İmkanlar və Komandalar:</b>\n" +
      "• 🧮 <b>Kalkulyator:</b> <code>hesabla maaş 1500 net</code> və ya <code>hesabla məzuniyyət 1200 maaş 21 gün</code>\n" +
      "• 📰 <b>Həftəlik Bülleten:</b> <code>/bulleten</code> — Qruplardan toplanmış canlı keyslərin icmalı\n" +
      "• 📉 <b>Bilik Boşluqları:</b> <code>/bosluqlar</code> — Bazada sənəd çatışmayan mövzuların hesabatı\n" +
      "• 🧬 <b>Yaddaş Konsolidasiyası:</b> <code>/yaddas_temizle</code> — Dublikat və ziddiyyətli qeydləri birləşdir\n" +
      "• 🧠 <b>Semantik Vektor İndeksi:</b> <code>/vektor_yenile</code> — Bütün bazanı məna üzrə indekslə\n" +
      "• 💾 <b>Baza Yedəkləməsi:</b> <code>/backup</code> — SQLite bazasını ehtiyat fayl kimi göndər\n" +
      "• 🎙️ <b>Səsli Cavab:</b> Cavabın altındakı <code>[🎙️ Səslə Dinlə]</code> düyməsi ilə audio dinləmə\n" +
      "• ℹ️ <b>Sistem Statusu:</b> <code>/status</code> və ya <code>/versiya</code>\n" +
      "• 📌 <b>Şəxsi Qayda Qeydi:</b> <code>/qeyd Mətn...</code>\n\n" +
      "💼 <b>Qrup Təcrübələri:</b> Digər Telegram qruplarındakı maraqlı mühasib müzakirələrini bura Forward etsəniz, avtomatik <b>Mühasibatlıq Praktikası Bankına</b> yazılacaq!"
    );
    return;
  }

  // Versiya və Sistem Statusu Yoxlanışı
  if (metn === "/versiya" || metn === "/status" || metn === "/ver") {
    const stat = db.statistikaAl();
    const vekStat = db.vektorStatistikasiAl();
    const tenz = db.tenzimlemeleriAl();
    await tgMesajGonder(
      token,
      chatId,
      `🤖 <b>BeyinAI Sistem Statusu:</b>\n\n` +
      `🏷️ <b>Versiya:</b> v3.0 (24 Noyabr 2026)\n` +
      `🧠 <b>AI Modeli:</b> ${tenz.gemini_model || "gemini-3-flash-preview"}\n` +
      `⚡ <b>Mühərrik:</b> ReAct Multi-Query + 2-Mərhələli Tənqidçi Müfəttiş (Critic Pass)\n` +
      `🛡️ <b>Server Qalxanı:</b> Rate-Limit + Təhlükəsiz Başlıqlar + Global Qoruyucu\n` +
      `⚖️ <b>Qanun vs Praktika Detektoru:</b> Aktiv\n` +
      `🧬 <b>Yaddaşın Özünü-Təmizləməsi:</b> Aktiv (/yaddas_temizle)\n` +
      `📉 <b>Bilik Boşluğu İzləməsi:</b> Aktiv (/bosluqlar)\n` +
      `💾 <b>1-Kliklə Baza Backup:</b> Aktiv (/backup)\n\n` +
      `📊 <b>Baza Statistikası:</b>\n` +
      `  • 📁 Qovluqlar: ${stat.qovluqSayi || 0}\n` +
      `  • 📄 Mənbələr / Sənədlər: ${stat.menbeSayi || 0}\n` +
      `  • 🧩 İndekslənmiş Hissələr: ${stat.parcaSayi || 0}\n` +
      `  • 🧬 Semantik Vektorlu: ${vekStat.vektorlu} / ${vekStat.cemi} (${vekStat.faiz}%)\n` +
      `  • 🧠 Şəxsi Yaddaş Faktları: ${stat.yaddasSayi || 0}\n` +
      `  • 📉 Açıq Bilik Boşluqları: ${stat.bosluqSayi || 0}\n\n` +
      `✅ <i>Bütün modullar aktiv və problemsiz işləyir!</i>`
    );
    return;
  }

  // 1-Kliklə Baza Yedəkləmə (/backup)
  if (metn === "/backup" || metn === "/yedek") {
    await tgMesajGonder(token, chatId, "💾 <b>Baza ehtiyat nüsxəsi hazırlanır...</b> (SQLite WAL birləşdirilir)");
    try {
      const bkp = db.bazaBackupHazirla();
      const stat = db.statistikaAl();
      const olcuMb = (bkp.olcu / (1024 * 1024)).toFixed(2);
      const res = await tgSenedGonder(
        token,
        chatId,
        bkp.buffer,
        bkp.faylAdi,
        `💾 <b>BeyinAI Baza Ehtiyat Nüsxəsi</b>\n` +
        `• 📦 Ölçü: <b>${olcuMb} MB</b>\n` +
        `• 📄 Mənbələr: ${stat.menbeSayi} | 🧩 Hissələr: ${stat.parcaSayi}\n` +
        `• 🧠 Yaddaş Qaydaları: ${stat.yaddasSayi}\n` +
        `✅ <i>Bu faylı saxlayın — istənilən vaxt bütün biliklərinizi 100% bərpa edə bilərsiniz.</i>`
      );
      if (!res || !res.ok) {
        await tgMesajGonder(token, chatId, `⚠️ Backup göndərilərkən xəta: ${res?.description || "Naməlum xəta"}`);
      }
    } catch (e) {
      await tgMesajGonder(token, chatId, `⚠️ Backup hazırlanarkən xəta: ${e.message}`);
    }
    return;
  }

  // Tam Semantik Vektor İndeksləməsi (/vektor_yenile və /vektor_status)
  if (metn === "/vektor_status") {
    const v = ai.vektorIsiVeziyyetiAl();
    await tgMesajGonder(
      token,
      chatId,
      `🧬 <b>Semantik Vektor Statusu:</b>\n\n` +
      `• 📊 Vektorlu hissələr: <b>${v.baza.vektorlu} / ${v.baza.cemi} (${v.baza.faiz}%)</b>\n` +
      `• ⏳ Qalan hissələr: <b>${v.baza.qaliq}</b>\n` +
      `• ⚙️ Aktiv proses: <b>${v.gedir ? `İşləyir (${v.hazir}/${v.cemi})` : "Gözləmədə"}</b>`
    );
    return;
  }

  if (metn === "/vektor_yenile" || metn === "/vektor") {
    const vekStat = db.vektorStatistikasiAl();
    if (vekStat.qaliq === 0) {
      await tgMesajGonder(token, chatId, `✅ <b>Bazadakı bütün ${vekStat.cemi} parça artıq 100% semantik vektorlaşdırılıb!</b>`);
      return;
    }
    await tgMesajGonder(
      token,
      chatId,
      `🧠 <b>Tam Semantik Vektor İndeksləməsi Başladıldı!</b>\n` +
      `• 📊 İndekslənəcək: <b>${vekStat.qaliq}</b> parça (Cəmi: ${vekStat.cemi})\n` +
      `• ⏳ Proses arxa planda təhlükəsiz partiyalarla gedir. Bitdikdə sizə hesabat göndəriləcək.\n` +
      `<i>Gedişatı yoxlamaq üçün: <code>/vektor_status</code></i>`
    );

    ai.butunBazaniVektorlashdir({
      batchOlcu: 5,
      gecikmeMs: 250
    }).then(net => {
      tgMesajGonder(token, chatId, net.mesaj).catch(() => {});
    }).catch(e => {
      tgMesajGonder(token, chatId, `⚠️ Vektorlaşdırma xətası: ${e.message}`).catch(() => {});
    });
    return;
  }

  // Bilik Boşluqları Hesabatı (/bosluqlar)
  if (metn === "/bosluqlar" || metn === "/boşluqlar") {
    const bosluqlar = db.bilikBosluqlariniAl(15);
    if (!bosluqlar || bosluqlar.length === 0) {
      await tgMesajGonder(
        token,
        chatId,
        `🟢 <b>Bilik Boşluğu Aşkarlanmayıb!</b>\n\nHal-hazırda bazada sənəd çatışmazlığı qeydə alınan açıq sual yoxdur. Yeni suallar verdikcə rəsmi mənbəsi zəif olan mövzular burada toplanacaq.`
      );
      return;
    }

    const siyahi = bosluqlar.map((b, idx) => {
      const tarixStr = new Date(b.son_sorulma || b.yaradildi).toISOString().slice(0, 10);
      return `${idx + 1}. <b>${b.movzu || b.sual.slice(0, 70)}</b>\n   <i>(Sorulma: ${b.say || 1} dəfə | Son tarix: ${tarixStr})</i>`;
    }).join("\n\n");

    await tgMesajGonder(
      token,
      chatId,
      `📉 <b>Bilik Boşluqları Hesabatı (Bazada Sənəd Çatışmayan Mövzular):</b>\n\n` +
      `Aşağıdakı <b>${bosluqlar.length}</b> mövzuda bazada rəsmi maddə və ya qeyd tapılmayıb:\n\n` +
      `${siyahi}\n\n` +
      `💡 <i>Bu mövzular üzrə PDF/Word sənəd yükləsəniz və ya <code>/qeyd [Qayda]</code> yazsanız, sistemin dəqiqliyi dərhal artacaq.\nSiyahını sıfırlamaq üçün: <code>/bosluqlar_temizle</code></i>`
    );
    return;
  }

  if (metn === "/bosluqlar_temizle") {
    db.bilikBosluqlariniTemizle();
    await tgMesajGonder(token, chatId, `🧹 <b>Bilik boşluqları siyahısı təmizləndi.</b>`);
    return;
  }

  // Yaddaşın Özünü-Təmizləməsi (/yaddas_temizle)
  if (metn === "/yaddas_temizle" || metn === "/konsolidasiya") {
    await tgMesajGonder(token, chatId, "🧬 <b>Yaddaş Konsolidasiyası başlayır...</b> Dublikat və ziddiyyətli qeydlər yoxlanılır...");
    try {
      const consolidator = require("./memory-consolidator");
      const net = await consolidator.yaddasiKonsolidasiyaEt({ aiIstifadeEt: true });
      await tgMesajGonder(token, chatId, net.hesabat);
    } catch (e) {
      await tgMesajGonder(token, chatId, `⚠️ Konsolidasiya zamanı xəta: ${e.message}`);
    }
    return;
  }

  // Həftəlik Mühasibat Təcrübə Bülleteni Komandası
  if (metn === "/bulleten" || metn === "/icmal" || metn === "/bülleten") {
    await tgMesajGonder(token, chatId, "📰 <b>Həftəlik Mühasibat və Vergi Təcrübəsi Bülleteni</b> toplanmış keyslər əsasında hazırlanır...");
    try {
      const bulleten = require("./bulleten");
      const icmalMetni = await bulleten.heftelikBulletenHazirla();
      const detalId = crypto.randomUUID().slice(0, 8);
      tgDetalliYaddas.set(detalId, {
        vaxt: Date.now(),
        sual: "/bulleten",
        qisa: icmalMetni,
        metn: icmalMetni
      });
      const secimler = {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎙️ Səslə Dinlə", callback_data: `tts_${detalId}` }]
          ]
        }
      };
      await tgMesajGonder(token, chatId, icmalMetni, secimler);
    } catch (e) {
      await tgMesajGonder(token, chatId, `⚠️ Bülleten hazırlanarkən xəta: ${e.message}`);
    }
    return;
  }

  // Birbaşa /qeyd və ya /yaddas komandası ilə qeyd saxlamaq
  if (/^\/(?:qeyd|yaddas)\s+(.+)/is.test(metn)) {
    const qeydMetni = metn.replace(/^\/(?:qeyd|yaddas)\s+/i, "").trim();
    db.yaddasElaveEt({
      kateqoriya: "qayda",
      metn: qeydMetni,
      menbe: "Telegram Əmri",
      vaciblik: 5
    });
    await tgMesajGonder(token, chatId, `📌 <b>Uzunmüddətli Yaddaşa əlavə olundu:</b>\n<i>"${qeydMetni}"</i>`);
    return;
  }

  // 🧮 Mühasibat və Əməkhaqqı Kalkulyatoru Əmrləri
  const calculator = require("./calculator");
  if (calculator.kalkulyatorSorgusudurmu(metn) && !isForward) {
    const cavab = calculator.kalkulyatorEmalEt(metn);
    const detalId = crypto.randomUUID().slice(0, 8);
    tgDetalliYaddas.set(detalId, {
      vaxt: Date.now(),
      sual: metn,
      qisa: cavab.mesaj,
      metn: cavab.mesaj
    });
    const secimler = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎙️ Səslə Dinlə", callback_data: `tts_${detalId}` }]
        ]
      }
    };
    await tgMesajGonder(token, chatId, cavab.mesaj, secimler);
    return;
  }

  const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;

  // Əgər istifadəçi birbaşa sual və ya mülahizə yazıbsa (Forward deyil və media faylı deyil)
  if (metn && !isForward && !msg.document && !msg.voice && !msg.audio && !hasPhoto) {
    try {
      const agent = require("./agent");
      await tgMesajGonder(token, chatId, "🧠 Düşünürəm və mənbələri analiz edirəm...");
      const nət = await agent.agentSualCavabla({ sual: metn, qovluq_id: "all" });
      const formatlanmis = telegramCavabiFormatla(nət.cavab.metn, nət.sitatlar);

      const detalId = crypto.randomUUID().slice(0, 8);
      tgDetalliYaddas.set(detalId, {
        vaxt: Date.now(),
        sual: metn,
        qisa: formatlanmis.qisa,
        metn: formatlanmis.genis || formatlanmis.qisa
      });
      const duymeler = [];
      if (formatlanmis.genis) {
        duymeler.push([{ text: "🔍 Geniş Təhlil və Praktiki Nümunə", callback_data: `det_${detalId}` }]);
      }
      duymeler.push([
        { text: "🎙️ Səslə Dinlə", callback_data: `tts_${detalId}` },
        { text: "👍 Doğrudur", callback_data: `ok_${detalId}` },
        { text: "👎 Bəyənmədim", callback_data: `bad_${detalId}` }
      ]);
      const secimler = { reply_markup: { inline_keyboard: duymeler } };
      const etibarSetri = nət.etibarliliq ? `\n\n🛡️ <b>Etibarlılıq:</b> ${nət.etibarliliq}` : "";

      await tgMesajGonder(token, chatId, `${formatlanmis.qisa}${etibarSetri}`, secimler);
      return;
    } catch (e) {
      await tgMesajGonder(token, chatId, `⚠️ Xəta baş verdi: ${e.message}`);
      return;
    }
  }

  // 1) Sənəd (PDF, Word, Excel, ZIP və s.) göndərilibsə
  if (msg.document) {
    try {
      const { buffer } = await tgFaylEndir(token, msg.document.file_id);
      const faylAdi = msg.document.file_name || "telegram_sened.dat";
      const emal = await parsers.faylEmalEt({
        buffer,
        faylAdi,
        mimeType: msg.document.mime_type || ""
      });
      const isPraktikaChat = emal.nov === "whatsapp" || emal.nov === "telegram" || emal.parcalar?.some(p => p.meta?.praktika);
      const senedQovluq = isPraktikaChat ? "qovluq-praktika" : qovluq_id;

      const elave = db.menbeElaveEt({
        qovluq_id: senedQovluq,
        ad: emal.ad || faylAdi,
        nov: emal.nov,
        olcu: buffer.length,
        xulase: emal.xulase,
        meta: { ...emal.meta, gonderen, tarix, menbe: "Telegram Bot" },
        xam_metn: emal.xam_metn,
        parcalar: emal.parcalar
      });
      ai.menbeVektorlashdir(elave).catch(() => {});
      tgVeziyyet.qebulEdilenSay++;
      tgVeziyyet.sonMesajTarixi = tarix;
      if (isPraktikaChat) {
        await tgMesajGonder(
          token,
          chatId,
          `💼 <b>Mühasibatlıq Praktikası Bankına əlavə edildi!</b>\n` +
          `• <b>Fayl:</b> ${faylAdi}\n` +
          `• <b>Analiz:</b> 85% boş mesaj süzüldü, ${emal.parcalar.length} faydalı praktiki keys və dialoq saxlanıldı.\n\n` +
          `✅ Sual verdiyinizdə bu canlı təcrübələr cavablarda nəzərə alınacaq.`
        );
      } else {
        await tgMesajGonder(token, chatId, `✅ Sənəd Mərkəzi Beyinə əlavə edildi: ${faylAdi} (${emal.parcalar.length} hissə)`);
      }
      return;
    } catch (e) {
      await tgMesajGonder(token, chatId, `⚠️ Sənəd oxunarkən xəta: ${e.message}`);
      return;
    }
  }

  // 2) Səsli mesaj (Voice / Audio) göndərilibsə
  if (msg.voice || msg.audio) {
    try {
      const mediaObj = msg.voice || msg.audio;
      const { buffer } = await tgFaylEndir(token, mediaObj.file_id);
      const analiz = await ai.mediaAnalizEt({
        buffer,
        mimeType: mediaObj.mime_type || "audio/ogg",
        faylAdi: "telegram_voice.ogg"
      });
      const tamMetn = `🎙️ [Səsli Mesaj]: ${analiz.metn}${metn ? "\nQeyd: " + metn : ""}`;
      canliMesajiBazayaYaz({
        platforma: "Telegram",
        qovluq_id,
        gonderen,
        tarix,
        metn: tamMetn,
        basliq: `🎙️ Səsli Mesaj — ${gonderen} (${tarix})`
      });
      tgVeziyyet.qebulEdilenSay++;
      tgVeziyyet.sonMesajTarixi = tarix;

      // Səsi dərhal cavablandır
      if (analiz.metn && analiz.metn.length > 3) {
        // 🎙️ Səsli Kalkulyator Yoxlanışı (məs: "hesabla maaş 1500 net" səsli deyildikdə dərhal dəqiq hesabla!)
        if (calculator.kalkulyatorSorgusudurmu(analiz.metn)) {
          const kalkCavab = calculator.kalkulyatorEmalEt(analiz.metn);
          await tgMesajGonder(token, chatId, `🎙️ Səsiniz:\n"${analiz.metn}"\n\n${kalkCavab.mesaj}`);
          try {
            const tts = require("./tts");
            const audioBuf = await tts.metniSeseCevir(kalkCavab.mesaj);
            await tts.tgSesliMesajGonder(token, chatId, audioBuf, "🎙️ Səsli Hesablama Nəticəsi");
          } catch (_) {}
          return;
        }

        await tgMesajGonder(token, chatId, `🎙️ Səsiniz:\n"${analiz.metn}"\n\n🧠 Cavab hazırlanır...`);
        try {
          const agent = require("./agent");
          const netice = await agent.agentSualCavabla({ sual: analiz.metn, qovluq_id: "all" });
          const formatlanmis = telegramCavabiFormatla(netice.cavab.metn, netice.sitatlar);

          const detalId = crypto.randomUUID().slice(0, 8);
          tgDetalliYaddas.set(detalId, {
            vaxt: Date.now(),
            sual: analiz.metn,
            qisa: formatlanmis.qisa,
            metn: formatlanmis.genis || formatlanmis.qisa
          });
          const duymeler = [];
          if (formatlanmis.genis) {
            duymeler.push([{ text: "🔍 Geniş Təhlil və Praktiki Nümunə", callback_data: `det_${detalId}` }]);
          }
          duymeler.push([
            { text: "🎙️ Təkrar Dinlə", callback_data: `tts_${detalId}` },
            { text: "👍 Doğrudur", callback_data: `ok_${detalId}` },
            { text: "👎 Bəyənmədim", callback_data: `bad_${detalId}` }
          ]);
          const secimler = { reply_markup: { inline_keyboard: duymeler } };

          const etibarSetri = netice.etibarliliq ? `\n\n🛡️ <b>Etibarlılıq:</b> ${netice.etibarliliq}` : "";
          await tgMesajGonder(token, chatId, `${formatlanmis.qisa}${etibarSetri}`, secimler);

          // Səsli suala avtomatik səsli cavab da göndər
          try {
            const tts = require("./tts");
            const audioBuf = await tts.metniSeseCevir(formatlanmis.qisa);
            await tts.tgSesliMesajGonder(token, chatId, audioBuf, "🎙️ Səsli Cavab (BeyinAI)");
          } catch (_) {}
        } catch (_) {}
      } else {
        await tgMesajGonder(token, chatId, `🎙️ Səsli qeyd yaddaşa yazıldı.`);
      }
      return;
    } catch (e) {
      await tgMesajGonder(token, chatId, `⚠️ Səsli mesaj oxunarkən xəta: ${e.message}`);
      return;
    }
  }

  // 3) Fotoşəkil (Photo) göndərilibsə
  if (hasPhoto) {
    try {
      const enBoyukFoto = msg.photo[msg.photo.length - 1];
      const { buffer } = await tgFaylEndir(token, enBoyukFoto.file_id);
      const analiz = await ai.mediaAnalizEt({
        buffer,
        mimeType: "image/jpeg",
        faylAdi: "telegram_photo.jpg"
      });
      const tamMetn = `${metn ? metn + "\n" : ""}🖼️ [Şəkildəki Mətn/Təsvir]: ${analiz.metn}`;
      const hedefQovluq = isForward ? "qovluq-praktika" : qovluq_id;
      canliMesajiBazayaYaz({
        platforma: "Telegram",
        qovluq_id: hedefQovluq,
        gonderen,
        tarix,
        metn: tamMetn,
        basliq: `🖼️ Şəkil — ${gonderen} (${tarix})`
      });
      tgVeziyyet.qebulEdilenSay++;
      tgVeziyyet.sonMesajTarixi = tarix;

      if (!isForward && metn) {
        // İstifadəçi şəklin altında sual və ya tapşırıq yazıbsa, həm OCR mətnini, həm də sualı birlikdə cavablandır
        await tgMesajGonder(token, chatId, `🖼️ Şəkil oxundu, sualınız analiz edilir...`);
        const agent = require("./agent");
        const birlesikSual = `Şəkildəki mətn: "${analiz.metn}"\n\nİstifadəçinin sualı: ${metn}`;
        const nət = await agent.agentSualCavabla({ sual: birlesikSual, qovluq_id: "all" });
        const formatlanmis = telegramCavabiFormatla(nət.cavab.metn, nət.sitatlar);
        await tgMesajGonder(token, chatId, formatlanmis.qisa);
      } else {
        await tgMesajGonder(token, chatId, `🖼️ Şəkil analiz edildi və yaddaşa saxlanıldı (${gonderen}).`);
      }
      return;
    } catch (e) {
      await tgMesajGonder(token, chatId, `⚠️ Şəkil analiz edilərkən xəta: ${e.message}`);
      return;
    }
  }

  // 4) Forward edilmiş mətn mesajı (Qrup Təcrübələri / Mühasibatlıq Praktikası Bankı)
  if (metn && isForward) {
    const hedefQovluq = "qovluq-praktika";
    const basliq = `💼 Qrup Təcrübəsi — ${gonderen} (${tarix})`;

    canliMesajiBazayaYaz({
      platforma: "Telegram",
      qovluq_id: hedefQovluq,
      gonderen,
      tarix,
      metn,
      basliq
    });
    tgVeziyyet.qebulEdilenSay++;
    tgVeziyyet.sonMesajTarixi = tarix;

    const qisaGosteris = metn.length > 100 ? metn.slice(0, 100).replace(/\n/g, " ") + "..." : metn;
    await tgMesajGonder(
      token,
      chatId,
      `💼 <b>Mühasibatlıq Praktikası Bankına əlavə edildi!</b>\n` +
      `• <b>Mənbə / Şəxs:</b> ${gonderen}\n` +
      `• <b>Qeyd:</b> <i>"${qisaGosteris}"</i>\n\n` +
      `✅ Bu real təcrübə və canlı keys növbəti suallarınızın analizində nəzərə alınacaq.`
    );
  }
}

async function tgSorğuDövrü() {
  if (!tgVeziyyet.aktiv || tgGedir) return;
  const tenz = db.tenzimlemeleriAl();
  const token = (tenz.tg_bot_token || "").trim();
  if (!token) {
    tgDayandir();
    return;
  }

  tgGedir = true;
  try {
    const offset = tgVeziyyet.sonUpdateId ? tgVeziyyet.sonUpdateId + 1 : 0;
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=10`,
      { signal: AbortSignal.timeout(15000) }
    );
    const data = await res.json();
    if (data.ok && Array.isArray(data.result)) {
      for (const upd of data.result) {
        tgVeziyyet.sonUpdateId = Math.max(tgVeziyyet.sonUpdateId, upd.update_id);
        await tgUpdateEmalEt(token, upd);
      }
      tgVeziyyet.xeta = null;
    } else if (!data.ok) {
      tgVeziyyet.xeta = data.description || "Telegram bağlantısında xəta";
    }
  } catch (e) {
    tgVeziyyet.xeta = e.message;
  } finally {
    tgGedir = false;
  }
}

async function tgBaslat() {
  const tenz = db.tenzimlemeleriAl();
  const token = (tenz.tg_bot_token || "").trim();
  if (!token) {
    tgDayandir();
    return { ok: false, xeta: "Telegram Bot Token daxil edilməyib." };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json();
    if (!data.ok) {
      tgVeziyyet.aktiv = false;
      tgVeziyyet.xeta = data.description || "Token yanlışdır.";
      return { ok: false, xeta: tgVeziyyet.xeta };
    }

    tgVeziyyet.aktiv = true;
    tgVeziyyet.botAdi = data.result.first_name || "BeyinAI Bot";
    tgVeziyyet.botIstifadeciAdi = data.result.username || "";
    tgVeziyyet.xeta = null;

    if (tgTimer) clearInterval(tgTimer);
    tgTimer = setInterval(tgSorğuDövrü, 3500);
    tgSorğuDövrü();

    return { ok: true, veziyyet: tgVeziyyet };
  } catch (e) {
    tgVeziyyet.aktiv = false;
    tgVeziyyet.xeta = e.message;
    return { ok: false, xeta: e.message };
  }
}

function tgDayandir() {
  if (tgTimer) {
    clearInterval(tgTimer);
    tgTimer = null;
  }
  tgVeziyyet.aktiv = false;
  return tgVeziyyet;
}

function veziyyetiAl() {
  return {
    telegram: tgVeziyyet
  };
}

module.exports = {
  tgBaslat,
  tgDayandir,
  tgMesajiHisselereBol,
  canliMesajiBazayaYaz,
  veziyyetiAl
};
