# Dəyişikliklər — 27 noyabr 2026
**Mövzu:** özünü-öyrənmə, cavab dəqiqliyi, araşdırma, inkişaf. Təhlükəsizlik hissəsinə hələ toxunulmayıb.

**Geri qaytarmaq üçün:** `..\yedek_duzelisden_evvel\` qovluğundakı `src`, `public`, `test`, `server.js`, `package.json` fayllarını geri köçürün.

## 1. Özünü-öyrənmə
| Əvvəl | İndi |
|---|---|
| Sual "Qızıl Qayda" ola bilirdi | Sual heç vaxt öyrənilmir. Qalıcı qayda yalnız `Yadda saxla ki ...`, `Düzəliş: ...` və ya təsdiq düyməsi ilə yaranır. Sadəcə "bu səhvdir..." yazsanız, qaralamaya düşür |
| AI-nin cümləsi söz oxşarlığı ilə "rəsmi təsdiq" alırdı | AI-nin çıxardığı hər şey qaralamadır |
| Oxşar qayda köhnənin üstünə yazılırdı | Yalnız hərfi eyni qeyd təkrar sayılır |
| Silinən qeyd itirdi | Zibil qutusu: ekranda "🗑️ Zibil qutusu", Telegram-da `/zibil`, `/berpa ID` |
| Təmizləmədə AI özü silirdi | AI yalnız təklif verir |
| Şəxsi qeyd "qanun dəyişikliyi" sayılırdı | Yalnız qanun adlı sənəd |
| Eyni adlı qeyd köhnəni əvəz edirdi | Yeni qeyd "(2)" adı ilə əlavə olunur |
| Ehtiyat nüsxədən bərpada qaralamalar təsdiqlənmiş olurdu | Bütün sütun və cədvəllər olduğu kimi qayıdır |

## 2. Cavab dəqiqliyi
- Rəsmi məcəllə mətni xülasələrdən yuxarı sıralanır; xülasələr AI-yə "köhnəlmiş ola bilər" damğası ilə verilir.
- Maddənin adı sualla uyğun gəlirsə, axtarışda üstünlük alır.
- AI-yə bugünkü tarix və dəqiqlik qaydaları verilir (mənbədə yoxdursa "tapmadım" desin).
- Cavabdakı maddə nömrəsi, faiz və məbləğ mənbə mətnləri ilə tutuşdurulur; tapılmayan görünən xəbərdarlıqla göstərilir.
- Yaşıl nişan yalnız rəsmi mətnə istinad olan və yoxlamadan keçən cavaba verilir.
- Hansı modelin cavab verdiyi görünür (zəif ehtiyat model daxil).
- Söndürülmüş modellər çıxarıldı (`gemini-3.1-flash-lite-preview` — axtarış planlayıcısı bu səbəbdən işləmirdi; `text-embedding-004`).
- Koda yazılmış hazır hüquqi "hökmlər" silindi.
- "Salam, ... neçədir?" tipli suallar artıq cavablanır.

## 3. Kalkulyator
- Dərəcələr il üzrə (2025, 2026, 2027, 2028+), `src/calculator.js` başındakı cədvəldə.
- "1 500", "1,500", il, dövlət sektoru düzgün oxunur; iki məbləğ olarsa soruşur; hüquqi suallar AI-yə gedir.
- Dövlət sektorunda net maaşla haqq-hesab xətası düzəldildi.

## 4. Araşdırma
- Yeni yol: Gemini + Google Axtarışı (mənbə linkləri ilə). DuckDuckGo yolu sınaqda bot yoxlamasına düşdü.
- Nəticə yalnız qaralamadır; bilik boşluğu siz təsdiqləyəndə bağlanır; 7 gün ərzində təkrar araşdırılmır.
- Rəsmi sayt yalnız host adına görə tanınır.

## 5. İnkişafın ölçülməsi
- Sınaqları AI hakim rəsmi mətnə görə qiymətləndirir; hakim yoxdursa "yoxlanılmayıb" yazılır və statistikaya düşmür (köhnə 35 sınaq da belə sayılır).
- İki səhv sınaq açarı düzəldildi.
- İmtahan dəsti: `npm run imtahan` (pulsuz, axtarış) və `npm run imtahan:canli` (Gemini açarı ilə, cavab). Suallar: `test/imtahan-suallari.json`.
- `npm test` artıq real bazaya toxunmur.

## 6. Canlı imtahandan sonrakı düzəlişlər
- **Müfəttiş yoxlayıcı:** bütün mənbələri görür. Düzəlişi yalnız mənbədən hərfi sitat gətirəndə və yeni rəqəmlər sitatda olanda cavaba əlavə olunur; sitat cavabın yanında göstərilir.
- **Nişan və xəbərdarlıq:** əsas cavab və "Geniş Təhlil" ayrı yoxlanır. Nişan əsas cavaba görə verilir, detallı hissənin xəbərdarlığı həmin hissənin içindədir.
- AI-yə tapşırılıb: mənbədə olmayan maddə, faiz, məbləğ yazmasın; sanksiya norması yoxdursa o bölməni buraxsın.
- Avtomatik əlavə olunan ümumi "dəqiqləşdirici sual" silindi.
- Limit (429), məşğulluq (503) və ya gecikmə verən model bir müddət ötürülür; bir sual üçün Gemini modellərində ümumi gözləmə həddi 75 saniyədir.

## 7. Düşünən assistent (yeni mühərrik: `src/dusunen.js`)
- Şablonlu cavab yerinə model özü axtarır, maddəni oxuyur, sənədləri təhlil edir, maaş hesablayır, lazım olsa internetdə araşdırır, çatışmayan detalı soruşur.
- Cavabını oxuduqları ilə yoxlayır; uyğunsuzluq olsa bir dəfə geri qayıdıb düzəldir.
- Söhbətdən öyrəndiyini təklif edir ("Bunu yadda saxlayım?"); yalnız razılığınızla yadda saxlayır; "unut" desəniz zibil qutusuna atır.
- Gemini əlçatmaz olsa köhnə sadə rejim işləyir və bunu bildirir.
- Söndürmək üçün: `dusunen_rejim` tənzimləməsi `0`.

## 8. Canlı sınaqdan sonrakı düzəlişlər
- Özünüyoxlama sualı təkrar xatırladır; yeni variant mövzudan çıxsa və ya daha pis olsa, ilk cavab saxlanılır.
- Yalnız əvvəlki cavabda mətni sizə göstərilmiş qeyd təsdiqlənə bilər. Təklifin mətnini proqram özü göstərir.
- Qanun müddəaları yaddaşa təklif olunmur.
- Özünüz barədə dediyiniz faktı model unutsa da, proqram təklif edir.
- Maaş hesablamasının dərəcə izahını kalkulyator özü verir.
- Yüngül model cavab verəndə bu, addımlarda bildirilir.

## 9. Bilik xəritəsi və gündəlik icmal (`src/icmal.js`)
- Seçilmiş istiqamət üzrə: yaxınlaşan qanun dəyişiklikləri, vergi tarixləri, mənbələr arasında uyğunsuzluq, təsdiq gözləyən qeydlər, açıq suallar, bilik vəziyyəti və sizə suallar.
- Proqramda gündə bir bildiriş (bazada saxlanır); Telegram-da və çatda `icmal göndər` və ya `/icmal`.
- AI sorğusu istifadə etmir. Vergi tarixləri bayram günlərini nəzərə almır; uyğunsuzluq siyahısı yoxlanmalı namizədlərdir.

## 10. Gündəlik öyrənmə (`src/oyrenme.js`)
- Proqram açıq olanda gündə bir dəfə seçilmiş istiqamətdə 5 mövzu oxuyur (yüngül model ilə) və qeyd yazır.
- Üstünlük: suallarınızda işlənən > mətni dəyişən > tezliklə dəyişəcək > ən çox istinad edilən maddələr.
- Yalnız sitatı mətndə hərfən olan və rəqəmləri sitatla üst-üstə düşən fikir saxlanılır. Bu, düzgün şərhə zəmanət deyil.
- AI-yə yalnız rəsmi qanun mətni göndərilir.
- Əmrlər (çat və Telegram): `öyrən`, `nə öyrəndin`, `nə öyrəndin 105`, `qeydi sil 105`.
- Gündəlik say: `oyrenme_limiti` tənzimləməsi (standart 5, `0` = söndürülüb).
- Avtomatik "sınaq simulyasiyaları" dayandırıldı (əl ilə işə salmaq olar).

## 11. Öyrənmə keyfiyyəti (ilk canlı sınaqdan sonra)
- Maddə mətni mənbənin özündən götürülür (təkrar abzaslar yoxdur); hissələr 4500 simvoladək və bənddən bölünür.
- Hər hissədən 14-ədək fikir; bir fikirdə bir qayda, hər birinin öz sitatı.
- "Qüvvəyə minir" qeydlərini proqram özü qeydə əlavə edir; dəyişiklik olan hissə birinci oxunur.
- "Aydın olmayan" üçün yalnız tam sual qəbul edilir.
- Hər qeyddə əhatə göstərilir (hissədəki bəndlərdən neçəsinə sitat gətirilib).
- Standart gündəlik say 12-dir.

## 12. Öyrənmədə şərtlərin və sitatların qorunması (ikinci canlı sınaqdan sonra)
- Siyahının ortasından başlayan hissəyə aid olduğu bəndin giriş cümləsi əlavə edilir (modelə də, qeyddə də görünür).
- Sitat tam saxlanılır (əvvəl 400 simvolda kəsilirdi).
- Proqram yoxlaması: izahda istisna, metod və ya tarix şərti itibsə, izah əvəzinə qanunun öz mətni göstərilir.
- İkinci AI yoxlaması (hissə başına bir əlavə sorğu): mənanı dəyişən izah da qanun mətni ilə əvəzlənir. Sorğu alınmasa fikir "şərtlər ikinci dəfə yoxlanmayıb" kimi nişanlanır.
- Öz sualına cavab yalnız hər iki yoxlamadan keçdikdə saxlanılır.
- İkinci sınağın cavabları internetsiz təkrar yoxlandı: 5 qüsurlu fikirdən 4-ü proqram yoxlamasında tutuldu, qalan 19 fikir toxunulmadı. İkinci AI yoxlaması hələ canlı sınanmayıb.

## Məlum zəif yerlər
- Öyrənmənin ikinci yoxlaması da AI-dir, səhv buraxa bilər. Gündəlik öyrənmə indi təxminən iki dəfə çox pulsuz sorğu işlədir.
- Sitat yoxlaması sitatın mənbədə olduğunu yoxlayır, müfəttişin ondan düzgün nəticə çıxardığını yox. Qeydi sitatla özünüz tutuşdurun.
- İmtahanda "MMC mənfəətindən neçə faiz?" sualında Maddə 105.1 hələ tapılmır.
- Axtarış düzəlişləri bu 20 suala baxaraq edilib. Öz suallarınızı əlavə edin ki, ölçü obyektiv olsun.
- Semantik vektorlaşdırma işə salınmayıb (0 vektor).
- DSMF və tibbi sığorta dərəcələri rəsmi mətnlə yoxlanmayıb.
- Rəqəm yoxlaması rəqəmin mənbədə **olduğunu** yoxlayır, düzgün yerə aid edildiyini yox.
