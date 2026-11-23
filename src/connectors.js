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

async function tgMesajGonder(token, chatId, metn, secimler = {}) {
  try {
    const body = {
      chat_id: chatId,
      text: metn.slice(0, 4000),
      parse_mode: "HTML",
      ...secimler
    };
    let res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    let data = await res.json();
    if (!data.ok && data.description?.includes("can't parse entities")) {
      delete body.parse_mode;
      body.text = metn.replace(/<[^>]+>/g, "").slice(0, 4000);
      res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000)
      });
      data = await res.json();
    }
    return data;
  } catch (_) {}
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
    } else if (data.startsWith("ok_")) {
      const detalId = data.replace("ok_", "");
      const qeyd = tgDetalliYaddas.get(detalId);
      if (qeyd && cbChatId && typeof db.praktikaKeysElaveEt === "function") {
        db.praktikaKeysElaveEt({
          basliq: `✅ Təsdiqlənmiş Keys: ${(qeyd.sual || "").slice(0, 75)}`,
          sual: qeyd.sual || "Telegram Ekspert Sualı",
          cavab: (qeyd.qisa || qeyd.metn || "").replace(/<[^>]+>/g, ""),
          gonderen: "Telegram Ekspert Təsdiqi",
          nov: "tesdiq"
        });
        await tgMesajGonder(token, cbChatId, "✅ <b>Təsdiqləndi!</b> Bu cavab etalon praktiki keys kimi <b>Mühasibatlıq Praktikası və Təcrübə Bankı</b>na əlavə olundu.");
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
      "🧠 Salam! Mən sizin Şəxsi AI Agentiniz və İkinci Beyninizəm.\n\n" +
      "Mənə istənilən mövzuda (Hüquq, Konstitusiya, Vergi/Mühasibatlıq, Fəlsəfə, Dünyagörüşü, Kitablar və Sənədlər) sual yaza, səsli mesaj ata və ya oxunması üçün PDF/Word faylları göndərə bilərsiniz.\n\n" +
      "📌 <b>Birbaşa yaddaşa qayda/qeyd yazmaq üçün:</b> <code>/qeyd Mətn...</code> yazın.\n" +
      "💼 <b>Qrup Təcrübələri / Keyslər:</b> Digər Telegram qruplarından maraqlı mühasib müzakirələrini bura Forward etsəniz, avtomatik <b>Mühasibatlıq Praktikası Bankına</b> yazılacaq və gələcək suallarınızda nəzərə alınacaq!"
    );
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
      duymeler.push([{ text: "👍 Doğrudur (Təcrübə Bankına Qat)", callback_data: `ok_${detalId}` }]);
      const secimler = { reply_markup: { inline_keyboard: duymeler } };

      await tgMesajGonder(token, chatId, formatlanmis.qisa, secimler);
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
        await tgMesajGonder(token, chatId, `🎙️ Səsiniz:\n"${analiz.metn}"\n\n🧠 Cavab hazırlanır...`);
        try {
          const agent = require("./agent");
          const netice = await agent.agentSualCavabla({ sual: analiz.metn, qovluq_id: "all" });
          const formatlanmis = telegramCavabiFormatla(netice.cavab.metn, netice.sitatlar);

          const secimler = {};
          if (formatlanmis.genis) {
            const detalId = crypto.randomUUID().slice(0, 8);
            tgDetalliYaddas.set(detalId, {
              vaxt: Date.now(),
              metn: formatlanmis.genis
            });
            secimler.reply_markup = {
              inline_keyboard: [
                [{ text: "🔍 Geniş Təhlil və Praktiki Nümunə", callback_data: `det_${detalId}` }]
              ]
            };
          }

          await tgMesajGonder(token, chatId, formatlanmis.qisa, secimler);
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
  canliMesajiBazayaYaz,
  veziyyetiAl
};
