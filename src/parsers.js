// Çoxşaxəli Məlumat və Çat Emalı Mühərriki (v2.0 — Sürətli, Xətti-Vaxtlı, Bloklanmayan)
// WhatsApp (.txt/.zip + Voice/Şəkil), Telegram (.json/.html/.zip), PDF (O(N) Mühərrik + Vision OCR),
// Word (.docx), Excel (.xlsx/.csv), Səs faylları, Şəkillər, Veb Linklər və YouTube + Avtomatik Sənəd Pasportu.
"use strict";

const zlib = require("node:zlib");
const path = require("node:path");
const ai = require("./ai");
const { pdfMetnVeSehifeleriCixar } = require("./pdf-engine");

// ---- 0. Avtomatik Sənəd və Çat Pasportu Çıxarıcısı (Entity & Fact Extractor) ----
function senedPasportuCixar(metn) {
  const s = String(metn || "").slice(0, 250000);

  // 1) Məbləğlər (AZN, ₼, manat, USD, $, EUR, €, % ƏDV)
  const meblegRegex = /\b\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?\s*(?:AZN|₼|manat|man\.|USD|\$|EUR|€|rubl|TL|%)/gi;
  const meblegler = Array.from(new Set((s.match(meblegRegex) || []).map(x => x.replace(/\s+/g, " ").trim()))).slice(0, 25);

  // 2) Tarixlər (12.11.2026, 2026-11-12, 12 noyabr 2026)
  const tarixRegex = /\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:yanvar|fevral|mart|aprel|may|iyun|iyul|avqust|sentyabr|oktyabr|noyabr|dekabr)\s+\d{4})/gi;
  const tarixler = Array.from(new Set((s.match(tarixRegex) || []).map(x => x.trim()))).slice(0, 25);

  // 3) VÖEN (10 rəqəm), Sənəd № və Telefonlar
  const voenMatch = s.match(/\bVÖEN[:\s-]*(\d{10})\b|\b[12]\d{9}\b/gi) || [];
  const nomreMatch = s.match(/№\s*[A-Za-z0-9/-]{2,20}/g) || [];
  const kodlar = Array.from(new Set([...voenMatch, ...nomreMatch].map(x => x.trim()))).slice(0, 20);

  // 4) Tapşırıqlar, Sözlər və Öhdəlik cümlələri
  const tapsiriqAcar = /(?:təhvil|göndər|ödənil|hazırla|bitir|son tarix|deadline|lazımdır|olmalıdır|edəcəm|edəcəyəm|söz verir|cərimə|avans|qaimə|müqavilə)/i;
  // 5) Avtonom Öyrənmə üçün Yüksək Dəyərli Hüquqi/Vergi Qaydaları (Rəqəm/Faiz/Maddə + Norma feili)
  const qaydaFeilAcar = /(?:azaddır|məcburidir|qadağandır|tutulur|cərimə|maliyyə\s*sanksiyası|əvəzləşdirilir|gəlirdən\s*çıxılmır|gəlirdən\s*çıxılır|dəqiqləşdirilir|ləğv\s*edilir|hesablanır|tətbiq\s*edilmir)/i;
  const qaydaReqemAcar = /(?:\b\d+(?:[.,\s]\d+)*\s*(?:%|faiz|AZN|manat|gün|iş\s*günü|ay|il)\b|\bmaddə\s*\d+|\b\d{1,3}\.\d+(?:\.\d+)*\b)/i;

  const cumleler = s.split(/(?<=[.!?])\s+|\n+/);
  const tapsiriqlar = [];
  const avto_qaydalar = [];

  for (const c of cumleler) {
    const t = c.replace(/^[-•*]+\s*/, "").replace(/\s+/g, " ").trim();
    if (t.length >= 20 && t.length <= 260 && tapsiriqAcar.test(t) && tapsiriqlar.length < 15) {
      tapsiriqlar.push(t);
    }
    if (t.length >= 45 && t.length <= 320 && qaydaFeilAcar.test(t) && qaydaReqemAcar.test(t) && avto_qaydalar.length < 6) {
      if (!avto_qaydalar.some(q => q.slice(0, 50).toLowerCase() === t.slice(0, 50).toLowerCase())) {
        avto_qaydalar.push(t);
      }
    }
  }

  return {
    meblegler,
    tarixler,
    kodlar,
    tapsiriqlar,
    avto_qaydalar
  };
}

// ---- 1. Daxili ZIP Açıcı (node:zlib ilə — xarici kitabxana olmadan) ----
function zipAc(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let eocdPos = -1;
  const minPos = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new Error("ZIP strukturu tapılmadı və ya fayl zədələnib.");

  const girisSayi = buf.readUInt16LE(eocdPos + 10);
  let cdOffset = buf.readUInt32LE(eocdPos + 16);
  const fayllar = {};

  for (let i = 0; i < girisSayi; i++) {
    if (cdOffset + 46 > buf.length || buf.readUInt32LE(cdOffset) !== 0x02014b50) break;
    const metod = buf.readUInt16LE(cdOffset + 10);
    const sixilmishOlcu = buf.readUInt32LE(cdOffset + 20);
    const adUzunluq = buf.readUInt16LE(cdOffset + 28);
    const elaveUzunluq = buf.readUInt16LE(cdOffset + 30);
    const serhUzunluq = buf.readUInt16LE(cdOffset + 32);
    const yerliOffset = buf.readUInt32LE(cdOffset + 42);

    const ad = buf.subarray(cdOffset + 46, cdOffset + 46 + adUzunluq).toString("utf8");
    cdOffset += 46 + adUzunluq + elaveUzunluq + serhUzunluq;

    if (ad.endsWith("/")) continue;
    if (yerliOffset + 30 > buf.length || buf.readUInt32LE(yerliOffset) !== 0x04034b50) continue;

    const yerliAdUz = buf.readUInt16LE(yerliOffset + 26);
    const yerliElaveUz = buf.readUInt16LE(yerliOffset + 28);
    const dataBaslangic = yerliOffset + 30 + yerliAdUz + yerliElaveUz;
    const xamData = buf.subarray(dataBaslangic, dataBaslangic + sixilmishOlcu);

    try {
      if (metod === 0) {
        fayllar[ad] = xamData;
      } else if (metod === 8) {
        fayllar[ad] = zlib.inflateRawSync(xamData);
      }
    } catch (_) {}
  }

  return fayllar;
}

// ---- 2. Mətn Təmizləyici və Ağıllı Cümlə-Əsaslı Parçalayıcı (Smart Sentence Chunking) ----
function nlmZibilleriniTemizle(metn) {
  const uiIkonlar = new Set([
    "add_2", "share_1", "more_vert", "settings", "pro", "collapse_content",
    "button_magic", "arrow_drop_up", "keyboard_arrow_down", "search_spark",
    "arrow_forward", "keep_pin", "content_copy", "copy", "thumb_up", "thumb_down",
    "side_nav", "bloknot yaradın", "paylaşın", "studio", "studiya", "audio icmal",
    "slayd dəsti", "video icmal", "zehin xəritəsi", "öyrədici kartlar", "kviz",
    "infoqrafika", "hesabatlar", "yenilik!", "mənbələr", "mənbə təlimatı"
  ]);

  const setirler = String(metn || "").replace(/\r\n/g, "\n").split("\n");
  const temizSetirler = [];

  for (let i = 0; i < setirler.length; i++) {
    const s = setirler[i].trim();
    if (!s) {
      temizSetirler.push("");
      continue;
    }
    if (uiIkonlar.has(s.toLocaleLowerCase("az"))) continue;
    // Tək sətirdə qalmış NotebookLM istinad rəqəmlərini (məs: "12") sil
    if (/^\d{1,2}$/.test(s)) continue;
    if (/^Gemini Notebook səhvlərə yol verə bilər/i.test(s)) continue;
    if (/^Sual verin və ya bir şey yaradın/i.test(s)) continue;
    temizSetirler.push(setirler[i]);
  }

  let birleshmish = temizSetirler
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // e-qanun.az və digər qanunvericilik sənədlərinin sonundakı "İSTİFADƏ OLUNMUŞ MƏNBƏ SƏNƏDLƏRİNİN SİYAHISI" (qüvvədən düşmüş köhnə redaksiyalar və haşiyələr) hissəsini avtomatik kəs
  const istinadSiyahiIdx = birleshmish.search(/\n\s*İSTİFADƏ OLUNMUŞ MƏNBƏ SƏNƏDLƏRİNİN SİYAHISI\s*\n/i);
  if (istinadSiyahiIdx > 2500) {
    birleshmish = birleshmish.slice(0, istinadSiyahiIdx).trim();
  }

  // Qanun mətnlərindəki "[1036]", "[1158]" kimi haşiyə nömrələrini təmizlə ki, sitat nömrələri və maddə rəqəmləri ilə qarışmasın
  birleshmish = birleshmish.replace(/\[\d{2,4}\]/g, "");

  return birleshmish;
}

// Mətni sözləri yarıdan kəsmədən, tam cümlə sərhədləri ilə hissələrə bölür
function cumleSərhədiTapSon(metn, hedefUzunluq) {
  if (metn.length <= hedefUzunluq) return metn;
  const baslangic = metn.length - hedefUzunluq;
  const kesik = metn.slice(baslangic);
  // İlk cümlə başlanğıcını və ya boşluğu tap ki, söz yarıdan kəsilməsin
  const cumleBasi = kesik.search(/(?<=[.!?]\s+|\n)[A-ZƏÖÜĞÇŞİ0-9"“•-]/);
  if (cumleBasi > 0 && cumleBasi < kesik.length - 30) {
    return kesik.slice(cumleBasi).trim();
  }
  const bosluq = kesik.indexOf(" ");
  return bosluq > 0 ? kesik.slice(bosluq + 1).trim() : kesik.trim();
}

// Universal Struktur/Maddə Başlığı Aşkaretmə (Qanunlar, Konstitusiya, Məcəllələr, Müqavilələr, Kitab Fəsilləri üçün)
function abzasdanBasliqTap(abzas) {
  const ilkSetir = String(abzas || "").split("\n")[0].trim();
  if (!ilkSetir || ilkSetir.length > 160) return null;

  // 1) "Maddə 163. Vergi tutulan dövriyyənin dəqiqləşdirilməsi" və ya "Maddə 71-1."
  if (/^Maddə\s+\d+[0-9.-]*\.?(?:\s+|$)/i.test(ilkSetir)) {
    return ilkSetir.replace(/\s+/g, " ").slice(0, 120);
  }
  // 2) Fəsil / Bölmə / Başlıq ("I fəsil.", "Fəsil 3.", "# Başlıq")
  if (/^(?:[IVXLCDM]+\s+fəsil|fəsil\s+[IVXLCDM0-9]+|bölmə\s+[IVXLCDM0-9]+|#{1,3}\s+\S+)/i.test(ilkSetir)) {
    return ilkSetir.replace(/^#+\s*/, "").replace(/\s+/g, " ").slice(0, 110);
  }
  // 3) Müqavilə və rəsmi sənəd bənd başlıqları ("1. TƏRƏFLƏR", "2. MÜQAVİLƏNİN PREDMETİ")
  if (/^\d{1,2}\.\s+[A-ZƏÖÜĞÇŞİ0-9\s,()-]{4,80}$/.test(ilkSetir)) {
    return ilkSetir.replace(/\s+/g, " ").slice(0, 100);
  }
  return null;
}

function metniParcala(metn, basliqPrefix = "Hissə", parcaOlcusu = 1500, ustUste = 180) {
  const temiz = nlmZibilleriniTemizle(metn);
  if (!temiz) return [];

  const abzaslar = temiz.split(/\n\n+/);
  const parcalar = [];
  let cari = "";
  let cariBolmeBasligi = "";
  let cariBolmeHissesi = 1;
  let sira = 1;

  const parcaElaveEt = (icerik) => {
    const t = String(icerik || "").trim();
    if (!t) return;
    let basliq = `${basliqPrefix} — Hissə ${sira}`;
    let yekunMetn = t;

    if (cariBolmeBasligi) {
      basliq = cariBolmeHissesi > 1
        ? `${cariBolmeBasligi} (Hissə ${cariBolmeHissesi})`
        : cariBolmeBasligi;

      // Uzun maddələrin içindəki alt-bənd nömrələrini (məs: 102.1.30, 175.8, 218.5) tapıb başlığa əlavə et!
      const anaMaddeMatch = cariBolmeBasligi.match(/^Maddə\s+(\d+[0-9-]*)/i);
      if (anaMaddeMatch && anaMaddeMatch[1] && !basliq.includes("[Bənd:")) {
        const anaNo = anaMaddeMatch[1];
        const bendRegex = new RegExp(`\\b(${anaNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+(?:\\.\\d+)*(?:-\\d+)?)\\b`, "g");
        const bendler = Array.from(new Set(Array.from(t.matchAll(bendRegex)).map(m => m[1])));
        if (bendler.length === 1) {
          basliq += ` [Bənd: ${bendler[0]}]`;
        } else if (bendler.length > 1) {
          basliq += ` [Bənd: ${bendler[0]}–${bendler[bendler.length - 1]}]`;
        }
      }

      // Əgər uzun maddənin 2-ci, 3-cü hissəsidirsə və mətndə maddənin adı yoxdursa, əvvəlinə kontekst başlığını əlavə et ki axtarışda və sitatda itməsin!
      if (cariBolmeHissesi > 1 && !t.startsWith(cariBolmeBasligi)) {
        yekunMetn = `[${basliq} — davamı]\n${t}`;
      }
      cariBolmeHissesi++;
    }

    parcalar.push({
      basliq,
      metn: yekunMetn,
      gonderen: "",
      tarix: ""
    });
    sira++;
  };

  for (const abzas of abzaslar) {
    const yeniBasliq = abzasdanBasliqTap(abzas);

    // Yeni Maddə və ya əsas bölmə başladıqda əvvəlki yığılmış mətni ayrıca blok kimi bağla (beləliklə iki fərqli maddə bir-birinə qarışmır!)
    if (yeniBasliq && /^Maddə\s+\d+/i.test(yeniBasliq)) {
      if (cari.trim()) {
        parcaElaveEt(cari);
        cari = "";
      }
      cariBolmeBasligi = yeniBasliq;
      cariBolmeHissesi = 1;
    } else if (yeniBasliq && !cariBolmeBasligi) {
      cariBolmeBasligi = yeniBasliq;
      cariBolmeHissesi = 1;
    }

    // Əgər tək bir abzas həddindən artıq uzundursa, cümlələrə görə böl (sözləri kəsmədən!)
    if (abzas.length > parcaOlcusu * 1.3) {
      if (cari.trim()) {
        parcaElaveEt(cari);
        cari = "";
      }
      const cumleler = abzas.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
      let altCari = "";
      for (const cumle of cumleler) {
        if ((altCari + " " + cumle).length > parcaOlcusu && altCari.length > 0) {
          parcaElaveEt(altCari);
          const overlap = cumleSərhədiTapSon(altCari, ustUste);
          altCari = overlap ? overlap + " " + cumle : cumle;
        } else {
          altCari = altCari ? altCari + " " + cumle : cumle;
        }
      }
      if (altCari.trim()) {
        cari = altCari.trim();
      }
      continue;
    }

    if ((cari + "\n\n" + abzas).length > parcaOlcusu && cari.length > 0) {
      parcaElaveEt(cari);
      const sonTamHisse = cumleSərhədiTapSon(cari, ustUste);
      cari = sonTamHisse ? sonTamHisse + "\n\n" + abzas : abzas;
    } else {
      cari = cari ? cari + "\n\n" + abzas : abzas;
    }
  }

  if (cari.trim()) {
    parcaElaveEt(cari);
  }

  return parcalar;
}

// ---- 3. WhatsApp Çat Parseri (.txt və .zip + Səs/Şəkil Media Birləşdiricisi) ----
function tarixiStandartlashdir(tarixStr, saatStr = "") {
  const m = String(tarixStr || "").trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return (tarixStr + " " + saatStr).trim();
  let gun = m[1].padStart(2, "0");
  let ay = m[2].padStart(2, "0");
  let il = m[3].length === 2 ? "20" + m[3] : m[3];
  if (Number(ay) > 12 && Number(gun) <= 12) {
    const tmp = gun;
    gun = ay;
    ay = tmp;
  }
  const saat = String(saatStr || "").trim().slice(0, 5);
  return `${il}-${ay}-${gun}${saat ? " " + saat : ""}`;
}

async function whatsappOxu(metn, faylAdi = "WhatsApp Çatı", mediaMap = {}) {
  const setirler = String(metn || "").replace(/\r\n/g, "\n").split("\n");
  const wpRegex = /^[\u200e\u200f]*\[?(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})[, ]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]?(?:\s*-\s*|\s+)([^:]{1,60}):\s*(.*)$/;

  const mesajlar = [];
  const istirakcilar = new Set();

  for (const setir of setirler) {
    const uygun = setir.length < 2000 ? setir.match(wpRegex) : null;
    if (uygun) {
      const [, tarixHisse, saatHisse, gonderenHisse, mesajMetn] = uygun;
      const gonderen = gonderenHisse.replace(/[\u200e\u200f~]/g, "").trim();
      if (/messages and calls are end-to-end encrypted|şifrələnib/i.test(mesajMetn)) {
        continue;
      }
      istirakcilar.add(gonderen);
      mesajlar.push({
        tarix: tarixiStandartlashdir(tarixHisse, saatHisse),
        xamTarix: `${tarixHisse} ${saatHisse}`,
        gonderen,
        metn: mesajMetn.trim()
      });
    } else if (mesajlar.length > 0 && setir.trim()) {
      mesajlar[mesajlar.length - 1].metn += "\n" + setir.trim();
    }
  }

  const mediaAcarlar = Object.keys(mediaMap);
  if (mediaAcarlar.length > 0) {
    let mediaSaygac = 0;
    for (const msg of mesajlar) {
      if (mediaSaygac >= 10) break;
      for (const mAd of mediaAcarlar) {
        const bazaAd = path.basename(mAd);
        if (msg.metn.includes(bazaAd)) {
          mediaSaygac++;
          const analiz = await ai.mediaAnalizEt({
            buffer: mediaMap[mAd],
            mimeType: bazaAd.match(/\.(ogg|opus|mp3|wav|m4a)$/i) ? "audio/ogg" : "image/jpeg",
            faylAdi: bazaAd
          });
          if (analiz && analiz.metn) {
            const etiket = bazaAd.match(/\.(ogg|opus|mp3|wav|m4a)$/i) ? "🎙️ [Səsli Mesajın Mətni]" : "🖼️ [Şəkildəki Mətn/OCR]";
            msg.metn += `\n${etiket}: ${analiz.metn}`;
          }
        }
      }
    }
  }

  const pasport = senedPasportuCixar(metn);

  if (mesajlar.length === 0) {
    const parcalar = metniParcala(metn, faylAdi);
    return {
      nov: "txt",
      xulase: `Mətn sənədi • ${parcalar.length} hissə (${setirler.length} sətir)`,
      meta: { setir_sayi: setirler.length, pasport },
      xam_metn: metn,
      parcalar
    };
  }

  const parcalar = sohbetPenceresiYarat(mesajlar, faylAdi);
  const ilkTarix = mesajlar[0]?.tarix || "";
  const sonTarix = mesajlar[mesajlar.length - 1]?.tarix || "";
  const kimler = Array.from(istirakcilar);

  // Hər iştirakçının mesaj statistikasını hesabla
  const kimStat = {};
  for (const m of mesajlar) {
    kimStat[m.gonderen] = (kimStat[m.gonderen] || 0) + 1;
  }

  return {
    nov: "whatsapp",
    xulase: `WhatsApp çatı • ${mesajlar.length} mesaj • İştirakçılar: ${kimler.slice(0, 6).join(", ")} (${ilkTarix} — ${sonTarix})`,
    meta: {
      platforma: "WhatsApp",
      mesaj_sayi: mesajlar.length,
      istirakcilar: kimler,
      istirakci_stat: kimStat,
      ilk_tarix: ilkTarix,
      son_tarix: sonTarix,
      pasport
    },
    xam_metn: mesajlar.slice(0, 5000).map(m => `[${m.tarix}] ${m.gonderen}: ${m.metn}`).join("\n"),
    parcalar
  };
}

// ---- 4. Telegram Çat Parseri (result.json və .html) ----
function telegramMetnCixar(textField) {
  if (!textField) return "";
  if (typeof textField === "string") return textField;
  if (Array.isArray(textField)) {
    return textField.map(item => {
      if (typeof item === "string") return item;
      if (item && typeof item.text === "string") return item.text;
      return "";
    }).join("");
  }
  return "";
}

async function telegramJsonOxu(jsonStr, faylAdi = "Telegram Çatı", mediaMap = {}) {
  const data = JSON.parse(jsonStr);
  const catAdi = data.name || faylAdi;
  const xamMesajlar = Array.isArray(data.messages) ? data.messages : [];

  const idMap = new Map();
  const mesajlar = [];
  const istirakcilar = new Set();
  const kimStat = {};
  let mediaSaygac = 0;

  for (const m of xamMesajlar) {
    if (m.type !== "message") continue;
    const gonderen = (m.from || m.actor || "Naməlum").trim();
    const tarix = String(m.date || "").replace("T", " ").slice(0, 16);
    let metn = telegramMetnCixar(m.text).trim();

    const mediaYolu = m.file || m.photo || "";
    if (mediaYolu && mediaMap[mediaYolu] && mediaSaygac < 10) {
      mediaSaygac++;
      const bazaAd = path.basename(mediaYolu);
      const analiz = await ai.mediaAnalizEt({
        buffer: mediaMap[mediaYolu],
        mimeType: bazaAd.match(/\.(ogg|opus|mp3|wav|m4a)$/i) ? "audio/ogg" : "image/jpeg",
        faylAdi: bazaAd
      });
      if (analiz && analiz.metn) {
        metn += (metn ? "\n" : "") + `🎙️/🖼️ [Media (${bazaAd})]: ${analiz.metn}`;
      }
    } else if (m.media_type === "voice_message" && !metn) {
      metn = `[Səsli mesaj (${m.duration_seconds || 0} san.) - ${m.file || ""}]`;
    } else if (m.photo && !metn) {
      metn = `[Fotoşəkil - ${m.photo}]`;
    }

    if (!metn) continue;

    if (m.reply_to_message_id && idMap.has(m.reply_to_message_id)) {
      const evvelki = idMap.get(m.reply_to_message_id);
      const qisaEvvelki = evvelki.metn.slice(0, 80).replace(/\n/g, " ");
      metn = `↪ (${evvelki.gonderen}: "${qisaEvvelki}..." mesajına cavab): ${metn}`;
    }

    const msgObj = { id: m.id, tarix, gonderen, metn };
    idMap.set(m.id, msgObj);
    istirakcilar.add(gonderen);
    kimStat[gonderen] = (kimStat[gonderen] || 0) + 1;
    mesajlar.push(msgObj);
  }

  const parcalar = sohbetPenceresiYarat(mesajlar, catAdi);
  const ilkTarix = mesajlar[0]?.tarix || "";
  const sonTarix = mesajlar[mesajlar.length - 1]?.tarix || "";
  const kimler = Array.from(istirakcilar);
  const tamMetn = mesajlar.slice(0, 5000).map(m => `[${m.tarix}] ${m.gonderen}: ${m.metn}`).join("\n");

  return {
    nov: "telegram",
    ad: catAdi,
    xulase: `Telegram çatı (${catAdi}) • ${mesajlar.length} mesaj • İştirakçılar: ${kimler.slice(0, 6).join(", ")}`,
    meta: {
      platforma: "Telegram",
      cat_adi: catAdi,
      mesaj_sayi: mesajlar.length,
      istirakcilar: kimler,
      istirakci_stat: kimStat,
      ilk_tarix: ilkTarix,
      son_tarix: sonTarix,
      pasport: senedPasportuCixar(tamMetn)
    },
    xam_metn: tamMetn,
    parcalar
  };
}

// ---- 5. Ağıllı Çat Süzgəci və Praktiki Təcrübə Çıxarıcısı ----
const muhasibatlikAcarlari = /(?:qaimə|qaime|ədv|evezles|vergi|bəyannamə|beyanname|kameral|hesab|əmək\s*haqqı|emek\s*haqqi|maaş|məzuniyyət|mezuniyyet|xəbərdarlıq|xitam|dövriyyə|dovriyye|pos|e-taxes|btp|gəlir\s*vergisi|mənfəət|menfeet|sadələşdirilmiş|sadeləşdirilmiş|cərimə|cerime|sanksiya|müfəttiş|mufettis|yoxlama|akt|hesab-faktura|idxal|ixrac|gömrük|gomruk|əsas\s*vəsait|esas\s*vesait|amortizasiya|subyekt|depozit|şhv|shv|şəxsi\s*hesab|1c|mühasib|muhasib|kassa|avans|dividend|royalti|faktiki|rüsum|məsuliyyət|lisenziya)/i;

const zibilSozler = [
  "salam", "aleykum", "əleyküm", "necəsiz", "necəsiniz", "hər kəsə", "hamıya", "dostlar", "həmkarlar",
  "sabahınız xeyir", "hər vaxtınız xeyir", "axşamınız xeyir", "günortanız xeyir", "gecəniz xeyrə",
  "çox sağ olun", "sağ olun", "sağolun", "təşəkkür", "təşəkkürlər", "edirəm", "edirik", "minnətdaram",
  "dəyməz", "buyurun", "xoşdur", "yaxşıyam", "yaxşı", "siz necəsiz", "şükür", "bəli", "xeyr",
  "ok", "aha", "hə", "yox", "+1", "anladım", "aydındır", "başa düşdüm", "təbriklər", "mübarək",
  "inşallah", "maşallah", "amin", "uğurlar", "xahiş edirəm", "zəhmət olmasa", "gözləyirəm"
];

function chatZibilleriniTemizle(mesajlar = []) {
  const sistemRegex = /^(?:pinned a message|changed the group|joined the group|left the group|daxil oldu|qrupdan çıxdı|mesaj bərkidildi|<attached:|<media omitted>|photo|sticker|audio omitted|voice omitted)/i;
  const spamRegex = /(?:vakansiya|iş axtarıram|satılır|kirayə verilir|qoşulun|instagram\.com|tiktok\.com|t\.me\/(?!(?:c\/|joinchat\/)))/i;

  const temiz = [];
  for (const m of mesajlar) {
    const txt = String(m.metn || "").trim();
    if (!txt || txt.length < 4) continue;
    if (sistemRegex.test(txt)) continue;
    if (txt.length < 70 && spamRegex.test(txt)) continue;

    // Əgər vergi/mühasibatlıq açar sözü varsa, mütləq saxla
    if (muhasibatlikAcarlari.test(txt)) {
      temiz.push(m);
      continue;
    }

    // Əgər mesaj uzundursa (>120 hərf), potensial faydalı fikirdir, saxla
    if (txt.length > 120) {
      temiz.push(m);
      continue;
    }

    // Qısa mesajlarda salam-sağol təmizliyi
    const normalize = txt.toLowerCase().replace(/[!.,?🌸🙏😊👍👋]/g, " ").trim();
    let qalan = normalize;
    for (const s of zibilSozler) {
      qalan = qalan.replaceAll(s, " ").trim();
    }
    qalan = qalan.replace(/[\s\d_+-]+/g, "").trim();

    // Əgər mətndəki bütün sözlər zibil sözlər siyahısındadırsa, at!
    if (qalan.length === 0) continue;

    temiz.push(m);
  }
  return temiz;
}

function sohbetPenceresiYarat(xamMesajlar, catAdi = "Söhbət") {
  // 1. Əvvəlcə 85% boş salam-sağol, stiker və spam mesajları təmizlə
  const mesajlar = chatZibilleriniTemizle(xamMesajlar);

  const parcalar = [];
  let cariBlok = [];
  let cariUzunluq = 0;
  let cariKimler = new Set();

  function blokuElaveEt() {
    if (cariBlok.length === 0) return;
    const ilkTarix = cariBlok[0].tarix;
    const sonTarix = cariBlok[cariBlok.length - 1].tarix;
    const kimSiyahisi = Array.from(cariKimler).join(", ");
    const tarixAralighi = ilkTarix === sonTarix ? ilkTarix : `${ilkTarix} — ${sonTarix.split(" ").pop()}`;

    const blokMetn = cariBlok
      .map(m => `[${m.tarix}] ${m.gonderen}: ${m.metn}`)
      .join("\n");

    // Əgər blokda peşəkar vergi/mühasibatlıq müzakirəsi varsa, xüsusi "Praktiki Keys" başlığı ver
    const muhasibatliqVar = muhasibatlikAcarlari.test(blokMetn);
    let basliq = `${catAdi} (${tarixAralighi})`;

    if (muhasibatliqVar) {
      const ilkSual = cariBlok.find(m => m.metn.includes("?") || muhasibatlikAcarlari.test(m.metn));
      const movzuQisa = ilkSual ? ilkSual.metn.slice(0, 55).replace(/\n/g, " ").trim() : catAdi;
      basliq = `💼 Praktiki Keys: ${movzuQisa}`;
    }

    parcalar.push({
      basliq,
      metn: blokMetn,
      gonderen: kimSiyahisi,
      tarix: ilkTarix,
      meta: {
        praktika: muhasibatliqVar,
        mesaj_sayi: cariBlok.length,
        ilk_tarix: ilkTarix,
        son_tarix: sonTarix,
        istirakcilar: Array.from(cariKimler)
      }
    });

    const ustUste = cariBlok.slice(-2);
    cariBlok = [...ustUste];
    cariUzunluq = cariBlok.reduce((c, m) => c + m.metn.length + 30, 0);
    cariKimler = new Set(cariBlok.map(m => m.gonderen));
    yeniMesajElaveOlundu = false;
  }

  let yeniMesajElaveOlundu = false;
  for (const m of mesajlar) {
    cariBlok.push(m);
    cariUzunluq += m.metn.length + 30;
    cariKimler.add(m.gonderen);
    yeniMesajElaveOlundu = true;

    if (cariBlok.length >= 12 || cariUzunluq >= 1200) {
      blokuElaveEt();
    }
  }

  if (cariBlok.length > 0 && yeniMesajElaveOlundu) {
    blokuElaveEt();
  }

  return parcalar;
}

// ---- 6. Word (.docx) Oxuyucusu ----
function xmlTemizle(xml) {
  return String(xml || "")
    .replace(/<\/w:p>/g, "\n\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^/>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function docxOxu(buffer, faylAdi) {
  const fayllar = zipAc(buffer);
  const docXmlBuf = fayllar["word/document.xml"];
  if (!docXmlBuf) throw new Error("Word (.docx) faylında mətn hissəsi tapılmadı.");
  const metn = xmlTemizle(docXmlBuf.toString("utf8"));
  const parcalar = metniParcala(metn, faylAdi);

  return {
    nov: "docx",
    xulase: `Word sənədi • ${parcalar.length} hissə (${metn.length} simvol)`,
    meta: { simvol_sayi: metn.length, parca_sayi: parcalar.length, pasport: senedPasportuCixar(metn) },
    xam_metn: metn,
    parcalar
  };
}

// ---- 7. Excel (.xlsx / .csv) Oxuyucusu (Xətti split ilə — böyük fayllarda donmur!) ----
function xlsxOxu(buffer, faylAdi) {
  const fayllar = zipAc(buffer);
  const paylashilan = [];

  if (fayllar["xl/sharedStrings.xml"]) {
    const ssXml = fayllar["xl/sharedStrings.xml"].toString("utf8");
    const siHisseler = ssXml.split("</si>");
    for (let i = 0; i < siHisseler.length - 1; i++) {
      const blok = siHisseler[i];
      const idx = blok.indexOf("<si");
      if (idx === -1) continue;
      const deyer = blok
        .slice(idx)
        .replace(/<rPh[\s\S]*?<\/rPh>/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');
      paylashilan.push(deyer);
    }
  }

  const vereqAdlari = Object.keys(fayllar).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort();
  let tamMetn = "";
  let cemiSetir = 0;

  for (const vYol of vereqAdlari) {
    const xml = fayllar[vYol].toString("utf8");
    const rowHisseler = xml.split("</row>");
    const setirler = [];

    for (let r = 0; r < rowHisseler.length - 1 && cemiSetir < 15000; r++) {
      const rBlok = rowHisseler[r];
      const rStart = rBlok.indexOf("<row");
      if (rStart === -1) continue;
      const cHisseler = rBlok.slice(rStart).split("</c>");
      const xanalar = [];

      for (let c = 0; c < cHisseler.length; c++) {
        const cXml = cHisseler[c];
        if (!cXml.includes("<c")) continue;
        const tipMatch = cXml.match(/\bt="([^"]+)"/);
        const tip = tipMatch ? tipMatch[1] : "";
        const vIdx = cXml.indexOf("<v>");
        const vEnd = vIdx !== -1 ? cXml.indexOf("</v>", vIdx) : -1;

        let val = "";
        if (tip === "s" && vIdx !== -1 && vEnd !== -1) {
          val = paylashilan[Number(cXml.slice(vIdx + 3, vEnd))] || "";
        } else if (vIdx !== -1 && vEnd !== -1) {
          val = cXml.slice(vIdx + 3, vEnd);
        } else if (tip === "inlineStr") {
          val = cXml.replace(/<[^>]+>/g, "").trim();
        }
        if (val !== "") xanalar.push(String(val).trim());
      }
      if (xanalar.length > 0) {
        setirler.push(xanalar.join(" | "));
        cemiSetir++;
      }
    }

    if (setirler.length > 0) {
      const basliqSetir = setirler[0];
      tamMetn += `=== Cədvəl (${path.basename(vYol, ".xml")}) | Sütunlar: ${basliqSetir} ===\n` + setirler.join("\n") + "\n\n";
    }
  }

  const parcalar = metniParcala(tamMetn, faylAdi, 1600, 150);
  return {
    nov: "xlsx",
    xulase: `Excel cədvəli • ${cemiSetir} sətir • ${vereqAdlari.length} vərəq`,
    meta: { setir_sayi: cemiSetir, vereq_sayi: vereqAdlari.length, pasport: senedPasportuCixar(tamMetn) },
    xam_metn: tamMetn,
    parcalar
  };
}

// ---- 8. PDF Oxuyucusu (Mozilla PDF.js + Səhifə-səhifə Parçalama + Multimodal Vision OCR) ----
async function pdfOxu(buffer, faylAdi) {
  const baslangicVaxt = Date.now();
  const { sehifeler, sehifeObyektleri, tamMetn } = await pdfMetnVeSehifeleriCixar(buffer);
  let metn = tamMetn;
  let usul = `Mozilla PDF.js Mühərriki (${sehifeler.length} səhifə, ${Date.now() - baslangicVaxt}ms)`;

  // Yalnız mətn qatında heç nə tapılmadıqda (skan edilmiş PDF olduqda) və ölçü < 12 MB olduqda AI Vision OCR çağır
  if (metn.length < 80 && buffer.length < 12 * 1024 * 1024) {
    const aiAnaliz = await ai.mediaAnalizEt({
      buffer,
      mimeType: "application/pdf",
      faylAdi
    });
    if (aiAnaliz && aiAnaliz.ugurlu && aiAnaliz.metn.length > metn.length) {
      metn = aiAnaliz.metn;
      usul = aiAnaliz.usul;
    }
  }

  let parcalar = [];
  if (sehifeObyektleri && sehifeObyektleri.length > 0 && usul.startsWith("Mozilla PDF.js")) {
    sehifeObyektleri.forEach(sObj => {
      const sehifeParcalari = metniParcala(sObj.metn, `${faylAdi} [Səhifə ${sObj.sehifeNo}]`, 1600, 200);
      parcalar.push(...sehifeParcalari);
    });
  } else {
    if (!metn || metn.trim().length < 10) {
      metn = `[PDF Sənədi: ${faylAdi} (${Math.round(buffer.length / 1024)} KB). Bu PDF skan edilmiş şəkil formatındadır. Skan olunmuş PDF-lərin avtomatik oxunması üçün sağ yuxarıdakı ⚙️ AI Mühərriki bölməsindən pulsuz Gemini API açarını daxil edin.]`;
    }
    parcalar = metniParcala(metn, faylAdi);
  }

  const pasport = senedPasportuCixar(metn);

  return {
    nov: "pdf",
    xulase: `PDF sənədi • ${sehifeler.length || 1} səhifə • ${parcalar.length} blok (${usul})`,
    meta: {
      usul,
      sehife_sayi: sehifeler.length || 1,
      parca_sayi: parcalar.length,
      pasport
    },
    xam_metn: metn,
    parcalar
  };
}

// ---- 9. Veb Link və YouTube Oxuyucusu ----
function htmlTemizle(html) {
  const basliqMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const basliq = basliqMatch ? basliqMatch[1].replace(/\s+/g, " ").trim() : "";

  const temiz = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr|article|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();

  return { basliq, metn: temiz };
}

async function linkOxu(url) {
  let u;
  try {
    u = new URL(url.trim());
  } catch (_) {
    throw new Error("Daxil edilən link (URL) formatı yanlışdır. Məsələn: https://sayt.az/meqale");
  }

  const isYoutube = /youtube\.com|youtu\.be/i.test(u.hostname);
  let html = "";
  let ilkinStatus = 0;

  try {
    const res = await fetch(u.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "az,tr;q=0.9,en;q=0.8,ru;q=0.7"
      },
      signal: AbortSignal.timeout(15000)
    });
    ilkinStatus = res.status;
    if (res.ok) {
      html = await res.text();
    }
  } catch (_) {}

  if (isYoutube) {
    if (!html) {
      throw new Error("YouTube linkinə qoşulmaq mümkün olmadı. İnternet bağlantısını və linkin doğruluğunu yoxlayın.");
    }
    const { basliq } = htmlTemizle(html);
    let ytMetn = `YouTube Video: ${basliq || u.href}\nURL: ${u.href}\n\n`;

    const descMatch = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
    if (descMatch) {
      try {
        ytMetn += "Video Təsviri:\n" + JSON.parse(`"${descMatch[1]}"`) + "\n\n";
      } catch (_) {}
    }

    const captionMatch = html.match(/"captionTracks":\[\{"baseUrl":"([^"]+)"/);
    if (captionMatch && captionMatch[1]) {
      try {
        const capUrl = captionMatch[1].replace(/\\u0026/g, "&");
        const capRes = await fetch(capUrl, { signal: AbortSignal.timeout(10000) });
        if (capRes.ok) {
          const capXml = await capRes.text();
          const transkript = capXml
            .replace(/<\/text>/g, " ")
            .replace(/<[^>]+>/g, "")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, " ")
            .trim();
          if (transkript) {
            ytMetn += "Video Transkripti (Subtitrlər):\n" + transkript;
          }
        }
      } catch (_) {}
    }

    if (ytMetn.length < 120) {
      throw new Error("Bu YouTube videosunun alt yazıları (transkripti) və təsviri bağlıdır, məzmun oxuna bilmədi.");
    }

    const ad = basliq ? basliq.replace(/\s*-\s*YouTube$/i, "") : u.href;
    const parcalar = metniParcala(ytMetn, ad);
    return {
      ad,
      nov: "youtube",
      xulase: `YouTube Video • ${parcalar.length} hissə`,
      meta: { url: u.href, parca_sayi: parcalar.length, pasport: senedPasportuCixar(ytMetn) },
      xam_metn: ytMetn,
      parcalar
    };
  }

  let { basliq, metn } = html ? htmlTemizle(html) : { basliq: "", metn: "" };

  // Başlığı çıxandan sonra qalan xalis mətni yoxla
  const xalisMetnYoxla = (m, b) => {
    const temiz = String(m || "").replace(b || "", "").replace(/\s+/g, " ").trim();
    const bloklanib = /^(?:e-qanun|just a moment|attention required|access denied|403 forbidden|enable javascript|please turn javascript on|cloudflare|robot check)/i.test(temiz);
    return !bloklanib && temiz.length >= 180;
  };

  // Əgər e-qanun.az linkidirsə və SPA səbəbindən boş ("E-QANUN") gəlibsə, rəsmi API-ni yoxla
  const eqanunMatch = u.hostname.includes("e-qanun.az") && u.pathname.match(/\/framework\/(\d+)/i);
  if (eqanunMatch && !xalisMetnYoxla(metn, basliq)) {
    const fwId = eqanunMatch[1];
    const apiUrls = [
      `https://api.e-qanun.az/getFramework/${fwId}`,
      `https://e-qanun.az/api/getFramework/${fwId}`
    ];
    for (const apiUrl of apiUrls) {
      try {
        const apiRes = await fetch(apiUrl, {
          headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(12000)
        });
        if (apiRes.ok) {
          const data = await apiRes.json();
          const docHtml = data?.data?.text || data?.text || data?.html || data?.content || "";
          const docTitle = data?.data?.title || data?.title || data?.name || "";
          if (docHtml && String(docHtml).length > 200) {
            const parsed = htmlTemizle(String(docHtml));
            metn = parsed.metn;
            basliq = docTitle || parsed.basliq || `e-qanun.az Sənəd #${fwId}`;
            break;
          }
        }
      } catch (_) {}
    }
  }

  // Əgər hələ də mətn oxuna bilməyibsə (SPA / JavaScript / 403 qoruması), Jina Reader körpüsü ilə yoxla
  if (!xalisMetnYoxla(metn, basliq)) {
    try {
      const rRes = await fetch(`https://r.jina.ai/${u.href}`, {
        headers: {
          "Accept": "text/plain",
          "X-Return-Format": "text"
        },
        signal: AbortSignal.timeout(15000)
      });
      if (rRes.ok) {
        const rText = (await rRes.text()).trim();
        if (
          rText.length >= 220 &&
          !/^(?:Title:\s*E-QANUN\s*Markdown Content:\s*E-QANUN|.*403 Forbidden|.*Access Denied|.*Just a moment)/is.test(rText) &&
          rText.replace(/^Title:.*$/m, "").replace(/^URL Source:.*$/m, "").replace(/^Markdown Content:/m, "").trim().length >= 180
        ) {
          const titleLine = rText.match(/^Title:\s*(.+)$/m);
          if (titleLine && titleLine[1].trim()) basliq = titleLine[1].trim();
          metn = rText
            .replace(/^Title:.*$/m, "")
            .replace(/^URL Source:.*$/m, "")
            .replace(/^Markdown Content:\s*/m, "")
            .trim();
        }
      }
    } catch (_) {}
  }

  // YEKUN CİDDİ YOXLAMA: Əgər sayt icazə vermədisə və ya mətn boşdursa, BAZAYA YAZMA VƏ DƏRHAL XƏTA BİLDİR!
  if (!xalisMetnYoxla(metn, basliq)) {
    const sebeb = ilkinStatus === 403 || ilkinStatus === 401
      ? `Sayt girişə icazə vermir (HTTP ${ilkinStatus} Qadağandır)`
      : `Sayt xarici oxumağa bağlıdır və ya məzmun yalnız brauzer daxilində (JavaScript ilə) yüklənir`;
    throw new Error(
      `Bu linkdəki (${u.hostname}) məlumatları oxumaq mümkün olmadı: ${sebeb}. ` +
      `Zəhmət olmasa səhifədəki mətni kopyalayıb sol paneldəki "📝 Qeyd Yapışdır" düyməsi ilə əlavə edin və ya sənədi fayl (PDF/Word) kimi yükləyin.`
    );
  }

  const ad = basliq || u.hostname + u.pathname;
  const parcalar = metniParcala(`Mənbə URL: ${u.href}\nBaşlıq: ${ad}\n\n${metn}`, ad);

  return {
    ad,
    nov: "link",
    xulase: `Veb Səhifə (${u.hostname}) • ${parcalar.length} hissə`,
    meta: { url: u.href, domain: u.hostname, parca_sayi: parcalar.length, pasport: senedPasportuCixar(metn) },
    xam_metn: metn,
    parcalar
  };
}

// ---- 10. Universal Fayl Emalçı ----
async function faylEmalEt({ buffer, faylAdi, mimeType = "" }) {
  const uzanti = path.extname(faylAdi || "").toLowerCase();

  if (uzanti === ".docx") return docxOxu(buffer, faylAdi);
  if (uzanti === ".xlsx") return xlsxOxu(buffer, faylAdi);

  if (uzanti === ".zip") {
    const arxivFayllari = zipAc(buffer);
    const adlar = Object.keys(arxivFayllari);

    const tgJsonAd = adlar.find(a => a.endsWith("result.json"));
    if (tgJsonAd) {
      return await telegramJsonOxu(arxivFayllari[tgJsonAd].toString("utf8"), faylAdi, arxivFayllari);
    }

    const wpTxtAd = adlar.find(a => a.toLowerCase().endsWith(".txt"));
    if (wpTxtAd) {
      return await whatsappOxu(arxivFayllari[wpTxtAd].toString("utf8"), faylAdi.replace(/\.zip$/i, ""), arxivFayllari);
    }

    let birleshmish = "";
    for (const a of adlar) {
      if (/\.(txt|md|csv|json|html)$/i.test(a)) {
        birleshmish += `=== Fayl: ${a} ===\n` + arxivFayllari[a].toString("utf8") + "\n\n";
      }
    }
    const parcalar = metniParcala(birleshmish || "ZIP arxivində oxuna bilən mətn tapılmadı.", faylAdi);
    return {
      nov: "zip",
      xulase: `ZIP Arxivi (${adlar.length} fayl) • ${parcalar.length} hissə`,
      meta: { fayl_sayi: adlar.length, pasport: senedPasportuCixar(birleshmish) },
      xam_metn: birleshmish,
      parcalar
    };
  }

  if (uzanti === ".pdf" || mimeType === "application/pdf") {
    return await pdfOxu(buffer, faylAdi);
  }

  if (/\.(ogg|opus|mp3|wav|m4a)$/i.test(uzanti) || mimeType.startsWith("audio/")) {
    const analiz = await ai.mediaAnalizEt({ buffer, mimeType: mimeType || "audio/ogg", faylAdi });
    const parcalar = metniParcala(analiz.metn, `🎙️ Səs: ${faylAdi}`);
    return {
      nov: "audio",
      xulase: `Səsli Qeyd / Mesaj (${analiz.usul})`,
      meta: { usul: analiz.usul, ugurlu: analiz.ugurlu, pasport: senedPasportuCixar(analiz.metn) },
      xam_metn: analiz.metn,
      parcalar
    };
  }

  if (/\.(png|jpe?g|webp|bmp)$/i.test(uzanti) || mimeType.startsWith("image/")) {
    const analiz = await ai.mediaAnalizEt({ buffer, mimeType: mimeType || "image/jpeg", faylAdi });
    const parcalar = metniParcala(analiz.metn, `🖼️ Şəkil: ${faylAdi}`);
    return {
      nov: "image",
      xulase: `Şəkil / Skrinşot OCR (${analiz.usul})`,
      meta: { usul: analiz.usul, ugurlu: analiz.ugurlu, pasport: senedPasportuCixar(analiz.metn) },
      xam_metn: analiz.metn,
      parcalar
    };
  }

  if (uzanti === ".json") {
    const str = Buffer.from(buffer).toString("utf8");
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed.messages)) {
        return await telegramJsonOxu(str, faylAdi);
      }
    } catch (_) {}
    const parcalar = metniParcala(str, faylAdi);
    return {
      nov: "txt",
      xulase: `JSON Məlumat faylı • ${parcalar.length} hissə`,
      meta: { parca_sayi: parcalar.length, pasport: senedPasportuCixar(str) },
      xam_metn: str,
      parcalar
    };
  }

  if (uzanti === ".html" || uzanti === ".htm") {
    const html = Buffer.from(buffer).toString("utf8");
    const { basliq, metn } = htmlTemizle(html);
    const parcalar = metniParcala(metn, basliq || faylAdi);
    return {
      nov: html.includes("from_name") ? "telegram" : "txt",
      xulase: `HTML Sənədi • ${parcalar.length} hissə`,
      meta: { parca_sayi: parcalar.length, pasport: senedPasportuCixar(metn) },
      xam_metn: metn,
      parcalar
    };
  }

  const metn = Buffer.from(buffer).toString("utf8");
  return await whatsappOxu(metn, faylAdi);
}

module.exports = {
  senedPasportuCixar,
  nlmZibilleriniTemizle,
  chatZibilleriniTemizle,
  sohbetPenceresiYarat,
  zipAc,
  metniParcala,
  whatsappOxu,
  telegramJsonOxu,
  docxOxu,
  xlsxOxu,
  pdfOxu,
  linkOxu,
  faylEmalEt
};
