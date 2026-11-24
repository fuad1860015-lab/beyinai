// BeyinAI — Azərbaycan Dili Üzrə Səsli Cavab Mühərriki (TTS - Text-to-Speech)
// Teleqram üçün təbii səsli qeyd (Voice Note / Audio) generasiyası
"use strict";

/**
 * Mətni səsləndirmə üçün təmizləyir:
 * HTML teqlərini, sitat nömrələrini [1], [2], ulduzları və xüsusi işarələri atır
 */
function metniSesUcuntemizle(metn = "") {
  if (!metn) return "";

  return metn
    .replace(/<[^>]+>/g, " ") // HTML teqlərini sil
    .replace(/\[\d+\]/g, "") // [1], [2] sitatlarını sil
    .replace(/[#*_`~]/g, "") // Markdown işarələrini sil
    .replace(/###\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Uzun mətni 150-180 simvolluq məntiqi cümlələrə/parçalara bölür
 */
function sesParcalarinaBol(metn, maksUzunluq = 170) {
  const cumleler = metn.split(/(?<=[.?!;:\n])\s+/);
  const parcalar = [];
  let cari = "";

  for (const c of cumleler) {
    if ((cari + " " + c).trim().length <= maksUzunluq) {
      cari = (cari + " " + c).trim();
    } else {
      if (cari) parcalar.push(cari);
      if (c.length <= maksUzunluq) {
        cari = c;
      } else {
        // Çox uzun cümlədirsə vergüllərə böl
        const hisseler = c.split(/,\s*/);
        for (const h of hisseler) {
          if ((cari + " " + h).trim().length <= maksUzunluq) {
            cari = (cari + " " + h).trim();
          } else {
            if (cari) parcalar.push(cari);
            cari = h.slice(0, maksUzunluq);
          }
        }
      }
    }
  }
  if (cari) parcalar.push(cari);

  // Səsli mesaj çox uzun olmasın deyə maksimum 4 parça (təxminən 40-50 saniyə) götürürük
  return parcalar.slice(0, 4);
}

/**
 * Mətni Azərbaycan dilində audio buferinə çevirir (Google TTS)
 */
async function metniSeseCevir(xammMetn) {
  const temiz = metniSesUcuntemizle(xammMetn);
  if (!temiz || temiz.length < 3) {
    throw new Error("Səsləndiriləcək mətn tapılmadı.");
  }

  // Maksimum 500 simvol xülasə götür
  const sesMetni = temiz.slice(0, 550);
  const parcalar = sesParcalarinaBol(sesMetni);

  const buferler = [];
  for (const parca of parcalar) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(parca)}&tl=az&client=tw-ob`;
    try {
      const cavab = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        signal: AbortSignal.timeout(8000)
      });
      if (!cavab.ok) continue;
      const arrayBuf = await cavab.arrayBuffer();
      buferler.push(Buffer.from(arrayBuf));
    } catch (_) {
      // Bir parça xəta verərsə digərlərini davam et
    }
  }

  if (buferler.length === 0) {
    throw new Error("Səs faylı generasiya edilə bilmədi.");
  }

  return Buffer.concat(buferler);
}

/**
 * Teleqrama birbaşa səsli qeyd (Voice note) və ya audio göndərir
 */
async function tgSesliMesajGonder(token, chatId, audioBuffer, caption = "") {
  const url = `https://api.telegram.org/bot${token}/sendVoice`;

  const formData = new FormData();
  formData.append("chat_id", String(chatId));

  // Telegram sendVoice üçün audio/ogg və ya audio/mpeg blob
  const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });
  formData.append("voice", audioBlob, "beyinai_ses.ogg");

  if (caption) {
    formData.append("caption", caption.slice(0, 1024));
  }

  const cavab = await fetch(url, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(20000)
  });

  const netice = await cavab.json();
  if (!netice.ok) {
    // Əgər sendVoice alınmazsa sendAudio ilə cəhd et
    const audioUrl = `https://api.telegram.org/bot${token}/sendAudio`;
    const fd2 = new FormData();
    fd2.append("chat_id", String(chatId));
    fd2.append("audio", new Blob([audioBuffer], { type: "audio/mpeg" }), "beyinai_cavab.mp3");
    if (caption) fd2.append("caption", caption.slice(0, 1024));

    const res2 = await fetch(audioUrl, {
      method: "POST",
      body: fd2,
      signal: AbortSignal.timeout(20000)
    });
    return await res2.json();
  }

  return netice;
}

module.exports = {
  metniSesUcuntemizle,
  sesParcalarinaBol,
  metniSeseCevir,
  tgSesliMesajGonder
};
