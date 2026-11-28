/**
 * «Уведомления о намазе» (#/notifications) — включить, выбрать намазы, «напомнить заранее», проверить.
 *
 * Владелец 20.11.2026 (скрин уведомлений Muslim Pro): «Нам тоже нужно добавить уведомления, чтобы правильные, красивые
 * уведомления время намаза приходило к клиенту.» Дизайн, приватность и ограничения iOS/Android — docs/дизайн/07-уведомления.md.
 *
 * Контракт: ПропсыЭкрана<'уведомления'>. Открывается из «Ещё» → Настройки и колокольчиком у следующего намаза на главной.
 * Где работает (notify/support.ts): только aiustaz.pro. batr.kz — пояснение «уведомления — на aiustaz.pro» и ссылка;
 * iPhone не с экрана «Домой» — объяснение и «Как добавить на экран „Домой“» (#/install); iOS < 16.4 и браузеры без Push
 * (Instagram, Telegram…) — честное «здесь нельзя».
 * На aiustaz.pro, сверху вниз:
 *   1. переключатель «Присылать уведомления». Включение: если браузер ещё не спрашивал — СНАЧАЛА наше пояснение (что
 *      придёт; координаты не уходят; что и где хранится; как отключить), и только по «Разрешить уведомления» —
 *      системный запрос. Отказ (или разрешение снято потом) — инструкция, как включить в настройках браузера/телефона.
 *      Выключение — отписка: подписка и расписание удаляются с сервера сразу;
 *   2. «Какие времена»: Фаджр, Восход (выключен по умолчанию: это не намаз), Зухр, Аср, Магриб, Иша — с сегодняшним временем;
 *      последний выбранный выключить нельзя (пустое расписание = «выключено»);
 *   3. «Напомнить заранее»: Нет · 5 · 10 · 15 · 30 мин;
 *   4. город — тот же, что для времени намаза (#/prayer-city);
 *   5. «Проверить уведомление» (сервер шлёт тестовое сразу) и строка состояния «Расписание на 30 дней — до …»;
 *   6. «Так будет выглядеть» — пример с сегодняшним временем; 7. «Что хранится» — приватность.
 * Тексты уведомлений собирает сервер (server/push.py) — пример здесь повторяет его формат (тест: scripts/test-notify.mjs).
 * kk — черновик для редактора-носителя и словаря терминов ДУМК.
 * testID: экран-уведомления, уведомления-переключатель, уведомления-пояснение, уведомления-разрешить, уведомления-не-сейчас,
 *   уведомления-отказ, уведомления-ios, уведомления-ios-установка, уведомления-ios-старый, уведомления-batr,
 *   уведомления-открыть-сайт, уведомления-нет-поддержки, уведомления-намазы, уведомления-намаз-<ключ>, уведомления-заранее,
 *   заранее-<0|5|10|15|30>, уведомления-город, уведомления-проверить, уведомления-итог, уведомления-состояние,
 *   уведомления-пример, уведомления-приватность, уведомления-звук.
 */
import { useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { Вкладки, Значок, Карточка, Кнопка, Плашка, СтрокаСписка, Текст, Экран } from '../components';
import { СтрокаПереключателя } from '../components/Switch';
import { useНавигация } from '../engine/navigation';
import type { ПропсыЭкрана } from '../engine/routes';
import { создатьСловарь, useПеревод, useСловарь } from '../i18n';
import { НАЗВАНИЯ, датаДня, деньРК, чч_мм } from '../prayer/day';
import { useДеньНамаза, useСейчас, версияОфициальных } from '../prayer/hooks';
import { текущийМазхаб, useМестоНамаза } from '../prayer/store';
import { названиеМеста } from '../prayer/places';
import type { КлючВремени } from '../prayer/times';
import { включить, выключить, проверить, разрешение } from '../notify/push';
import { ВАРИАНТЫ_ЗАРАНЕЕ, ПОРЯДОК, концаРасписания, type Заранее } from '../notify/schedule';
import { useНастройкиУведомлений } from '../notify/store';
import { данныеРасписания, ключСинхронизации, отметитьОтправку, useПоддержкаУведомлений } from '../notify/useNotify';
import { useТема } from '../theme';

/** Адрес экрана на своём домене (ссылка с batr.kz — переход по нажатию, не загрузка; check-dist разрешает aiustaz.pro). */
const АДРЕС_НА_СВОЁМ = 'https://aiustaz.pro/aiustaz/#/notifications';

const СЛОВАРЬ = создатьСловарь({
  ru: {
    заголовок: 'Уведомления о намазе',
    вступление: 'Уведомление в начале времени намаза — по расчёту для вашего города. Можно выбрать намазы и напоминание заранее.',
    переключатель: 'Присылать уведомления',
    включены: 'Включены',
    выключены: 'Выключены',
    пояснениеЗаголовок: 'Прежде чем браузер спросит разрешение',
    пояснение1: 'Придёт «Аср · 14:39» в начале времени выбранных намазов и, если хотите, напоминание заранее. Только время намаза — без рекламы.',
    пояснение2: 'Координаты не уходят: время считает ваш телефон. На сервер AI Ustaz в Казахстане уходят подписка браузера, язык, название города и расписание на 30 дней.',
    пояснение3: 'Хранится, пока уведомления включены. Выключите здесь — подписка и расписание удалятся с сервера сразу.',
    пояснение4: 'Расписание обновляется, когда вы открываете AI Ustaz. Если не открывать его почти месяц, придёт одно тихое напоминание.',
    разрешить: 'Разрешить уведомления',
    неСейчас: 'Не сейчас',
    ждём: 'Включаем…',
    отказЗаголовок: 'Браузер запретил уведомления',
    отказТекст: 'Разрешение даётся в настройках — AI Ustaz сам его включить не может. Потом вернитесь сюда и включите переключатель ещё раз.',
    отказAndroid: 'Android, Chrome: значок слева от адреса → «Разрешения» (или «Настройки сайта») → «Уведомления» → «Разрешить». Приложение AI Ustaz: настройки телефона → «Приложения» → AI Ustaz → «Уведомления».',
    отказIOS: 'iPhone: «Настройки» → «Уведомления» → AI Ustaz → «Допуск уведомлений».',
    отказКомпьютер: 'Компьютер: значок слева от адреса → «Уведомления» → «Разрешить», затем обновите страницу.',
    iosЗаголовок: 'На iPhone — с экрана «Домой»',
    iosТекст: 'iPhone присылает уведомления сайтов только приложению на экране «Домой» (iOS 16.4 и новее). Добавьте AI Ustaz на экран «Домой», откройте его оттуда и включите уведомления здесь.',
    iosКнопка: 'Как добавить на экран «Домой»',
    iosСтарый: 'Уведомления сайтов на iPhone работают с iOS 16.4. Обновите iOS, чтобы получать уведомления о времени намаза.',
    нетПоддержкиЗаголовок: 'Здесь уведомления недоступны',
    нетПоддержки: 'Этот браузер не показывает уведомления сайтов (например, браузер внутри Instagram или Telegram). Откройте aiustaz.pro в Chrome на Android или в Safari на iPhone (с экрана «Домой»).',
    batrЗаголовок: 'Уведомления — на aiustaz.pro',
    batrТекст: 'Уведомления о времени намаза работают на собственном сайте AI Ustaz — aiustaz.pro, без рекламы и чужих скриптов вокруг. Здесь, на batr.kz, их нет.',
    открытьСайт: 'Открыть aiustaz.pro',
    какие: 'Какие времена',
    восходПодпись: 'Не намаз: им кончается время фаджра',
    последний: 'Хотя бы одно время должно остаться',
    заранее: 'Напомнить заранее',
    заранееПодпись: 'Напоминание за N минут — вдобавок к уведомлению в начале времени.',
    нет: 'Нет',
    мин: '{n} мин',
    группаЗаранее: 'Напомнить заранее, минут',
    город: 'Город',
    городПодпись: 'Тот же, что для времени намаза',
    проверить: 'Проверить уведомление',
    'итог.включено': 'Уведомления включены. Расписание на 30 дней отправлено.',
    'итог.выключено': 'Уведомления выключены. Подписка и расписание удалены с сервера.',
    'итог.выключеноБезСети': 'Уведомления выключены на этом телефоне. Сервер удалит данные сам при следующей отправке.',
    'итог.закрыто': 'Окно разрешения закрыто — уведомления не включены.',
    'итог.нетСети': 'Нет связи с сервером AI Ustaz. Попробуйте позже.',
    'итог.ошибка': 'Не получилось включить уведомления. Попробуйте позже.',
    'итог.отправлено': 'Отправили. Уведомление придёт через несколько секунд.',
    'итог.часто': 'Проверку можно повторить через несколько минут.',
    'итог.нетПодписки': 'Подписка не найдена — выключите и снова включите уведомления.',
    состояние: 'Расписание на 30 дней — до {дата}. Обновляется, когда вы открываете AI Ustaz.',
    пример: 'Так будет выглядеть',
    примерТекст: 'Наступило время намаза · {город}. Следующий — {намаз} в {время}',
    приватность: 'Что хранится',
    приватностьТекст: 'На сервере AI Ustaz в Казахстане: подписка браузера (адрес и ключи шифрования), язык, название города и расписание на 30 дней. Координат, имени, телефона нет. Без рекламы и аналитики. Выключили — всё удаляется сразу.',
    звук: 'Звук — обычный звук уведомлений вашего телефона.',
    черновик: 'Черновик',
  },
  kk: {
    заголовок: 'Намаз хабарландырулары',
    вступление: 'Намаз уақыты кіргенде хабарландыру келеді — қалаңыз бойынша есеппен. Намаздарды және алдын ала еске салуды таңдауға болады.',
    переключатель: 'Хабарландыру жіберу',
    включены: 'Қосулы',
    выключены: 'Өшірулі',
    пояснениеЗаголовок: 'Браузер рұқсат сұрамас бұрын',
    пояснение1: 'Таңдалған намаз уақыты кіргенде «Екінті · 14:39» келеді, қаласаңыз — алдын ала еске салу. Тек намаз уақыты — жарнамасыз.',
    пояснение2: 'Координаттар жіберілмейді: уақытты телефоныңыз есептейді. Қазақстандағы AI Ustaz серверіне браузер жазылымы, тіл, қала атауы және 30 күндік кесте жіберіледі.',
    пояснение3: 'Хабарландыру қосулы тұрғанда сақталады. Осы жерде өшірсеңіз — жазылым мен кесте серверден бірден жойылады.',
    пояснение4: 'Кесте AI Ustaz-ты ашқан сайын жаңарады. Бір айдай ашпасаңыз, бір рет дыбыссыз еске салу келеді.',
    разрешить: 'Хабарландыруға рұқсат беру',
    неСейчас: 'Қазір емес',
    ждём: 'Қосылуда…',
    отказЗаголовок: 'Браузер хабарландыруға тыйым салды',
    отказТекст: 'Рұқсат баптауларда беріледі — AI Ustaz оны өзі қоса алмайды. Кейін осында оралып, қосқышты қайта қосыңыз.',
    отказAndroid: 'Android, Chrome: мекенжайдың сол жағындағы белгіше → «Рұқсаттар» (немесе «Сайт баптаулары») → «Хабарландырулар» → «Рұқсат ету». AI Ustaz қолданбасы: телефон баптаулары → «Қолданбалар» → AI Ustaz → «Хабарландырулар».',
    отказIOS: 'iPhone: «Баптаулар» → «Хабарландырулар» → AI Ustaz → «Хабарландыруға рұқсат».',
    отказКомпьютер: 'Компьютер: мекенжайдың сол жағындағы белгіше → «Хабарландырулар» → «Рұқсат ету», сосын бетті жаңартыңыз.',
    iosЗаголовок: 'iPhone-да — «Үй» экранынан',
    iosТекст: 'iPhone сайт хабарландыруларын тек «Үй» экранындағы қолданбаға жібереді (iOS 16.4 және жаңарақ). AI Ustaz-ты «Үй» экранына қосып, сол жерден ашып, хабарландыруды осында қосыңыз.',
    iosКнопка: '«Үй» экранына қалай қосу керек',
    iosСтарый: 'iPhone-да сайт хабарландырулары iOS 16.4-тен бастап жұмыс істейді. Намаз уақыты туралы хабарландыру алу үшін iOS-ты жаңартыңыз.',
    нетПоддержкиЗаголовок: 'Мұнда хабарландыру жоқ',
    нетПоддержки: 'Бұл браузер сайт хабарландыруларын көрсетпейді (мысалы, Instagram не Telegram ішіндегі браузер). aiustaz.pro сайтын Android-та Chrome-да немесе iPhone-да Safari-де («Үй» экранынан) ашыңыз.',
    batrЗаголовок: 'Хабарландыру — aiustaz.pro сайтында',
    batrТекст: 'Намаз уақыты туралы хабарландыру AI Ustaz-тың өз сайтында — aiustaz.pro-да жұмыс істейді, жарнамасыз және бөгде скриптсіз. Мұнда, batr.kz-те, ол жоқ.',
    открытьСайт: 'aiustaz.pro ашу',
    какие: 'Қай уақыттар',
    восходПодпись: 'Намаз емес: онымен таң намазының уақыты бітеді',
    последний: 'Кемінде бір уақыт қалуы керек',
    заранее: 'Алдын ала еске салу',
    заранееПодпись: 'N минут бұрын еске салу — уақыт кіргендегі хабарландыруға қосымша.',
    нет: 'Жоқ',
    мин: '{n} мин',
    группаЗаранее: 'Алдын ала еске салу, минут',
    город: 'Қала',
    городПодпись: 'Намаз уақытындағы қала',
    проверить: 'Хабарландыруды тексеру',
    'итог.включено': 'Хабарландыру қосылды. 30 күндік кесте жіберілді.',
    'итог.выключено': 'Хабарландыру өшірілді. Жазылым мен кесте серверден жойылды.',
    'итог.выключеноБезСети': 'Хабарландыру осы телефонда өшірілді. Сервер деректерді келесі жіберуде өзі жояды.',
    'итог.закрыто': 'Рұқсат терезесі жабылды — хабарландыру қосылмады.',
    'итог.нетСети': 'AI Ustaz серверімен байланыс жоқ. Кейінірек көріңіз.',
    'итог.ошибка': 'Хабарландыруды қосу мүмкін болмады. Кейінірек көріңіз.',
    'итог.отправлено': 'Жіберілді. Хабарландыру бірнеше секундта келеді.',
    'итог.часто': 'Тексеруді бірнеше минуттан кейін қайталауға болады.',
    'итог.нетПодписки': 'Жазылым табылмады — хабарландыруды өшіріп, қайта қосыңыз.',
    состояние: '30 күндік кесте — {дата} дейін. AI Ustaz-ты ашқан сайын жаңарады.',
    пример: 'Былай көрінеді',
    примерТекст: 'Намаз уақыты кірді · {город}. Келесі — {намаз}, {время}',
    приватность: 'Не сақталады',
    приватностьТекст: 'Қазақстандағы AI Ustaz серверінде: браузер жазылымы (мекенжайы мен шифрлау кілттері), тіл, қала атауы және 30 күндік кесте. Координат, аты-жөн, телефон жоқ. Жарнамасыз, аналитикасыз. Өшірсеңіз — бәрі бірден жойылады.',
    звук: 'Дыбыс — телефоныңыздағы әдеттегі хабарландыру дыбысы.',
    черновик: 'Жоба',
  },
  uz: {
    заголовок: 'Namoz haqida bildirishnomalar',
    вступление: 'Namoz vaqti kirganda bildirishnoma — shahringiz uchun hisob boʻyicha. Namozlarni va oldindan eslatishni tanlash mumkin.',
    переключатель: 'Bildirishnomalarni yuborish',
    включены: 'Yoqilgan',
    выключены: 'Oʻchirilgan',
    пояснениеЗаголовок: 'Brauzer ruxsat soʻrashidan oldin',
    пояснение1: 'Tanlangan namozlar vaqti kirganda «Asr · 14:39» keladi va, xohlasangiz, oldindan eslatma. Faqat namoz vaqti — reklamasiz.',
    пояснение2: 'Koordinatalar yuborilmaydi: vaqtni telefoningiz hisoblaydi. Qozogʻistondagi AI Ustaz serveriga brauzer obunasi, til, shahar nomi va 30 kunlik jadval yuboriladi.',
    пояснение3: 'Bildirishnomalar yoqilgan ekan, saqlanadi. Shu yerda oʻchirsangiz — obuna va jadval serverdan darhol oʻchiriladi.',
    пояснение4: 'Jadval AI Ustazni ochganingizda yangilanadi. Uni qariyb bir oy ochmasangiz, bitta sokin eslatma keladi.',
    разрешить: 'Bildirishnomalarga ruxsat berish',
    неСейчас: 'Hozir emas',
    ждём: 'Yoqilmoqda…',
    отказЗаголовок: 'Brauzer bildirishnomalarni taqiqladi',
    отказТекст: 'Ruxsat sozlamalarda beriladi — AI Ustaz uni oʻzi yoqa olmaydi. Keyin shu yerga qaytib, tugmani yana yoqing.',
    отказAndroid: 'Android, Chrome: manzil chap tomonidagi belgi → «Ruxsatlar» (yoki «Sayt sozlamalari») → «Bildirishnomalar» → «Ruxsat berish». AI Ustaz ilovasi: telefon sozlamalari → «Ilovalar» → AI Ustaz → «Bildirishnomalar».',
    отказIOS: 'iPhone: «Sozlamalar» → «Bildirishnomalar» → AI Ustaz → «Bildirishnomalarga ruxsat».',
    отказКомпьютер: 'Kompyuter: manzil chap tomonidagi belgi → «Bildirishnomalar» → «Ruxsat berish», soʻng sahifani yangilang.',
    iosЗаголовок: 'iPhoneʼda — «Uy» ekranidan',
    iosТекст: 'iPhone saytlar bildirishnomalarini faqat «Uy» ekranidagi ilovaga yuboradi (iOS 16.4 va yangisi). AI Ustazni «Uy» ekraniga qoʻshing, uni oʻsha yerdan oching va bildirishnomalarni shu yerda yoqing.',
    iosКнопка: '«Uy» ekraniga qanday qoʻshiladi',
    iosСтарый: 'iPhoneʼda saytlar bildirishnomalari iOS 16.4 dan boshlab ishlaydi. Namoz vaqti haqida bildirishnoma olish uchun iOSni yangilang.',
    нетПоддержкиЗаголовок: 'Bu yerda bildirishnomalar mavjud emas',
    нетПоддержки: 'Bu brauzer saytlar bildirishnomalarini koʻrsatmaydi (masalan, Instagram yoki Telegram ichidagi brauzer). aiustaz.pro ni Androidʼda Chromeʼda yoki iPhoneʼda Safariʼda («Uy» ekranidan) oching.',
    batrЗаголовок: 'Bildirishnomalar — aiustaz.pro saytida',
    batrТекст: 'Namoz vaqti haqidagi bildirishnomalar AI Ustazning oʻz saytida — aiustaz.pro da, atrofida reklama va begona skriptlarsiz ishlaydi. Bu yerda, batr.kz saytida, ular yoʻq.',
    открытьСайт: 'aiustaz.pro ni ochish',
    какие: 'Qaysi vaqtlar',
    восходПодпись: 'Namoz emas: u bilan bomdod vaqti tugaydi',
    последний: 'Kamida bitta vaqt qolishi kerak',
    заранее: 'Oldindan eslatish',
    заранееПодпись: 'N daqiqa oldin eslatma — vaqt kirganidagi bildirishnomaga qoʻshimcha.',
    нет: 'Yoʻq',
    мин: '{n} daq.',
    группаЗаранее: 'Oldindan eslatish, daqiqa',
    город: 'Shahar',
    городПодпись: 'Namoz vaqti uchun tanlangan shahar',
    проверить: 'Bildirishnomani tekshirish',
    'итог.включено': 'Bildirishnomalar yoqildi. 30 kunlik jadval yuborildi.',
    'итог.выключено': 'Bildirishnomalar oʻchirildi. Obuna va jadval serverdan oʻchirildi.',
    'итог.выключеноБезСети': 'Bildirishnomalar shu telefonda oʻchirildi. Server maʼlumotlarni keyingi yuborishda oʻzi oʻchiradi.',
    'итог.закрыто': 'Ruxsat oynasi yopildi — bildirishnomalar yoqilmadi.',
    'итог.нетСети': 'AI Ustaz serveri bilan aloqa yoʻq. Keyinroq urinib koʻring.',
    'итог.ошибка': 'Bildirishnomalarni yoqib boʻlmadi. Keyinroq urinib koʻring.',
    'итог.отправлено': 'Yuborildi. Bildirishnoma bir necha soniyada keladi.',
    'итог.часто': 'Tekshiruvni bir necha daqiqadan keyin takrorlash mumkin.',
    'итог.нетПодписки': 'Obuna topilmadi — bildirishnomalarni oʻchirib, yana yoqing.',
    состояние: '30 kunlik jadval — {дата} gacha. AI Ustazni ochganingizda yangilanadi.',
    пример: 'Shunday koʻrinadi',
    примерТекст: 'Namoz vaqti kirdi · {город}. Keyingi — {намаз}, {время}',
    приватность: 'Nima saqlanadi',
    приватностьТекст: 'Qozogʻistondagi AI Ustaz serverida: brauzer obunasi (manzil va shifrlash kalitlari), til, shahar nomi va 30 kunlik jadval. Koordinatalar, ism, telefon yoʻq. Reklama va analitikasiz. Oʻchirdingiz — hammasi darhol oʻchiriladi.',
    звук: 'Ovoz — telefoningizning odatiy bildirishnoma ovozi.',
    черновик: 'Qoralama',
  },
  en: {
    заголовок: 'Prayer notifications',
    вступление: 'A notification at the start of each prayer time — calculated for your city. You can choose the prayers and an early reminder.',
    переключатель: 'Send notifications',
    включены: 'On',
    выключены: 'Off',
    пояснениеЗаголовок: 'Before the browser asks for permission',
    пояснение1: 'You will get “Asr · 14:39” at the start of the chosen prayer times and, if you like, an early reminder. Only the prayer time — no ads.',
    пояснение2: 'Coordinates are not sent: your phone calculates the times. The AI Ustaz server in Kazakhstan receives the browser subscription, the language, the city name and a 30-day schedule.',
    пояснение3: 'Stored while notifications are on. Turn them off here — the subscription and schedule are deleted from the server right away.',
    пояснение4: 'The schedule is updated when you open AI Ustaz. If you do not open it for almost a month, one quiet reminder will arrive.',
    разрешить: 'Allow notifications',
    неСейчас: 'Not now',
    ждём: 'Turning on…',
    отказЗаголовок: 'The browser blocked notifications',
    отказТекст: 'Permission is given in the settings — AI Ustaz cannot turn it on by itself. Then come back here and turn the switch on again.',
    отказAndroid: 'Android, Chrome: the icon left of the address → “Permissions” (or “Site settings”) → “Notifications” → “Allow”. AI Ustaz app: phone settings → “Apps” → AI Ustaz → “Notifications”.',
    отказIOS: 'iPhone: “Settings” → “Notifications” → AI Ustaz → “Allow Notifications”.',
    отказКомпьютер: 'Computer: the icon left of the address → “Notifications” → “Allow”, then refresh the page.',
    iosЗаголовок: 'On iPhone — from the Home Screen',
    iosТекст: 'iPhone delivers website notifications only to an app on the Home Screen (iOS 16.4 and later). Add AI Ustaz to the Home Screen, open it from there and turn on notifications here.',
    iosКнопка: 'How to add to the Home Screen',
    iosСтарый: 'Website notifications on iPhone work from iOS 16.4. Update iOS to get prayer time notifications.',
    нетПоддержкиЗаголовок: 'Notifications are not available here',
    нетПоддержки: 'This browser does not show website notifications (for example, the browser inside Instagram or Telegram). Open aiustaz.pro in Chrome on Android or in Safari on iPhone (from the Home Screen).',
    batrЗаголовок: 'Notifications — on aiustaz.pro',
    batrТекст: 'Prayer time notifications work on the AI Ustaz website itself — aiustaz.pro, with no ads and no third-party scripts around. Here, on batr.kz, they are not available.',
    открытьСайт: 'Open aiustaz.pro',
    какие: 'Which times',
    восходПодпись: 'Not a prayer: it ends the time of Fajr',
    последний: 'At least one time must remain',
    заранее: 'Remind in advance',
    заранееПодпись: 'A reminder N minutes before — in addition to the notification at the start of the time.',
    нет: 'None',
    мин: '{n} min',
    группаЗаранее: 'Remind in advance, minutes',
    город: 'City',
    городПодпись: 'The same as for prayer times',
    проверить: 'Test notification',
    'итог.включено': 'Notifications are on. The 30-day schedule has been sent.',
    'итог.выключено': 'Notifications are off. The subscription and schedule have been deleted from the server.',
    'итог.выключеноБезСети': 'Notifications are off on this phone. The server will delete the data itself on the next send.',
    'итог.закрыто': 'The permission window was closed — notifications are not on.',
    'итог.нетСети': 'No connection to the AI Ustaz server. Please try later.',
    'итог.ошибка': 'Could not turn on notifications. Please try later.',
    'итог.отправлено': 'Sent. The notification will arrive in a few seconds.',
    'итог.часто': 'You can repeat the test in a few minutes.',
    'итог.нетПодписки': 'Subscription not found — turn notifications off and on again.',
    состояние: 'Schedule for 30 days — until {дата}. Updated when you open AI Ustaz.',
    пример: 'This is how it will look',
    примерТекст: 'It is time for prayer · {город}. Next — {намаз} at {время}',
    приватность: 'What is stored',
    приватностьТекст: 'On the AI Ustaz server in Kazakhstan: the browser subscription (address and encryption keys), the language, the city name and a 30-day schedule. No coordinates, name or phone number. No ads or analytics. Turn it off — everything is deleted right away.',
    звук: "Sound — your phone's usual notification sound.",
    черновик: 'Draft',
  },
}, 'screens/NotificationsScreen');

type Итог = 'включено' | 'выключено' | 'выключеноБезСети' | 'закрыто' | 'нетСети' | 'ошибка' | 'отправлено' | 'часто' | 'нетПодписки';

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

function Пункты({ строки }: { строки: string[] }) {
  const { отступ, цвет } = useТема();
  return (
    <View style={{ gap: отступ.s }}>
      {строки.map((с, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: отступ.s }}>
          <Значок имя="галочка" размер={18} цвет={цвет.акцент} />
          <Текст стиль={{ flex: 1 }}>{с}</Текст>
        </View>
      ))}
    </View>
  );
}

export function Уведомления(_: ПропсыЭкрана<'уведомления'>) {
  const т = useСловарь(СЛОВАРЬ);
  const { язык } = useПеревод();
  const { перейти } = useНавигация();
  const { цвет, отступ, радиус } = useТема();
  const поддержка = useПоддержкаУведомлений();
  const { настройки, изменить } = useНастройкиУведомлений();
  const { место } = useМестоНамаза();
  const сейчас = useСейчас();
  const { день } = useДеньНамаза(место, сейчас);
  const [этап, установитьЭтап] = useState<'обычно' | 'пояснение' | 'ждём' | 'отказ'>('обычно');
  const [итог, установитьИтог] = useState<Итог | null>(null);
  const [проверка, установитьПроверку] = useState(false);

  const отказано = этап === 'отказ' || (настройки.включено && поддержка === 'можно' && разрешение() === 'denied');

  async function включитьСейчас() {
    установитьЭтап('ждём');
    установитьИтог(null);
    const момент = Date.now();
    const данные = данныеРасписания(место, язык, настройки, момент);
    const р = await включить(данные);
    if (р === 'включено') {
      await изменить({ включено: true, отправлено: момент, до: концаРасписания(данные.пункты) });
      отметитьОтправку(ключСинхронизации(место, язык, настройки, текущийМазхаб(), версияОфициальных()));
      установитьЭтап('обычно');
      установитьИтог('включено');
    } else if (р === 'отказ') {
      установитьЭтап('отказ');
    } else {
      установитьЭтап('обычно');
      установитьИтог(р === 'закрыто' ? 'закрыто' : р === 'нет-сети' ? 'нетСети' : 'ошибка');
    }
  }

  async function переключить(новое: boolean) {
    установитьИтог(null);
    if (!новое) {
      установитьЭтап('ждём');
      const р = await выключить();
      await изменить({ включено: false, отправлено: null, до: null });
      отметитьОтправку('');
      установитьЭтап('обычно');
      установитьИтог(р === 'выключено' ? 'выключено' : 'выключеноБезСети');
      return;
    }
    const п = разрешение();
    if (п === 'granted') void включитьСейчас();
    else if (п === 'denied') установитьЭтап('отказ');
    else установитьЭтап('пояснение'); // сначала наше пояснение, системный запрос — только по «Разрешить»
  }

  async function проверитьСейчас() {
    установитьПроверку(true);
    const р = await проверить();
    установитьПроверку(false);
    установитьИтог(р === 'отправлено' ? 'отправлено' : р === 'часто' ? 'часто' : р === 'нет-подписки' ? 'нетПодписки' : р === 'нет-сети' ? 'нетСети' : 'ошибка');
  }

  const выбрано = ПОРЯДОК.filter((к) => настройки.намазы[к]);
  const сайт = Platform.OS === 'web' ? ({ href: АДРЕС_НА_СВОЁМ } as object) : {};

  let основное: ReactNode;
  if (поддержка === 'batr') {
    основное = (
      <Блок заголовок={т('batrЗаголовок')} testID="уведомления-batr" вид="акцент">
        <Текст>{т('batrТекст')}</Текст>
        <Текст {...сайт} accessibilityRole="link" вид="кнопка" цвет={цвет.акцент} стиль={{ textDecorationLine: 'underline', paddingVertical: отступ.s }} testID="уведомления-открыть-сайт">
          {т('открытьСайт')}
        </Текст>
      </Блок>
    );
  } else if (поддержка === 'ios-домой') {
    основное = (
      <Блок заголовок={т('iosЗаголовок')} testID="уведомления-ios" вид="акцент">
        <Текст>{т('iosТекст')}</Текст>
        <Кнопка вид="основная" значок="наЭкранДомой" надпись={т('iosКнопка')} приНажатии={() => перейти('установка')} testID="уведомления-ios-установка" />
      </Блок>
    );
  } else if (поддержка === 'ios-старый') {
    основное = (
      <Блок заголовок={т('нетПоддержкиЗаголовок')} testID="уведомления-ios-старый">
        <Текст>{т('iosСтарый')}</Текст>
      </Блок>
    );
  } else if (поддержка === 'нет-поддержки') {
    основное = (
      <Блок заголовок={т('нетПоддержкиЗаголовок')} testID="уведомления-нет-поддержки">
        <Текст>{т('нетПоддержки')}</Текст>
      </Блок>
    );
  } else {
    const включено = настройки.включено && !отказано;
    основное = (
      <>
        <СтрокаПереключателя
          вид="карточка"
          значок={включено ? 'колокол' : 'колоколВыкл'}
          заголовок={т('переключатель')}
          подпись={этап === 'ждём' ? т('ждём') : включено ? т('включены') : т('выключены')}
          включено={включено}
          отключена={этап === 'ждём'}
          приСмене={(н) => void переключить(н)}
          testID="уведомления-переключатель"
        />

        {этап === 'пояснение' ? (
          <Блок заголовок={т('пояснениеЗаголовок')} testID="уведомления-пояснение" вид="акцент">
            <Пункты строки={[т('пояснение1'), т('пояснение2'), т('пояснение3'), т('пояснение4')]} />
            <Кнопка вид="основная" значок="колокол" надпись={т('разрешить')} приНажатии={() => void включитьСейчас()} testID="уведомления-разрешить" />
            <Кнопка вид="тихая" надпись={т('неСейчас')} приНажатии={() => установитьЭтап('обычно')} testID="уведомления-не-сейчас" />
          </Блок>
        ) : null}

        {отказано ? (
          <Блок заголовок={т('отказЗаголовок')} testID="уведомления-отказ" вид="акцент">
            <Текст>{т('отказТекст')}</Текст>
            <Пункты строки={[т('отказAndroid'), т('отказIOS'), т('отказКомпьютер')]} />
          </Блок>
        ) : null}

        {итог ? (
          <View aria-live="polite" testID="уведомления-итог" style={{ padding: отступ.m, borderRadius: радиус.m, backgroundColor: цвет.поверхностьАкцент }}>
            <Текст>{т(`итог.${итог}`)}</Текст>
          </View>
        ) : null}

        {включено ? (
          <View style={{ gap: отступ.s }}>
            <Кнопка вид="вторичная" значок="колокол" надпись={т('проверить')} отключена={проверка} приНажатии={() => void проверитьСейчас()} testID="уведомления-проверить" />
            {настройки.до ? (
              <Текст вид="мелкий" testID="уведомления-состояние">
                {т('состояние', { дата: датаДня(деньРК(настройки.до, место.пояс), язык) })}
              </Текст>
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: отступ.xs }} testID="уведомления-намазы">
          <Текст вид="подзаголовок" accessibilityRole="header" уровень={2}>
            {т('какие')}
          </Текст>
          {ПОРЯДОК.map((к: КлючВремени) => {
            const последний = выбрано.length === 1 && настройки.намазы[к];
            return (
              <СтрокаПереключателя
                key={к}
                заголовок={НАЗВАНИЯ[к][язык]}
                подпись={к === 'sunrise' ? т('восходПодпись') : последний ? т('последний') : undefined}
                значение={день ? чч_мм(день.сегодня[к], место.пояс) : undefined}
                включено={настройки.намазы[к]}
                отключена={последний || этап === 'ждём'}
                приСмене={(н) => void изменить({ намазы: { ...настройки.намазы, [к]: н } })}
                testID={'уведомления-намаз-' + к}
              />
            );
          })}
        </View>

        <View style={{ gap: отступ.s }}>
          <Текст вид="подзаголовок" accessibilityRole="header" уровень={2}>
            {т('заранее')}
          </Текст>
          <Текст вид="мелкий">{т('заранееПодпись')}</Текст>
          <Вкладки
            роль="выбор"
            подпись={т('группаЗаранее')}
            вкладки={ВАРИАНТЫ_ЗАРАНЕЕ.map((n) => ({ ключ: String(n), надпись: n === 0 ? т('нет') : т('мин', { n }), testID: 'заранее-' + n }))}
            выбрана={String(настройки.заранее)}
            приВыборе={(к) => void изменить({ заранее: Number(к) as Заранее })}
            testID="уведомления-заранее"
          />
        </View>

        <СтрокаСписка заголовок={т('город')} подпись={т('городПодпись')} значение={названиеМеста(место, язык)} значок="город" приНажатии={() => перейти('городНамаза')} testID="уведомления-город" />

        {день ? (
          <View style={{ gap: отступ.s }} testID="уведомления-пример">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.s }}>
              <Текст вид="подзаголовок" accessibilityRole="header" уровень={2}>
                {т('пример')}
              </Текст>
              <Плашка вид="черновик" малая надпись={т('черновик')} />
            </View>
            <View style={{ flexDirection: 'row', gap: отступ.m, padding: отступ.m, borderRadius: радиус.l, backgroundColor: цвет.поверхность, borderWidth: 1, borderColor: цвет.граница }}>
              <View aria-hidden style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: цвет.геройФон }}>
                <Значок имя="колокол" размер={20} цвет={цвет.геройТекст} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Текст вид="мелкий">AI Ustaz</Текст>
                <Текст стиль={{ fontWeight: '600' }}>{`${НАЗВАНИЯ.asr[язык]} · ${чч_мм(день.сегодня.asr, место.пояс)}`}</Текст>
                <Текст вид="мелкий">{т('примерТекст', { город: названиеМеста(место, язык), намаз: НАЗВАНИЯ.maghrib[язык], время: чч_мм(день.сегодня.maghrib, место.пояс) })}</Текст>
              </View>
            </View>
            <Текст вид="мелкий" testID="уведомления-звук">
              {т('звук')}
            </Текст>
          </View>
        ) : null}
      </>
    );
  }

  return (
    <Экран заголовок={т('заголовок')} testID="экран-уведомления">
      <Текст вид="второй">{т('вступление')}</Текст>
      {основное}
      <Блок заголовок={т('приватность')} testID="уведомления-приватность">
        <Текст>{т('приватностьТекст')}</Текст>
      </Блок>
    </Экран>
  );
}
