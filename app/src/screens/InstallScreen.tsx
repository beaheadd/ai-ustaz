/**
 * «Установить приложение» (#/install) — как поставить AI Ustaz на экран «Домой» телефона.
 *
 * Решение владельца 19.11.2026: «Сразу нужно сделать ещё TWA приложение для загрузки из сайта и объяснение в APPLE,
 * чтобы добавить на рабочий стол». Сайт — свой домен aiustaz.pro (там проверка голосом, QML); манифест PWA и значки
 * кладёт scripts/after-export.mjs, пакет Google Play (TWA) — папка twa/ в корне репозитория.
 *
 * Контракт: ПропсыЭкрана<'установка'>; подстраница раздела «Ещё» (строка «Установить приложение» — первая в «Ещё»;
 * баннер на главной — useБаннерУстановки). Что показать — сценарий(среда, естьПредложение)
 * (install/platform.ts, чистая функция, тест scripts/test-install.mjs):
 *   установлено      — «Приложение уже установлено» (display-mode standalone, navigator.standalone, TWA, ?source=);
 *   batr             — страница на batr.kz: ставить нужно с aiustaz.pro (там проверка голосом) — ссылка и «Скопировать»;
 *   встроенный       — Instagram, Telegram, WhatsApp, Facebook, TikTok…: «Откройте в Chrome/Safari», «Скопировать ссылку»;
 *   кнопка           — Android, пришло beforeinstallprompt: «Установить» (системное окно Chrome); отказ — шаги меню;
 *   android-меню     — Android без события: ⋮ → «Установить приложение» / «Добавить на главный экран» (Samsung — ≡);
 *   ios-safari       — «Поделиться» → «На экран „Домой“» → «Добавить» (значки шагов — <Значок>, без растров);
 *   ios-поделиться   — Chrome/Firefox/Edge на iOS 16.4+: то же через их «Поделиться»; нет пункта — открыть в Safari;
 *   ios-только-safari — старый iOS в другом браузере: «Откройте aiustaz.pro в Safari»;
 *   компьютер        — «Откройте aiustaz.pro на телефоне» (адрес текстом; если Chrome предложил — «Установить на компьютер»).
 * На Android ниже — «Google Play — скоро» (без ссылки).
 * testID: экран-установка, установка-вступление, установка-сценарий-<сценарий>, установка-установлено, установка-batr,
 *   установка-открыть-сайт, установка-встроенный, установка-кнопка, установка-установить, установка-итог, установка-android, установка-ios, установка-шаги, установка-шаг-<n>,
 *   установка-адрес, установка-скопировать, установка-скопировано, установка-компьютер, установка-play, установка-ios-хранилище.
 * Правила: без счётчиков, рейтингов, рекламы; без растров; kk — черновик для редактора-носителя.
 */
import { useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { Карточка, Кнопка, Плашка, Текст, Значок, Экран, type ИмяЗначка } from '../components';
import type { ПропсыЭкрана } from '../engine/routes';
import { создатьСловарь, useСловарь } from '../i18n';
import { скопировать } from '../install/browser';
import { АДРЕС_УСТАНОВКИ, type Среда } from '../install/platform';
import { useУстановка } from '../install/useInstall';
import { useТема } from '../theme';

const СЛОВАРЬ = создатьСловарь({
  ru: {
    заголовок: 'Установить приложение',
    вступление:
      'AI Ustaz можно поставить на телефон как приложение: значок на экране «Домой», открывается без адресной строки. Это тот же сайт aiustaz.pro — бесплатно, без рекламы, обновляется сам.',
    установленоЗаголовок: 'Приложение уже установлено',
    установленоТекст: 'Вы открыли AI Ustaz как приложение. Новые уроки и исправления приходят сами — ничего обновлять не нужно.',
    batrЗаголовок: 'Ставьте с aiustaz.pro',
    batrТекст:
      'Здесь, на batr.kz, — прототип без проверки чтения голосом. Приложение ставится с собственного сайта AI Ustaz — aiustaz.pro: там работает проверка голосом. Откройте его и выберите «Установить приложение».',
    открытьСайт: 'Открыть aiustaz.pro',
    встроенныйЗаголовок: 'Откройте ссылку в браузере',
    встроенныйТекст: 'Вы открыли страницу внутри {где}. Отсюда приложение не ставится — нужен Chrome (Android) или Safari (iPhone).',
    встроенныйШаг1: 'Нажмите ⋮ или ··· вверху экрана и выберите «Открыть в браузере» (в Chrome, в Safari).',
    встроенныйШаг2: 'Если такого пункта нет — скопируйте ссылку ниже и вставьте её в адресную строку Chrome или Safari.',
    встроенныйШаг3: 'В браузере откройте «Ещё» → «Установить приложение».',
    кнопкаЗаголовок: 'Поставить на телефон',
    кнопкаТекст: 'Браузер готов поставить AI Ustaz. Нажмите кнопку и подтвердите «Установить».',
    установить: 'Установить',
    принято: 'Готово: значок AI Ustaz появится на экране «Домой».',
    отклонено: 'Можно поставить позже — через меню браузера:',
    androidЗаголовок: 'Через меню браузера',
    chromeШаг1: 'Нажмите ⋮ (три точки) вверху справа.',
    chromeШаг2: 'Выберите «Установить приложение» или «Добавить на главный экран».',
    chromeШаг3: 'Подтвердите «Установить». Значок появится на экране «Домой».',
    samsungШаг1: 'Нажмите ≡ (меню) внизу экрана.',
    samsungШаг2: 'Выберите «Добавить страницу на» → «Главный экран».',
    samsungШаг3: 'Нажмите «Добавить».',
    firefoxШаг1: 'Нажмите ⋮ (меню) у адресной строки.',
    firefoxШаг2: 'Выберите «Установить» или «Добавить на главный экран».',
    firefoxШаг3: 'Подтвердите «Добавить».',
    другойБраузер: 'Если в меню вашего браузера нет такого пункта — откройте aiustaz.pro в Chrome.',
    play: 'Google Play',
    playСкоро: 'Скоро',
    playТекст: 'Приложение в Google Play готовится. До выхода ставьте с сайта — это то же самое приложение.',
    iosЗаголовок: 'Добавить на экран «Домой»',
    iosШаг1: 'Нажмите «Поделиться» — квадрат со стрелкой вверх, внизу экрана (на iPad — вверху). Не видно — сначала нажмите ··· рядом с адресом.',
    iosШаг2: 'Прокрутите список вниз и выберите «На экран „Домой“».',
    iosШаг3: 'Нажмите «Добавить» вверху справа. Значок AI Ustaz появится на экране «Домой».',
    iosДругойШаг1: 'Нажмите «Поделиться» в браузере: значок со стрелкой у адресной строки или в меню ··· / ≡.',
    iosДругойШаг2: 'Выберите «На экран „Домой“» (или «Добавить на экран „Домой“»).',
    iosДругойШаг3: 'Нажмите «Добавить».',
    iosДругойНет: 'Если такого пункта нет — откройте aiustaz.pro в Safari и добавьте оттуда.',
    iosТолькоSafariЗаголовок: 'Откройте в Safari',
    iosТолькоSafariТекст:
      'В этом браузере на iPhone приложение не добавить. Скопируйте ссылку, откройте Safari, вставьте её в адресную строку — и дальше «Поделиться» → «На экран „Домой“».',
    iosХранилище: 'На iPhone у приложения своя память: уроки, пройденные в Safari, в нём начнутся заново.',
    компьютерЗаголовок: 'Откройте на телефоне',
    компьютерТекст:
      'AI Ustaz — приложение для телефона. Откройте на телефоне адрес ниже: на Android — в Chrome, на iPhone — в Safari. Затем «Ещё» → «Установить приложение».',
    компьютерУстановить: 'Установить на этот компьютер',
    адрес: 'Адрес',
    скопировать: 'Скопировать ссылку',
    скопировано: 'Ссылка скопирована',
    неСкопировано: 'Не получилось скопировать — выделите адрес и скопируйте вручную.',
    микрофон:
      'Микрофон: при первой записи телефон спросит разрешение для aiustaz.pro. Запись начинается только по вашему нажатию.',
    шаг: 'Шаг {номер}',
  },
  kk: {
    заголовок: 'Қолданбаны орнату',
    вступление:
      'AI Ustaz-ты телефонға қолданба ретінде орнатуға болады: «Үй» экранында белгіше пайда болады, мекенжай жолағынсыз ашылады. Бұл сол aiustaz.pro сайты — тегін, жарнамасыз, өзі жаңарады.',
    установленоЗаголовок: 'Қолданба орнатылған',
    установленоТекст: 'Сіз AI Ustaz-ты қолданба ретінде аштыңыз. Жаңа сабақтар мен түзетулер өзі келеді — ештеңе жаңартудың қажеті жоқ.',
    batrЗаголовок: 'aiustaz.pro сайтынан орнатыңыз',
    batrТекст:
      'Мұнда, batr.kz-те — дауыспен тексерусіз прототип. Қолданба AI Ustaz-тың өз сайтынан — aiustaz.pro-дан орнатылады: онда дауыспен тексеру жұмыс істейді. Сайтты ашып, «Тағы» → «Қолданбаны орнату» таңдаңыз.',
    открытьСайт: 'aiustaz.pro ашу',
    встроенныйЗаголовок: 'Сілтемені браузерде ашыңыз',
    встроенныйТекст: 'Бет {где} ішінде ашылды. Мұнда қолданба орнатылмайды — Chrome (Android) немесе Safari (iPhone) керек.',
    встроенныйШаг1: 'Экранның жоғарғы жағындағы ⋮ немесе ··· түймесін басып, «Браузерде ашу» таңдаңыз (Chrome, Safari).',
    встроенныйШаг2: 'Мұндай тармақ болмаса — төмендегі сілтемені көшіріп, Chrome не Safari мекенжай жолағына қойыңыз.',
    встроенныйШаг3: 'Браузерде «Тағы» → «Қолданбаны орнату» ашыңыз.',
    кнопкаЗаголовок: 'Телефонға орнату',
    кнопкаТекст: 'Браузер AI Ustaz-ты орнатуға дайын. Түймені басып, «Орнату» деп растаңыз.',
    установить: 'Орнату',
    принято: 'Дайын: AI Ustaz белгішесі «Үй» экранында пайда болады.',
    отклонено: 'Кейін де орнатуға болады — браузер мәзірі арқылы:',
    androidЗаголовок: 'Браузер мәзірі арқылы',
    chromeШаг1: 'Жоғарғы оң жақтағы ⋮ (үш нүкте) түймесін басыңыз.',
    chromeШаг2: '«Қолданбаны орнату» немесе «Басты экранға қосу» таңдаңыз.',
    chromeШаг3: '«Орнату» деп растаңыз. Белгіше «Үй» экранында пайда болады.',
    samsungШаг1: 'Экранның төменгі жағындағы ≡ (мәзір) түймесін басыңыз.',
    samsungШаг2: '«Бетті қосу» → «Басты экран» таңдаңыз.',
    samsungШаг3: '«Қосу» түймесін басыңыз.',
    firefoxШаг1: 'Мекенжай жолағының қасындағы ⋮ (мәзір) түймесін басыңыз.',
    firefoxШаг2: '«Орнату» немесе «Басты экранға қосу» таңдаңыз.',
    firefoxШаг3: '«Қосу» деп растаңыз.',
    другойБраузер: 'Браузеріңіздің мәзірінде мұндай тармақ болмаса — aiustaz.pro-ны Chrome-да ашыңыз.',
    play: 'Google Play',
    playСкоро: 'Жақында',
    playТекст: 'Google Play-дегі қолданба дайындалуда. Шыққанға дейін сайттан орнатыңыз — бұл сол қолданба.',
    iosЗаголовок: '«Үй» экранына қосу',
    iosШаг1: '«Бөлісу» түймесін басыңыз — жоғары бағытталған нұсқары бар шаршы, экранның төменгі жағында (iPad-та — жоғарыда). Көрінбесе — алдымен мекенжай қасындағы ··· басыңыз.',
    iosШаг2: 'Тізімді төмен айналдырып, «„Үй“ экранына» таңдаңыз.',
    iosШаг3: 'Жоғарғы оң жақтағы «Қосу» түймесін басыңыз. AI Ustaz белгішесі «Үй» экранында пайда болады.',
    iosДругойШаг1: 'Браузердегі «Бөлісу» түймесін басыңыз: мекенжай жолағындағы нұсқары бар белгіше немесе ··· / ≡ мәзірі.',
    iosДругойШаг2: '«„Үй“ экранына» (немесе «„Үй“ экранына қосу») таңдаңыз.',
    iosДругойШаг3: '«Қосу» түймесін басыңыз.',
    iosДругойНет: 'Мұндай тармақ болмаса — aiustaz.pro-ны Safari-де ашып, сол жерден қосыңыз.',
    iosТолькоSafariЗаголовок: 'Safari-де ашыңыз',
    iosТолькоSafariТекст:
      'iPhone-дағы бұл браузерде қолданбаны қосу мүмкін емес. Сілтемені көшіріп, Safari-ді ашыңыз, мекенжай жолағына қойыңыз — содан кейін «Бөлісу» → «„Үй“ экранына».',
    iosХранилище: 'iPhone-да қолданбаның өз жады бар: Safari-де өткен сабақтар онда қайта басталады.',
    компьютерЗаголовок: 'Телефонда ашыңыз',
    компьютерТекст:
      'AI Ustaz — телефонға арналған қолданба. Төмендегі мекенжайды телефонда ашыңыз: Android-та — Chrome-да, iPhone-да — Safari-де. Содан кейін «Тағы» → «Қолданбаны орнату».',
    компьютерУстановить: 'Осы компьютерге орнату',
    адрес: 'Мекенжай',
    скопировать: 'Сілтемені көшіру',
    скопировано: 'Сілтеме көшірілді',
    неСкопировано: 'Көшіру мүмкін болмады — мекенжайды белгілеп, қолмен көшіріңіз.',
    микрофон: 'Микрофон: алғашқы жазба кезінде телефон aiustaz.pro үшін рұқсат сұрайды. Жазба тек сіз басқанда басталады.',
    шаг: '{номер}-қадам',
  },
  uz: {
    заголовок: 'Ilovani oʻrnatish',
    вступление:
      'AI Ustazni telefonga ilova sifatida oʻrnatish mumkin: «Uy» ekranida belgi, manzil satrisiz ochiladi. Bu oʻsha aiustaz.pro sayti — bepul, reklamasiz, oʻzi yangilanadi.',
    установленоЗаголовок: 'Ilova allaqachon oʻrnatilgan',
    установленоТекст: 'Siz AI Ustazni ilova sifatida ochdingiz. Yangi darslar va tuzatishlar oʻzi keladi — hech narsani yangilash shart emas.',
    batrЗаголовок: 'aiustaz.pro saytidan oʻrnating',
    batrТекст:
      'Bu yerda, batr.kz saytida, — oʻqishni ovoz bilan tekshirmaydigan prototip. Ilova AI Ustazning oʻz saytidan — aiustaz.pro dan oʻrnatiladi: u yerda ovoz bilan tekshirish ishlaydi. Uni oching va «Ilovani oʻrnatish»ni tanlang.',
    открытьСайт: 'aiustaz.pro ni ochish',
    встроенныйЗаголовок: 'Havolani brauzerda oching',
    встроенныйТекст: 'Siz sahifani {где} ichida ochdingiz. Bu yerdan ilova oʻrnatilmaydi — Chrome (Android) yoki Safari (iPhone) kerak.',
    встроенныйШаг1: 'Ekranning yuqorisidagi ⋮ yoki ··· ni bosing va «Brauzerda ochish»ni tanlang (Chromeʼda, Safariʼda).',
    встроенныйШаг2: 'Bunday band boʻlmasa — quyidagi havolani nusxalab, Chrome yoki Safari manzil satriga qoʻying.',
    встроенныйШаг3: 'Brauzerda «Yana» → «Ilovani oʻrnatish»ni oching.',
    кнопкаЗаголовок: 'Telefonga oʻrnatish',
    кнопкаТекст: 'Brauzer AI Ustazni oʻrnatishga tayyor. Tugmani bosing va «Oʻrnatish»ni tasdiqlang.',
    установить: 'Oʻrnatish',
    принято: 'Tayyor: AI Ustaz belgisi «Uy» ekranida paydo boʻladi.',
    отклонено: 'Keyinroq oʻrnatish mumkin — brauzer menyusi orqali:',
    androidЗаголовок: 'Brauzer menyusi orqali',
    chromeШаг1: 'Yuqori oʻngdagi ⋮ (uch nuqta) ni bosing.',
    chromeШаг2: '«Ilovani oʻrnatish» yoki «Bosh ekranga qoʻshish»ni tanlang.',
    chromeШаг3: '«Oʻrnatish»ni tasdiqlang. Belgi «Uy» ekranida paydo boʻladi.',
    samsungШаг1: 'Ekranning pastidagi ≡ (menyu) ni bosing.',
    samsungШаг2: '«Sahifani qoʻshish» → «Bosh ekran»ni tanlang.',
    samsungШаг3: '«Qoʻshish»ni bosing.',
    firefoxШаг1: 'Manzil satri yonidagi ⋮ (menyu) ni bosing.',
    firefoxШаг2: '«Oʻrnatish» yoki «Bosh ekranga qoʻshish»ni tanlang.',
    firefoxШаг3: '«Qoʻshish»ni tasdiqlang.',
    другойБраузер: 'Brauzeringiz menyusida bunday band boʻlmasa — aiustaz.pro ni Chromeʼda oching.',
    play: 'Google Play',
    playСкоро: 'Tez orada',
    playТекст: 'Google Playʼdagi ilova tayyorlanmoqda. U chiqquncha saytdan oʻrnating — bu xuddi shu ilova.',
    iosЗаголовок: '«Uy» ekraniga qoʻshish',
    iosШаг1: '«Ulashish»ni bosing — ekranning pastidagi yuqoriga strelkali kvadrat (iPadʼda — yuqorida). Koʻrinmasa — avval manzil yonidagi ··· ni bosing.',
    iosШаг2: 'Roʻyxatni pastga aylantiring va «„Uy“ ekraniga»ni tanlang.',
    iosШаг3: 'Yuqori oʻngdagi «Qoʻshish»ni bosing. AI Ustaz belgisi «Uy» ekranida paydo boʻladi.',
    iosДругойШаг1: 'Brauzerda «Ulashish»ni bosing: manzil satri yonidagi strelkali belgi yoki ··· / ≡ menyusida.',
    iosДругойШаг2: '«„Uy“ ekraniga» (yoki «„Uy“ ekraniga qoʻshish»)ni tanlang.',
    iosДругойШаг3: '«Qoʻshish»ni bosing.',
    iosДругойНет: 'Bunday band boʻlmasa — aiustaz.pro ni Safariʼda oching va u yerdan qoʻshing.',
    iosТолькоSafariЗаголовок: 'Safariʼda oching',
    iosТолькоSafariТекст:
      'iPhoneʼdagi bu brauzerda ilovani qoʻshib boʻlmaydi. Havolani nusxalang, Safariʼni oching, uni manzil satriga qoʻying — soʻng «Ulashish» → «„Uy“ ekraniga».',
    iosХранилище: 'iPhoneʼda ilovaning oʻz xotirasi bor: Safariʼda oʻtilgan darslar unda qaytadan boshlanadi.',
    компьютерЗаголовок: 'Telefonda oching',
    компьютерТекст:
      'AI Ustaz — telefon uchun ilova. Quyidagi manzilni telefonda oching: Androidʼda — Chromeʼda, iPhoneʼda — Safariʼda. Soʻng «Yana» → «Ilovani oʻrnatish».',
    компьютерУстановить: 'Shu kompyuterga oʻrnatish',
    адрес: 'Manzil',
    скопировать: 'Havolani nusxalash',
    скопировано: 'Havola nusxalandi',
    неСкопировано: 'Nusxalab boʻlmadi — manzilni belgilab, qoʻlda nusxalang.',
    микрофон:
      'Mikrofon: birinchi yozuvda telefon aiustaz.pro uchun ruxsat soʻraydi. Yozuv faqat siz bosganingizda boshlanadi.',
    шаг: '{номер}-qadam',
  },
  en: {
    заголовок: 'Install the app',
    вступление:
      'You can install AI Ustaz on your phone as an app: an icon on the Home screen, it opens without the address bar. It is the same aiustaz.pro website — free, no ads, updates itself.',
    установленоЗаголовок: 'The app is already installed',
    установленоТекст: 'You opened AI Ustaz as an app. New lessons and fixes arrive by themselves — nothing to update.',
    batrЗаголовок: 'Install from aiustaz.pro',
    batrТекст:
      'Here, on batr.kz, is a prototype without voice reading check. The app is installed from the AI Ustaz website itself — aiustaz.pro: the voice check works there. Open it and choose “Install the app”.',
    открытьСайт: 'Open aiustaz.pro',
    встроенныйЗаголовок: 'Open the link in a browser',
    встроенныйТекст: 'You opened the page inside {где}. The app cannot be installed from here — you need Chrome (Android) or Safari (iPhone).',
    встроенныйШаг1: 'Tap ⋮ or ··· at the top of the screen and choose “Open in browser” (in Chrome, in Safari).',
    встроенныйШаг2: 'If there is no such item — copy the link below and paste it into the address bar of Chrome or Safari.',
    встроенныйШаг3: 'In the browser, open “More” → “Install the app”.',
    кнопкаЗаголовок: 'Install on your phone',
    кнопкаТекст: 'The browser is ready to install AI Ustaz. Tap the button and confirm “Install”.',
    установить: 'Install',
    принято: 'Done: the AI Ustaz icon will appear on the Home screen.',
    отклонено: 'You can install it later — via the browser menu:',
    androidЗаголовок: 'Via the browser menu',
    chromeШаг1: 'Tap ⋮ (three dots) at the top right.',
    chromeШаг2: 'Choose “Install app” or “Add to Home screen”.',
    chromeШаг3: 'Confirm “Install”. The icon will appear on the Home screen.',
    samsungШаг1: 'Tap ≡ (menu) at the bottom of the screen.',
    samsungШаг2: 'Choose “Add page to” → “Home screen”.',
    samsungШаг3: 'Tap “Add”.',
    firefoxШаг1: 'Tap ⋮ (menu) next to the address bar.',
    firefoxШаг2: 'Choose “Install” or “Add to Home screen”.',
    firefoxШаг3: 'Confirm “Add”.',
    другойБраузер: "If your browser's menu has no such item — open aiustaz.pro in Chrome.",
    play: 'Google Play',
    playСкоро: 'Soon',
    playТекст: 'The Google Play app is being prepared. Until then, install from the website — it is the same app.',
    iosЗаголовок: 'Add to Home Screen',
    iosШаг1: 'Tap “Share” — the square with an up arrow, at the bottom of the screen (on iPad — at the top). Not visible — first tap ··· next to the address.',
    iosШаг2: 'Scroll down the list and choose “Add to Home Screen”.',
    iosШаг3: 'Tap “Add” at the top right. The AI Ustaz icon will appear on the Home Screen.',
    iosДругойШаг1: 'Tap “Share” in the browser: the arrow icon next to the address bar or in the ··· / ≡ menu.',
    iosДругойШаг2: 'Choose “Add to Home Screen”.',
    iosДругойШаг3: 'Tap “Add”.',
    iosДругойНет: 'If there is no such item — open aiustaz.pro in Safari and add it from there.',
    iosТолькоSafariЗаголовок: 'Open in Safari',
    iosТолькоSafariТекст:
      'In this browser on iPhone the app cannot be added. Copy the link, open Safari, paste it into the address bar — and then “Share” → “Add to Home Screen”.',
    iosХранилище: 'On iPhone the app has its own storage: lessons completed in Safari will start over in it.',
    компьютерЗаголовок: 'Open on your phone',
    компьютерТекст:
      'AI Ustaz is a phone app. Open the address below on your phone: on Android — in Chrome, on iPhone — in Safari. Then “More” → “Install the app”.',
    компьютерУстановить: 'Install on this computer',
    адрес: 'Address',
    скопировать: 'Copy link',
    скопировано: 'Link copied',
    неСкопировано: 'Could not copy — select the address and copy it manually.',
    микрофон:
      'Microphone: on the first recording the phone will ask for permission for aiustaz.pro. Recording starts only when you tap.',
    шаг: 'Step {номер}',
  },
});

type Шаг = { значок: ИмяЗначка; текст: string };

/** Пронумерованные шаги со значками (значок — в мягкой изумрудной плитке, как у строк списка). */
function Шаги({ шаги }: { шаги: Шаг[] }) {
  const { цвет, отступ, радиус } = useТема();
  const т = useСловарь(СЛОВАРЬ);
  return (
    <View style={{ gap: отступ.m }} testID="установка-шаги" accessibilityRole="list">
      {шаги.map((ш, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: отступ.m, alignItems: 'flex-start' }} testID={'установка-шаг-' + (i + 1)} accessibilityRole={'listitem' as never}>
          <View style={{ width: 40, height: 40, borderRadius: радиус.m, backgroundColor: цвет.поверхностьАкцент, alignItems: 'center', justifyContent: 'center' }}>
            <Значок имя={ш.значок} размер={24} цвет={цвет.акцент} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Текст вид="метка" цвет={цвет.текстВторой}>
              {т('шаг', { номер: i + 1 })}
            </Текст>
            <Текст>{ш.текст}</Текст>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Адрес для копирования: текстом (можно выделить) и кнопка «Скопировать ссылку». */
function Адрес({ адрес }: { адрес: string }) {
  const { цвет, отступ, радиус } = useТема();
  const т = useСловарь(СЛОВАРЬ);
  const [итог, установитьИтог] = useState<'нет' | 'да' | 'ошибка'>('нет');
  return (
    <View style={{ gap: отступ.s }}>
      <View style={{ padding: отступ.m, borderRadius: радиус.m, backgroundColor: цвет.поверхностьВторая }}>
        <Текст вид="метка" цвет={цвет.текстВторой}>
          {т('адрес')}
        </Текст>
        <Текст selectable testID="установка-адрес" стиль={{ wordBreak: 'break-all' } as never}>
          {адрес}
        </Текст>
      </View>
      <Кнопка
        вид="вторичная"
        значок="копировать"
        надпись={т('скопировать')}
        приНажатии={() => {
          void скопировать(адрес).then((ок) => установитьИтог(ок ? 'да' : 'ошибка'));
        }}
        testID="установка-скопировать"
      />
      {итог !== 'нет' ? (
        <Текст вид="мелкий" testID="установка-скопировано" accessibilityLiveRegion="polite">
          {итог === 'да' ? т('скопировано') : т('неСкопировано')}
        </Текст>
      ) : null}
    </View>
  );
}

function ШагиAndroid({ среда }: { среда: Среда }) {
  const т = useСловарь(СЛОВАРЬ);
  const шаги: Шаг[] =
    среда.браузер === 'samsung'
      ? [
          { значок: 'меню', текст: т('samsungШаг1') },
          { значок: 'наЭкранДомой', текст: т('samsungШаг2') },
          { значок: 'галочка', текст: т('samsungШаг3') },
        ]
      : среда.браузер === 'firefox'
        ? [
            { значок: 'точкиВертикально', текст: т('firefoxШаг1') },
            { значок: 'установить', текст: т('firefoxШаг2') },
            { значок: 'галочка', текст: т('firefoxШаг3') },
          ]
        : [
            { значок: 'точкиВертикально', текст: т('chromeШаг1') },
            { значок: 'установить', текст: т('chromeШаг2') },
            { значок: 'галочка', текст: т('chromeШаг3') },
          ];
  const свой = ['chrome', 'edge', 'samsung', 'firefox'].includes(среда.браузер);
  return (
    <>
      <Шаги шаги={шаги} />
      {свой ? null : <Текст вид="мелкий">{т('другойБраузер')}</Текст>}
    </>
  );
}

function Блок({ заголовок, children, testID, вид = 'обычная' }: { заголовок: string; children: ReactNode; testID: string; вид?: 'обычная' | 'акцент' }) {
  return (
    <Карточка вид={вид} testID={testID}>
      <Текст вид="подзаголовок" accessibilityRole="header" уровень={2}>
        {заголовок}
      </Текст>
      {children}
    </Карточка>
  );
}

export function Установка(_: ПропсыЭкрана<'установка'>) {
  const т = useСловарь(СЛОВАРЬ);
  const { цвет, отступ } = useТема();
  const { среда, сценарий, предложить, естьПредложение } = useУстановка();
  const [ответ, установитьОтвет] = useState<'нет' | 'принято' | 'отклонено'>('нет');


  const нажатьУстановить = () => {
    void предложить().then((р) => установитьОтвет(р === 'принято' ? 'принято' : 'отклонено'));
  };

  const iosШаги: Шаг[] = [
    { значок: 'поделиться', текст: т('iosШаг1') },
    { значок: 'наЭкранДомой', текст: т('iosШаг2') },
    { значок: 'галочка', текст: т('iosШаг3') },
  ];
  const iosДругойШаги: Шаг[] = [
    { значок: 'поделиться', текст: т('iosДругойШаг1') },
    { значок: 'наЭкранДомой', текст: т('iosДругойШаг2') },
    { значок: 'галочка', текст: т('iosДругойШаг3') },
  ];
  // На вебе — обычная ссылка <a href> в той же вкладке (react-native-web: Text с href).
  const адресСайта = Platform.OS === 'web' ? ({ href: АДРЕС_УСТАНОВКИ } as object) : {};

  let основное: ReactNode;
  switch (сценарий) {
    case 'установлено':
      основное = (
        <Блок заголовок={т('установленоЗаголовок')} testID="установка-установлено" вид="акцент">
          <Плашка вид="успех" значок="галочка" надпись={т('установленоЗаголовок')} />
          <Текст>{т('установленоТекст')}</Текст>
        </Блок>
      );
      break;
    case 'batr':
      основное = (
        <Блок заголовок={т('batrЗаголовок')} testID="установка-batr" вид="акцент">
          <Текст>{т('batrТекст')}</Текст>
          <Текст {...адресСайта} accessibilityRole="link" вид="кнопка" цвет={цвет.акцент} стиль={{ textDecorationLine: 'underline', paddingVertical: отступ.s }} testID="установка-открыть-сайт">
            {т('открытьСайт')}
          </Текст>
          <Адрес адрес={АДРЕС_УСТАНОВКИ} />
        </Блок>
      );
      break;
    case 'встроенный':
      основное = (
        <Блок заголовок={т('встроенныйЗаголовок')} testID="установка-встроенный">
          <Текст>{т('встроенныйТекст', { где: среда.встроенный ?? '' })}</Текст>
          <Шаги
            шаги={[
              { значок: среда.ос === 'ios' ? 'ещё' : 'точкиВертикально', текст: т('встроенныйШаг1') },
              { значок: 'копировать', текст: т('встроенныйШаг2') },
              { значок: 'установить', текст: т('встроенныйШаг3') },
            ]}
          />
          <Адрес адрес={АДРЕС_УСТАНОВКИ} />
        </Блок>
      );
      break;
    case 'кнопка':
    case 'android-меню':
      основное = (
        <>
          {сценарий === 'кнопка' || ответ !== 'нет' ? (
            <Блок заголовок={т('кнопкаЗаголовок')} testID="установка-кнопка" вид="акцент">
              {ответ === 'нет' ? (
                <>
                  <Текст>{т('кнопкаТекст')}</Текст>
                  <Кнопка надпись={т('установить')} значок="установить" крупная приНажатии={нажатьУстановить} testID="установка-установить" />
                </>
              ) : (
                <Текст testID="установка-итог" accessibilityLiveRegion="polite">
                  {ответ === 'принято' ? т('принято') : т('отклонено')}
                </Текст>
              )}
            </Блок>
          ) : null}
          {ответ === 'принято' ? null : (
            <Блок заголовок={т('androidЗаголовок')} testID="установка-android">
              <ШагиAndroid среда={среда} />
            </Блок>
          )}
        </>
      );
      break;
    case 'ios-safari':
      основное = (
        <Блок заголовок={т('iosЗаголовок')} testID="установка-ios">
          <Шаги шаги={iosШаги} />
        </Блок>
      );
      break;
    case 'ios-поделиться':
      основное = (
        <Блок заголовок={т('iosЗаголовок')} testID="установка-ios">
          <Шаги шаги={iosДругойШаги} />
          <Текст вид="мелкий">{т('iosДругойНет')}</Текст>
        </Блок>
      );
      break;
    case 'ios-только-safari':
      основное = (
        <Блок заголовок={т('iosТолькоSafariЗаголовок')} testID="установка-ios">
          <Текст>{т('iosТолькоSafariТекст')}</Текст>
          <Адрес адрес={АДРЕС_УСТАНОВКИ} />
        </Блок>
      );
      break;
    default:
      основное = (
        <Блок заголовок={т('компьютерЗаголовок')} testID="установка-компьютер">
          <View style={{ flexDirection: 'row', gap: отступ.m, alignItems: 'center' }}>
            <Значок имя="телефон" размер={32} цвет={цвет.акцент} />
            <Текст стиль={{ flex: 1 }}>{т('компьютерТекст')}</Текст>
          </View>
          <Адрес адрес={АДРЕС_УСТАНОВКИ} />
          {естьПредложение && ответ === 'нет' ? (
            <Кнопка вид="тихая" надпись={т('компьютерУстановить')} значок="установить" приНажатии={нажатьУстановить} testID="установка-установить" />
          ) : ответ !== 'нет' ? (
            <Текст вид="мелкий" testID="установка-итог">
              {ответ === 'принято' ? т('принято') : ''}
            </Текст>
          ) : null}
        </Блок>
      );
  }

  return (
    <Экран заголовок={т('заголовок')} testID="экран-установка">
      {сценарий === 'установлено' ? null : <Текст testID="установка-вступление">{т('вступление')}</Текст>}
      <View style={{ gap: отступ.m }} testID={'установка-сценарий-' + сценарий}>
        {основное}
      </View>
      {среда.ос === 'ios' && сценарий !== 'установлено' && сценарий !== 'batr' ? (
        <Текст вид="мелкий" testID="установка-ios-хранилище">
          {т('iosХранилище')}
        </Текст>
      ) : null}
      {среда.ос === 'android' && сценарий !== 'установлено' ? (
        <Карточка вид="песок" testID="установка-play">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.s, flexWrap: 'wrap' }}>
            <Текст вид="подзаголовок">{т('play')}</Текст>
            <Плашка вид="скоро" надпись={т('playСкоро')} />
          </View>
          <Текст вид="мелкий" цвет={цвет.песокТекст}>
            {т('playТекст')}
          </Текст>
        </Карточка>
      ) : null}
      {сценарий === 'batr' ? null : <Текст вид="мелкий">{т('микрофон')}</Текст>}
    </Экран>
  );
}
