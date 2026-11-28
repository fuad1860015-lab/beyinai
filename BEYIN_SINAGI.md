# Beyin sınağı — nəticə (28 noyabr 2026)

## Nə quruldu
Mövzu: gəlirdən çıxılan və çıxılmayan xərclər (Maddə 108, 109 və bağlı bəndlər).

| Addım | Kim edir | Nəticə |
|---|---|---|
| Bəndləri ayırmaq, istinadları tapmaq | proqram (pulsuz) | 25 kart üçün bəndlər |
| Hər bəndə sadə izah | AI, proqram yoxlayır | 23 kartda izah, 2-də yalnız qanun mətni |
| Dosye: qaydalar, əlaqələr, öz sualları | AI, proqram yoxlayır | 17 qayda, 11 sual, 3 açıq sual |

Dosyeni oxumaq üçün: [BEYIN_DOSYESI.md](BEYIN_DOSYESI.md)

Dosyeni yüngül model (gemini-3.1-flash-lite) yazıb. Güclü modellər pulsuz limitdə cavab vermirdi.

## Müqayisə: 10 sual, hər biri beyinsiz və beyinli

Açar söz hesabı (proqram): beyinsiz 21/26, beyinli 24/26.
**Bu rəqəm aldadıcıdır.** Cavabları oxuyanda aydın üstünlük görünmədi:

| Sual | Oxuyandan sonra | Səbəb |
|---|---|---|
| Kassa çeki, mal və xidmət | bərabər | ikisində də bir əsassız iddia, "hər bir hal üzrə" yoxdur |
| Ad günü xərci | **beyinli pis** | "heç bir istisna yoxdur" dedi; 109.4 istisnadır. Beyin aid bəndi tapmamışdı |
| Mehmanxana sənədi | bərabər, düz | |
| Noutbuk, kassa çeki | bərabər | beyinli 109.1-i dedi, beyinsiz amortizasiya normasını; beyinliyə daxili mətn sızdı |
| İki ayrı 2 faiz limiti | bərabər, düz | |
| Əmək haqqı kartı | beyinli bir az yaxşı | maddə nömrəsini göstərdi |
| Xərc bölgüsü | **beyinli pis** | cavab daxili özünüyoxlamadan danışdı |
| Sanksiya tətbiq olunan mal | bərabər | |
| Əmtəəsiz əməliyyat | sayılmır | beyin sualı mövzuya aid saymamışdı |
| Əsaslı təmir | **beyinli pis** | 114.11.3-ün yalnız üfüqi monitorinqə aid olduğunu demədi |

Əsaslı təmir sualında hər iki tərəf 115.1-dəki təmir həddini buraxdı (115-ci maddə beynə daxil deyil).

## Sınaqdan sonra düzəldilənlər
1. Beyin bəndi seçəndə öz suallarını da istifadə edir ("şənlik" → 109.3, 109.4; "əmtəəsiz" → 109.9).
2. "daha_oxu" kimi daxili ad cavaba sızmır.
3. Özünüyoxlama haqqında danışan variant atılır, ilk cavab qalır.

Üç sual beyinli rejimdə yenidən soruldu: xərc bölgüsü və əmtəəsiz əməliyyat yaxşı cavablandı;
ad günü sualında aid bəndlər modelə verildi, amma model 109.4 istisnasını yenə yazmadı.
Bu, düzəlişdən sonrakı yoxlamadır, ayrıca müstəqil sınaq deyil.

## Nəticə
- Mexanizm işləyir: oxuyur, bağlayır, dosye yığır, cavaba verir, qanun dəyişəndə köhnə dosyeni işlətmir.
- Cavabın keyfiyyətini yaxşılaşdırdığı **sübut olunmadı**.
- Ehtimal olunan əsas səbəb: yekun cavabı və dosyeni yüngül model yazır; hazır verilən istisnanı da buraxa bilir.
  İkinci səbəb: 108–109 kiçik mövzudur, adi axtarış da bu bəndləri çox vaxt tapır.
- 10 sual və hərəyə bir cəhd azdır; kiçik fərqlər modelin təsadüfi dəyişkənliyi ola bilər.
- Mövzunu genişləndirməzdən əvvəl eyni sınağı güclü modellə təkrarlamaq lazımdır.

## İstifadə
- Proqramda və ya Telegramda: `beyin qur`, `beyin göstər`
- Terminalda: `npm run beyin`
- Söndürmək: tənzimləmələrdə `beyin_rejim = 0`

Əsas bazada beyin **qurulmayıb**, ona görə siz `beyin qur` yazmayınca cavablar dəyişmir.
Sınaq `scratch\beyin_sinaq` qovluğunda, yalnız qanun mətni olan baza surətində aparılıb.
Render-ə heç nə yüklənməyib. Əvvəlki kod: `scratch\yedek_beyinden_evvel`.
