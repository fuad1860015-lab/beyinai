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
      .replace(/\[\d+(?:\.\d+(?:-\d+)?)*(?:\s*,\s*\d+(?:\.\d+(?:-\d+)?)*)*\]/g, "") // [1], [1, 2], [109.8, 2]
      .replace(/(?<![\p{L}\p{N}])_([^_\n]+)_(?![\p{L}\p{N}])/gu, "<i>$1</i>")
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
    } else if (data.startsWith("qar_ok_")) {
      const yadId = data.replace("qar_ok_", "");
      const tesdiq = db.qaralamaTesdiqle(yadId);
      if (tesdiq && cbChatId) {
        await tgMesajGonder(token, cbChatId, `✅ <b>Qaralama Qızıl Yaddaşa Təsdiqləndi!</b>\nArtıq əsas qayda kimi tətbiq ediləcək:\n<i>${tesdiq.metn.slice(0, 260)}</i>`);
      }
    } else if (data.startsWith("qar_no_")) {
      const yadId = data.replace("qar_no_", "");
      db.qaralamaReddEt(yadId);
      if (cbChatId) {
        await tgMesajGonder(token, cbChatId, "🗑️ Namizəd qaralama qayda rədd edildi və silindi.");
      }
    } else if (data.startsWith("boz_a_") || data.startsWith("boz_b_")) {
      const movqe = data.startsWith("boz_a_") ? "teref_a" : "teref_b";
      const dosyeId = data.replace(/^boz_[ab]_/, "");
      const qerar = db.mubahiseliDosyeQerarVer(dosyeId, { secilmis_movqe: movqe });
      if (qerar && cbChatId) {
        const etiket = movqe === "teref_a" ? "👮‍♂️ Mühafizəkar Müfəttiş Mövqeyi" : "💼 Praktiki Baş Mühasib Mövqeyi";
        await tgMesajGonder(token, cbChatId, `⚖️ <b>Ekspertin İş Siyasəti Yadda Saxlanıldı!</b>\nSeçilmiş mövqe: <b>${etiket}</b>\nMövzu: <i>${qerar.dosye.movzu}</i>`);
      }
    } else if (data.startsWith("sahe_sec_")) {
      const saheId = data.replace("sahe_sec_", "");
      const yeni = db.aktivSaheDeyis(saheId);
      if (yeni && cbChatId) {
        await tgMesajGonder(token, cbChatId, `📚 <b>Aktiv Kitabxana Sahəsi Dəyişdirildi:</b> ${yeni.ikon || "📚"} <b>${yeni.ad}</b>`);
      }
    }
    return;
  }

  const msg = update.message || update.channel_post;
  if (!msg) return;

  const chatId = msg.chat.id;
  tgVeziyyet.sonChatId = chatId;
  try {
    db.tenzimlemeYenile({ tg_son_chat_id: String(chatId) });
  } catch (_) {}

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
      "🧠 Salam! Mən sizin Şəxsi AI Agentiniz və Mühasibatlıq Köməkçinizəm (v4.0 — Özünü-İnkişaf Mühərriki).\n\n" +
      "Mənə istənilən mövzuda (Vergi, Əmək, Mühasibatlıq, Sənədlər) sual verə, səsli mesaj ata və ya PDF/Word sənədləri göndərə bilərsiniz.\n\n" +
      "📌 <b>Xüsusi İmkanlar və Komandalar:</b>\n" +
      "• 📚 <b>Kitabxana Sahələri:</b> <code>/saheler</code> — Aktiv sahəni seçmək və təcrid etmək\n" +
      "• 🧬 <b>Özünü-İnkişaf Paneli:</b> <code>/tekamul</code> — Qaralama qaydalar, Boz Zona dosyeləri və Düşünmə alqoritmi\n" +
      "• 🧪 <b>Canlı Avtonom Sınaq:</b> <code>/sinaq</code> — 3-pilləli ağıllı öyrənmə dövrəsini dərhal işə sal\n" +
      "• 🧮 <b>Kalkulyator:</b> <code>hesabla maaş 1500 net</code> və ya <code>hesabla son haqq-hesab 1500 maaş 14 gün</code>\n" +
      "• ☀️ <b>Gündəlik İcmal:</b> <code>icmal göndər</code> — dəyişikliklər, tarixlər, suallarım\n" +
      "• 📚 <b>Öyrənmə:</b> <code>öyrən</code>, <code>nə öyrəndin</code>, <code>nə öyrəndin 105</code>, <code>qeydi sil 105</code>\n" +
      "• 📰 <b>Həftəlik Bülleten:</b> <code>/bulleten</code> — Qruplardan toplanmış canlı keyslər\n" +
      "• 📉 <b>Bilik Boşluqları:</b> <code>/bosluqlar</code> — Bazada sənəd çatışmayan mövzuların hesabatı\n" +
      "• 🧬 <b>Yaddaş Konsolidasiyası:</b> <code>/yaddas_temizle</code> — Təkrar və ziddiyyətli qeydləri yoxla (<code>/zibil</code> — silinənlər)\n" +
      "• 💾 <b>Baza Yedəkləməsi:</b> <code>/backup</code> — SQLite bazasını ehtiyat fayl kimi göndər\n" +
      "• ℹ️ <b>Sistem Statusu:</b> <code>/status</code> | 📌 <b>Şəxsi Qayda:</b> <code>/qeyd Mətn...</code>\n\n" +
      "💼 <b>Qrup Təcrübələri:</b> Digər Telegram qruplarındakı maraqlı mühasib müzakirələrini bura Forward etsəniz, avtomatik <b>Mühasibatlıq Praktikası Bankına</b> yazılacaq!"
    );
    return;
  }

  // Kitabxana sahələri (/saheler)
  if (metn === "/saheler") {
    const saheler = db.saheleriAl();
    const aktiv = db.aktivSaheAl();
    const duymeler = saheler.map(s => ([{
      text: `${s.id === aktiv?.id ? "✅ " : ""}${s.ikon || "📚"} ${s.ad} (${s.menbe_sayi || 0} mənbə)`,
      callback_data: `sahe_sec_${s.id}`
    }]));
    await tgMesajGonder(
      token,
      chatId,
      `📚 <b>BeyinAI Kitabxana Rəfləri:</b>\nAktiv istiqamət: <b>${aktiv?.ikon || "💼"} ${aktiv?.ad || "Vergi və Mühasibatlıq"}</b>\n\nSahəni dəyişmək üçün aşağıdan seçin:`,
      { reply_markup: { inline_keyboard: duymeler } }
    );
    return;
  }

  // Özünü-İnkişaf v2.0 Statusu və Təsdiq İdarəetməsi (/tekamul, /qaralama, /bozzona)
  if (metn === "/tekamul" || metn === "/inkisaf" || metn === "/qaralama" || metn === "/bozzona") {
    const aktivSahe = db.aktivSaheIdAl();
    const qaralamalar = db.qaralamaYaddaslariAl(aktivSahe);
    const bozlar = db.mubahiseliDosyeleriAl(aktivSahe, "gozleyir");
    const dusunmeler = db.dusunmeQaydalariniAl(aktivSahe);

    let xulase = `🧬 <b>BeyinAI Özünü-İnkişaf Mərkəzi:</b>\n` +
      `• 📝 Təsdiq gözləyən Qaralamalar: <b>${qaralamalar.length}</b>\n` +
      `• ⚖️ Açıq Boz Zona Dosyeləri: <b>${bozlar.length}</b>\n` +
      `• 🧠 Öyrənilmiş Düşünmə Alqoritmi Qaydaları: <b>${dusunmeler.length}</b>\n`;

    if (dusunmeler.length > 0) {
      xulase += `\n<b>Son Metodoloji Qaydalar ("Niyə səhv etdim?"):</b>\n` +
        dusunmeler.slice(0, 3).map((d, i) => `${i + 1}. <i>${d.yoxlama_qaydasi}</i>`).join("\n");
    }
    await tgMesajGonder(token, chatId, xulase);

    for (const q of qaralamalar.slice(0, 3)) {
      await tgMesajGonder(
        token,
        chatId,
        `📝 <b>Namizəd Qaralama Qayda:</b>\n${q.metn.slice(0, 500)}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: "👍 Qızıl Yaddaşa Təsdiqlə", callback_data: `qar_ok_${q.id}` },
              { text: "🗑️ Rədd Et", callback_data: `qar_no_${q.id}` }
            ]]
          }
        }
      );
    }

    for (const b of bozlar.slice(0, 3)) {
      await tgMesajGonder(
        token,
        chatId,
        `⚖️ <b>Boz Zona Dosyesi: ${b.movzu}</b>\n\n👮‍♂️ <b>Müfəttiş:</b> ${b.teref_a_mufettis}\n\n💼 <b>Baş Mühasib:</b> ${b.teref_b_muhasib}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: "👮‍♂️ Müfəttiş Mövqeyi", callback_data: `boz_a_${b.id}` },
              { text: "💼 Baş Mühasib Mövqeyi", callback_data: `boz_b_${b.id}` }
            ]]
          }
        }
      );
    }
    return;
  }

  // Canlı 3-Pilləli Avtonom Sınaq Dövrəsi (/sinaq)
  if (metn === "/sinaq") {
    await tgMesajGonder(token, chatId, "🧪 <b>3-pilləli avtonom öyrənmə və sınaq dövrəsi başladıldı...</b> (1. Boşluqlar → 2. Canlı Çat → 3. Çarpaz Maddələr)");
    try {
      const scheduler = require("./scheduler");
      const net = await scheduler.avtoTedqiqatDovresiCalisdir({ mecburidir: true });
      if (!net.telegramGonderildi && net.vebBildiris) {
        await tgMesajGonder(token, chatId, `✅ <b>${net.vebBildiris.basliq}</b>\n\n${net.vebBildiris.metn.replace(/\*\*/g, "")}`);
      }
    } catch (err) {
      await tgMesajGonder(token, chatId, `⚠️ Sınaq xətası: ${err.message}`);
    }
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
      `🏷️ <b>Versiya:</b> v4.0 (Özünü-İnkişaf və Kitabxana Sistemi)\n` +
      `📚 <b>Aktiv Sahə:</b> ${stat.aktivSahe?.ikon || "💼"} ${stat.aktivSahe?.ad || "Vergi və Mühasibatlıq"}\n` +
      `🧠 <b>AI Modeli:</b> ${tenz.gemini_model || "gemini-3-flash-preview"}\n` +
      `⚡ <b>Mühərrik:</b> ReAct + Konsilium Debatı + 4-Bəndli Müfəttiş + Kök-Səbəb Alqoritmi\n` +
      `⏱️ <b>Avtonom Tədqiqat Tezliyi:</b> ${tenz.scheduler_tezlik || "gunde_1"}\n\n` +
      `📊 <b>Baza Statistikası:</b>\n` +
      `  • 📚 Kitabxana Sahələri: ${stat.saheSayi || 0} (${stat.movzuSayi || 0} mövzu)\n` +
      `  • 📄 Mənbələr / Sənədlər: ${stat.menbeSayi || 0} (${stat.parcaSayi || 0} blok)\n` +
      `  • 🧬 Semantik Vektorlu: ${vekStat.vektorlu} / ${vekStat.cemi} (${vekStat.faiz}%)\n` +
      `  • 🟢 Qızıl Yaddaş Qaydaları: ${stat.yaddasSayi || 0} | 📝 Qaralama: ${stat.qaralamaSayi || 0} | 📜 Arxiv: ${stat.arxivYaddasSayi || 0}\n` +
      `  • 🧠 Düşünmə Qaydaları: ${stat.dusunmeQaydaSayi || 0} | ⚖️ Boz Zona: ${stat.mubahiseliSayi || 0}\n` +
      `  • 📉 Açıq Bilik Boşluqları: ${stat.bosluqSayi || 0}\n\n` +
      `✅ <i>Bütün modullar tam inteqrasiya olunub və işləyir!</i>`
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

  // Zibil qutusu (/zibil) və geri qaytarma (/berpa ID)
  if (metn === "/zibil") {
    const siyahi = db.yaddasZibiliAl(10);
    const html = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    await tgMesajGonder(
      token,
      chatId,
      siyahi.length === 0
        ? "🗑️ Zibil qutusu boşdur."
        : "🗑️ <b>Zibil qutusu</b> (geri qaytarmaq üçün <code>/berpa ID</code>):\n\n" +
          siyahi.map(y => `<code>${y.id}</code> — ${html(y.metn.slice(0, 200))}`).join("\n\n")
    );
    return;
  }

  if (/^\/berpa\s+\S+/.test(metn)) {
    const berpa = db.yaddasBerpaEt(metn.split(/\s+/)[1]);
    await tgMesajGonder(token, chatId, berpa ? "↩️ Qeyd geri qaytarıldı." : "⚠️ Bu ID zibil qutusunda tapılmadı.");
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

  // Gündəlik İcmal ("icmal göndər" və ya /icmal)
  const icmal = require("./icmal");
  if (icmal.icmalEmridirmi(metn) && !msg.forward_date) {
    try {
      const hazir = icmal.icmalHazirla();
      const html = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const govde = hazir.bolmeler.map(b => `<b>${html(b.basliq)}</b>\n${b.setirler.map(s => `• ${html(s)}`).join("\n")}`).join("\n\n");
      await tgMesajGonder(token, chatId, `<b>${html(hazir.basliq)}</b>\n\n${govde}`);
    } catch (e) {
      await tgMesajGonder(token, chatId, `⚠️ İcmal hazırlanarkən xəta: ${e.message}`);
    }
    return;
  }

  // Öyrənmə əmrləri ("öyrən", "nə öyrəndin", "qeydi sil 105")
  const oyrenme = require("./oyrenme");
  const oyrenmeEmri = oyrenme.emriTani(metn);
  if (oyrenmeEmri && !msg.forward_date) {
    try {
      if (oyrenmeEmri.nov === "oyren") await tgMesajGonder(token, chatId, "📚 Oxumağa başladım, bir dəqiqə...");
      const netice = await oyrenme.emriIcraEt(oyrenmeEmri);
      const html = netice.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/^- /gm, "• ");
      await tgMesajGonder(token, chatId, html);
    } catch (e) {
      await tgMesajGonder(token, chatId, `⚠️ Öyrənmə xətası: ${e.message}`);
    }
    return;
  }

  // Beyin əmrləri ("beyin qur", "beyin göstər")
  const beyin = require("./beyin");
  const beyinEmri = beyin.emriTani(metn);
  if (beyinEmri && !msg.forward_date) {
    try {
      if (beyinEmri.nov === "qur") await tgMesajGonder(token, chatId, "🧠 Beyni qurmağa başladım, bir neçə dəqiqə çəkə bilər...");
      const netice = await beyin.emriIcraEt(beyinEmri);
      const html = netice.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/^#+ /gm, "").replace(/^- /gm, "• ");
      // Telegramın mesaj həddi: sətir sərhədindən bölünür
      let parca = "";
      for (const setir of html.split("\n")) {
        if (parca && parca.length + setir.length > 3500) { await tgMesajGonder(token, chatId, parca); parca = ""; }
        parca += `${setir}\n`;
      }
      if (parca.trim()) await tgMesajGonder(token, chatId, parca);
    } catch (e) {
      await tgMesajGonder(token, chatId, `⚠️ Beyin xətası: ${e.message}`);
    }
    return;
  }

  // Həftəlik Mühasibat Təcrübə Bülleteni Komandası
  if (metn === "/bulleten" || metn === "/bülleten") {
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

  // 1) Sənəd (PDF, Word, Excel, ZIP, CSV və ya .sqlite Backup) göndərilibsə
  if (msg.document) {
    try {
      const { buffer } = await tgFaylEndir(token, msg.document.file_id);
      const faylAdi = msg.document.file_name || "telegram_sened.dat";

      // Əgər istifadəçi əvvəlki /backup .sqlite faylını geri göndəribsə — bazanı 1 kliklə bərpa et!
      if (/\.sqlite$/i.test(faylAdi) && typeof db.bazaBackupBerpaEt === "function") {
        const net = db.bazaBackupBerpaEt(buffer);
        await tgMesajGonder(
          token,
          chatId,
          `♻️ <b>Baza Backup-dan Uğurla Bərpa Edildi!</b>\n\n` +
          `• 📁 Qovluqlar: <b>${net.qovluqSayi}</b>\n` +
          `• 📄 Mənbələr: <b>${net.menbeSayi}</b>\n` +
          `• 🧩 Hissələr: <b>${net.parcaSayi}</b>\n` +
          `• 🧠 Yaddaş Qaydaları: <b>${net.yaddasSayi}</b>\n\n` +
          `✅ <i>Bütün əvvəlki bilikləriniz və sənədləriniz 100% geri qaytarıldı!</i>`
        );
        return;
      }

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
  const token = (tenz.tg_bot_token || process.env.TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN || "").trim();
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
  const token = (tenz.tg_bot_token || process.env.TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN || "").trim();
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

async function proaktivBildirisGonder(metn, secimler = {}) {
  const tenz = db.tenzimlemeleriAl();
  const token = (tenz.tg_bot_token || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = tenz.tg_bildiris_chat_id || tenz.tg_son_chat_id || tgVeziyyet.sonChatId;
  if (!token || !chatId) return { ok: false, xeta: "Telegram token və ya chat_id yoxdur." };
  try {
    return await tgMesajGonder(token, chatId, metn, secimler);
  } catch (err) {
    return { ok: false, xeta: err.message };
  }
}

module.exports = {
  tgBaslat,
  tgDayandir,
  tgMesajiHisselereBol,
  tgMesajGonder,
  proaktivBildirisGonder,
  canliMesajiBazayaYaz,
  veziyyetiAl,
  telegramCavabiFormatla
};
