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

async function tgMesajGonder(token, chatId, metn) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: metn.slice(0, 4000)
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch (_) {}
}

// Canlı gələn tək mesajı Mərkəzi Beyinə əlavə edir
function canliMesajiBazayaYaz({ platforma = "Telegram", qovluq_id, gonderen, tarix, metn, basliq }) {
  const menbeler = db.menbeleriAl(qovluq_id);
  const canliAd = `📡 Canlı ${platforma} Axını`;
  let movcud = menbeler.find(m => m.ad === canliAd);

  if (!movcud) {
    const yeni = db.menbeElaveEt({
      qovluq_id,
      ad: canliAd,
      nov: platforma.toLowerCase(),
      olcu: metn.length,
      xulase: `Canlı ${platforma} bağlantısı vasitəsilə gələn mesajlar və səsli qeydlər`,
      meta: { platforma, canli: true },
      xam_metn: `[${tarix}] ${gonderen}: ${metn}`,
      parcalar: [
        {
          basliq: basliq || `${canliAd} (${tarix})`,
          metn: `[${tarix}] ${gonderen}: ${metn}`,
          gonderen,
          tarix
        }
      ]
    });
    ai.menbeVektorlashdir(yeni).catch(() => {});
    return yeni;
  }

  // Mövcud canlı mənbəyə yeni parça əlavə et
  const detallar = db.menbeDetaliAl(movcud.id);
  const yeniSira = (detallar?.parcalar?.length || 0) + 1;
  const crypto = require("node:crypto");
  const pid = "p-" + crypto.randomUUID().slice(0, 12);
  const tamMetn = `[${tarix}] ${gonderen}: ${metn}`;

  db.db.prepare(`
    INSERT INTO parcalar (id, menbe_id, qovluq_id, sira, basliq, metn, gonderen, tarix, meta, vektor, yaradildi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
  `).run(
    pid,
    movcud.id,
    qovluq_id,
    yeniSira,
    basliq || `${canliAd} #${yeniSira}`,
    tamMetn,
    gonderen,
    tarix,
    JSON.stringify({ platforma, canli: true }),
    Date.now()
  );

  ai.vektorYarat(`${gonderen}: ${metn}`).then(v => {
    if (v) db.parcaVektorYenile(pid, v);
  }).catch(() => {});

  return movcud;
}

async function tgUpdateEmalEt(token, update) {
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

  // 0) Telegram Komandaları və Birbaşa Sual-Cavab
  if (metn === "/start") {
    await tgMesajGonder(
      token,
      chatId,
      "🧠 Salam! Mən sizin Şəxsi AI Agentiniz və İkinci Beyninizəm.\n\n" +
      "Mənə istənilən mövzuda (Hüquq, Konstitusiya, Vergi/Mühasibatlıq, Fəlsəfə, Dünyagörüşü, Kitablar və Sənədlər) sual yaza, səsli mesaj ata və ya oxunması üçün PDF/Word faylları göndərə bilərsiniz."
    );
    return;
  }

  // Əgər istifadəçi birbaşa sual və ya mülahizə yazıbsa (Forward deyil)
  if (metn && !msg.forward_date && !msg.document && !msg.voice && !msg.audio) {
    try {
      const agent = require("./agent");
      await tgMesajGonder(token, chatId, "🧠 Düşünürəm və mənbələri analiz edirəm...");
      const nət = await agent.agentSualCavabla({ sual: metn, qovluq_id: "all" });
      await tgMesajGonder(token, chatId, nət.cavab.metn);
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
      const elave = db.menbeElaveEt({
        qovluq_id,
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
      await tgMesajGonder(token, chatId, `✅ Sənəd Mərkəzi Beyinə əlavə edildi: ${faylAdi} (${emal.parcalar.length} hissə)`);
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
          await tgMesajGonder(token, chatId, netice.cavab.metn);
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
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    try {
      const enBoyukFoto = msg.photo[msg.photo.length - 1];
      const { buffer } = await tgFaylEndir(token, enBoyukFoto.file_id);
      const analiz = await ai.mediaAnalizEt({
        buffer,
        mimeType: "image/jpeg",
        faylAdi: "telegram_photo.jpg"
      });
      const tamMetn = `${metn ? metn + "\n" : ""}🖼️ [Şəkildəki Mətn/Təsvir]: ${analiz.metn}`;
      canliMesajiBazayaYaz({
        platforma: "Telegram",
        qovluq_id,
        gonderen,
        tarix,
        metn: tamMetn,
        basliq: `🖼️ Şəkil — ${gonderen} (${tarix})`
      });
      tgVeziyyet.qebulEdilenSay++;
      tgVeziyyet.sonMesajTarixi = tarix;
      await tgMesajGonder(token, chatId, `🖼️ Şəkil analiz edildi və yaddaşa saxlanıldı (${gonderen}).`);
      return;
    } catch (e) {
      await tgMesajGonder(token, chatId, `⚠️ Şəkil analiz edilərkən xəta: ${e.message}`);
      return;
    }
  }

  // 4) Adi və ya Forward edilmiş mətn mesajı
  if (metn && metn !== "/start") {
    canliMesajiBazayaYaz({
      platforma: "Telegram",
      qovluq_id,
      gonderen,
      tarix,
      metn,
      basliq: `💬 Telegram — ${gonderen} (${tarix})`
    });
    tgVeziyyet.qebulEdilenSay++;
    tgVeziyyet.sonMesajTarixi = tarix;
    await tgMesajGonder(token, chatId, `🧠 Yaddaşa saxlanıldı: [${tarix}] ${gonderen}`);
  } else if (metn === "/start") {
    await tgMesajGonder(
      token,
      chatId,
      `👋 Salam! Mən sənin BeyinAI (Şəxsi AI Asistant) botunam.\n\n` +
      `📌 Mənə istənilən mesajı, səsli qeydi (voice), PDF/Word faylını və ya şəkli "Forward" et — dərhal oxuyub Mərkəzi Beyin bazasına əlavə edəcəyəm.\n` +
      `❓ Bazadan sual soruşmaq üçün mesajın əvvəlinə "?" qoy (məsələn: "? Əli qiymət barədə nə demişdi?").`
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
