# 🧠 BeyinAI — Layihənin Cari Vəziyyəti və Yeni Söhbət üçün Keçid Təlimatı (Handoff)
**Yenilənmə tarixi:** 25 Noyabr 2026  
**Məqsəd:** Yeni söhbət açıldıqda agentin layihəni, arxitekturanı, son düzəlişləri və növbəti addımları 100% dəqiqliklə xatırlaması üçün bələdçi.

---

## 📌 1. Layihənin Ümumi Məlumatları
- **Lokal layihə qovluğu:** `C:\Users\SM\.gemini\antigravity\scratch\sexsi-ai-asistant`
- **GitHub repozitoriyası:** `https://github.com/fuad1860015-lab/beyinai` (budaq: `main`)
- **Canlı server (Render):** `https://beyinai.onrender.com/`
- **Telegram Bot:** `@Brainai1_bot`
- **Arxiv paketləri:** `C:\Users\SM\.gemini\antigravity\scratch\beyinai_tam_layihe.zip` və `beyinai_deploy.zip`
- **Testlər:** `node --no-warnings test/health.test.js` (**25/25 test 100% uğurlu**)

---

## 🏗️ 2. Texnoloji Arxitektura
- **Backend:** Node.js (xarici asılılıqsız, nativ HTTP `server.js`)
- **Verilənlər Bazası:** SQLite (`node:sqlite` nativ modulu, fayl: `data/beyin.sqlite`, `src/db.js`)
- **AI Provayderləri:** `src/ai.js` (Google Gemini 3 Flash / 2.5 Flash, Groq Llama 3.3, Pollinations ehtiyat)
- **Agent Mühərriki:** `src/agent.js` (ReAct multi-query axtarış, Çox-Baxışlı Konsilium Debatı, Düşünmə Alqoritmi, 4-mərhələli tənqidi audit)
- **Özünü-İnkişaf və Təkamül Mühərriki (v2.0):** `src/evolution.js` (Kök-səbəb təhlili, qanun dəyişikliyi zamanı 3 illik dövr arxivi, Boz Zona dosyeləri)
- **İyerarxik Boşluq Tədqiqatçısı:** `src/web-researcher.js` (1-ci qat rəsmi dövlət saytları, 2-ci qat "Fərziyyə" damğalı ekspert şərhləri)
- **Kitabxana və Sahə Sərhəd Qoruyucusu:** `src/domain-guard.js` (Açar söz və semantik profil üzrə sahə uyğunluğu təyini və təcridi)
- **Sınaq və Təcrübə Simulyatoru:** `src/simulator.js` (Standart keyslər + Çarpaz maddə sintezatoru + Canlı çat mübahisə təhlili)
- **Planlayıcı & Vergi Təqvimi:** `src/scheduler.js` (3-pilləli prioritet öyrənmə növbəsi: 1. Boşluqlar -> 2. Canlı Çat -> 3. Çarpaz Sınaq, Vergi Təqvimi)
- **Əməkhaqqı & Son Haqq-Hesab Generatoru:** `src/payroll.js` (ƏM Maddə 140, 144, 172 və VM 101.1-1 üzrə rəsmi çıxarış və çap/PDF şablonu)
- **Frontend:** Nativ JS/CSS (`public/index.html`, `public/app.js`, `public/style.css`), Kitabxana, Özünü-İnkişaf v2.0 (Qaralama, Boz Zona, Düşünmə Qaydaları), Haqq-Hesab və Bildiriş modalları

---

## ✅ 3. Son Sessiyada Görülən və Təsdiqlənmiş Bütün Düzəlişlər

### 0. Özünü-İnkişaf və Təkamül Mühərriki v2.0 (Test 21–24)
- **İki-Pilləli Yaddaş ("Qaralama Dəftəri → Qızıl Yaddaş"):** AI-nin öz çıxardığı dərslər və açıq ekspert şərhləri əvvəlcə `status = 'qaralama'` kimi Qaralama Dəftərinə düşür; yalnız rəsmi maddə ilə 100% hərfi təsdiq tapıldıqda və ya istifadəçi Veb/Telegram üzərindən **👍 Təsdiqlə** dedikdə Qızıl Yaddaşa keçir.
- **"Mən Niyə Səhv Etdim?" Kök-Səbəb Təhlili (`dusunme_qaydalari`):** İstifadəçi düzəliş etdikdə və ya simulyasiyada səhv tutulduqda sistem səhvin metodoloji kökünü çıxarır və `agent.js` sistem promptuna məcburi yoxlama addımı kimi əlavə edir.
- **Qanun Dəyişikliyi Zamanı Dövr üzrə Arxivləmə (`qanun_tesir_hesabatlari`):** Yeni qanun/dəyişiklik yükləndikdə dəyişən maddələrə bağlı köhnə qaydalar silinmir — keçmiş 3 illik vergi yoxlamaları üçün `status = 'arxiv_dovr'` və `"2026-cı ilədək qüvvədə olub"` qeydi ilə saxlanılır və Təsir Hesabatı çıxarılır.
- **İyerarxik Araşdırma & Boz Zona Dosyeləri (`mubahiseli_dosyeler`):** Əvvəl rəsmi dövlət saytları (*e-qanun.az, taxes.gov.az, cabmin.gov.az*), tapılmadıqda isə `"RƏSMİ QANUN DEYİL — EKSPERT ŞƏRHİ"` damğası ilə 2-ci qat araşdırılır və mübahisəli hallarda Boz Zona Dosyesi açılaraq **Ekspertin İş Siyasəti** (`is_siyaseti`) öyrənilir.
- **Dinamik Çarpaz Sınaq & 3-Pilləli Öyrənmə Növbəsi:** Planlaşdırıcı `1. Bilik boşluqları -> 2. Canlı mühasib çatları -> 3. Çarpaz maddə kəsişmələri` prioritet sırası ilə işləyir.

### 1. Planlaşdırıcı (Scheduler), Vergi Təqvimi və Proaktiv Bildirişlər
- `src/scheduler.js` modulu quruldu:
  - Tədqiqat tezliyi istifadəçi tərəfindən tənzimlənir: gündə 1 dəfə, 2 dəfə, 3 dəfə, həftədə/ayda 1 dəfə və ya söndürülüb (yalnız əl ilə).
  - "İndi Tədqiq Et" düyməsi ilə istənilən an dərhal tədqiqat dövrəsi başladılır (`POST /api/scheduler/icra`).
  - Azərbaycan Vergi Təqvimi avtomatik izlənilir (hər ayın 20-si ƏDV/ÖMV/Aksiz, rüblük DSMF/İTS, 31 Mart illik mənfəət/gəlir/əmlak hesabatı). Yaxınlaşan son tarixlər həm Veb paneldə, həm də qoşulmuş Telegram botuna proaktiv göndərilir.

### 2. Maaş, Məzuniyyət və Son Haqq-Hesab Generatoru
- `src/payroll.js` mühərriki və UI forması quruldu:
  - İşçinin stajı, 15 gündən çox olan qalıq ayların tam aya yuvarlaqlaşdırılması (ƏM Maddə 144), cari ayın işlənmiş günləri və istifadə edilməmiş məzuniyyət günləri hesablanır.
  - Gross/Net maaş, kompensasiya, gəlir vergisi (0%/14%), DSMF (3%/10%), İTS (2%), İşsizlik (0.5%) və işəgötürən xərcləri dəqiq çıxarılır.
  - Nəticə həm ekranda səliqəli cədvəllə görünür, həm də 1-kliklə rəsmi sənəd kimi Çap/PDF (`🖨️ Çap Et / PDF`) edilə bilir.

### 3. Çox-Baxışlı Konsilium Debatı (Multi-Agent Debate)
- `src/agent.js` daxilində Konsilium Debatı aktivləşdirildi:
  - 👮‍♂️ *Mühafizəkar Vergi Müfəttişi Yanaşması* (kameral risklər, cərimə sanksiyaları).
  - 💼 *Təcrübəli Baş Mühasib Yanaşması* (qanuni optimizasiya, müdafiə arqumentləri, məhkəmə və portal təcrübəsi).
  - 🎯 *Balanslaşdırılmış Qızıl Qərar* (riski sıfırlayan və biznes üçün ən əlverişli çıxış yolu).

### 4. Kitabxana və Bilik Sahələri Sistemi (Domain Partitioning & Shielding)
- Verilənlər bazasında `saheler` və `sahe_movzulari` cədvəlləri quruldu; `qovluqlar`, `menbeler`, `parcalar`, `yaddas`, `sohbetler` və `bilik_bosluqlari` cədvəllərinə `sahe_id` xarici açarları və indeksləri bağlandı.
- Hibrid BM25/Vektor axtarışı və uzunmüddətli yaddaş axtarışında ciddi sahə süzgəci (`icazeVerilenSaheIdleriAl`) tətbiq edildi. Proqramlaşdırma və ya coğrafiya kimi kənar biliklər vergi/mühasibatlıq sahəsinin yaddaşına qətiyyən sızmır (Test 15 təsdiqləyib).
- `src/domain-guard.js` vasitəsilə 75% və yuxarı əlaqəli sahələr (Mülki Məcəllə, Əmək Məcəlləsi, Hökumət qərarları) avtomatik əlaqələndirilir, 40%-dən aşağı kənar sahələr isə təcrid olunur.
- Yeni sənəd və ya mətn daxil edildikdə hüquqi maddələr və mövzular avtomatik parse edilərək `sahe_movzulari` cədvəlində "öyrənilib" statusu ilə qeydiyyata alınır.

### 2. Sınaq və Praktiki Təcrübə Simulyatoru (Level C Depth & Error-Learning)
- `src/simulator.js` modulu yaradıldı:
  - Vergi, əmək və hökumət qərarları üzrə 7 mürəkkəb praktiki keys ssenarisi (qeyri-rezident bulud xidməti ƏDV/ÖMV, mikro sahibkarlıq 0 işçi ilə 75% güzəşt, köhnə ay qaiməsinin ləğvi, əsas vəsaitlərin 5% təmir norması və kapitallaşdırma, nağdsız hədlər və s.).
  - Agentin həlli deterministik və hüquqi qaydalarla (`helliQiymetlendir`) qiymətləndirilir: məcəllə istinadları, kritik tələlər (məsələn, 0 işçi əvəzinə səhvən 3 işçi tələb etmək və ya köhnə aya dəqiqləşmə vermək) aşkarlandıqda xüsusi cərimə balı kəsilir və dərhal praktiki düzəliş dərsi formalaşdırılır.
  - Çıxarılan praktiki dərslər avtomatik olaraq uzunmüddətli yaddaşa (`yaddas`, `kateqoriya: 'praktika'`, `etibar_seviyyesi: 'praktika'`) yazılır.
  - Açıq bilik boşluqları (`bilik_bosluqlari`) `bilikBosluqlariniAvtoTedqiqEt` funksiyası ilə avtomatik sahənin tədqiqat təkliflərinə (`status: 'teklif'`) çevrilir.

### 3. Server API və İnterfeys (UI) Yenilikləri
- `server.js` daxilində `/api/simulyator/ssenariler`, `/api/simulyator/tarixce`, `/api/simulyator/icra` və `/api/simulyator/avto-tedqiqat` marşrutları əlavə edildi.
- İnterfeysin yuxarı sağ panelinə bənövşəyi `🧪 Sınaq Mərkəzi` düyməsi yerləşdirildi.
- İstifadəçi üçün interaktiv Sınaq Mərkəzi modalı (`#modalSimulyator`) quruldu:
  - Sınaq statistikası (ümumi sınaq sayı, orta müvəffəqiyyət %, yaddaşa yazılmış dərslər).
  - Standart ssenarilər bankından seçim etmə və 1-kliklə canlı sınaq aparma.
  - Canlı sınaq kartı (Agent həlli, Auditor rəyi, Yaddaşa əlavə edilmiş dərslər).
  - Keçmiş sınaqlar və təcrübə dərsləri tarixçəsi.

### 4. Minimalist İnterfeys və Mobil Uyğunlaşma (UI/UX)
- Sol panel gizlədilə/açıla bilən menyuya (`☰`) çevrildi, mobil cihazlar üçün tam responsiv `@media` qatları əlavə edildi (`<900px` ekranda avtomatik bağlanır).
- Giriş xanasının üstündəki qarışıq funksiya düymələri yığışdırıldı, əvəzinə birbaşa xana daxilinə sənəd əlavə etmə (`📎`) düyməsi yerləşdirildi.
- Mesaj əməliyyatları hover ilə görünən sadə ikonlara (`📋`, `👍`, `🎯`, `•••`) yığıldı.
- Brauzer nitq səsləndirməsi Azərbaycan dili (`az-AZ`) prioriteti ilə sazlandı.
- AI status göstəricisi real API açarı yoxlanışı ilə sinxronlaşdırıldı (yaşıl `Gemini 3 • Dərin Zəka ✓` nöqtəsi).

### 2. Google AI Studio `AQ.` Açar Formatı
- Google AI Studio-nun 53-simvollu `AQ.` ilə başlayan avtorizasiya açarları üçün `X-goog-api-key: <key>` header dəstəyi əlavə edildi (`src/ai.js` və `src/gemini-files.js`).

### 3. PDF Mühərriki və Skan OCR
- `pdfDoc.destroy()` xətası aradan qaldırıldı (`src/pdf-engine.js`).
- Hibrid səhifə-səhifə OCR quruldu: hər səhifədəki mətn həcmi ayrıca yoxlanılır, mətnsiz və ya skan edilmiş səhifələr (simvol sayı < 35) avtomatik Gemini Vision OCR-a göndərilir (`src/parsers.js`).

### 4. CSV Cədvəl Emalı
- RFC-4180 standartına uyğun `csvOxu` və `csvSetriParcala` funksiyaları yaradıldı. Vergül, nöqtəli-vergül və tab ayırıcıları avtomatik tanınır, cədvəl sətirləri strukturlaşdırılmış şəkildə bazaya yazılır.

### 5. Baza Təhlükəsizliyi, Versiyalaşdırma və Bərpa
- SQLite tranzaksiyaları (`tranzaksiyaIleIcraEt` — `BEGIN IMMEDIATE`) tətbiq edildi.
- `menbe_versiyalari` cədvəli yaradıldı (eyni adlı fayl yeniləndikdə və ya link sinxronlaşdıqda köhnə məzmun arxivlənir, `GET /api/menbeler/:id/versiyalar`).
- `audit_jurnali` cədvəli quruldu (`GET /api/audit`).
- `etibar_seviyyesi` sütunu (`orijinal_menbe`, `ekspert_tesdiqli`, `ai_sintezi`) əlavə edildi — AI sintezi heç vaxt rəsmi normanı əvəz etmir.
- 1-klik SQLite baza bərpası əlavə edildi (`POST /api/backup/berpa` və Telegram botuna `.sqlite` faylı göndərməklə).
- ZIP bomb müdafiəsi əlavə edildi (fayl sayı, maks 50MB açılmış həcm, 100x sıxılma həddi və path traversal yoxlaması).

### 6. Təhlükəsizlik və Hüquqi Dəqiqlik Qalxanı
- İstifadəçi sənədləri `<ETIBARSIZ_MENBE_METNI>` teqləri arasına alınaraq prompt injection hücumlarından qorundu (`src/agent.js`).
- Hüquqi Tənqidçi Müfəttiş 4-bəndli yoxlama ilə gücləndirildi (yanlış şərh, tətbiq şərti/istisna, redaksiya uyğunsuzluğu, qanun vs təcrübə fərqi).
- Sənədlərdən `redaksiya_tarixi` çıxarılıb sitatlara əlavə edildi.
- "Kassa çeki" sorğuları üçün maddə 108/109 ilə maddə 130-133 (kassa uçot metodu) arasındakı qarışıqlıq aradan qaldırıldı.

---

## 🚀 4. Növbəti Addımlar və Açıq Məsələlər
1. **Render Environment Variables:** Render panelində `GEMINI_API_KEY` (`AQ.Ab8RN...EvQ0bA`), `GROQ_API_KEY` və `TELEGRAM_BOT_TOKEN` dəyişənlərinin Environment bölməsinə daxil edilməsi (beləliklə sistem yenidən deploy olanda açarlar sıfırlanmır).
2. **Qanunvericilik Fayllarının Qalıcı Olması:** Əsas normativ sənədlərin (Vergi Məcəlləsi, Əmək Məcəlləsi, Mülki Məcəllə) Render yenidən başladıqda itməməsi üçün repozitoriyada `data/` daxilinə toxumlanması (seed).
3. **Audit Maddələrinin Davamı:** İstifadəçinin istəyinə uyğun digər hüquqi və maliyyə qaydalarının tənzimlənməsi.
