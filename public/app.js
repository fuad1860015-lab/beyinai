// BeyinAI v2.0 — Müştəri (Frontend) İdarəetmə Mühərriki
"use strict";

const veziyyet = {
  aktivQovluq: "all",
  aktivSahe: null,
  saheler: [],
  saheMovzulari: [],
  qovluqlar: [],
  menbeler: [],
  istirakcilar: [],
  yaddas: [],
  sohbetler: [],
  tenzimlemeler: {},
  baglantilar: {},
  simulyasiyalar: [],
  simSsenariler: [],
  secilmisSsenariId: null,
  simStatistika: { umumi: 0, ugurlu: 0, ortaBal: 0, dersSayi: 0 },
  schedulerVeziyyet: { tezlik: "gunde_1", son_vaxt: 0, bildirisler: [] },
  vergiTeqvimi: null,
  cariHaqqHesabHtml: "",
  seciliMenbeId: null,
  cariMenbeDetali: null,
  yuklemeAbort: null,
  sohbetAbort: null
};

const NOV_IKONLARI = {
  whatsapp: "🟢",
  telegram: "🔵",
  pdf: "📕",
  docx: "📘",
  xlsx: "📗",
  txt: "📄",
  qeyd: "📝",
  link: "🔗",
  youtube: "▶️",
  audio: "🎙️",
  image: "🖼️",
  zip: "📦"
};

function bildirisGoster(metn, vaxt = 3500) {
  const qutu = document.getElementById("bildirisQutusu");
  qutu.textContent = metn;
  qutu.hidden = false;
  clearTimeout(qutu._timer);
  qutu._timer = setTimeout(() => {
    qutu.hidden = true;
  }, vaxt);
}

function htmlQoru(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function apiSorgu(yol, metod = "GET", govde = null, { signal = null, timeoutMs = 120000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Sorğu vaxtı aşdı (Timeout).")), timeoutMs);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(new Error("İstifadəçi tərəfindən dayandırıldı.")));
  }

  try {
    const secimler = {
      method: metod,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal
    };
    if (govde !== null) {
      secimler.body = JSON.stringify(govde);
    }
    const res = await fetch(yol, secimler);
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(data.xeta || `Xəta baş verdi (${res.status})`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Məlumatların Yüklənməsi və Yenilənməsi ----
async function melumatlariYenile() {
  try {
    const data = await apiSorgu(`/api/bootstrap?qovluq_id=${encodeURIComponent(veziyyet.aktivQovluq)}`);
    veziyyet.saheler = data.saheler || [];
    veziyyet.aktivSahe = data.aktiv_sahe || null;
    veziyyet.aktivSaheProfili = data.aktiv_sahe_profili || null;
    veziyyet.bacariqXeritesi = data.bacariq_xeritesi || { movzular: [], xulase: {} };
    veziyyet.saheMovzulari = data.sahe_movzulari || [];
    veziyyet.qovluqlar = data.qovluqlar || [];
    veziyyet.menbeler = data.menbeler || [];
    veziyyet.istirakcilar = data.istirakcilar || [];
    veziyyet.yaddas = data.yaddas || [];
    veziyyet.sohbetler = data.sohbetler || [];
    veziyyet.tenzimlemeler = data.tenzimlemeler || {};
    veziyyet.baglantilar = data.baglantilar || {};
    veziyyet.simStatistika = data.simulyasiya_statistika || { umumi: 0, ugurlu: 0, ortaBal: 0, dersSayi: 0 };
    veziyyet.simSsenariler = data.simulyasiya_ssenariler || [];
    veziyyet.schedulerVeziyyet = data.scheduler_veziyyet || { tezlik: "gunde_1", son_vaxt: 0, bildirisler: [] };
    veziyyet.vergiTeqvimi = data.vergi_teqvimi || null;
    veziyyet.qaralamalar = data.qaralamalar || [];
    veziyyet.dusunmeQaydalari = data.dusunme_qaydalari || [];
    veziyyet.mubahiseliDosyeler = data.mubahiseli_dosyeler || [];
    veziyyet.qanunTesirleri = data.qanun_tesir_hesabatlari || [];

    tekamulSaygaclariYenile();
    statistikaCiz(data.statistika);
    bildirislerSaygacYenile();
    kitabxanaCiz();
    qovluqlariCiz();
    menbeleriCiz();
    istirakcilariCiz();
    yaddasCiz();
    sohbetleriCiz();
    ustPanelDurumYenile();
  } catch (err) {
    bildirisGoster("⚠️ " + err.message);
  }
}

function tekamulSaygaclariYenile() {
  const qarSay = (veziyyet.qaralamalar || []).length;
  const bozSay = (veziyyet.mubahiseliDosyeler || []).filter(d => !d.status || d.status === "gozleyir").length;
  const gozleyenCem = qarSay + bozSay;

  const solBadge = document.getElementById("solTekamulSaygac");
  if (solBadge) {
    if (gozleyenCem > 0) {
      solBadge.textContent = gozleyenCem;
      solBadge.style.display = "inline-block";
    } else {
      solBadge.style.display = "none";
    }
  }

  const tabSay = document.getElementById("tabSayTesdiq");
  if (tabSay) {
    tabSay.textContent = gozleyenCem;
  }
}

function simTabSec(hedefTabId) {
  if (!hedefTabId) return;
  document.querySelectorAll("[data-sim-tab]").forEach(btn => {
    btn.classList.toggle("aktiv", btn.getAttribute("data-sim-tab") === hedefTabId);
  });
  document.querySelectorAll(".sim-tab-panel").forEach(panel => {
    const uygun = panel.id === hedefTabId;
    panel.classList.toggle("aktiv", uygun);
    panel.hidden = !uygun;
  });
}

function kitabxanaCiz() {
  const sahe = veziyyet.aktivSahe;
  const saheAdEl = document.getElementById("aktivSaheAd");
  const saheIkonEl = document.getElementById("aktivSaheIkon");
  if (sahe && saheAdEl) {
    saheAdEl.textContent = sahe.ad;
    if (saheIkonEl) saheIkonEl.textContent = sahe.ikon || "📚";
  }

  const sualInp = document.getElementById("sualInput");
  if (sualInp && veziyyet.aktivSaheProfili?.sual_ipucu) {
    sualInp.placeholder = veziyyet.aktivSaheProfili.sual_ipucu;
  }

  const profilQabi = document.getElementById("aktivSaheProfilQabi");
  if (profilQabi) {
    const pr = veziyyet.aktivSaheProfili;
    if (pr) {
      profilQabi.innerHTML = `
        <div class="tekamul-qutu-basliq" style="margin-bottom:5px;">
          <span>🧠 "${htmlQoru(sahe?.ad || "Aktiv Sahə")}" üzrə Avtomatik Müstəqil Düşünmə Rolları</span>
        </div>
        <div style="font-size:11.5px; color:var(--metn-ikincil); display:flex; flex-direction:column; gap:3px;">
          <div>🥊 <strong>Əks-Hücum Tənqidçisi:</strong> ${htmlQoru(pr.teref_a_rol)}</div>
          <div>🛠️ <strong>Həll Qurucusu:</strong> ${htmlQoru(pr.teref_b_rol)} • <strong>Yekun:</strong> ${htmlQoru(pr.hakim_rol)}</div>
          <div style="color:var(--metn-solgun); margin-top:2px;">🔎 <em>Yoxlama sualı: ${htmlQoru(pr.eks_hucum_suali || "")}</em></div>
        </div>
      `;
      profilQabi.style.display = "block";
    } else {
      profilQabi.style.display = "none";
    }
  }

  const kartlarQabi = document.getElementById("sahelerKartlarQabi");
  if (kartlarQabi) {
    kartlarQabi.innerHTML = (veziyyet.saheler || []).map(s => {
      const aktiv = sahe && sahe.id === s.id;
      const statusBadge = s.esas_mi ? "Əsas Sahə" : (s.valideyn_id ? `Əlaqəli (${s.elaqe_derecesi}%)` : "Müstəqil");
      return `
        <div class="sahe-karti ${aktiv ? "aktiv" : ""}" data-sahe-id="${htmlQoru(s.id)}">
          <div class="sahe-karti-ust">
            <span class="sahe-karti-ad">${htmlQoru(s.ikon || "📚")} ${htmlQoru(s.ad)}</span>
            <span class="sahe-karti-badge">${statusBadge}</span>
          </div>
          <div class="sahe-karti-aciqlama">${htmlQoru(s.aciqlama || "")}</div>
          <div class="sahe-karti-stat">📄 ${s.menbe_sayi || 0} mənbə • 💡 ${s.movzu_sayi || 0} mövzu</div>
        </div>
      `;
    }).join("");

    kartlarQabi.querySelectorAll(".sahe-karti").forEach(kart => {
      kart.addEventListener("click", async () => {
        const saheId = kart.getAttribute("data-sahe-id");
        if (!saheId || (sahe && sahe.id === saheId)) return;
        try {
          const res = await apiSorgu("/api/saheler/aktiv", "POST", { sahe_id: saheId });
          veziyyet.aktivSahe = res.aktiv_sahe;
          veziyyet.saheler = res.saheler;
          veziyyet.saheMovzulari = res.sahe_movzulari || [];
          bildirisGoster(`📚 Kitabxana sahəsi: ${res.aktiv_sahe.ad}`);
          kitabxanaCiz();
          await melumatlariYenile();
        } catch (e) {
          bildirisGoster("⚠️ " + e.message);
        }
      });
    });
  }

  const movzuQabi = document.getElementById("saheMovzulariSiyahisi");
  const movzuSayEl = document.getElementById("oyrenilmisMovzuSay");
  const movzular = veziyyet.saheMovzulari || [];
  if (movzuSayEl) movzuSayEl.textContent = movzular.length;

  if (movzuQabi) {
    if (movzular.length === 0) {
      movzuQabi.innerHTML = `<div style="font-size:12px; color:var(--metn-solgun); padding:8px 0;">Bu sahə üzrə hələ xüsusi norma öyrənilməyib.</div>`;
    } else {
      movzuQabi.innerHTML = movzular.map(m => `
        <div class="movzu-satiri">
          <div class="movzu-satiri-sol">
            <span style="font-size:14px;">💡</span>
            <div>
              <div class="movzu-satiri-ad">${htmlQoru(m.movzu)}</div>
              ${m.detal ? `<div class="movzu-satiri-detal">${htmlQoru(m.detal)}</div>` : ""}
            </div>
          </div>
          <span class="movzu-status-badge ${m.status === 'teklif' ? 'teklif' : ''}">${m.status === 'teklif' ? '🔍 Təklif' : '✓ Öyrənilib'}</span>
        </div>
      `).join("");
    }
  }
}

async function simulyatorModalAc(baslangicTab = null) {
  const saheId = veziyyet.aktivSahe ? veziyyet.aktivSahe.id : "vergi_muhasibat";
  try {
    const [ssenariRes, tarixceRes, tekamulRes] = await Promise.all([
      apiSorgu(`/api/simulyator/ssenariler?sahe_id=${encodeURIComponent(saheId)}`),
      apiSorgu(`/api/simulyator/tarixce?sahe_id=${encodeURIComponent(saheId)}&limit=15`),
      apiSorgu(`/api/tekamul/veziyyet?sahe_id=${encodeURIComponent(saheId)}`)
    ]);
    veziyyet.simSsenariler = ssenariRes.ssenariler || [];
    veziyyet.simStatistika = ssenariRes.statistika || {};
    veziyyet.simulyasiyalar = tarixceRes.simulyasiyalar || [];
    veziyyet.aktivSaheProfili = tekamulRes.aktiv_sahe_profili || veziyyet.aktivSaheProfili;
    veziyyet.bacariqXeritesi = tekamulRes.bacariq_xeritesi || veziyyet.bacariqXeritesi;
    veziyyet.qaralamalar = tekamulRes.qaralamalar || [];
    veziyyet.arxivYaddaslar = tekamulRes.arxiv_yaddaslar || [];
    veziyyet.dusunmeQaydalari = tekamulRes.dusunme_qaydalari || [];
    veziyyet.mubahiseliDosyeler = tekamulRes.mubahiseli_dosyeler || [];
    veziyyet.qanunTesirleri = tekamulRes.qanun_tesir_hesabatlari || [];
    if (!veziyyet.secilmisSsenariId && veziyyet.simSsenariler.length > 0) {
      veziyyet.secilmisSsenariId = veziyyet.simSsenariler[0].id;
    }
    simulyatorCiz();
    const gozleyenSay = (veziyyet.qaralamalar || []).length +
      (veziyyet.mubahiseliDosyeler || []).filter(d => !d.status || d.status === "gozleyir").length;
    simTabSec(baslangicTab || (gozleyenSay > 0 ? "tabTesdiq" : "tabSinaq"));
    document.getElementById("modalSimulyator").hidden = false;
  } catch (err) {
    bildirisGoster("⚠️ " + err.message);
  }
}

function tekamulPanelleriCiz() {
  const saheId = veziyyet.aktivSahe ? veziyyet.aktivSahe.id : "vergi_muhasibat";
  tekamulSaygaclariYenile();

  // 1) Qaralama Dəftəri
  const qarQabi = document.getElementById("tekamulQaralamalarQabi");
  const sayQar = document.getElementById("sayQaralama");
  const qarList = veziyyet.qaralamalar || [];
  if (sayQar) sayQar.textContent = qarList.length;
  if (qarQabi) {
    if (qarList.length === 0) {
      qarQabi.innerHTML = `<div style="font-size:12px; color:var(--metn-ikincil); padding:4px 0;">✅ Hazırda təsdiq gözləyən yeni namizəd qayda yoxdur.</div>`;
    } else {
      qarQabi.innerHTML = qarList.map(q => `
        <div class="tekamul-element">
          <div>${htmlQoru(q.metn)}</div>
          <div class="tekamul-duymeler">
            <button type="button" class="tekamul-btn tesdiq" data-qar-tesdiq="${htmlQoru(q.id)}">👍 Yaddaşa Təsdiqlə</button>
            <button type="button" class="tekamul-btn redd" data-qar-redd="${htmlQoru(q.id)}">🗑️ Rədd Et</button>
          </div>
        </div>
      `).join("");
      qarQabi.querySelectorAll("[data-qar-tesdiq]").forEach(btn => {
        btn.onclick = async () => {
          const res = await apiSorgu("/api/tekamul/qaralama/tesdiq", "POST", { id: btn.getAttribute("data-qar-tesdiq"), sahe_id: saheId });
          veziyyet.qaralamalar = res.qaralamalar || [];
          veziyyet.yaddas = res.yaddas || veziyyet.yaddas;
          tekamulPanelleriCiz();
          yaddasCiz();
          bildirisGoster("✅ Qayda əsas yaddaşa təsdiqləndi!");
        };
      });
      qarQabi.querySelectorAll("[data-qar-redd]").forEach(btn => {
        btn.onclick = async () => {
          const res = await apiSorgu("/api/tekamul/qaralama/redd", "POST", { id: btn.getAttribute("data-qar-redd"), sahe_id: saheId });
          veziyyet.qaralamalar = res.qaralamalar || [];
          tekamulPanelleriCiz();
          bildirisGoster("🗑️ Namizəd qayda silindi.");
        };
      });
    }
  }

  // 2) Boz Zona Dosyeləri
  const bozQabi = document.getElementById("tekamulBozZonaQabi");
  const sayBoz = document.getElementById("sayBozZona");
  const gozleyenBozlar = (veziyyet.mubahiseliDosyeler || []).filter(d => d.status === "gozleyir");
  if (sayBoz) sayBoz.textContent = gozleyenBozlar.length;
  if (bozQabi) {
    if (gozleyenBozlar.length === 0) {
      bozQabi.innerHTML = `<div style="font-size:12px; color:var(--metn-ikincil); padding:4px 0;">✅ Hazırda qərar gözləyən mübahisəli məsələ yoxdur.</div>`;
    } else {
      const rolA = veziyyet.aktivSaheProfili?.teref_a_rol || "👮‍♂️ Tənqidçi Mövqeyi";
      const rolB = veziyyet.aktivSaheProfili?.teref_b_rol || "💼 Praktik Həll Mövqeyi";
      bozQabi.innerHTML = gozleyenBozlar.map(d => `
        <div class="tekamul-element">
          <div style="font-weight:700; color:#fde68a; margin-bottom:4px;">⚖️ ${htmlQoru(d.movzu)}</div>
          <div style="margin-bottom:3px;"><strong>${htmlQoru(rolA)}:</strong> ${htmlQoru(d.teref_a_mufettis)}</div>
          <div><strong>${htmlQoru(rolB)}:</strong> ${htmlQoru(d.teref_b_muhasib)}</div>
          <div class="tekamul-duymeler">
            <button type="button" class="tekamul-btn" data-boz-id="${htmlQoru(d.id)}" data-movqe="teref_a">${htmlQoru(rolA)} Seç</button>
            <button type="button" class="tekamul-btn tesdiq" data-boz-id="${htmlQoru(d.id)}" data-movqe="teref_b">${htmlQoru(rolB)} Seç</button>
          </div>
        </div>
      `).join("");
      bozQabi.querySelectorAll("[data-boz-id]").forEach(btn => {
        btn.onclick = async () => {
          const res = await apiSorgu("/api/tekamul/boz-zona/qerar", "POST", {
            id: btn.getAttribute("data-boz-id"),
            secilmis_movqe: btn.getAttribute("data-movqe"),
            sahe_id: saheId
          });
          veziyyet.mubahiseliDosyeler = res.mubahiseli_dosyeler || [];
          veziyyet.yaddas = res.yaddas || veziyyet.yaddas;
          tekamulPanelleriCiz();
          yaddasCiz();
          bildirisGoster("⚖️ Seçdiyiniz iş siyasəti yaddaşa saxlanıldı!");
        };
      });
    }
  }

  // 3) Düşünmə Qaydaları ("Mən niyə səhv etdim?") & Qanun Dəyişikliyi Dövr Arxivi
  const dusQabi = document.getElementById("tekamulDusunmeQabi");
  const sayDus = document.getElementById("sayDusunmeQayda");
  const dusList = veziyyet.dusunmeQaydalari || [];
  const tesirList = veziyyet.qanunTesirleri || [];
  if (sayDus) sayDus.textContent = dusList.length + tesirList.length;
  if (dusQabi) {
    const dusHtml = dusList.map(q => `
      <div class="tekamul-element">
        <div style="color:#a5b4fc; font-weight:600;">🧬 Səhvin Səbəbi: ${htmlQoru(q.sehv_koku)}</div>
        <div style="margin-top:2px;">✓ <strong>Yeni Yoxlama Qaydası:</strong> ${htmlQoru(q.yoxlama_qaydasi)}</div>
      </div>
    `).join("");
    const tesirHtml = tesirList.map(t => `
      <div class="tekamul-element" style="border-left:3px solid #f59e0b;">
        <div style="color:#fde68a; font-weight:600;">📜 Qanun Yenilənməsi: ${htmlQoru(t.sened_adi)}</div>
        <div style="margin-top:2px;">${htmlQoru(t.xulase)}</div>
      </div>
    `).join("");
    dusQabi.innerHTML = (tesirHtml + dusHtml) || `<div style="font-size:12px; color:var(--metn-solgun);">Hələ əlavə yoxlama qaydası yaranmayıb.</div>`;
  }
}

async function dinamikSimulyasiyaIcraEt(dinamikNov = "carpaz_madde") {
  const saheId = veziyyet.aktivSahe ? veziyyet.aktivSahe.id : "vergi_muhasibat";
  const mesajMap = {
    zeif_movzu: "🎯 Zəif mövzu seçildi — hədəfli özünü-məşq sınağı aparılır...",
    canli_cat: "💬 Canlı çatlardan mübahisəli sual sınanılır...",
    carpaz_madde: "🔀 Qaydaların çarpaz kəsişməsindən çətin məsələ qurulur və həll edilir..."
  };
  bildirisGoster(mesajMap[dinamikNov] || mesajMap.carpaz_madde);
  try {
    const res = await apiSorgu("/api/tekamul/dinamik-sinaq", "POST", { dinamikNov, sahe_id: saheId }, { timeoutMs: 90000 });
    if (res.ok) {
      veziyyet.simStatistika = res.statistika || {};
      veziyyet.bacariqXeritesi = res.bacariq_xeritesi || veziyyet.bacariqXeritesi;
      veziyyet.qaralamalar = res.qaralamalar || veziyyet.qaralamalar;
      veziyyet.dusunmeQaydalari = res.dusunme_qaydalari || veziyyet.dusunmeQaydalari;
      veziyyet.yaddas = res.yaddas || veziyyet.yaddas;
      const tRes = await apiSorgu(`/api/simulyator/tarixce?sahe_id=${encodeURIComponent(saheId)}&limit=15`);
      veziyyet.simulyasiyalar = tRes.simulyasiyalar || [];
      simulyatorCiz();
      yaddasCiz();
      bildirisGoster(`✅ Sınaq tamamlandı: ${res.netice.basliq} (${res.netice.bal}%)`);
    }
  } catch (err) {
    bildirisGoster("⚠️ " + err.message);
  }
}

function bacariqXeritesiniCiz() {
  const qabi = document.getElementById("bacariqXeritesiQabi");
  const xulaseEl = document.getElementById("bacariqXulaseEtiket");
  if (!qabi) return;

  const xerite = veziyyet.bacariqXeritesi || { movzular: [], xulase: {} };
  const list = xerite.movzular || [];
  const x = xerite.xulase || {};

  if (xulaseEl) {
    xulaseEl.textContent = list.length > 0
      ? `🔴 ${x.zeifSay || 0} zəif • 🟡 ${x.ortaSay || 0} orta • 🟢 ${x.gucluSay || 0} güclü`
      : "";
  }

  if (list.length === 0) {
    qabi.innerHTML = `<div style="font-size:12px; color:var(--metn-solgun);">Hələ mövzu xəritəsi yaranmayıb — ilk sınaqdan sonra avtomatik dolacaq.</div>`;
    return;
  }

  qabi.innerHTML = list.slice(0, 8).map(m => {
    const reng = m.seviyye === "zeif" ? "#ef4444" : (m.seviyye === "guclu" ? "#10b981" : "#f59e0b");
    const nisan = m.seviyye === "zeif" ? "🔴 Zəif" : (m.seviyye === "guclu" ? "🟢 Güclü" : "🟡 Orta");
    return `
      <div class="bacariq-satir">
        <div class="bacariq-satir-ust">
          <span style="color:#f1f5f9; font-weight:500;">${htmlQoru(m.movzu)}</span>
          <span style="color:${reng}; font-weight:700; white-space:nowrap;">${nisan} (${m.deqiqlik_faizi}%)</span>
        </div>
        <div class="bacariq-zolagi">
          <div class="bacariq-ic" style="width:${Math.max(8, m.deqiqlik_faizi)}%; background:${reng};"></div>
        </div>
      </div>
    `;
  }).join("");
}

function simulyatorCiz() {
  tekamulPanelleriCiz();
  bacariqXeritesiniCiz();
  const stat = veziyyet.simStatistika || {};
  const elUmumi = document.getElementById("statSimUmumi");
  const elBal = document.getElementById("statSimBal");
  const elDers = document.getElementById("statSimDersler");
  if (elUmumi) elUmumi.textContent = stat.umumi || 0;
  if (elBal) elBal.textContent = (stat.ortaBal || 0) + "%";
  if (elDers) elDers.textContent = stat.dersSayi || 0;

  const ssenarilerQabi = document.getElementById("simSsenarilerQabi");
  if (ssenarilerQabi) {
    ssenarilerQabi.innerHTML = (veziyyet.simSsenariler || []).map(s => {
      const aktiv = veziyyet.secilmisSsenariId === s.id;
      return `
        <div class="sim-ssenari-karti ${aktiv ? "aktiv" : ""}" data-id="${htmlQoru(s.id)}">
          <div style="flex:1;">
            <div class="sim-ssenari-basliq">${htmlQoru(s.basliq)}</div>
            <div style="font-size:11px; color:var(--metn-solgun); margin-top:2px;">${htmlQoru(s.ssenari.slice(0, 110))}...</div>
          </div>
          <span class="sim-ssenari-badge">${s.gozlenilenMaddeler?.length ? `Maddə: ${s.gozlenilenMaddeler.join(", ")}` : "Praktika"}</span>
        </div>
      `;
    }).join("");

    ssenarilerQabi.querySelectorAll(".sim-ssenari-karti").forEach(k => {
      k.addEventListener("click", () => {
        veziyyet.secilmisSsenariId = k.getAttribute("data-id");
        simulyatorCiz();
      });
    });
  }

  const teqvimZolagi = document.getElementById("simTeqvimZolagi");
  const teqvim = veziyyet.vergiTeqvimi;
  if (teqvimZolagi) {
    if (teqvim && teqvim.yaxinOlanlar && teqvim.yaxinOlanlar.length > 0) {
      teqvimZolagi.innerHTML = teqvim.yaxinOlanlar.map(t => `<div style="margin-bottom:4px;">📅 <strong>${htmlQoru(t.ad)}:</strong> ${htmlQoru(t.aciqlama)}</div>`).join("");
      teqvimZolagi.style.display = "block";
    } else {
      teqvimZolagi.style.display = "none";
    }
  }

  const selTezlik = document.getElementById("selectSchedulerTezlik");
  if (selTezlik && veziyyet.schedulerVeziyyet) {
    selTezlik.value = veziyyet.schedulerVeziyyet.tezlik || "gunde_1";
    selTezlik.onchange = async () => {
      try {
        await apiSorgu("/api/scheduler/tezlik", "POST", { tezlik: selTezlik.value });
        veziyyet.schedulerVeziyyet.tezlik = selTezlik.value;
        bildirisGoster("⏱️ Tədqiqat tezliyi yeniləndi: " + selTezlik.options[selTezlik.selectedIndex].text);
      } catch (e) {
        bildirisGoster("⚠️ " + e.message);
      }
    };
  }

  const btnIndi = document.getElementById("btnSchedulerIndiIcra");
  if (btnIndi) {
    btnIndi.onclick = async () => {
      btnIndi.disabled = true;
      bildirisGoster("🚀 Avtonom tədqiqat dövrəsi başladıldı...");
      try {
        const res = await apiSorgu("/api/scheduler/icra", "POST", {});
        if (res.ok) {
          veziyyet.schedulerVeziyyet.bildirisler = res.bildirisler || [];
          bildirislerSaygacYenile();
          bildirisGoster("✅ Avtonom tədqiqat tamamlandı və hesabat hazırlandı!");
          await melumatlariYenile();
        }
      } catch (err) {
        bildirisGoster("⚠️ " + err.message);
      } finally {
        btnIndi.disabled = false;
      }
    };
  }

  const tarixceQabi = document.getElementById("simTarixceSiyahisi");
  if (tarixceQabi) {
    const list = veziyyet.simulyasiyalar || [];
    if (list.length === 0) {
      tarixceQabi.innerHTML = `<div style="font-size:11.5px; color:var(--metn-solgun); padding:8px 0;">Hələ sınaq keçirilməyib.</div>`;
    } else {
      tarixceQabi.innerHTML = list.map(t => {
        const balKlas = t.yoxlanib && t.ugurlu_mu ? "ugurlu" : "zeif";
        const dersler = Array.isArray(t.dersler) ? t.dersler : [];
        return `
          <div class="sim-tarixce-satiri">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:600; color:#f1f5f9;">${htmlQoru(t.basliq)}</span>
              <span class="sim-netice-bal-badge ${balKlas}">${t.yoxlanib ? t.bal + "%" : "⏳ yoxlanmayıb"}</span>
            </div>
            <div style="font-size:11px; color:var(--metn-solgun); margin:4px 0;">${htmlQoru(t.audit_netice || "")}</div>
            ${dersler.map(d => `<div class="sim-ders-satiri">💡 ${htmlQoru(d)}</div>`).join("")}
          </div>
        `;
      }).join("");
    }
  }
}

async function simulyasiyaIcraEt() {
  const ssenariId = veziyyet.secilmisSsenariId;
  const btnMetn = document.getElementById("btnSimIcraMetn");
  const btn = document.getElementById("btnSimIcraEt");
  if (!ssenariId) {
    bildirisGoster("⚠️ Sınaq keysi seçin.");
    return;
  }

  btn.disabled = true;
  if (btnMetn) btnMetn.textContent = "⏳ Sınaq aparılır...";
  bildirisGoster("🧪 Sınaq simulyasiyası başlandı...");

  try {
    const res = await apiSorgu("/api/simulyator/icra", "POST", {
      ssenariId,
      sahe_id: veziyyet.aktivSahe ? veziyyet.aktivSahe.id : "vergi_muhasibat"
    }, { timeoutMs: 90000 });

    if (res.ok) {
      veziyyet.simStatistika = res.statistika || {};
      veziyyet.bacariqXeritesi = res.bacariq_xeritesi || veziyyet.bacariqXeritesi;
      veziyyet.yaddas = res.yaddas || veziyyet.yaddas;
      veziyyet.saheMovzulari = res.sahe_movzulari || veziyyet.saheMovzulari;

      const qutu = document.getElementById("simCanliNeticeQutusu");
      const kart = document.getElementById("simNeticeKarti");
      const net = res.netice;
      const balKlas = net.yoxlanib && net.ugurlu_mu ? "ugurlu" : "zeif";
      const dersler = Array.isArray(net.dersler) ? net.dersler : [];

      if (kart) {
        kart.innerHTML = `
          <div class="sim-netice-basliq-satir">
            <span style="font-weight:700; font-size:13px; color:#f1f5f9;">🎯 Sınaq Nəticəsi: ${htmlQoru(net.basliq)}</span>
            <span class="sim-netice-bal-badge ${balKlas}">${net.yoxlanib ? `${net.bal} / 100 Bal (${net.ugurlu_mu ? "Müvəffəq" : "Çatışmazlıq"})` : "⏳ Yoxlanılmayıb"}</span>
          </div>
          <div style="font-size:12px; color:#cbd5e1; margin-bottom:8px; line-height:1.5;">
            <strong>Auditor Rəyi:</strong> ${htmlQoru(net.audit_netice)}
          </div>
          <div style="font-size:11.5px; font-weight:700; text-transform:uppercase; color:#38bdf8; margin-top:8px;">Yaddaşa Yazılmış Dərslər:</div>
          ${dersler.map(d => `<div class="sim-ders-satiri">🧠 ${htmlQoru(d)}</div>`).join("")}
        `;
      }
      if (qutu) qutu.style.display = "block";

      bildirisGoster(`✅ Sınaq tamamlandı: ${net.bal}% bal!`);
      const saheId = veziyyet.aktivSahe ? veziyyet.aktivSahe.id : "vergi_muhasibat";
      const tRes = await apiSorgu(`/api/simulyator/tarixce?sahe_id=${encodeURIComponent(saheId)}&limit=15`);
      veziyyet.simulyasiyalar = tRes.simulyasiyalar || [];
      simulyatorCiz();
      yaddasCiz();
      kitabxanaCiz();
    }
  } catch (err) {
    bildirisGoster("⚠️ Sınaq xətası: " + err.message);
  } finally {
    btn.disabled = false;
    if (btnMetn) btnMetn.textContent = "Seçilmiş Keysi Sınaqdan Keçir";
  }
}

async function simulyatorAvtoTedqiqEt() {
  const saheId = veziyyet.aktivSahe ? veziyyet.aktivSahe.id : "vergi_muhasibat";
  bildirisGoster("🔍 Bilik boşluqları araşdırılır...");
  try {
    const res = await apiSorgu("/api/simulyator/avto-tedqiqat", "POST", { sahe_id: saheId });
    if (res.ok) {
      veziyyet.saheMovzulari = res.movzular || veziyyet.saheMovzulari;
      const say = res.cevrilmisTeklifler ? res.cevrilmisTeklifler.length : 0;
      bildirisGoster(`💡 ${say} yeni boşluq tədqiqat təkliflərinə əlavə edildi!`);
      kitabxanaCiz();
    }
  } catch (err) {
    bildirisGoster("⚠️ " + err.message);
  }
}

function bildirislerSaygacYenile() {
  const saygac = document.getElementById("bildirisSaygac");
  const bildirisler = veziyyet.schedulerVeziyyet?.bildirisler || [];
  if (saygac) {
    if (bildirisler.length > 0) {
      saygac.textContent = bildirisler.length;
      saygac.style.display = "inline-block";
    } else {
      saygac.style.display = "none";
    }
  }
}

async function modalBildirislerAc() {
  try {
    const res = await apiSorgu("/api/scheduler/bildirisler");
    veziyyet.schedulerVeziyyet.bildirisler = res.bildirisler || [];
    bildirislerCiz();
    document.getElementById("modalBildirisler").hidden = false;
  } catch (err) {
    bildirisGoster("⚠️ " + err.message);
  }
}

function bildirislerCiz() {
  const qabi = document.getElementById("bildirislerSiyahisi");
  const list = veziyyet.schedulerVeziyyet?.bildirisler || [];
  bildirislerSaygacYenile();
  if (!qabi) return;
  if (list.length === 0) {
    qabi.innerHTML = `<div style="font-size:12px; color:var(--metn-solgun); padding:14px 0; text-align:center;">Hələ yeni təqvim və ya avtonom tədqiqat bildirişi yoxdur.</div>`;
    return;
  }
  qabi.innerHTML = list.map(b => {
    const tarix = new Date(b.vaxt).toLocaleString("az-AZ");
    return `
      <div class="bildiris-elementi ${b.seviyye || "info"}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:700; color:#f1f5f9; font-size:12.5px;">${htmlQoru(b.basliq)}</span>
          <span style="font-size:10.5px; color:var(--metn-solgun);">${tarix}</span>
        </div>
        <div style="font-size:12px; color:#cbd5e1; margin-top:4px; line-height:1.4; white-space:pre-wrap;">${htmlQoru(b.metn)}</div>
      </div>
    `;
  }).join("");
}

async function bildirisleriTemizle() {
  try {
    await apiSorgu("/api/scheduler/bildirisler", "DELETE");
    veziyyet.schedulerVeziyyet.bildirisler = [];
    bildirislerCiz();
    bildirisGoster("🗑️ Bildirişlər təmizləndi.");
  } catch (e) {
    bildirisGoster("⚠️ " + e.message);
  }
}

function modalHaqqHesabAc() {
  const isdenCixma = document.getElementById("hhIsdenCixma");
  if (isdenCixma && !isdenCixma.value) {
    isdenCixma.value = new Date().toISOString().slice(0, 10);
  }
  document.getElementById("modalHaqqHesab").hidden = false;
}

async function haqqHesabHesabla(e) {
  e.preventDefault();
  const isciAd = document.getElementById("hhIsciAd").value.trim();
  const vezife = document.getElementById("hhVezife").value.trim();
  const maas = Number(document.getElementById("hhMaas").value) || 0;
  const maasTipi = document.getElementById("hhMaasTipi").value;
  const sektor = document.getElementById("hhSektor").value;
  const iseQebulTarixi = document.getElementById("hhIseQebul").value;
  const isdenCixmaTarixi = document.getElementById("hhIsdenCixma").value;
  const illikMezuniyyetGun = Number(document.getElementById("hhIllikMezuniyyet").value) || 21;
  const istifadeEdilmisGun = Number(document.getElementById("hhIstifadeEdilmis").value) || 0;
  const ayIsGunleri = Number(document.getElementById("hhAyIsGunleri").value) || 22;
  const islenmisIsGunleri = Number(document.getElementById("hhIslenmisGunler").value) || 22;

  try {
    const res = await apiSorgu("/api/kalkulyator/haqq-hesab", "POST", {
      isciAd,
      vezife,
      maas,
      maasTipi,
      sektor,
      iseQebulTarixi,
      isdenCixmaTarixi,
      illikMezuniyyetGun,
      istifadeEdilmisGun,
      ayIsGunleri,
      islenmisIsGunleri
    });

    veziyyet.cariHaqqHesabHtml = res.htmlCixarisi || "";
    const qutu = document.getElementById("hhNeticeQutusu");
    const icerik = document.getElementById("hhHesabatIcerik");

    if (icerik) {
      icerik.innerHTML = `
        <div style="font-weight:700; font-size:14px; margin-bottom:8px; color:#38bdf8;">
          📑 ${htmlQoru(res.isciAd)} üçün Son Haqq-Hesab Çıxarışı
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:12px; font-size:12px;">
          <div><strong>Staj Müddəti:</strong> ${res.staj.stajAylari} ay (${res.staj.stajIli} il ${res.staj.stajQaliqAyi} ay)</div>
          <div><strong>Kompensasiya Günləri:</strong> ${res.staj.qaliqGun} gün (Maddə 144)</div>
          <div><strong>Cari Ay Maaşı (Gross):</strong> ${res.cariAyGrossMaas} AZN</div>
          <div><strong>Məzuniyyət Kompensasiyası (Gross):</strong> ${res.kompensasiyaGross} AZN</div>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
          <tr style="background:rgba(255,255,255,0.06);"><th>Təyinat</th><th>Gross</th><th>Tutulmalar</th><th>Net Ödəniş</th></tr>
          <tr>
            <td><strong>YEKUN SON HAQQ-HESAB:</strong></td>
            <td><strong>${res.yekunCemiGross} AZN</strong></td>
            <td style="color:#f87171;">-${res.tutulma.cemiIsciTutulma} AZN</td>
            <td style="color:#34d399; font-size:14px; font-weight:bold;">${res.netYekun} AZN</td>
          </tr>
        </table>
        <div style="font-size:11.5px; color:var(--metn-solgun);">
          • Gəlir vergisi: ${res.tutulma.gelirVergisi} AZN | DSMF: ${res.tutulma.dsmfIsci} AZN | İTS: ${res.tutulma.itsIsci} AZN | İşsizlik: ${res.tutulma.issizlikIsci} AZN<br/>
          • Şirkətin ümumi xərci: <strong>${res.tutulma.umumiXerc} AZN</strong> (İşəgötürən DSMF/İTS daxil)
        </div>
      `;
    }
    if (qutu) qutu.style.display = "block";
    bildirisGoster("✅ Son haqq-hesab hesablandı!");
  } catch (err) {
    bildirisGoster("⚠️ Hesablama xətası: " + err.message);
  }
}

function statistikaCiz(stat = {}) {
  document.getElementById("statQovluq").textContent = stat.qovluqSayi || 0;
  document.getElementById("statMenbe").textContent = stat.menbeSayi || 0;
  document.getElementById("statParca").textContent = stat.parcaSayi || 0;
  document.getElementById("statYaddas").textContent = stat.yaddasSayi || 0;
  document.getElementById("yaddasTabSay").textContent = (veziyyet.yaddas || []).length;
}

function ustPanelDurumYenile() {
  const t = veziyyet.tenzimlemeler;
  const etiket = document.getElementById("aktivAiEtiket");
  const derinAktiv = t.derin_rejim !== "0";
  const btnDerin = document.getElementById("btnDerinRejim");
  if (btnDerin) {
    btnDerin.classList.toggle("aktiv", derinAktiv);
    btnDerin.textContent = derinAktiv ? "🧠 Dərin Təhlil" : "⚡ Sürətli Cavab";
  }

  const statusDot = document.querySelector("#btnTenzimlemeler .status-dot");
  let statusReng = "#ef4444";

  if (t.ai_provayder === "ollama") {
    if (etiket) etiket.textContent = "Lokal AI Aktiv";
    statusReng = "#10b981";
  } else if (t.ai_provayder === "groq" && t.groq_api_key && t.groq_api_key.trim().length >= 15) {
    if (etiket) etiket.textContent = "AI Hazırdır";
    statusReng = "#10b981";
  } else if (t.gemini_api_key && t.gemini_api_key.trim().length >= 20) {
    if (etiket) etiket.textContent = "AI Hazırdır";
    statusReng = "#10b981";
  } else if (t.gemini_api_key && t.gemini_api_key.trim().length > 0) {
    if (etiket) etiket.textContent = "Açar Yoxlanmalıdır";
    statusReng = "#f59e0b";
  } else {
    if (etiket) etiket.textContent = "Tənzimləmələr";
    statusReng = "#ef4444";
  }

  if (statusDot) {
    statusDot.style.background = statusReng;
  }

  const tgAktiv = veziyyet.baglantilar?.telegram?.aktiv;
  const nlmAktiv = veziyyet.baglantilar?.notebooklm?.aktiv;
  const noqte = document.getElementById("canliNoqte");
  if (noqte) {
    if (tgAktiv || nlmAktiv) {
      noqte.classList.add("aktiv");
    } else {
      noqte.classList.remove("aktiv");
    }
  }
}

// ---- Sol Panel: Qovluqlar (Notebooks) ----
function qovluqlariCiz() {
  const qutu = document.getElementById("qovluqSiyahisi");
  const cemiMenbe = veziyyet.qovluqlar.reduce((c, q) => c + (q.menbe_sayi || 0), 0);

  let html = `
    <div class="qovluq-element ${veziyyet.aktivQovluq === "all" ? "aktiv" : ""}" data-qovluq="all">
      <div class="qovluq-sol">
        <span>🌐</span>
        <span>Bütün Sənədlər</span>
      </div>
      <span class="qovluq-say">${cemiMenbe}</span>
    </div>
  `;

  const sistemQovluqlari = new Set(["qovluq-is", "qovluq-praktika", "qovluq-cat", "qovluq-sexsi"]);
  for (const q of veziyyet.qovluqlar) {
    const aktiv = veziyyet.aktivQovluq === q.id ? "aktiv" : "";
    const silDuyme = !sistemQovluqlari.has(q.id)
      ? `<button type="button" class="menbe-sil-duyme qovluq-sil-duyme" data-qovluq-sil="${htmlQoru(q.id)}" title="Qovluğu sil">✕</button>`
      : "";
    html += `
      <div class="qovluq-element ${aktiv}" data-qovluq="${htmlQoru(q.id)}">
        <div class="qovluq-sol">
          <span>${htmlQoru(q.ikon || "📁")}</span>
          <span>${htmlQoru(q.ad)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          <span class="qovluq-say">${q.menbe_sayi || 0}</span>
          ${silDuyme}
        </div>
      </div>
    `;
  }

  qutu.innerHTML = html;

  const gosterici = document.getElementById("aktivQovluqGosterici");
  if (veziyyet.aktivQovluq === "all") {
    gosterici.textContent = "🌐 Mərkəzi Beyin (Bütün Qovluqlar)";
  } else {
    const tap = veziyyet.qovluqlar.find(x => x.id === veziyyet.aktivQovluq);
    gosterici.textContent = tap ? `${tap.ikon} ${tap.ad}` : "📁 Qovluq";
  }

  qutu.querySelectorAll(".qovluq-element").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.classList.contains("qovluq-sil-duyme")) return;
      veziyyet.aktivQovluq = el.getAttribute("data-qovluq");
      melumatlariYenile();
    });
  });

  qutu.querySelectorAll(".qovluq-sil-duyme").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id = btn.getAttribute("data-qovluq-sil");
      try {
        await apiSorgu(`/api/qovluqlar/${encodeURIComponent(id)}`, "DELETE");
        if (veziyyet.aktivQovluq === id) veziyyet.aktivQovluq = "all";
        bildirisGoster("🗑️ Qovluq silindi (içindəki sənədlər 'İş və Mühasibatlıq' qovluğuna köçürüldü)");
        melumatlariYenile();
      } catch (err) {
        bildirisGoster("⚠️ " + err.message);
      }
    });
  });
}

// ---- Sol Panel: Mənbələr ----
function menbeleriCiz() {
  const qutu = document.getElementById("menbeSiyahisi");
  document.getElementById("menbeSaygac").textContent = veziyyet.menbeler.length;

  if (veziyyet.menbeler.length === 0) {
    qutu.innerHTML = `
      <div style="text-align:center; padding: 18px 10px; color: var(--metn-solgun); font-size: 12px; line-height:1.5;">
        Bu qovluqda hələ sənəd yoxdur.<br/>Yuxarıdakı <b>📁 Fayl Yüklə</b> düyməsi ilə PDF, Word, Excel və ya çat əlavə edə bilərsiniz.
      </div>
    `;
    return;
  }

  qutu.innerHTML = veziyyet.menbeler.map(m => {
    const ikon = NOV_IKONLARI[m.nov] || "📄";
    const secili = veziyyet.seciliMenbeId === m.id ? "secili" : "";
    const olcuKb = m.olcu ? `${Math.max(1, Math.round(m.olcu / 1024))} KB • ` : "";
    const nlmBadge = m.meta?.gemini_file?.uri ? `<span title="Google NotebookLM / Gemini File API serverində aktivdir" style="color:#34d399; font-weight:700;">☁️ NLM</span> • ` : "";
    const linkVar = m.nov === "link" || m.nov === "youtube" || Boolean(m.meta?.url);
    const sinxronBtn = linkVar
      ? `<button class="menbe-sinxron-duyme" data-sinxron-id="${htmlQoru(m.id)}" title="Mənbəni canlı linkdən yenilə (Sinxron et)">🔄</button>`
      : "";

    return `
      <div class="menbe-kart ${secili}" data-menbe-id="${htmlQoru(m.id)}">
        <div class="menbe-kart-ust">
          <div class="menbe-basliq-qrup">
            <input type="checkbox" class="menbe-aktiv-check" data-id="${htmlQoru(m.id)}" ${m.aktiv ? "checked" : ""} title="Axtarışda və sitatlarda istifadə olunsun" />
            <span>${ikon}</span>
            <span class="menbe-ad" title="${htmlQoru(m.ad)}">${htmlQoru(m.ad)}</span>
          </div>
          <div class="menbe-duymeler-qrup" style="display:flex; align-items:center; gap:2px;">
            ${sinxronBtn}
            <button class="menbe-sil-duyme" data-sil-id="${htmlQoru(m.id)}" title="Mənbəni sil">✕</button>
          </div>
        </div>
        <div class="menbe-alt">
          <span class="menbe-xulase" title="${htmlQoru(m.xulase)}">${htmlQoru(m.xulase || m.nov)}</span>
          <span>${nlmBadge}${olcuKb}${m.parca_sayi || 0} blok</span>
        </div>
      </div>
    `;
  }).join("");

  qutu.querySelectorAll(".menbe-kart").forEach(kart => {
    kart.addEventListener("click", e => {
      if (e.target.classList.contains("menbe-aktiv-check") || e.target.classList.contains("menbe-sil-duyme") || e.target.classList.contains("menbe-sinxron-duyme")) return;
      const id = kart.getAttribute("data-menbe-id");
      menbeOnizlemeAc(id);
    });
  });

  qutu.querySelectorAll(".menbe-sinxron-duyme").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id = btn.getAttribute("data-sinxron-id");
      btn.classList.add("firlanir");
      bildirisGoster("🔄 Canlı linkdən ən son məzmun oxunur...");
      try {
        const netice = await apiSorgu(`/api/menbeler/${encodeURIComponent(id)}/sinxron`, "POST");
        if (netice.ok) {
          bildirisGoster(netice.mesaj || "✅ Mənbə uğurla yeniləndi!");
          await melumatlariYenile();
        } else {
          bildirisGoster("⚠️ " + (netice.xeta || "Yeniləmə xətası baş verdi."));
        }
      } catch (err) {
        bildirisGoster("⚠️ Yeniləmə xətası: " + err.message);
      } finally {
        btn.classList.remove("firlanir");
      }
    });
  });

  qutu.querySelectorAll(".menbe-aktiv-check").forEach(chk => {
    chk.addEventListener("change", async e => {
      e.stopPropagation();
      const id = chk.getAttribute("data-id");
      await apiSorgu(`/api/menbeler/${encodeURIComponent(id)}`, "PUT", { aktiv: chk.checked });
      bildirisGoster(chk.checked ? "✅ Mənbə axtarışa daxil edildi" : "⏸️ Mənbə müvəqqəti deaktiv edildi");
    });
  });

  qutu.querySelectorAll(".menbe-sil-duyme").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id = btn.getAttribute("data-sil-id");
      await apiSorgu(`/api/menbeler/${encodeURIComponent(id)}`, "DELETE");
      if (veziyyet.seciliMenbeId === id) {
        veziyyet.seciliMenbeId = null;
      }
      bildirisGoster("🗑️ Mənbə silindi");
      melumatlariYenile();
    });
  });
}

// ---- Çat İştirakçıları Filtrinin Yenilənməsi ----
function istirakcilariCiz() {
  const sel = document.getElementById("filtrGonderen");
  const cariDeyer = sel.value;
  let html = `<option value="">Bütün şəxslər (${veziyyet.istirakcilar.length})</option>`;
  for (const ad of veziyyet.istirakcilar) {
    const sec = ad === cariDeyer ? "selected" : "";
    html += `<option value="${htmlQoru(ad)}" ${sec}>👤 ${htmlQoru(ad)}</option>`;
  }
  sel.innerHTML = html;
}

// ---- Orta Panel: Sitatlı Söhbət Tarixçəsi ----
function teqleriTemizle(metn = "") {
  return String(metn || "")
    .replace(/<\/?DETALLI_ANALIZ>/gi, "")
    .replace(/<NOVBETI_SUALLAR>[\s\S]*?<\/NOVBETI_SUALLAR>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function markdownDaxiliFormatla(metn, sitatlar = []) {
  let s = String(metn || "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^\s*][^*\n]*?)\*(?=[\s.,;:!?)]|$)/gm, "$1<em>$2</em>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

  s = s.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (tam, reqemlerStr) => {
    const reqemler = reqemlerStr.split(",").map(r => Number(r.trim())).filter(Boolean);
    return reqemler.map(n => {
      const sitat = sitatlar.find(x => x.nomre === n);
      if (!sitat) return `[${n}]`;
      const maddeTap = String(sitat.basliq || "").match(/^(Maddə\s+\d+[0-9.-]*)/i);
      const qisaEtiket = maddeTap
        ? `${n}: ${maddeTap[1]}`
        : sitat.gonderen
          ? `${n}: ${sitat.gonderen.split(",")[0].slice(0, 14)}`
          : `${n}: ${sitat.menbe_adi.slice(0, 14)}`;
      return `<button type="button" class="sitat-heb" data-menbe-id="${htmlQoru(sitat.menbe_id)}" data-parca-id="${htmlQoru(sitat.parca_id)}" title="${htmlQoru(sitat.menbe_adi + " | " + (sitat.basliq || ""))}">${htmlQoru(qisaEtiket)}</button>`;
    }).join(" ");
  });

  const setirler = s.split("\n");
  const bloklar = [];
  let cariSiyahi = [];
  let cariSiyahiNovu = null; // "ul" | "ol"
  let cariAbzas = [];

  const abzasiBagla = () => {
    if (cariAbzas.length > 0) {
      bloklar.push(`<p>${cariAbzas.join("<br/>")}</p>`);
      cariAbzas = [];
    }
  };

  const siyahiniBagla = () => {
    if (cariSiyahi.length > 0 && cariSiyahiNovu) {
      bloklar.push(`<${cariSiyahiNovu}>${cariSiyahi.map(x => `<li>${x}</li>`).join("")}</${cariSiyahiNovu}>`);
      cariSiyahi = [];
      cariSiyahiNovu = null;
    }
  };

  for (const xamSetir of setirler) {
    const setir = xamSetir.trim();
    if (!setir) {
      abzasiBagla();
      siyahiniBagla();
      continue;
    }

    const h4Match = setir.match(/^####\s+(.+)$/);
    if (h4Match) {
      abzasiBagla();
      siyahiniBagla();
      bloklar.push(`<h4>${h4Match[1]}</h4>`);
      continue;
    }

    const h3Match = setir.match(/^#{1,3}\s+(.+)$/);
    if (h3Match) {
      abzasiBagla();
      siyahiniBagla();
      bloklar.push(`<h3>${h3Match[1]}</h3>`);
      continue;
    }

    const ulMatch = setir.match(/^[-•*]\s+(.+)$/);
    if (ulMatch) {
      abzasiBagla();
      if (cariSiyahiNovu && cariSiyahiNovu !== "ul") siyahiniBagla();
      cariSiyahiNovu = "ul";
      cariSiyahi.push(ulMatch[1]);
      continue;
    }

    const olMatch = setir.match(/^\d+[.)]\s+(.+)$/);
    if (olMatch) {
      abzasiBagla();
      if (cariSiyahiNovu && cariSiyahiNovu !== "ol") siyahiniBagla();
      cariSiyahiNovu = "ol";
      cariSiyahi.push(olMatch[1]);
      continue;
    }

    if (setir.startsWith("&gt;")) {
      abzasiBagla();
      siyahiniBagla();
      bloklar.push(`<blockquote>${setir.replace(/^&gt;\s?/, "")}</blockquote>`);
      continue;
    }

    siyahiniBagla();
    cariAbzas.push(setir);
  }

  abzasiBagla();
  siyahiniBagla();

  return bloklar.join("");
}

function markdownFormatla(metn, sitatlar = []) {
  if (!metn) return "";
  let s = htmlQoru(metn);

  // 1) <NOVBETI_SUALLAR> blokunu çıxar
  const novbetiSuallar = [];
  s = s.replace(/(?:&lt;|<)NOVBETI_SUALLAR(?:&gt;|>)([\s\S]*?)(?:(?:&lt;|<)\/NOVBETI_SUALLAR(?:&gt;|>)|$)/gi, (_, icerik) => {
    icerik.split("\n").forEach(setir => {
      const temiz = setir.replace(/^[-•*\d.)\s]+/, "").trim();
      if (temiz.length > 6) novbetiSuallar.push(temiz);
    });
    return "";
  });

  // 2) <DETALLI_ANALIZ> blokunu çıxar
  const bloklar = [];
  s = s.replace(/(?:&lt;|<)DETALLI_ANALIZ(?:&gt;|>)([\s\S]*?)(?:(?:&lt;|<)\/DETALLI_ANALIZ(?:&gt;|>)|$)/gi, (m, icerik) => {
    const idx = bloklar.length;
    bloklar.push(icerik.trim());
    return `\n\n__DETALLI_ANALIZ_BLOK_${idx}__\n\n`;
  });

  let esasHtml = markdownDaxiliFormatla(s, sitatlar);

  for (let i = 0; i < bloklar.length; i++) {
    const formatlanmisIcerik = markdownDaxiliFormatla(bloklar[i], sitatlar);
    const akkordeonHtml = `
      <details class="detalli-analiz-akkordeon">
        <summary class="detalli-analiz-basliq">
          <span class="detalli-basliq-sol">
            <span class="detalli-ikon">🔍</span>
            <strong>Geniş və Detallı Təhlil (Bütün Maddələr, İstisnalar və Şərtlər)</strong>
          </span>
          <span class="detalli-ipucu">Baxmaq üçün klikləyin ▾</span>
        </summary>
        <div class="detalli-analiz-govde">
          ${formatlanmisIcerik}
        </div>
      </details>
    `;
    esasHtml = esasHtml.replace(`<p>__DETALLI_ANALIZ_BLOK_${i}__</p>`, akkordeonHtml);
    esasHtml = esasHtml.replace(`__DETALLI_ANALIZ_BLOK_${i}__`, akkordeonHtml);
  }

  if (novbetiSuallar.length > 0) {
    esasHtml += `
      <div class="novbeti-suallar-qutu">
        <div class="novbeti-suallar-basliq">💡 Mövzunu dərinləşdirmək üçün növbəti suallar:</div>
        <div class="novbeti-suallar-siyahi">
          ${novbetiSuallar.slice(0, 3).map(ns => `<button type="button" class="novbeti-sual-cip" data-novbeti-sual="${ns}">👉 ${ns}</button>`).join("")}
        </div>
      </div>
    `;
  }

  return esasHtml;
}

function sohbetleriCiz() {
  const qutu = document.getElementById("sohbetAxini");

  if (veziyyet.sohbetler.length === 0) {
    const aktivSaheAd = veziyyet.aktivSahe ? veziyyet.aktivSahe.ad : "Vergi və Mühasibatlıq";
    const aktivSaheIkon = veziyyet.aktivSahe ? (veziyyet.aktivSahe.ikon || "💼") : "💼";
    const pr = veziyyet.aktivSaheProfili || {};
    const numuneSuallar = Array.isArray(pr.numune_suallar) && pr.numune_suallar.length > 0
      ? pr.numune_suallar.slice(0, 3)
      : [
          "Mikro sahibkar üçün 75% gəlir və mənfəət vergisi güzəşti hansı şərtlərlə tətbiq olunur?",
          "İşdən çıxan işçinin istifadə edilməmiş məzuniyyət kompensasiyası və son haqq-hesabı necə hesablanır?",
          "ƏDV-nin əvəzləşdirilməsi üçün hansı sənədlər və elektron qaimə şərtləri mütləqdir?"
        ];
    qutu.innerHTML = `
      <div class="xos-geldin-qabi">
        <div class="xos-geldin-ust">
          <div class="xos-geldin-ikon">🧠</div>
          <h2 class="xos-geldin-basliq">BeyinAI ilə necə işləmək istəyirsiniz?</h2>
          <p class="xos-geldin-altbasliq">
            Aktiv sahə: <strong>${htmlQoru(aktivSaheIkon)} ${htmlQoru(aktivSaheAd)}</strong>. Yarımçıq suallarda Qərar Ağacı qurur, <em>${htmlQoru(pr.teref_a_rol || "Əks-Hücum Tənqidçisi")}</em> gözü ilə cavabı yoxlayır və öz zəif mövzularını məşq edir.
          </p>
        </div>

        <div class="xos-geldin-kartlar">
          <button type="button" class="baslangic-kart" data-baslangic="sual">
            <span class="baslangic-kart-ikon">💬</span>
            <div>
              <div class="baslangic-kart-ad">${htmlQoru(aktivSaheAd)} Sualı Soruş</div>
              <div class="baslangic-kart-izah">Qərar ağacı, dəqiq mənbə istinadları və əks-hücum risk təhlili ilə izah alın</div>
            </div>
          </button>

          <button type="button" class="baslangic-kart" data-baslangic="fayl">
            <span class="baslangic-kart-ikon">📁</span>
            <div>
              <div class="baslangic-kart-ad">Sənəd və ya Müzakirə Yüklə</div>
              <div class="baslangic-kart-izah">PDF, Word, Excel cədvəli və ya WhatsApp/Telegram müzakirəsini təhlil etdirin</div>
            </div>
          </button>

          <button type="button" class="baslangic-kart" data-baslangic="kitabxana">
            <span class="baslangic-kart-ikon">📚</span>
            <div>
              <div class="baslangic-kart-ad">Bilik Sahəsini Dəyiş və ya Yarat</div>
              <div class="baslangic-kart-izah">Vergi, Hüquq, Biznes, IT və ya tam yeni sahə yaradıb avtomatik kökləyin</div>
            </div>
          </button>

          <button type="button" class="baslangic-kart" data-baslangic="simulyator">
            <span class="baslangic-kart-ikon">🧬</span>
            <div>
              <div class="baslangic-kart-ad">Özünü-İnkişaf və Zəiflik Xəritəsi</div>
              <div class="baslangic-kart-izah">Yeni qaydaları təsdiqləyin, güclü/zəif mövzulara baxın və hədəfli məşq edin</div>
            </div>
          </button>
        </div>

        <div class="xos-geldin-numuneler">
          ${numuneSuallar.map(ns => `
            <button type="button" class="numune-sual-cip" data-numune-sual="${htmlQoru(ns)}">
              💡 ${htmlQoru(ns.length > 68 ? ns.slice(0, 66) + "..." : ns)}
            </button>
          `).join("")}
        </div>
      </div>
    `;

    qutu.querySelectorAll("[data-baslangic]").forEach(kart => {
      kart.addEventListener("click", () => {
        const emel = kart.getAttribute("data-baslangic");
        if (emel === "sual") {
          const inp = document.getElementById("sualInput");
          if (inp) inp.focus();
        } else if (emel === "fayl") {
          document.getElementById("faylSecici")?.click();
        } else if (emel === "kitabxana") {
          kitabxanaCiz();
          document.getElementById("modalKitabxana").hidden = false;
        } else if (emel === "haqqhesab") {
          modalHaqqHesabAc();
        } else if (emel === "simulyator") {
          simulyatorModalAc();
        }
      });
    });

    qutu.querySelectorAll("[data-numune-sual]").forEach(cip => {
      cip.addEventListener("click", () => {
        const s = cip.getAttribute("data-numune-sual");
        if (s) sualGonder(s);
      });
    });
    return;
  }

  qutu.innerHTML = veziyyet.sohbetler.map((m, idx) => {
    const rolAdi = m.rol === "user" ? "👤 Siz" : "🧠 BeyinAI";
    const vaxt = m.yaradildi ? new Date(m.yaradildi).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" }) : "";
    const sitatlar = Array.isArray(m.sitatlar) ? m.sitatlar : [];
    const dusunme = sitatlar[0]?.dusunmeAddimlari || m.dusunmeAddimlari || [];

    let dusunmeHtml = "";
    if (m.rol === "assistant" && Array.isArray(dusunme) && dusunme.length > 0) {
      dusunmeHtml = `
        <details class="agent-dusunme-qutu">
          <summary>🔍 Necə araşdırıldı? (${dusunme.length} addım)</summary>
          <div class="agent-dusunme-siyahi">
            ${dusunme.map(a => `<div>${markdownFormatla(a, [])}</div>`).join("")}
          </div>
        </details>
      `;
    }

    let altSitatlarHtml = "";
    if (m.rol === "assistant" && sitatlar.length > 0) {
      // Mətndə həqiqətən istinad edilmiş [1], [2] nömrələrini tap
      const istinadEdilenNomreler = new Set();
      const sitatTap = String(m.metn || "").matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g);
      for (const uy of sitatTap) {
        uy[1].split(",").forEach(r => {
          const n = Number(r.trim());
          if (n > 0) istinadEdilenNomreler.add(n);
        });
      }

      const gosterilecekSitatlar = istinadEdilenNomreler.size > 0
        ? sitatlar.filter(s => istinadEdilenNomreler.has(s.nomre))
        : sitatlar.slice(0, 3);

      const etiketMetni = istinadEdilenNomreler.size > 0
        ? "İstifadə olunan mənbələr:"
        : "💡 Ümumi qanunvericilik/ekspert biliyi + əlaqəli mənbələr:";

      if (gosterilecekSitatlar.length > 0) {
        altSitatlarHtml = `
          <div class="mesaj-sitatlar-alt">
            <span style="font-size:11px; color:var(--metn-solgun); margin-right:4px;">${etiketMetni}</span>
            ${gosterilecekSitatlar.slice(0, 6).map(s => {
              const ikon = NOV_IKONLARI[s.menbe_novu] || "📄";
              const basliqEtiket = (s.basliq && !s.basliq.includes("— Hissə"))
                ? s.basliq.slice(0, 36)
                : s.menbe_adi.slice(0, 24);
              const huquqIpucu = s.huquqi_etiket ? ` (${s.huquqi_etiket})` : "";
              return `<button type="button" class="sitat-heb" title="${htmlQoru(s.menbe_adi + " | " + (s.basliq || "") + huquqIpucu)}" data-menbe-id="${htmlQoru(s.menbe_id)}" data-parca-id="${htmlQoru(s.parca_id)}">${ikon} [${s.nomre}] ${htmlQoru(basliqEtiket)}</button>`;
            }).join("")}
          </div>
        `;
      }
    }

    let aletlerHtml = "";
    if (m.rol === "assistant" && !m.gozleyir) {
      aletlerHtml = `
        <div class="mesaj-etiketli-aletler">
          <button type="button" class="mini-ikon-btn" data-kopyala="${idx}" title="Cavabın mətnini kopyala">📋 Kopyala</button>
          <button type="button" class="mini-ikon-btn" data-oyren-tesdiq="${idx}" title="Cavab doğrudursa təcrübə yaddaşına əlavə et">👍 Düzgündür</button>
          <button type="button" class="mini-ikon-btn" data-oyren-duzelis="${idx}" title="Səhv varsa düzgün qaydanı sistemə öyrət">✏️ Səhvi Düzəlt</button>
          <button type="button" class="mini-ikon-btn" data-seslendir="${idx}" title="Cavabı səslə oxut">🔊 Dinlə</button>
          <div class="menu-acilan-qabi">
            <button type="button" class="mini-ikon-btn btn-daha-cox" data-menu-toggle="${idx}" title="Əlavə əməliyyatlar">•••</button>
            <div class="menu-acilan-siyahi" id="menuAletler_${idx}">
              <button type="button" class="menu-element" data-yeniden="${idx}">🔄 Yenidən cavabla</button>
              <button type="button" class="menu-element" data-etrafli="${idx}">🔍 Daha ətraflı izah et</button>
              <button type="button" class="menu-element" data-endir="${idx}">📥 Fayl kimi endir (.md)</button>
            </div>
          </div>
        </div>
      `;
    }

    // Etibarlılıq dərəcəsini və Bilik Boşluğunu düşünmə addımlarından çıxar
    let etibarliliqBadge = "";
    let bilikBosluguBanner = "";
    if (m.rol === "assistant" && Array.isArray(dusunme)) {
      const etibSetir = dusunme.find(d => d.includes("Etibarlılıq:"));
      if (etibSetir) {
        const temizEtib = etibSetir.replace(/^.*Etibarlılıq:\s*\*\*/i, "").replace(/\*\*.*$/, "").trim();
        const isBosluq = temizEtib.includes("🔴") || temizEtib.includes("Bilik Boşluğu");
        const isOrta = temizEtib.includes("🟡");
        const bg = isBosluq
          ? "rgba(239,68,68,0.14)"
          : (isOrta ? "rgba(245,158,11,0.14)" : "rgba(16,185,129,0.12)");
        const fg = isBosluq ? "#fca5a5" : (isOrta ? "#fcd34d" : "#6ee7b7");
        const brd = isBosluq
          ? "rgba(239,68,68,0.35)"
          : (isOrta ? "rgba(245,158,11,0.32)" : "rgba(16,185,129,0.28)");
        etibarliliqBadge = `<span style="font-size:10.5px; padding:1px 7px; border-radius:99px; background:${bg}; color:${fg}; border:1px solid ${brd}; font-weight:500;">${htmlQoru(temizEtib)}</span>`;
        if (isBosluq) {
          bilikBosluguBanner = `
            <div style="margin-top:8px; padding:8px 11px; border-radius:8px; background:rgba(239,68,68,0.09); border:1px dashed rgba(239,68,68,0.4); display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
              <span style="font-size:11.5px; color:#fecaca;">🔴 <b>Bilik Boşluğu aşkarlandı:</b> Bu sual üzrə bazada birbaşa rəsmi maddə və ya Qızıl Qayda tapılmadı.</span>
              <button type="button" class="kicik-duyme" data-oyren-duzelis="${idx}" style="background:rgba(245,158,11,0.2); color:#fde68a; border:1px solid rgba(245,158,11,0.45); font-size:11px; cursor:pointer;">🎯 Bu mövzunu Sistemə Öyrət</button>
            </div>
          `;
        }
      }
    }

    return `
      <div class="mesaj-qutu ${m.rol}">
        <div class="mesaj-basliq" style="flex-wrap:wrap;">
          <span>${rolAdi}</span>
          ${etibarliliqBadge}
          <span>${vaxt}</span>
        </div>
        ${dusunmeHtml}
        <div class="mesaj-icerik">
          ${markdownFormatla(m.metn, sitatlar)}
        </div>
        ${bilikBosluguBanner}
        ${altSitatlarHtml}
        ${aletlerHtml}
      </div>
    `;
  }).join("");

  qutu.scrollTop = qutu.scrollHeight;

  qutu.querySelectorAll(".sitat-heb").forEach(btn => {
    btn.addEventListener("click", () => {
      const menbeId = btn.getAttribute("data-menbe-id");
      const parcaId = btn.getAttribute("data-parca-id");
      menbeOnizlemeAc(menbeId, parcaId);
    });
  });

  // Növbəti əlaqəli sual çipləri (1 kliklə soruş)
  qutu.querySelectorAll("[data-novbeti-sual]").forEach(btn => {
    btn.addEventListener("click", () => {
      const ns = btn.getAttribute("data-novbeti-sual");
      if (ns) sualGonder(ns);
    });
  });

  // Mesaj alətləri (Yenidən Cavabla, Ətraflı İzah, Kopyala, Səsləndir, Yaddaşa Saxla, Endir)
  qutu.querySelectorAll("[data-yeniden]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-yeniden"));
      let sual = "";
      for (let i = idx - 1; i >= 0; i--) {
        if (veziyyet.sohbetler[i]?.rol === "user") {
          sual = veziyyet.sohbetler[i].metn;
          break;
        }
      }
      if (sual) {
        bildirisGoster("🔄 Sual yenidən cavablandırılır...");
        sualGonder(sual);
      }
    });
  });

  qutu.querySelectorAll("[data-etrafli]").forEach(btn => {
    btn.addEventListener("click", () => {
      sualGonder("Yuxarıdakı cavabı ən xırda detallarına qədər, bütün maddələr, istisnalar və praktiki keyslərlə geniş və dərindən izah et.");
    });
  });

  qutu.querySelectorAll("[data-kopyala]").forEach(btn => {
    btn.addEventListener("click", () => {
      const m = veziyyet.sohbetler[Number(btn.getAttribute("data-kopyala"))];
      if (m) {
        navigator.clipboard.writeText(teqleriTemizle(m.metn));
        bildirisGoster("📋 Cavab mübadilə buferinə kopyalandı!");
      }
    });
  });

  qutu.querySelectorAll("[data-seslendir]").forEach(btn => {
    btn.addEventListener("click", () => {
      const m = veziyyet.sohbetler[Number(btn.getAttribute("data-seslendir"))];
      if (!m || !("speechSynthesis" in window)) return;
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        bildirisGoster("⏹️ Səsləndirmə dayandırıldı");
        return;
      }
      const temiz = teqleriTemizle(m.metn).replace(/[#*>_`[\]]/g, " ");
      const ut = new SpeechSynthesisUtterance(temiz);
      const sesler = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
      const azSes = sesler.find(v => /^az/i.test(v.lang));
      if (azSes) {
        ut.voice = azSes;
        ut.lang = azSes.lang;
      } else {
        ut.lang = "az-AZ";
      }
      window.speechSynthesis.speak(ut);
      bildirisGoster("🔊 Cavab səsləndirilir... (Dayandırmaq üçün yenidən basın)");
    });
  });

  // Özü-Öyrənmə: 👍 Cavabı Təsdiqlə (Təcrübə Bankına Qat)
  qutu.querySelectorAll("[data-oyren-tesdiq]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.getAttribute("data-oyren-tesdiq"));
      const m = veziyyet.sohbetler[idx];
      if (!m) return;
      let sual = "";
      for (let i = idx - 1; i >= 0; i--) {
        if (veziyyet.sohbetler[i]?.rol === "user") {
          sual = veziyyet.sohbetler[i].metn;
          break;
        }
      }
      btn.disabled = true;
      btn.textContent = "✅ Təcrübə Bankına Əlavə Edildi";
      try {
        await apiSorgu("/api/oyren", "POST", {
          nov: "tesdiq",
          sual,
          cavab: teqleriTemizle(m.metn)
        });
        bildirisGoster("💼 Cavab etalon praktiki keys kimi 'Mühasibatlıq Praktikası və Təcrübə Bankı'na əlavə olundu!");
        melumatlariYenile();
      } catch (err) {
        bildirisGoster("⚠️ " + err.message);
      }
    });
  });

  // Özü-Öyrənmə: 🎯 Ekspert Düzəlişi Öyrət (Qızıl Qayda + Praktiki Keys)
  qutu.querySelectorAll("[data-oyren-duzelis]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.getAttribute("data-oyren-duzelis"));
      const m = veziyyet.sohbetler[idx];
      if (!m) return;
      let sual = "";
      for (let i = idx - 1; i >= 0; i--) {
        if (veziyyet.sohbetler[i]?.rol === "user") {
          sual = veziyyet.sohbetler[i].metn;
          break;
        }
      }
      const duzelis = prompt(
        `🎯 Bu sual üzrə dəqiq qaydanı və ya düzəlişinizi yazın:\n(Mövzu: "${(sual || "").slice(0, 90)}")\n\nSistem bunu həm Uzunmüddətli Qızıl Qayda, həm də Praktiki Keys kimi öyrənəcək:`,
        ""
      );
      if (!duzelis || !duzelis.trim()) return;
      try {
        await apiSorgu("/api/oyren", "POST", {
          nov: "duzelis",
          sual,
          duzelis: duzelis.trim()
        });
        bildirisGoster("🎯 Düzəlişiniz 'Qızıl Qayda' və 'Praktiki Keys' kimi öyrənildi! Sual yenidən cavablandırılır...");
        await melumatlariYenile();
        if (sual) {
          sualGonder(sual);
        }
      } catch (err) {
        bildirisGoster("⚠️ " + err.message);
      }
    });
  });

  qutu.querySelectorAll("[data-menu-toggle]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const idx = btn.getAttribute("data-menu-toggle");
      const menu = document.getElementById(`menuAletler_${idx}`);
      document.querySelectorAll(".menu-acilan-siyahi.aktiv").forEach(m => {
        if (m !== menu) m.classList.remove("aktiv");
      });
      if (menu) menu.classList.toggle("aktiv");
    });
  });

  qutu.querySelectorAll("[data-endir]").forEach(btn => {
    btn.addEventListener("click", () => {
      const m = veziyyet.sohbetler[Number(btn.getAttribute("data-endir"))];
      if (!m) return;
      const blob = new Blob([teqleriTemizle(m.metn)], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `BeyinAI_Hesabat_${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
    });
  });
}

// ---- Sağ Panel: Mənbə Pasportu, Daxili Axtarış və Sitat Önizləməsi ----
function onizlemeParcalariniCiz(m, vurgulanacaqParcaId = null, axtarisSozu = "") {
  const konteyner = document.getElementById("onizlemeParcalarSiyahisi");
  if (!konteyner) return;

  const soz = axtarisSozu.trim().toLocaleLowerCase("az");
  const uygunParcalar = (m.parcalar || []).filter(p => {
    if (!soz) return true;
    return (p.metn + " " + p.basliq + " " + p.gonderen).toLocaleLowerCase("az").includes(soz);
  });

  if (uygunParcalar.length === 0) {
    konteyner.innerHTML = `<div style="padding:14px; color:var(--metn-solgun); font-size:12px;">Bu sənəddə "${htmlQoru(axtarisSozu)}" sözünə uyğun hissə tapılmadı.</div>`;
    return;
  }

  konteyner.innerHTML = uygunParcalar.map(p => {
    const aktivSinif = p.id === vurgulanacaqParcaId ? "aktiv-sitat" : "";
    const metaSag = [p.gonderen ? `👤 ${p.gonderen}` : "", p.tarix ? `🕒 ${p.tarix}` : ""].filter(Boolean).join(" • ");

    let qorunmushMetn = htmlQoru(p.metn);
    if (soz && soz.length >= 2) {
      const escaped = soz.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      qorunmushMetn = qorunmushMetn.replace(new RegExp(`(${escaped})`, "gi"), `<mark class="axtaris-vurgu">$1</mark>`);
    }

    return `
      <div class="parca-blok ${aktivSinif}" id="onizleme-${htmlQoru(p.id)}">
        <div class="parca-ust-etiket">
          <span>#${p.sira} ${htmlQoru(p.basliq)}</span>
          <span>${htmlQoru(metaSag)}</span>
        </div>
        <div>${qorunmushMetn}</div>
      </div>
    `;
  }).join("");
}

async function menbeOnizlemeAc(menbeId, vurgulanacaqParcaId = null) {
  if (!menbeId) return;
  veziyyet.seciliMenbeId = menbeId;
  menbeleriCiz();

  const sagP = document.getElementById("sagPanel");
  if (sagP) {
    sagP.classList.remove("gizli");
    document.getElementById("btnPanelToggle")?.classList.add("aktiv");
  }

  document.querySelectorAll(".sag-tab").forEach(t => t.classList.toggle("aktiv", t.getAttribute("data-tab") === "sitatTab"));
  document.querySelectorAll(".sag-tab-mezmun").forEach(c => c.classList.toggle("aktiv", c.id === "sitatTab"));

  const qutu = document.getElementById("sitatOnizlemeQutusu") || document.getElementById("sitatTab");
  qutu.classList.remove("sitat-onizleme-bos");
  qutu.innerHTML = `<div style="padding:20px; color:var(--metn-ikincil);">⏳ Sənəd mətni yüklənir...</div>`;

  try {
    const data = await apiSorgu(`/api/menbeler/${encodeURIComponent(menbeId)}`);
    const m = data.menbe;
    veziyyet.cariMenbeDetali = m;
    const ikon = NOV_IKONLARI[m.nov] || "📄";

    // Sənəd Pasportu (Avtomatik çıxarılmış məbləğlər, tarixlər, VÖEN-lər və iştirakçı statistikası)
    const pasport = m.meta?.pasport || {};
    const kimStat = m.meta?.istirakci_stat || {};
    const meblegler = pasport.meblegler || [];
    const tarixler = pasport.tarixler || [];
    const kodlar = pasport.kodlar || [];

    let pasportHtml = "";
    if (meblegler.length > 0 || tarixler.length > 0 || kodlar.length > 0 || Object.keys(kimStat).length > 0) {
      pasportHtml = `
        <div class="pasport-qutu">
          <div class="pasport-basliq">
            <span>📊 Avtomatik Sənəd / Çat Pasportu</span>
          </div>
          ${Object.keys(kimStat).length > 0 ? `
            <div>
              <div style="color:var(--metn-ikincil); margin-bottom:3px;">👥 İştirakçı Aktivliyi:</div>
              <div class="pasport-etiketler">
                ${Object.entries(kimStat).map(([ad, say]) => `<span class="pasport-cip">👤 ${htmlQoru(ad)}: <b>${say}</b> mesaj</span>`).join("")}
              </div>
            </div>
          ` : ""}
          ${meblegler.length > 0 ? `
            <div>
              <div style="color:var(--metn-ikincil); margin-bottom:3px;">💰 Tapılan Məbləğlər:</div>
              <div class="pasport-etiketler">
                ${meblegler.slice(0, 12).map(x => `<span class="pasport-cip mebleg">${htmlQoru(x)}</span>`).join("")}
              </div>
            </div>
          ` : ""}
          ${tarixler.length > 0 ? `
            <div>
              <div style="color:var(--metn-ikincil); margin-bottom:3px;">📅 Tarixlər:</div>
              <div class="pasport-etiketler">
                ${tarixler.slice(0, 10).map(x => `<span class="pasport-cip tarix">${htmlQoru(x)}</span>`).join("")}
              </div>
            </div>
          ` : ""}
          ${kodlar.length > 0 ? `
            <div>
              <div style="color:var(--metn-ikincil); margin-bottom:3px;">🏢 VÖEN və Nömrələr:</div>
              <div class="pasport-etiketler">
                ${kodlar.slice(0, 8).map(x => `<span class="pasport-cip">${htmlQoru(x)}</span>`).join("")}
              </div>
            </div>
          ` : ""}
        </div>
      `;
    }

    const urlMövcuddur = m.nov === "link" || m.nov === "youtube" || Boolean(m.meta?.url);
    const linkUrl = m.meta?.url || (m.ad.startsWith("http") ? m.ad : "");

    const qovluqSecimHtml = `
      <select id="onizlemeQovluqSecici" title="Sənədin yerləşdiyi qovluğu dəyiş" style="background:var(--bg-input); color:var(--metn-ikincil); border:1px solid var(--serhed); border-radius:4px; padding:2px 6px; font-size:11px; cursor:pointer;">
        ${veziyyet.qovluqlar.map(q => `<option value="${htmlQoru(q.id)}" ${q.id === m.qovluq_id ? "selected" : ""}>${htmlQoru(q.ikon)} ${htmlQoru(q.ad)}</option>`).join("")}
      </select>
    `;

    qutu.innerHTML = `
      <div class="onizleme-basliq-kart">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <h3 style="margin:0;">${ikon} ${htmlQoru(m.ad)}</h3>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            ${qovluqSecimHtml}
            ${urlMövcuddur ? `
              ${linkUrl ? `<a href="${htmlQoru(linkUrl)}" target="_blank" rel="noopener noreferrer" class="menbe-aksiyon-duyme" title="Orijinal veb səhifəni aç" style="text-decoration:none; color:#38bdf8; font-size:11px; padding:3px 7px; background:rgba(56,189,248,0.1); border-radius:4px;">🌐 Sayta Get</a>` : ""}
              <button id="btnOnizlemeSinxron" class="menbe-aksiyon-duyme" title="Mənbəni canlı linkdən yenilə" style="background:rgba(56,189,248,0.1); border:none; color:#38bdf8; font-size:11px; padding:3px 7px; border-radius:4px; cursor:pointer;">🔄 Yenilə</button>
            ` : ""}
          </div>
        </div>
        <div class="onizleme-meta">${htmlQoru(m.xulase)}</div>
      </div>
      ${pasportHtml}
      <div class="daxili-axtaris-qutu">
        <input type="text" id="menbeDaxiliAxtaris" placeholder="🔍 Bu sənədin / çatın içində söz və ya rəqəm axtar..." />
      </div>
      <div id="onizlemeParcalarSiyahisi" style="display:flex; flex-direction:column; gap:10px;"></div>
    `;

    const qovluqSecici = document.getElementById("onizlemeQovluqSecici");
    if (qovluqSecici) {
      qovluqSecici.addEventListener("change", async () => {
        const yeniQovluq = qovluqSecici.value;
        try {
          await apiSorgu(`/api/menbeler/${encodeURIComponent(m.id)}`, "PUT", { qovluq_id: yeniQovluq });
          bildirisGoster("📁 Sənəd seçilmiş qovluğa köçürüldü!");
          await melumatlariYenile();
        } catch (err) {
          bildirisGoster("⚠️ " + err.message);
        }
      });
    }

    const btnOnizSinx = document.getElementById("btnOnizlemeSinxron");
    if (btnOnizSinx) {
      btnOnizSinx.addEventListener("click", async () => {
        btnOnizSinx.textContent = "⏳ Yenilənir...";
        btnOnizSinx.disabled = true;
        bildirisGoster("🔄 Canlı linkdən ən son məzmun oxunur...");
        try {
          const res = await apiSorgu(`/api/menbeler/${encodeURIComponent(m.id)}/sinxron`, "POST");
          if (res.ok) {
            bildirisGoster(res.mesaj || "✅ Mənbə uğurla yeniləndi!");
            await melumatlariYenile();
            await menbeOnizlemeAc(m.id);
          } else {
            bildirisGoster("⚠️ " + (res.xeta || "Yeniləmə xətası"));
          }
        } catch (e) {
          bildirisGoster("⚠️ Yeniləmə xətası: " + e.message);
        } finally {
          if (btnOnizSinx) {
            btnOnizSinx.textContent = "🔄 Yenilə";
            btnOnizSinx.disabled = false;
          }
        }
      });
    }

    onizlemeParcalariniCiz(m, vurgulanacaqParcaId, "");

    const axtarInput = document.getElementById("menbeDaxiliAxtaris");
    axtarInput.addEventListener("input", () => {
      onizlemeParcalariniCiz(m, vurgulanacaqParcaId, axtarInput.value);
    });

    if (vurgulanacaqParcaId) {
      setTimeout(() => {
        const hedef = document.getElementById(`onizleme-${vurgulanacaqParcaId}`);
        if (hedef) hedef.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    }
  } catch (err) {
    qutu.innerHTML = `<div style="padding:20px; color:var(--tehlike);">⚠️ ${htmlQoru(err.message)}</div>`;
  }
}

// ---- Sağ Panel: Uzunmüddətli Şəxsi Yaddaş (Qızıl Yaddaş + Qaralama/Boz Zona Keçidi) ----
function yaddasCiz() {
  const qutu = document.getElementById("yaddasSiyahisi");
  if (!qutu) return;

  const qarSay = (veziyyet.qaralamalar || []).length;
  const bozSay = (veziyyet.mubahiseliDosyeler || []).length;
  const dusSay = (veziyyet.dusunmeQaydalari || []).length;

  const ustZolaq = (qarSay > 0 || bozSay > 0 || dusSay > 0)
    ? `<div id="btnYaddasdanTekamulAc" style="background:rgba(168,85,247,0.12); border:1px solid rgba(168,85,247,0.35); border-radius:8px; padding:8px 10px; margin-bottom:8px; cursor:pointer; font-size:11.5px; color:#e9d5ff;">
         🧬 <strong>Özünü-İnkişaf:</strong> ${qarSay} qaralama • ${bozSay} boz zona • ${dusSay} düşünmə qaydası <span style="float:right; color:#c084fc;">Aç →</span>
       </div>`
    : "";

  if (veziyyet.yaddas.length === 0) {
    qutu.innerHTML = ustZolaq + `
      <div style="text-align:center; padding:20px; color:var(--metn-solgun); font-size:12px;">
        Hələ yaddaş qeydi yoxdur. Yuxarıdan əlavə edə və ya çatda <i>"Yadda saxla ki..."</i> yaza bilərsiniz.
      </div>
    `;
  } else {
    qutu.innerHTML = ustZolaq + veziyyet.yaddas.map(y => {
      const etibarEtiket = y.etibar_seviyyesi === "is_siyaseti"
        ? "⚖️ İş Siyasəti"
        : y.etibar_seviyyesi === "orijinal_menbe"
          ? "🟢 Rəsmi Norma"
          : y.etibar_seviyyesi === "ekspert_tesdiqli"
            ? "🎯 Ekspert Təsdiqli"
            : "🧠 Sintez";
      return `
        <div class="yaddas-kart">
          <div class="yaddas-kart-ust">
            <span>[${htmlQoru(y.kateqoriya)}] • ${etibarEtiket}</span>
            <div style="display:flex; align-items:center; gap:4px;">
              <button class="menbe-sil-duyme" data-yad-redakte="${htmlQoru(y.id)}" title="Qaydanı redaktə et" style="color:#38bdf8;">✏️</button>
              <button class="menbe-sil-duyme" data-yad-sil="${htmlQoru(y.id)}" title="Yaddaşdan sil">✕</button>
            </div>
          </div>
          <div>${htmlQoru(y.metn)}</div>
        </div>
      `;
    }).join("");
  }

  qutu.insertAdjacentHTML("beforeend",
    `<button type="button" id="btnYaddasZibil" class="kicik-duyme" style="margin-top:8px; width:100%;">🗑️ Zibil qutusu (silinənləri geri qaytar)</button><div id="yaddasZibilQabi"></div>`);
  document.getElementById("btnYaddasZibil").addEventListener("click", yaddasZibiliniGoster);

  const kecid = document.getElementById("btnYaddasdanTekamulAc");
  if (kecid) {
    kecid.addEventListener("click", () => simulyatorModalAc());
  }

  qutu.querySelectorAll("[data-yad-redakte]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-yad-redakte");
      const cari = veziyyet.yaddas.find(x => x.id === id);
      if (!cari) return;
      const yeniMetn = prompt("✏️ Yaddaş qaydasını redaktə edin:", cari.metn);
      if (!yeniMetn || !yeniMetn.trim() || yeniMetn.trim() === cari.metn) return;
      await apiSorgu(`/api/yaddas/${encodeURIComponent(id)}`, "PUT", {
        kateqoriya: cari.kateqoriya,
        metn: yeniMetn.trim()
      });
      bildirisGoster("✏️ Yaddaş qaydası yeniləndi!");
      melumatlariYenile();
    });
  });

  qutu.querySelectorAll("[data-yad-sil]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-yad-sil");
      await apiSorgu(`/api/yaddas/${encodeURIComponent(id)}`, "DELETE");
      bildirisGoster("🗑️ Yaddaş qeydi zibil qutusuna köçürüldü");
      melumatlariYenile();
    });
  });
}

async function yaddasZibiliniGoster() {
  const qab = document.getElementById("yaddasZibilQabi");
  if (!qab) return;
  try {
    const net = await apiSorgu("/api/yaddas/zibil");
    const siyahi = net.zibil || [];
    qab.innerHTML = siyahi.length === 0
      ? `<div style="font-size:12px; color:var(--metn-solgun); padding:8px 0;">Zibil qutusu boşdur.</div>`
      : siyahi.map(y => `
        <div class="yaddas-kart" style="opacity:0.75;">
          <div class="yaddas-kart-ust">
            <span>[${htmlQoru(y.kateqoriya)}] • ${htmlQoru(y.menbe)}</span>
            <button type="button" class="menbe-sil-duyme" data-yad-berpa="${htmlQoru(y.id)}" title="Geri qaytar" style="color:#34d399;">↩️</button>
          </div>
          <div>${htmlQoru(y.metn)}</div>
        </div>`).join("");
    qab.querySelectorAll("[data-yad-berpa]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await apiSorgu("/api/yaddas/zibil/berpa", "POST", { id: btn.getAttribute("data-yad-berpa") });
        bildirisGoster("↩️ Qeyd geri qaytarıldı");
        melumatlariYenile();
      });
    });
  } catch (err) {
    bildirisGoster("❌ " + err.message);
  }
}

// ---- Fayl Yükləmə (Canlı Progress Zolağı və Ləğv Etmə ilə!) ----
function fayliBase64Oxu(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const base64 = res.includes(",") ? res.split(",")[1] : res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function fayllariYukle(fileList) {
  const fayllar = Array.from(fileList || []);
  if (fayllar.length === 0) return;

  const durumQutu = document.getElementById("yuklemeDurumQutusu");
  const durumMetn = document.getElementById("yuklemeDurumMetn");
  const progressBar = document.getElementById("yuklemeProgressBar");

  durumQutu.hidden = false;
  veziyyet.yuklemeAbort = new AbortController();

  for (let i = 0; i < fayllar.length; i++) {
    const f = fayllar[i];
    const olcuKb = Math.max(1, Math.round(f.size / 1024));
    const baslangic = Date.now();

    progressBar.style.width = `${Math.round(((i + 0.3) / fayllar.length) * 100)}%`;
    durumMetn.textContent = `⏳ (${i + 1}/${fayllar.length}) Oxunur: ${f.name} (${olcuKb} KB)...`;

    const sanTimer = setInterval(() => {
      const san = ((Date.now() - baslangic) / 1000).toFixed(1);
      durumMetn.textContent = `⏳ (${i + 1}/${fayllar.length}) Analiz edilir: ${f.name} (${san} san)...`;
    }, 300);

    try {
      const base64Data = await fayliBase64Oxu(f);
      const net = await apiSorgu(
        "/api/menbeler/fayl",
        "POST",
        {
          qovluq_id: veziyyet.aktivQovluq,
          faylAdi: f.name,
          mimeType: f.type || "",
          base64Data
        },
        { signal: veziyyet.yuklemeAbort.signal, timeoutMs: 180000 }
      );

      clearInterval(sanTimer);
      progressBar.style.width = `${Math.round(((i + 1) / fayllar.length) * 100)}%`;
      if (net.qanun_tesir && net.qanun_tesir.deyisiklikTapildi) {
        bildirisGoster(`📜 Qanun dəyişikliyi aşkarlandı! ${net.qanun_tesir.arxivlenenSay} əvvəlki qayda dövr arxivi kimi qorundu.`, 5500);
      } else {
        bildirisGoster(`✅ Əlavə edildi: ${f.name} (${net.menbe?.parcalar?.length || 0} blok)`);
      }
      if (net.menbe?.id) {
        veziyyet.seciliMenbeId = net.menbe.id;
      }
    } catch (err) {
      clearInterval(sanTimer);
      bildirisGoster(`⚠️ Xəta (${f.name}): ${err.message}`, 6000);
      if (veziyyet.yuklemeAbort.signal.aborted) break;
    }
  }

  durumQutu.hidden = true;
  veziyyet.yuklemeAbort = null;

  await melumatlariYenile();
  if (veziyyet.seciliMenbeId) {
    menbeOnizlemeAc(veziyyet.seciliMenbeId);
  }
}

// ---- Sual Göndərmə (Canlı Taymer və Ləğv Etmə ilə!) ----
async function sualGonder(sualMetni) {
  const sual = String(sualMetni || "").trim();
  if (!sual) return;

  const btn = document.getElementById("btnGonder");
  const input = document.getElementById("sualInput");
  btn.disabled = true;
  input.value = "";

  veziyyet.sohbetAbort = new AbortController();
  const baslangic = Date.now();

  veziyyet.sohbetler.push({
    rol: "user",
    metn: sual,
    yaradildi: baslangic
  });
  const gozlemeMesaji = {
    rol: "assistant",
    gozleyir: true,
    metn: "⏳ *Mənbələr, çat xronologiyası və şəxsi yaddaş analiz edilir (0.1 san)...*",
    yaradildi: baslangic
  };
  veziyyet.sohbetler.push(gozlemeMesaji);
  sohbetleriCiz();

  const derinAktiv = veziyyet.tenzimlemeler.derin_rejim !== "0";
  const sanTimer = setInterval(() => {
    const san = ((Date.now() - baslangic) / 1000).toFixed(1);
    gozlemeMesaji.metn = derinAktiv
      ? `🧠 *Dərin təfəkkür rejimi: Mənbələr, şərtlər və qanunvericilik parçaları birləşdirilir (${san} san)...*`
      : `⏳ *Mənbələr və şəxsi yaddaş analiz edilir (${san} san)...*`;
    sohbetleriCiz();
  }, 400);

  try {
    const net = await apiSorgu(
      "/api/sohbet",
      "POST",
      {
        sual,
        qovluq_id: veziyyet.aktivQovluq,
        gonderen: document.getElementById("filtrGonderen").value,
        menbe_nov: document.getElementById("filtrNov").value,
        tarix_baslangic: document.getElementById("filtrTarixBaslangic").value,
        tarix_son: document.getElementById("filtrTarixSon").value,
        derin_rejim: derinAktiv
      },
      { signal: veziyyet.sohbetAbort.signal, timeoutMs: 300000 } // düşünmə + güclü modellə yoxlama 4 dəqiqəyə yaxın çəkə bilər
    );

    clearInterval(sanTimer);
    await melumatlariYenile();

    if (net.yeniYaddaslar && net.yeniYaddaslar.length > 0) {
      bildirisGoster(`🧠 Yeni fakt Şəxsi Yaddaşa əlavə olundu!`);
    }
    const sagP = document.getElementById("sagPanel");
    if (net.sitatlar && net.sitatlar.length > 0 && sagP && !sagP.classList.contains("gizli")) {
      menbeOnizlemeAc(net.sitatlar[0].menbe_id, net.sitatlar[0].parca_id);
    }
  } catch (err) {
    clearInterval(sanTimer);
    veziyyet.sohbetler.pop();
    veziyyet.sohbetler.push({
      rol: "assistant",
      metn: `⚠️ Xəta baş verdi: ${err.message}`,
      yaradildi: Date.now()
    });
    sohbetleriCiz();
  } finally {
    veziyyet.sohbetAbort = null;
    btn.disabled = false;
    input.focus();
  }
}

// ---- 3. SƏSLİ SUAL VERMƏ (Web Speech API / SpeechRecognition) ----
function sesliGirisQur() {
  const btnSes = document.getElementById("btnSesliGiris");
  const sualInput = document.getElementById("sualInput");
  if (!btnSes || !sualInput) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    btnSes.addEventListener("click", () => {
      bildirisGoster("⚠️ Brauzeriniz səslə daxiletməni dəstəkləmir (Google Chrome və ya Microsoft Edge tövsiyə olunur).");
    });
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "az-AZ";
  recognition.interimResults = true;
  recognition.continuous = false;

  let dinleyir = false;
  let ilkinMetn = "";

  btnSes.addEventListener("click", () => {
    if (dinleyir) {
      recognition.stop();
      return;
    }
    ilkinMetn = sualInput.value.trim();
    try {
      recognition.start();
    } catch (e) {
      console.warn("Speech start:", e);
    }
  });

  recognition.onstart = () => {
    dinleyir = true;
    btnSes.classList.add("dinleyir");
    btnSes.title = "Dinlənilir... Danışın (Dayandırmaq üçün klikləyin)";
    bildirisGoster("🎙️ Sizi dinləyirəm... Sualınızı danışın.");
  };

  recognition.onresult = (e) => {
    let cariDanisiq = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      cariDanisiq += e.results[i][0].transcript;
    }
    if (cariDanisiq) {
      sualInput.value = (ilkinMetn ? ilkinMetn + " " : "") + cariDanisiq;
      sualInput.style.height = "auto";
      sualInput.style.height = Math.min(sualInput.scrollHeight, 120) + "px";
    }
  };

  recognition.onerror = (e) => {
    console.warn("Speech error:", e.error);
    dinleyir = false;
    btnSes.classList.remove("dinleyir");
    btnSes.title = "Səslə daxil et (Danışın)";
    if (e.error === "not-allowed" || e.error === "permission-denied") {
      bildirisGoster("⚠️ Mikrofon icazəsi verilmədi. Zəhmət olmasa brauzerdə mikrofona icazə verin.");
    } else if (e.error === "no-speech") {
      bildirisGoster("ℹ️ Səs eşidilmədi, zəhmət olmasa təkrar cəhd edin.");
    }
  };

  recognition.onend = () => {
    dinleyir = false;
    btnSes.classList.remove("dinleyir");
    btnSes.title = "Səslə daxil et (Danışın)";
  };
}

function bookmarkletHazirla() {
  const origin = window.location.origin;
  const kod = `javascript:(function(){try{var basliq=document.title||'Canli_Cat';var el=document.querySelectorAll('[data-pre-plain-text], .message-in, .message-out, .Message, .bubble-content');var s=[];if(el.length>0){el.forEach(function(x){var pre=x.getAttribute('data-pre-plain-text')||'';var t=x.innerText||'';if(t.trim())s.push(pre?pre+' '+t.replace(/\\n+/g,' '):t.replace(/\\n+/g,' '));});}else{s.push(document.body.innerText.slice(0,30000));}fetch('${origin}/api/connectors/whatsapp/ingest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({catAdi:basliq,metn:s.join('\\n')})}).then(function(r){return r.json()}).then(function(d){alert(d.ok?'✅ BeyinAI bazasına '+s.length+' mesaj göndərildi!':'⚠️ Xəta: '+d.xeta);}).catch(function(e){alert('BeyinAI serveri açıq olmalıdır ('+'${origin}'+')');});}catch(e){alert(e.message);}})();`;
  const link = document.getElementById("wpBookmarkletLink");
  if (link) link.setAttribute("href", kod);
  return kod;
}

document.addEventListener("DOMContentLoaded", () => {
  melumatlariYenile();
  bookmarkletHazirla();
  sesliGirisQur();

  const btnDerin = document.getElementById("btnDerinRejim");
  if (btnDerin) {
    btnDerin.addEventListener("click", async () => {
      const cari = veziyyet.tenzimlemeler.derin_rejim !== "0";
      const yeni = cari ? "0" : "1";
      veziyyet.tenzimlemeler.derin_rejim = yeni;
      ustPanelDurumYenile();
      await apiSorgu("/api/tenzimlemeler", "POST", { derin_rejim: yeni });
      bildirisGoster(
        yeni === "1"
          ? "🧠 Dərin Təhlil və Parçaları Birləşdirmə Rejimi aktivləşdirildi!"
          : "⚡ Sürətli Cavab Rejimi aktivləşdirildi!"
      );
    });
  }

  document.getElementById("btnYuklemeLegv").addEventListener("click", () => {
    if (veziyyet.yuklemeAbort) {
      veziyyet.yuklemeAbort.abort();
      bildirisGoster("⏹️ Fayl yükləmə dayandırıldı");
    }
  });

  document.querySelectorAll(".sag-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const hedef = tab.getAttribute("data-tab");
      document.querySelectorAll(".sag-tab").forEach(t => t.classList.toggle("aktiv", t === tab));
      document.querySelectorAll(".sag-tab-mezmun").forEach(c => c.classList.toggle("aktiv", c.id === hedef));
    });
  });

  document.getElementById("btnYeniQovluq").addEventListener("click", async () => {
    const ad = prompt("Yeni Qovluğun (Notebook) adını yazın:", "Layihə X");
    if (!ad || !ad.trim()) return;
    const ikon = prompt("Qovluq üçün emoji seçin:", "🚀") || "📁";
    const net = await apiSorgu("/api/qovluqlar", "POST", { ad: ad.trim(), ikon: ikon.trim() });
    veziyyet.aktivQovluq = net.qovluq.id;
    bildirisGoster(`📁 "${ad}" qovluğu yaradıldı`);
    melumatlariYenile();
  });

  const faylSecici = document.getElementById("faylSecici");
  const yuklemeQutusu = document.getElementById("yuklemeQutusu");

  faylSecici.addEventListener("change", () => {
    fayllariYukle(faylSecici.files);
    faylSecici.value = "";
  });

  yuklemeQutusu.addEventListener("dragover", e => {
    e.preventDefault();
    yuklemeQutusu.classList.add("suruklenir");
  });

  yuklemeQutusu.addEventListener("dragleave", () => {
    yuklemeQutusu.classList.remove("suruklenir");
  });

  yuklemeQutusu.addEventListener("drop", e => {
    e.preventDefault();
    yuklemeQutusu.classList.remove("suruklenir");
    if (e.dataTransfer?.files?.length) {
      fayllariYukle(e.dataTransfer.files);
    }
  });

  const sualInpEl = document.getElementById("sualInput");
  if (sualInpEl) {
    sualInpEl.addEventListener("input", () => {
      sualInpEl.style.height = "auto";
      sualInpEl.style.height = Math.min(sualInpEl.scrollHeight, 140) + "px";
    });
  }

  document.getElementById("sualFormu").addEventListener("submit", e => {
    e.preventDefault();
    const v = document.getElementById("sualInput").value;
    if (sualInpEl) sualInpEl.style.height = "auto";
    sualGonder(v);
  });

  document.getElementById("sualInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const v = e.target.value;
      if (sualInpEl) sualInpEl.style.height = "auto";
      sualGonder(v);
    }
  });

  document.querySelectorAll(".analiz-cip").forEach(cip => {
    cip.addEventListener("click", () => {
      sualGonder(cip.getAttribute("data-sual"));
    });
  });

  document.getElementById("btnSohbetTemizle").addEventListener("click", async () => {
    await apiSorgu("/api/sohbet/temizle", "POST", { qovluq_id: veziyyet.aktivQovluq });
    bildirisGoster("🧹 Söhbət tarixçəsi təmizləndi");
    melumatlariYenile();
  });

  document.getElementById("btnSohbetEndir")?.addEventListener("click", () => {
    const mesajlar = veziyyet.sohbetler || [];
    if (mesajlar.length === 0) {
      bildirisGoster("ℹ️ Endiriləcək söhbət tarixçəsi yoxdur.");
      return;
    }
    const mdHisseler = [
      `# 🧠 BeyinAI — Konsultasiya və Sual-Cavab Hesabatı`,
      `Tarix: ${new Date().toLocaleString("az-AZ")}`,
      `Qovluq: ${veziyyet.aktivQovluq}\n`,
      ...mesajlar.map(m => {
        const kim = m.rol === "user" ? "## 👤 Sual" : "## 🧠 BeyinAI Cavabı";
        const vaxt = m.yaradildi ? `_(${new Date(m.yaradildi).toLocaleString("az-AZ")})_` : "";
        return `${kim} ${vaxt}\n\n${teqleriTemizle(m.metn || "")}`;
      })
    ];
    const blob = new Blob([mdHisseler.join("\n\n---\n\n")], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `BeyinAI_Sohbet_Hesabati_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    bildirisGoster("📥 Bütün söhbət tarixçəsi (.md) hesabat kimi endirildi!");
  });

  // Bütün Bazada Ani Maddə və Açar Söz Axtarışı (<10ms)
  let globalAxtarisTaymer = null;
  const globalInput = document.getElementById("globalBazaAxtaris");
  const globalNeticeQutu = document.getElementById("globalAxtarisNeticeleri");
  if (globalInput && globalNeticeQutu) {
    globalInput.addEventListener("input", () => {
      clearTimeout(globalAxtarisTaymer);
      const q = globalInput.value.trim();
      if (!q) {
        globalNeticeQutu.hidden = true;
        globalNeticeQutu.innerHTML = "";
        return;
      }
      globalAxtarisTaymer = setTimeout(async () => {
        try {
          const url = `/api/axtar?q=${encodeURIComponent(q)}&qovluq_id=${encodeURIComponent(veziyyet.aktivQovluq || "all")}`;
          const cav = await apiSorgu(url, "GET");
          const siyahı = cav.neticeler || [];
          globalNeticeQutu.hidden = false;
          if (siyahı.length === 0) {
            globalNeticeQutu.innerHTML = `<div style="font-size:12px; color:var(--metn-solgun); padding:6px;">"${htmlQoru(q)}" üzrə bazada uyğun maddə və ya parça tapılmadı.</div>`;
            return;
          }
          globalNeticeQutu.innerHTML = `
            <div style="font-size:11px; color:var(--metn-solgun); margin-bottom:6px; display:flex; justify-content:space-between;">
              <span>⚡ Bazada tapılan nəticələr (${siyahı.length}):</span>
              <button type="button" id="btnGlobalAxtarisBagla" style="background:none; border:none; color:var(--metn-solgun); cursor:pointer; font-size:11px;">✕ Bağla</button>
            </div>
            ${siyahı.map(r => {
              const ikon = NOV_IKONLARI[r.menbe_novu] || "📄";
              return `
                <div class="yaddas-kart" data-global-menbe="${htmlQoru(r.menbe_id)}" data-global-parca="${htmlQoru(r.id)}" style="cursor:pointer; margin-bottom:6px; padding:8px 10px;">
                  <div style="font-size:11.5px; font-weight:600; color:#93c5fd; margin-bottom:3px;">${ikon} ${htmlQoru(r.menbe_adi)} — ${htmlQoru(r.basliq || "")}</div>
                  <div style="font-size:11.5px; color:var(--metn-ikinci); line-height:1.4;">${htmlQoru(r.metn.slice(0, 180))}...</div>
                </div>
              `;
            }).join("")}
          `;
          document.getElementById("btnGlobalAxtarisBagla")?.addEventListener("click", () => {
            globalNeticeQutu.hidden = true;
          });
          globalNeticeQutu.querySelectorAll("[data-global-menbe]").forEach(el => {
            el.addEventListener("click", () => {
              const mId = el.getAttribute("data-global-menbe");
              const pId = el.getAttribute("data-global-parca");
              menbeOnizlemeAc(mId, pId);
            });
          });
        } catch (err) {
          globalNeticeQutu.hidden = false;
          globalNeticeQutu.innerHTML = `<div style="font-size:12px; color:#fca5a5;">Axtarış xətası: ${htmlQoru(err.message)}</div>`;
        }
      }, 180);
    });
  }

  document.getElementById("yaddasForm").addEventListener("submit", async e => {
    e.preventDefault();
    const kateqoriya = document.getElementById("yaddasKat").value;
    const metnInput = document.getElementById("yaddasMetn");
    if (!metnInput.value.trim()) return;
    await apiSorgu("/api/yaddas", "POST", {
      kateqoriya,
      metn: metnInput.value.trim(),
      menbe: "Əl ilə əlavə",
      vaciblik: 5
    });
    metnInput.value = "";
    bildirisGoster("🧠 Şəxsi Yaddaşa əlavə olundu");
    melumatlariYenile();
  });

  document.getElementById("btnYaddasEndir")?.addEventListener("click", () => {
    const siyahı = veziyyet.yaddas || [];
    if (siyahı.length === 0) {
      bildirisGoster("ℹ️ Hələ yedəklənəcək yaddaş qeydi yoxdur.");
      return;
    }
    const md = [
      `# 🧠 BeyinAI — Öyrədilmiş Qızıl Qaydalar və Uzunmüddətli Yaddaş Ehtiyat Nüsxəsi`,
      `Tarix: ${new Date().toLocaleString("az-AZ")}`,
      `Cəmi Qayda Sayı: ${siyahı.length}\n`,
      ...siyahı.map((y, i) => `${i + 1}. **[${y.kateqoriya.toUpperCase()} | ${y.menbe}]** ${y.metn}`)
    ].join("\n\n");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `BeyinAI_Qizil_Qaydalar_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    bildirisGoster("📥 Bütün öyrədilmiş Qızıl Qaydalar kompüterinizə endirildi!");
  });

  document.getElementById("btnDemoYukle").addEventListener("click", async () => {
    bildirisGoster("⏳ Nümunə WhatsApp, Telegram və Müqavilə faylları yüklənir...");
    await apiSorgu("/api/demo-yukle", "POST");
    bildirisGoster("✨ 3 nümunə mənbə (WhatsApp, Telegram, PDF Müqavilə) bazaya əlavə olundu!");
    await melumatlariYenile();
  });

  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.getAttribute("data-close")).hidden = true;
    });
  });

  document.querySelectorAll(".modal-arka").forEach(m => {
    m.addEventListener("click", e => {
      if (e.target === m) m.hidden = true;
    });
  });

  document.getElementById("btnLinkModal").addEventListener("click", () => {
    const xetaQutu = document.getElementById("linkXetaQutusu");
    if (xetaQutu) {
      xetaQutu.style.display = "none";
      xetaQutu.innerHTML = "";
    }
    document.getElementById("modalLink").hidden = false;
    document.getElementById("inputLinkUrl").focus();
  });

  document.getElementById("btnMetnModal").addEventListener("click", () => {
    document.getElementById("modalMetn").hidden = false;
    document.getElementById("inputMetnBasliq").focus();
  });

  document.getElementById("formLink").addEventListener("submit", async e => {
    e.preventDefault();
    const url = document.getElementById("inputLinkUrl").value.trim();
    if (!url) return;
    const btn = document.getElementById("btnLinkElaveEt");
    const xetaQutu = document.getElementById("linkXetaQutusu");
    if (xetaQutu) {
      xetaQutu.style.display = "none";
      xetaQutu.innerHTML = "";
    }
    btn.disabled = true;
    btn.textContent = "⏳ Yoxlanılır...";
    bildirisGoster("⏳ Link yoxlanılır və məzmunu oxunur...");
    try {
      const net = await apiSorgu("/api/menbeler/link", "POST", {
        qovluq_id: veziyyet.aktivQovluq,
        url
      });
      document.getElementById("inputLinkUrl").value = "";
      document.getElementById("modalLink").hidden = true;
      bildirisGoster(`✅ Link uğurla oxundu və əlavə edildi: ${net.menbe.ad}`);
      await melumatlariYenile();
      menbeOnizlemeAc(net.menbe.id);
    } catch (err) {
      if (xetaQutu) {
        xetaQutu.style.display = "block";
        xetaQutu.innerHTML = `
          <div style="font-weight:700; margin-bottom:4px;">❌ Linkdəki məlumat oxuna bilmədi</div>
          <div>${htmlQoru(err.message)}</div>
          <button type="button" id="btnLinkdenQeydeKec" style="margin-top:8px; background:rgba(99,102,241,0.25); border:1px solid #6366f1; color:#e0e7ff; padding:5px 10px; border-radius:6px; font-size:11.5px; cursor:pointer; font-weight:600;">
            📋 Mətni "Qeyd Yapışdır" bölməsindən əlavə et →
          </button>
        `;
        const kecBtn = document.getElementById("btnLinkdenQeydeKec");
        if (kecBtn) {
          kecBtn.addEventListener("click", () => {
            document.getElementById("modalLink").hidden = true;
            document.getElementById("modalMetn").hidden = false;
            document.getElementById("inputMetnBasliq").focus();
          });
        }
      }
      bildirisGoster("❌ " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Yoxla və Əlavə et";
    }
  });

  document.getElementById("formMetn").addEventListener("submit", async e => {
    e.preventDefault();
    const basliq = document.getElementById("inputMetnBasliq").value.trim();
    const metn = document.getElementById("inputMetnIcerik").value.trim();
    if (!basliq || !metn) return;
    try {
      const net = await apiSorgu("/api/menbeler/metn", "POST", {
        qovluq_id: veziyyet.aktivQovluq,
        basliq,
        metn
      });
      document.getElementById("inputMetnBasliq").value = "";
      document.getElementById("inputMetnIcerik").value = "";
      document.getElementById("modalMetn").hidden = true;
      bildirisGoster(`✅ Əlavə edildi: ${net.menbe.ad}`);
      await melumatlariYenile();
      menbeOnizlemeAc(net.menbe.id);
    } catch (err) {
      bildirisGoster("⚠️ " + err.message);
    }
  });

  function provayderSaheleriniYenile() {
    const p = document.getElementById("tenzProvayder")?.value || "gemini";
    const qGemini = document.getElementById("qrupGemini");
    const qGroq = document.getElementById("qrupGroq");
    const qOllama = document.getElementById("qrupOllama");
    if (qGemini) qGemini.style.display = p === "gemini" ? "block" : "none";
    if (qGroq) qGroq.style.display = p === "groq" ? "block" : "none";
    if (qOllama) qOllama.style.display = p === "ollama" ? "block" : "none";
  }

  document.getElementById("tenzProvayder")?.addEventListener("change", provayderSaheleriniYenile);

  const btnFiltr = document.getElementById("btnFiltrToggle");
  const filtrPanel = document.getElementById("filtrAcilanPanel");
  if (btnFiltr && filtrPanel) {
    btnFiltr.addEventListener("click", () => {
      filtrPanel.hidden = !filtrPanel.hidden;
    });
  }

  document.getElementById("btnTenzimlemeler").addEventListener("click", () => {
    const t = veziyyet.tenzimlemeler;
    document.getElementById("tenzProvayder").value = t.ai_provayder || "gemini";
    document.getElementById("tenzGeminiKey").value = t.gemini_api_key || "";
    document.getElementById("tenzGeminiModel").value = t.gemini_model || "gemini-3-flash-preview";
    document.getElementById("tenzGroqKey").value = t.groq_api_key || "";
    document.getElementById("tenzGroqModel").value = t.groq_model || "llama-3.3-70b-versatile";
    document.getElementById("tenzOllamaUrl").value = t.ollama_url || "http://127.0.0.1:11434";
    document.getElementById("tenzOllamaModel").value = t.ollama_model || "llama3.2";
    document.getElementById("tenzSistemTelimati").value = t.sistem_telimati || "";
    const tgEl = document.getElementById("tenzTgToken");
    if (tgEl) tgEl.value = t.tg_bot_token || "";
    provayderSaheleriniYenile();
    document.getElementById("modalTenzimlemeler").hidden = false;
  });

  document.getElementById("formTenzimlemeler").addEventListener("submit", async e => {
    e.preventDefault();
    const gKey = document.getElementById("tenzGeminiKey").value.trim();
    const prov = document.getElementById("tenzProvayder").value;
    await apiSorgu("/api/tenzimlemeler", "POST", {
      ai_provayder: prov,
      gemini_api_key: gKey,
      gemini_model: document.getElementById("tenzGeminiModel").value.trim() || "gemini-3-flash-preview",
      groq_api_key: document.getElementById("tenzGroqKey").value.trim(),
      groq_model: document.getElementById("tenzGroqModel").value.trim() || "llama-3.3-70b-versatile",
      ollama_url: document.getElementById("tenzOllamaUrl").value.trim() || "http://127.0.0.1:11434",
      ollama_model: document.getElementById("tenzOllamaModel").value.trim() || "llama3.2",
      sistem_telimati: document.getElementById("tenzSistemTelimati").value.trim(),
      tg_bot_token: document.getElementById("tenzTgToken")?.value?.trim() || ""
    });
    document.getElementById("modalTenzimlemeler").hidden = true;
    if (prov === "gemini" && gKey && !gKey.startsWith("AIza") && !gKey.startsWith("AQ.")) {
      bildirisGoster("⚠️ Diqqət: Gemini API açarı 'AQ.' və ya 'AIzaSy...' ilə başlamalıdır. Açarı yoxlayın.", 5500);
    } else {
      bildirisGoster("💾 AI tənzimləmələri yadda saxlanıldı!");
    }
    melumatlariYenile();
  });

  // Baza Backup Bərpa (Restore) Düyməsi Dinləyicisi
  const inpBackup = document.getElementById("faylBackupBerpa");
  if (inpBackup) {
    inpBackup.addEventListener("change", async e => {
      const fayl = e.target.files?.[0];
      if (!fayl) return;
      const statusEtiket = document.getElementById("etiketBackupStatus");
      if (statusEtiket) statusEtiket.textContent = "⏳ Baza bərpa olunur, zəhmət olmasa gözləyin...";
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64Data = String(reader.result).split(",")[1];
            const res = await apiSorgu("/api/backup/berpa", "POST", { base64Data });
            if (res && res.ok !== false) {
              bildirisGoster(`✅ ${res.mesaj || "Baza uğurla bərpa edildi!"}`, 6000);
              if (statusEtiket) statusEtiket.textContent = `✅ Bərpa edildi! (${res.menbeSayi || 0} mənbə, ${res.parcaSayi || 0} maddə)`;
              melumatlariYenile();
            } else {
              bildirisGoster(`❌ Xəta: ${res?.xeta || "Bərpa edilə bilmədi"}`, 5000);
              if (statusEtiket) statusEtiket.textContent = `❌ Xəta: ${res?.xeta || "Bərpa edilə bilmədi"}`;
            }
          } catch (sorXeta) {
            bildirisGoster(`❌ Bərpa sorğusunda xəta: ${sorXeta.message}`, 5000);
            if (statusEtiket) statusEtiket.textContent = "❌ Xəta baş verdi.";
          }
          inpBackup.value = "";
        };
        reader.readAsDataURL(fayl);
      } catch (err) {
        bildirisGoster(`❌ Fayl oxunarkən xəta: ${err.message}`, 5000);
      }
    });
  }

  // Sol paneli aç/bağla (ChatGPT / Claude tərzi)
  const btnSolToggle = document.getElementById("btnSolPanelToggle");
  const solPanel = document.querySelector(".sol-panel");
  if (btnSolToggle && solPanel) {
    btnSolToggle.addEventListener("click", () => {
      solPanel.classList.toggle("bagli");
      localStorage.setItem("beyin_sol_bagli", solPanel.classList.contains("bagli") ? "1" : "0");
    });
    if (localStorage.getItem("beyin_sol_bagli") === "1" || (localStorage.getItem("beyin_sol_bagli") === null && window.innerWidth <= 900)) {
      solPanel.classList.add("bagli");
    }
  }

  // Qlobal klik: Açıq 3-nöqtə menyularını bağla
  document.addEventListener("click", () => {
    document.querySelectorAll(".menu-acilan-siyahi.aktiv").forEach(m => m.classList.remove("aktiv"));
  });

  document.getElementById("btnBaglantilar").addEventListener("click", () => {
    const nlm = veziyyet.baglantilar?.notebooklm;
    const nlmSt = document.getElementById("nlmKorpuStatusEtiket");
    if (nlmSt) {
      if (nlm && nlm.aktiv) {
        nlmSt.textContent = `🟢 Canlı Qoşulu (${nlm.notebookAdi || "NotebookLM"})`;
        nlmSt.classList.add("aktiv");
      } else {
        nlmSt.textContent = "Genişlənmə Gözlənilir";
        nlmSt.classList.remove("aktiv");
      }
    }

    document.getElementById("bagTgToken").value = veziyyet.tenzimlemeler.tg_bot_token || "";
    const tg = veziyyet.baglantilar?.telegram;
    const st = document.getElementById("tgStatusEtiket");
    const mel = document.getElementById("tgMelumatQutusu");
    if (tg && tg.aktiv) {
      st.textContent = `Aktiv (@${tg.botIstifadeciAdi})`;
      st.classList.add("aktiv");
      mel.hidden = false;
      mel.textContent = `✅ @${tg.botIstifadeciAdi} canlı dinlənilir. Qəbul edilən mesaj/fayl sayı: ${tg.qebulEdilenSay || 0}`;
    } else {
      st.textContent = "Qoşulmayıb";
      st.classList.remove("aktiv");
      mel.hidden = true;
    }
    document.getElementById("modalBaglantilar").hidden = false;
  });

  document.getElementById("btnTgQos").addEventListener("click", async () => {
    const token = document.getElementById("bagTgToken").value.trim();
    if (!token) {
      bildirisGoster("⚠️ Telegram Bot Token daxil edin");
      return;
    }
    bildirisGoster("⏳ Telegram Bot yoxlanılır...");
    const net = await apiSorgu("/api/connectors/telegram/test", "POST", { tg_bot_token: token });
    const mel = document.getElementById("tgMelumatQutusu");
    const st = document.getElementById("tgStatusEtiket");
    if (net.ok) {
      st.textContent = `Aktiv (@${net.veziyyet.botIstifadeciAdi})`;
      st.classList.add("aktiv");
      mel.hidden = false;
      mel.textContent = `✅ Qoşuldu: @${net.veziyyet.botIstifadeciAdi}. İndi Telegram-da bu bota istənilən mesajı, səsli qeydi və ya sənədi Forward edə bilərsiniz!`;
      bildirisGoster("✅ Telegram Bot uğurla qoşuldu!");
      melumatlariYenile();
    } else {
      st.textContent = "Xəta";
      st.classList.remove("aktiv");
      mel.hidden = false;
      mel.textContent = `⚠️ Xəta: ${net.xeta}`;
    }
  });

  document.getElementById("btnBookmarkletKopyala").addEventListener("click", () => {
    const kod = bookmarkletHazirla();
    navigator.clipboard.writeText(kod);
    bildirisGoster("📋 Canlı sinxronizasiya kodu kopyalandı!");
  });

  // Kitabxana və Bilik Sahələri Modalı (Həm üst paneldən, həm də sol menyudan)
  const kitabxanaAcFn = () => {
    kitabxanaCiz();
    document.getElementById("modalKitabxana").hidden = false;
  };
  document.getElementById("btnKitabxanaSecici")?.addEventListener("click", kitabxanaAcFn);
  document.getElementById("btnSolKitabxanaAc")?.addEventListener("click", kitabxanaAcFn);

  // Özünü-İnkişaf Mərkəzi daxili tabları
  document.querySelectorAll("[data-sim-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      simTabSec(btn.getAttribute("data-sim-tab"));
    });
  });

  const formYeniSahe = document.getElementById("formYeniSahe");
  if (formYeniSahe) {
    formYeniSahe.addEventListener("submit", async e => {
      e.preventDefault();
      const ad = document.getElementById("yeniSaheAd").value.trim();
      const aciqlama = document.getElementById("yeniSaheAciqlama").value.trim();
      const ikon = document.getElementById("yeniSaheIkon").value.trim() || "📚";
      if (!ad) return;
      try {
        const net = await apiSorgu("/api/saheler", "POST", { ad, aciqlama, ikon });
        veziyyet.saheler = net.saheler;
        document.getElementById("yeniSaheAd").value = "";
        document.getElementById("yeniSaheAciqlama").value = "";
        const rolMesaj = net.profil ? ` (Tənqidçi: ${net.profil.teref_a_rol})` : "";
        bildirisGoster(`✅ Yeni sahə və müstəqil düşünmə qaydaları quruldu: ${ad}${rolMesaj}`);
        kitabxanaCiz();
      } catch (err) {
        bildirisGoster("⚠️ " + err.message);
      }
    });
  }

  // Sınaq və Praktiki Təcrübə Simulyatoru Modalı
  const btnSimulyatorAc = document.getElementById("btnSimulyatorAc");
  if (btnSimulyatorAc) {
    btnSimulyatorAc.addEventListener("click", () => {
      simulyatorModalAc();
    });
  }

  const btnSimulyatorBagla = document.getElementById("btnSimulyatorBagla");
  if (btnSimulyatorBagla) {
    btnSimulyatorBagla.addEventListener("click", () => {
      document.getElementById("modalSimulyator").hidden = true;
    });
  }

  const btnSimIcraEt = document.getElementById("btnSimIcraEt");
  if (btnSimIcraEt) {
    btnSimIcraEt.addEventListener("click", () => {
      simulyasiyaIcraEt();
    });
  }

  const btnSimAvtoTedqiq = document.getElementById("btnSimAvtoTedqiq");
  if (btnSimAvtoTedqiq) {
    btnSimAvtoTedqiq.addEventListener("click", () => {
      simulyatorAvtoTedqiqEt();
    });
  }

  const btnSimZeifMesq = document.getElementById("btnSimZeifMesq");
  if (btnSimZeifMesq) {
    btnSimZeifMesq.addEventListener("click", () => {
      dinamikSimulyasiyaIcraEt("zeif_movzu");
    });
  }

  const btnSimCarpazMadde = document.getElementById("btnSimCarpazMadde");
  if (btnSimCarpazMadde) {
    btnSimCarpazMadde.addEventListener("click", () => {
      dinamikSimulyasiyaIcraEt("carpaz_madde");
    });
  }

  const btnSimCanliCat = document.getElementById("btnSimCanliCat");
  if (btnSimCanliCat) {
    btnSimCanliCat.addEventListener("click", () => {
      dinamikSimulyasiyaIcraEt("canli_cat");
    });
  }

  // Haqq-Hesab Modalı Dinləyiciləri
  const btnHaqqHesabAc = document.getElementById("btnHaqqHesabAc");
  if (btnHaqqHesabAc) {
    btnHaqqHesabAc.addEventListener("click", () => {
      modalHaqqHesabAc();
    });
  }

  const btnHaqqHesabBagla = document.getElementById("btnHaqqHesabBagla");
  if (btnHaqqHesabBagla) {
    btnHaqqHesabBagla.addEventListener("click", () => {
      document.getElementById("modalHaqqHesab").hidden = true;
    });
  }

  const formHaqqHesab = document.getElementById("formHaqqHesab");
  if (formHaqqHesab) {
    formHaqqHesab.addEventListener("submit", haqqHesabHesabla);
  }

  const btnHhCapEt = document.getElementById("btnHhCapEt");
  if (btnHhCapEt) {
    btnHhCapEt.addEventListener("click", () => {
      if (!veziyyet.cariHaqqHesabHtml) return;
      const w = window.open("", "_blank");
      w.document.write(veziyyet.cariHaqqHesabHtml);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 300);
    });
  }

  const btnHhKopyala = document.getElementById("btnHhKopyala");
  if (btnHhKopyala) {
    btnHhKopyala.addEventListener("click", () => {
      const icerik = document.getElementById("hhHesabatIcerik");
      if (icerik) {
        navigator.clipboard.writeText(icerik.innerText);
        bildirisGoster("📋 Hesabat mətni kopyalandı!");
      }
    });
  }

  // Bildirişlər Modalı Dinləyiciləri
  const btnBildirislerToggle = document.getElementById("btnBildirislerToggle");
  if (btnBildirislerToggle) {
    btnBildirislerToggle.addEventListener("click", () => {
      modalBildirislerAc();
    });
  }

  const btnBildirislerBagla = document.getElementById("btnBildirislerBagla");
  if (btnBildirislerBagla) {
    btnBildirislerBagla.addEventListener("click", () => {
      document.getElementById("modalBildirisler").hidden = true;
    });
  }

  const btnBildirisleriTemizle = document.getElementById("btnBildirisleriTemizle");
  if (btnBildirisleriTemizle) {
    btnBildirisleriTemizle.addEventListener("click", () => {
      bildirisleriTemizle();
    });
  }
});
