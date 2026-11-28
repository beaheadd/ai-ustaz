/**
 * «Вход и прогресс» (#/account) — ленивый чанк (screens/index.ts). Вход по желанию: без него всё работает как раньше.
 *
 * Владелец 28.11.2026: «Ты лучше создай вход, чтобы кто хочет, мог заходить входом, и у него прогресс сохраняется. И с
 * другого устройства он также может зайти с сохраненным прогрессом. И тогда ты смело можешь сделать мне вход на мой
 * аккаунт»; «Создай кнопку входа и привяжи вход через почту, отправляем код. Google авторизация»; «Код четырёхзначный».
 * Дизайн — docs/дизайн/13-аккаунт-и-синхронизация.md; сервер — server/account.py; синхронизация — account/sync.ts.
 *
 * Не вошли: что хранится, где и как удалить (простыми словами) → «Мне 16 лет или больше» (без отметки входа нет) →
 *   почта → «Получить код» → 4 цифры (одно поле, autocomplete one-time-code, вход сразу после 4-й цифры);
 *   «Войти через Google» — только если на сервере задан client ID (/api/account/config); скрипт Google
 *   (accounts.google.com/gsi/client) грузится ТОЛЬКО по нажатию: без нажатия Google не узнаёт о посещении.
 * Вошли: почта, «Синхронизировано: …», «Синхронизировать сейчас», «Сохранять суммы закята в аккаунте» (выкл.),
 *   «Админ-панель» (если почта — админ), «Скачать мои данные», «Выйти», «Выйти на всех устройствах», «Удалить аккаунт».
 * testID: экран-аккаунт, аккаунт-16, аккаунт-почта, аккаунт-получить-код, аккаунт-код, аккаунт-google, аккаунт-google-кнопка,
 *   аккаунт-ошибка, аккаунт-почта-вошли, аккаунт-статус, аккаунт-синхронизировать, аккаунт-закят, аккаунт-админка,
 *   аккаунт-скачать, аккаунт-выйти, аккаунт-выйти-везде, аккаунт-удалить, аккаунт-удалить-да, аккаунт-готово.
 */
import { useEffect, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { Кнопка, СтрокаПереключателя, СтрокаСписка, Текст, Экран } from '../components';
import type { ПропсыЭкрана } from '../engine/routes';
import { ЛОКАЛЬ_INTL, создатьСловарь, useПеревод, useСловарь } from '../i18n';
import { ШРИФТ_ИНТЕРФЕЙСА, useТема } from '../theme';
import * as api from '../account/api';
import { входДоступен, задатьАккаунт, обновитьАккаунт, useАккаунт } from '../account/state';
import { забытьСинхронизацию, остановитьСинхронизацию, запуститьСинхронизацию, синхронизировать } from '../account/sync';
import { войтиЧерезGoogle } from '../account/google';

const СЛОВАРЬ = создатьСловарь({
  ru: {
    заголовок: 'Вход и прогресс',
    вступление: 'Войдите, чтобы прогресс сохранялся и был на всех ваших устройствах. Без входа всё работает как раньше — только на этом устройстве.',
    чтоХранится: 'Что хранится',
    чтоХранитсяТекст: 'Почта и ваш прогресс: уроки, счёт зикров и избранное, место чтения и закладка Корана, настройки (язык, тема, город, аср, чтец). Суммы закята — только если сами включите. История чата, голос и фото не сохраняются.',
    где: 'Где',
    гдеТекст: 'На сервере AI Ustaz в Казахстане. Мы не продаём и не передаём ваши данные.',
    какУдалить: 'Как удалить',
    какУдалитьТекст: 'Здесь же — «Удалить аккаунт»: всё удаляется с сервера сразу. «Скачать мои данные» — файл со всем, что хранится.',
    возраст: 'Мне 16 лет или больше',
    возрастПодпись: 'Аккаунт — только с 16 лет',
    почта: 'Почта',
    получитьКод: 'Получить код',
    или: 'или',
    google: 'Войти через Google',
    googleДальше: 'Нажмите кнопку Google ниже',
    googleПояснение: 'Google передаст нам только почту и номер аккаунта — без имени и фото.',
    кодОтправлен: 'Код отправлен на {почта}. Письмо может попасть в «Спам».',
    код: 'Код из письма (4 цифры)',
    войти: 'Войти',
    ещёКод: 'Отправить код ещё раз',
    другаяПочта: 'Другая почта',
    готово: 'Готово! Прогресс сохраняется в аккаунте.',
    вошли: 'Вы вошли: {почта}',
    синхронизировано: 'Синхронизировано: {когда}',
    толькоЧто: 'только что',
    сегодня: 'сегодня в {время}',
    ещёНет: 'ещё нет',
    идёт: 'Синхронизируем…',
    нетСети: 'Нет связи — синхронизируем, когда появится',
    ошибкаСинх: 'Не удалось синхронизировать — попробуем ещё раз',
    синхронизировать: 'Синхронизировать сейчас',
    закят: 'Сохранять суммы закята в аккаунте',
    закятВкл: 'Включено: суммы закята — и на других устройствах',
    закятВыкл: 'Выключено: суммы закята — только на этом устройстве',
    админка: 'Админ-панель',
    админкаПодпись: 'Открыть без второго кода',
    скачать: 'Скачать мои данные',
    выйти: 'Выйти',
    выйтиПодпись: 'На этом устройстве всё останется',
    выйтиВезде: 'Выйти на всех устройствах',
    удалить: 'Удалить аккаунт',
    удалитьВопрос: 'Удалить аккаунт и все данные на сервере? На этом устройстве всё останется.',
    удалитьДа: 'Удалить',
    отмена: 'Отмена',
    недоступно: 'Вход доступен на aiustaz.pro.',
    'ош.code': 'Неверный или устаревший код',
    'ош.age': 'Отметьте, что вам 16 лет или больше',
    'ош.email': 'Проверьте почту',
    'ош.rate': 'Слишком много попыток — попробуйте позже',
    'ош.mail': 'Письмо не отправилось — попробуйте позже',
    'ош.сеть': 'Нет связи — попробуйте позже',
    'ош.google': 'Не удалось войти через Google',
    'ош.общая': 'Что-то пошло не так — попробуйте ещё раз',
  },
  kk: {
    заголовок: 'Кіру және прогресс',
    вступление: 'Прогресс сақталып, барлық құрылғыңызда болуы үшін кіріңіз. Кірмесеңіз, бәрі бұрынғыдай — тек осы құрылғыда.',
    чтоХранится: 'Не сақталады',
    чтоХранитсяТекст: 'Пошта және прогрессіңіз: сабақтар, зікір саны мен таңдаулылар, Құран оқу орны мен бетбелгі, баптаулар (тіл, тақырып, қала, асыр, қари). Зекет сомалары — тек өзіңіз қоссаңыз. Чат тарихы, дауыс пен фото сақталмайды.',
    где: 'Қайда',
    гдеТекст: 'Қазақстандағы AI Ustaz серверінде. Деректеріңізді сатпаймыз және бермейміз.',
    какУдалить: 'Қалай жою',
    какУдалитьТекст: 'Осында — «Аккаунтты жою»: бәрі серверден бірден жойылады. «Деректерімді жүктеу» — сақталғанның бәрі бар файл.',
    возраст: 'Маған 16 жас немесе одан көп',
    возрастПодпись: 'Аккаунт — тек 16 жастан',
    почта: 'Пошта',
    получитьКод: 'Код алу',
    или: 'немесе',
    google: 'Google арқылы кіру',
    googleДальше: 'Төмендегі Google батырмасын басыңыз',
    googleПояснение: 'Google бізге тек поштаны және аккаунт нөмірін береді — атсыз және фотосыз.',
    кодОтправлен: 'Код {почта} поштасына жіберілді. Хат «Спам» қалтасына түсуі мүмкін.',
    код: 'Хаттағы код (4 сан)',
    войти: 'Кіру',
    ещёКод: 'Кодты қайта жіберу',
    другаяПочта: 'Басқа пошта',
    готово: 'Дайын! Прогресс аккаунтта сақталады.',
    вошли: 'Сіз кірдіңіз: {почта}',
    синхронизировано: 'Үндестірілді: {когда}',
    толькоЧто: 'жаңа ғана',
    сегодня: 'бүгін {время}',
    ещёНет: 'әлі жоқ',
    идёт: 'Үндестіріп жатырмыз…',
    нетСети: 'Байланыс жоқ — пайда болғанда үндестіреміз',
    ошибкаСинх: 'Үндестіру сәтсіз — тағы көреміз',
    синхронизировать: 'Қазір үндестіру',
    закят: 'Зекет сомаларын аккаунтта сақтау',
    закятВкл: 'Қосулы: зекет сомалары басқа құрылғыларда да',
    закятВыкл: 'Өшірулі: зекет сомалары тек осы құрылғыда',
    админка: 'Әкімші панелі',
    админкаПодпись: 'Екінші кодсыз ашу',
    скачать: 'Деректерімді жүктеу',
    выйти: 'Шығу',
    выйтиПодпись: 'Осы құрылғыда бәрі қалады',
    выйтиВезде: 'Барлық құрылғыдан шығу',
    удалить: 'Аккаунтты жою',
    удалитьВопрос: 'Аккаунт пен сервердегі барлық деректер жойылсын ба? Осы құрылғыда бәрі қалады.',
    удалитьДа: 'Жою',
    отмена: 'Болдырмау',
    недоступно: 'Кіру aiustaz.pro сайтында.',
    'ош.code': 'Код қате немесе ескірген',
    'ош.age': '16 жас немесе одан көп екеніңізді белгілеңіз',
    'ош.email': 'Поштаны тексеріңіз',
    'ош.rate': 'Әрекет тым көп — кейінірек көріңіз',
    'ош.mail': 'Хат жіберілмеді — кейінірек көріңіз',
    'ош.сеть': 'Байланыс жоқ — кейінірек көріңіз',
    'ош.google': 'Google арқылы кіру сәтсіз',
    'ош.общая': 'Бірдеңе дұрыс болмады — қайта көріңіз',
  },
  uz: {
    заголовок: 'Kirish va natijalar',
    вступление: 'Natijalaringiz saqlanib, barcha qurilmalaringizda boʻlishi uchun kiring. Kirmasangiz ham hammasi avvalgidek ishlaydi — faqat shu qurilmada.',
    чтоХранится: 'Nima saqlanadi',
    чтоХранитсяТекст: 'Pochta va natijalaringiz: darslar, zikrlar hisobi va saralanganlar, Qurʼon oʻqish joyi va xatchoʻp, sozlamalar (til, mavzu, shahar, asr, qori). Zakot summalari — faqat oʻzingiz yoqsangiz. Chat tarixi, ovoz va rasmlar saqlanmaydi.',
    где: 'Qayerda',
    гдеТекст: 'Qozogʻistondagi AI Ustaz serverida. Maʼlumotlaringizni sotmaymiz va bermaymiz.',
    какУдалить: 'Qanday oʻchirish',
    какУдалитьТекст: 'Shu yerda — «Akkauntni oʻchirish»: hammasi serverdan darhol oʻchadi. «Maʼlumotlarimni yuklab olish» — saqlangan hamma narsa bilan fayl.',
    возраст: 'Men 16 yoshdaman yoki kattaroqman',
    возрастПодпись: 'Akkaunt — faqat 16 yoshdan',
    почта: 'Pochta',
    получитьКод: 'Kod olish',
    или: 'yoki',
    google: 'Google orqali kirish',
    googleДальше: 'Pastdagi Google tugmasini bosing',
    googleПояснение: 'Google bizga faqat pochta va akkaunt raqamini beradi — ism va rasmsiz.',
    кодОтправлен: 'Kod {почта} manziliga yuborildi. Xat «Spam»ga tushishi mumkin.',
    код: 'Xatdagi kod (4 raqam)',
    войти: 'Kirish',
    ещёКод: 'Kodni qayta yuborish',
    другаяПочта: 'Boshqa pochta',
    готово: 'Tayyor! Natijalar akkauntda saqlanadi.',
    вошли: 'Siz kirdingiz: {почта}',
    синхронизировано: 'Sinxronlandi: {когда}',
    толькоЧто: 'hozirgina',
    сегодня: 'bugun {время}',
    ещёНет: 'hali yoʻq',
    идёт: 'Sinxronlanmoqda…',
    нетСети: 'Aloqa yoʻq — paydo boʻlganda sinxronlaymiz',
    ошибкаСинх: 'Sinxronlab boʻlmadi — yana urinib koʻramiz',
    синхронизировать: 'Hozir sinxronlash',
    закят: 'Zakot summalarini akkauntda saqlash',
    закятВкл: 'Yoqilgan: zakot summalari boshqa qurilmalarda ham',
    закятВыкл: 'Oʻchirilgan: zakot summalari faqat shu qurilmada',
    админка: 'Admin panel',
    админкаПодпись: 'Ikkinchi kodsiz ochish',
    скачать: 'Maʼlumotlarimni yuklab olish',
    выйти: 'Chiqish',
    выйтиПодпись: 'Shu qurilmada hammasi qoladi',
    выйтиВезде: 'Barcha qurilmalardan chiqish',
    удалить: 'Akkauntni oʻchirish',
    удалитьВопрос: 'Akkaunt va serverdagi barcha maʼlumotlar oʻchirilsinmi? Shu qurilmada hammasi qoladi.',
    удалитьДа: 'Oʻchirish',
    отмена: 'Bekor qilish',
    недоступно: 'Kirish aiustaz.pro saytida.',
    'ош.code': 'Kod notoʻgʻri yoki eskirgan',
    'ош.age': '16 yoshda yoki kattaroq ekaningizni belgilang',
    'ош.email': 'Pochtani tekshiring',
    'ош.rate': 'Urinishlar juda koʻp — keyinroq urinib koʻring',
    'ош.mail': 'Xat yuborilmadi — keyinroq urinib koʻring',
    'ош.сеть': 'Aloqa yoʻq — keyinroq urinib koʻring',
    'ош.google': 'Google orqali kirib boʻlmadi',
    'ош.общая': 'Nimadir xato ketdi — qayta urinib koʻring',
  },
  en: {
    заголовок: 'Sign in and progress',
    вступление: 'Sign in to keep your progress and have it on all your devices. Without signing in everything works as before — on this device only.',
    чтоХранится: 'What is stored',
    чтоХранитсяТекст: 'Your email and progress: lessons, dhikr counts and favourites, your Quran reading place and bookmark, settings (language, theme, city, Asr, reciter). Zakat amounts — only if you turn it on. Chat history, voice and photos are not stored.',
    где: 'Where',
    гдеТекст: 'On the AI Ustaz server in Kazakhstan. We do not sell or share your data.',
    какУдалить: 'How to delete',
    какУдалитьТекст: 'Right here — “Delete account”: everything is removed from the server at once. “Download my data” — a file with everything stored.',
    возраст: 'I am 16 or older',
    возрастПодпись: 'Accounts are for 16+ only',
    почта: 'Email',
    получитьКод: 'Get a code',
    или: 'or',
    google: 'Sign in with Google',
    googleДальше: 'Tap the Google button below',
    googleПояснение: 'Google gives us only your email and account number — no name or photo.',
    кодОтправлен: 'We sent a code to {почта}. Check your Spam folder too.',
    код: 'Code from the email (4 digits)',
    войти: 'Sign in',
    ещёКод: 'Send the code again',
    другаяПочта: 'Different email',
    готово: 'Done! Your progress is saved to your account.',
    вошли: 'Signed in: {почта}',
    синхронизировано: 'Synced: {когда}',
    толькоЧто: 'just now',
    сегодня: 'today at {время}',
    ещёНет: 'not yet',
    идёт: 'Syncing…',
    нетСети: 'No connection — will sync when back online',
    ошибкаСинх: 'Could not sync — will try again',
    синхронизировать: 'Sync now',
    закят: 'Save zakat amounts to the account',
    закятВкл: 'On: zakat amounts on your other devices too',
    закятВыкл: 'Off: zakat amounts stay on this device only',
    админка: 'Admin panel',
    админкаПодпись: 'Open without a second code',
    скачать: 'Download my data',
    выйти: 'Sign out',
    выйтиПодпись: 'Everything stays on this device',
    выйтиВезде: 'Sign out on all devices',
    удалить: 'Delete account',
    удалитьВопрос: 'Delete the account and all data on the server? Everything stays on this device.',
    удалитьДа: 'Delete',
    отмена: 'Cancel',
    недоступно: 'Sign-in is available on aiustaz.pro.',
    'ош.code': 'Wrong or expired code',
    'ош.age': 'Please confirm you are 16 or older',
    'ош.email': 'Check the email address',
    'ош.rate': 'Too many attempts — try again later',
    'ош.mail': 'The email was not sent — try again later',
    'ош.сеть': 'No connection — try again later',
    'ош.google': 'Could not sign in with Google',
    'ош.общая': 'Something went wrong — please try again',
  },
  // ar — черновик для редактора-носителя (владелец 28.11.2026); здесь, а не в lang-ar.json: чанк языка ≤ 110 КБ,
  // а этот экран грузится отдельным чанком только при открытии.
  ar: {
    заголовок: "تسجيل الدخول والتقدّم",
    вступление: "سجّل الدخول ليُحفظ تقدّمك ويكون على جميع أجهزتك. بدون تسجيل الدخول يعمل كل شيء كما كان — على هذا الجهاز فقط.",
    чтоХранится: "ما الذي يُحفظ",
    чтоХранитсяТекст: "بريدك الإلكتروني وتقدّمك: الدروس، وعدد الأذكار والمفضّلة، وموضع القراءة والعلامة في القرآن، والإعدادات (اللغة، المظهر، المدينة، العصر، القارئ). مبالغ الزكاة — فقط إن فعّلتها بنفسك. لا يُحفظ سجلّ المحادثة ولا الصوت ولا الصور.",
    где: "أين",
    гдеТекст: "على خادم AI Ustaz في كازاخستان. لا نبيع بياناتك ولا ننقلها.",
    какУдалить: "كيف تحذف",
    какУдалитьТекст: "هنا — «حذف الحساب»: يُحذف كل شيء من الخادم فورًا. «تنزيل بياناتي» — ملف بكل ما هو محفوظ.",
    возраст: "عمري 16 سنة أو أكثر",
    возрастПодпись: "الحساب لمن هم في سن 16 فما فوق فقط",
    почта: "البريد الإلكتروني",
    получитьКод: "الحصول على الرمز",
    или: "أو",
    google: "تسجيل الدخول عبر Google",
    googleДальше: "اضغط زر Google أدناه",
    googleПояснение: "يعطينا Google بريدك الإلكتروني ورقم الحساب فقط — بلا اسم ولا صورة.",
    кодОтправлен: "أرسلنا الرمز إلى {почта}. قد تصل الرسالة إلى «البريد المزعج».",
    код: "الرمز من الرسالة (4 أرقام)",
    войти: "دخول",
    ещёКод: "إرسال الرمز مرة أخرى",
    другаяПочта: "بريد آخر",
    готово: "تم! يُحفظ تقدّمك في الحساب.",
    вошли: "سجّلت الدخول: {почта}",
    синхронизировано: "تمّت المزامنة: {когда}",
    толькоЧто: "الآن",
    сегодня: "اليوم في {время}",
    ещёНет: "ليس بعد",
    идёт: "جارٍ المزامنة…",
    нетСети: "لا يوجد اتصال — سنزامن عند عودته",
    ошибкаСинх: "تعذّرت المزامنة — سنحاول مرة أخرى",
    синхронизировать: "مزامنة الآن",
    закят: "حفظ مبالغ الزكاة في الحساب",
    закятВкл: "مفعّل: مبالغ الزكاة على أجهزتك الأخرى أيضًا",
    закятВыкл: "متوقّف: مبالغ الزكاة على هذا الجهاز فقط",
    админка: "لوحة الإدارة",
    админкаПодпись: "فتحها بلا رمز ثانٍ",
    скачать: "تنزيل بياناتي",
    выйти: "تسجيل الخروج",
    выйтиПодпись: "يبقى كل شيء على هذا الجهاز",
    выйтиВезде: "تسجيل الخروج من جميع الأجهزة",
    удалить: "حذف الحساب",
    удалитьВопрос: "هل تحذف الحساب وكل البيانات على الخادم؟ يبقى كل شيء على هذا الجهاز.",
    удалитьДа: "حذف",
    отмена: "إلغاء",
    недоступно: "تسجيل الدخول متاح على aiustaz.pro.",
    'ош.code': "الرمز غير صحيح أو منتهي الصلاحية",
    'ош.age': "أكّد أن عمرك 16 سنة أو أكثر",
    'ош.email': "تحقّق من البريد الإلكتروني",
    'ош.rate': "محاولات كثيرة — حاول لاحقًا",
    'ош.mail': "لم تُرسل الرسالة — حاول لاحقًا",
    'ош.сеть': "لا يوجد اتصال — حاول لاحقًا",
    'ош.google': "تعذّر تسجيل الدخول عبر Google",
    'ош.общая': "حدث خطأ — حاول مرة أخرى",
  },
  tr: {
    заголовок: "Giriş ve ilerleme",
    вступление: "İlerlemen kaydedilsin ve tüm cihazlarında olsun diye giriş yap. Giriş yapmadan her şey eskisi gibi çalışır — yalnızca bu cihazda.",
    чтоХранится: "Ne saklanır",
    чтоХранитсяТекст: "E-postan ve ilerlemen: dersler, zikir sayıları ve favoriler, Kuran okuma yerin ve yer imin, ayarlar (dil, tema, şehir, ikindi, kari). Zekât tutarları — yalnızca kendin açarsan. Sohbet geçmişi, ses ve fotoğraflar saklanmaz.",
    где: "Nerede",
    гдеТекст: "Kazakistan'daki AI Ustaz sunucusunda. Verilerini satmayız ve paylaşmayız.",
    какУдалить: "Nasıl silinir",
    какУдалитьТекст: "Burada — “Hesabı sil”: her şey sunucudan hemen silinir. “Verilerimi indir” — saklanan her şeyin olduğu bir dosya.",
    возраст: "16 yaşında veya daha büyüğüm",
    возрастПодпись: "Hesap yalnızca 16 yaş ve üzeri için",
    почта: "E-posta",
    получитьКод: "Kod al",
    или: "veya",
    google: "Google ile giriş yap",
    googleДальше: "Aşağıdaki Google düğmesine dokun",
    googleПояснение: "Google bize yalnızca e-postanı ve hesap numaranı verir — ad ve fotoğraf olmadan.",
    кодОтправлен: "Kodu {почта} adresine gönderdik. Spam klasörüne de bak.",
    код: "E-postadaki kod (4 rakam)",
    войти: "Giriş yap",
    ещёКод: "Kodu yeniden gönder",
    другаяПочта: "Başka e-posta",
    готово: "Tamam! İlerlemen hesabına kaydediliyor.",
    вошли: "Giriş yapıldı: {почта}",
    синхронизировано: "Eşitlendi: {когда}",
    толькоЧто: "az önce",
    сегодня: "bugün {время}",
    ещёНет: "henüz değil",
    идёт: "Eşitleniyor…",
    нетСети: "Bağlantı yok — gelince eşitleyeceğiz",
    ошибкаСинх: "Eşitlenemedi — yeniden deneyeceğiz",
    синхронизировать: "Şimdi eşitle",
    закят: "Zekât tutarlarını hesapta sakla",
    закятВкл: "Açık: zekât tutarları diğer cihazlarında da",
    закятВыкл: "Kapalı: zekât tutarları yalnızca bu cihazda",
    админка: "Yönetim paneli",
    админкаПодпись: "İkinci kod olmadan aç",
    скачать: "Verilerimi indir",
    выйти: "Çıkış yap",
    выйтиПодпись: "Bu cihazda her şey kalır",
    выйтиВезде: "Tüm cihazlardan çıkış yap",
    удалить: "Hesabı sil",
    удалитьВопрос: "Hesap ve sunucudaki tüm veriler silinsin mi? Bu cihazda her şey kalır.",
    удалитьДа: "Sil",
    отмена: "Vazgeç",
    недоступно: "Giriş aiustaz.pro üzerinde yapılabilir.",
    'ош.code': "Kod yanlış veya süresi dolmuş",
    'ош.age': "16 yaşında veya daha büyük olduğunu işaretle",
    'ош.email': "E-posta adresini kontrol et",
    'ош.rate': "Çok fazla deneme — daha sonra dene",
    'ош.mail': "E-posta gönderilemedi — daha sonra dene",
    'ош.сеть': "Bağlantı yok — daha sonra dene",
    'ош.google': "Google ile giriş yapılamadı",
    'ош.общая': "Bir şeyler ters gitti — yeniden dene",
  },
  id: {
    заголовок: "Masuk dan kemajuan",
    вступление: "Masuk agar kemajuan Anda tersimpan dan ada di semua perangkat. Tanpa masuk, semuanya tetap berjalan seperti biasa — hanya di perangkat ini.",
    чтоХранится: "Apa yang disimpan",
    чтоХранитсяТекст: "Email dan kemajuan Anda: pelajaran, hitungan zikir dan favorit, posisi baca dan penanda Al-Qur'an, pengaturan (bahasa, tema, kota, Asar, qari). Jumlah zakat — hanya jika Anda menyalakannya. Riwayat obrolan, suara, dan foto tidak disimpan.",
    где: "Di mana",
    гдеТекст: "Di server AI Ustaz di Kazakhstan. Kami tidak menjual atau membagikan data Anda.",
    какУдалить: "Cara menghapus",
    какУдалитьТекст: "Di sini — “Hapus akun”: semuanya langsung dihapus dari server. “Unduh data saya” — berkas berisi semua yang disimpan.",
    возраст: "Saya berusia 16 tahun atau lebih",
    возрастПодпись: "Akun hanya untuk usia 16+",
    почта: "Email",
    получитьКод: "Dapatkan kode",
    или: "atau",
    google: "Masuk dengan Google",
    googleДальше: "Ketuk tombol Google di bawah",
    googleПояснение: "Google hanya memberi kami email dan nomor akun Anda — tanpa nama dan foto.",
    кодОтправлен: "Kami mengirim kode ke {почта}. Periksa juga folder Spam.",
    код: "Kode dari email (4 angka)",
    войти: "Masuk",
    ещёКод: "Kirim ulang kode",
    другаяПочта: "Email lain",
    готово: "Selesai! Kemajuan Anda tersimpan di akun.",
    вошли: "Masuk sebagai: {почта}",
    синхронизировано: "Disinkronkan: {когда}",
    толькоЧто: "baru saja",
    сегодня: "hari ini pukul {время}",
    ещёНет: "belum",
    идёт: "Menyinkronkan…",
    нетСети: "Tidak ada koneksi — akan disinkronkan saat kembali",
    ошибкаСинх: "Gagal menyinkronkan — akan dicoba lagi",
    синхронизировать: "Sinkronkan sekarang",
    закят: "Simpan jumlah zakat di akun",
    закятВкл: "Aktif: jumlah zakat juga di perangkat lain",
    закятВыкл: "Nonaktif: jumlah zakat hanya di perangkat ini",
    админка: "Panel admin",
    админкаПодпись: "Buka tanpa kode kedua",
    скачать: "Unduh data saya",
    выйти: "Keluar",
    выйтиПодпись: "Semuanya tetap di perangkat ini",
    выйтиВезде: "Keluar dari semua perangkat",
    удалить: "Hapus akun",
    удалитьВопрос: "Hapus akun dan semua data di server? Semuanya tetap di perangkat ini.",
    удалитьДа: "Hapus",
    отмена: "Batal",
    недоступно: "Masuk tersedia di aiustaz.pro.",
    'ош.code': "Kode salah atau kedaluwarsa",
    'ош.age': "Konfirmasi bahwa Anda berusia 16 tahun atau lebih",
    'ош.email': "Periksa alamat email",
    'ош.rate': "Terlalu banyak percobaan — coba lagi nanti",
    'ош.mail': "Email tidak terkirim — coba lagi nanti",
    'ош.сеть': "Tidak ada koneksi — coba lagi nanti",
    'ош.google': "Gagal masuk dengan Google",
    'ош.общая': "Terjadi kesalahan — coba lagi",
  },
  ur: {
    заголовок: "سائن اِن اور پیش رفت",
    вступление: "سائن اِن کریں تاکہ آپ کی پیش رفت محفوظ رہے اور آپ کے تمام آلات پر ہو۔ سائن اِن کے بغیر سب کچھ پہلے کی طرح چلتا ہے — صرف اسی آلے پر۔",
    чтоХранится: "کیا محفوظ ہوتا ہے",
    чтоХранитсяТекст: "آپ کا ای میل اور پیش رفت: اسباق، اذکار کی گنتی اور پسندیدہ، قرآن میں پڑھنے کی جگہ اور نشان، ترتیبات (زبان، تھیم، شہر، عصر، قاری)۔ زکوٰۃ کی رقمیں — صرف اگر آپ خود آن کریں۔ چیٹ کی تاریخ، آواز اور تصاویر محفوظ نہیں ہوتیں۔",
    где: "کہاں",
    гдеТекст: "قازقستان میں AI Ustaz کے سرور پر۔ ہم آپ کا ڈیٹا نہ بیچتے ہیں نہ کسی کو دیتے ہیں۔",
    какУдалить: "کیسے حذف کریں",
    какУдалитьТекст: "یہیں — «اکاؤنٹ حذف کریں»: سب کچھ سرور سے فوراً حذف ہو جاتا ہے۔ «میرا ڈیٹا ڈاؤن لوڈ کریں» — محفوظ ہر چیز کی فائل۔",
    возраст: "میری عمر 16 سال یا زیادہ ہے",
    возрастПодпись: "اکاؤنٹ صرف 16 سال اور زیادہ عمر کے لیے",
    почта: "ای میل",
    получитьКод: "کوڈ حاصل کریں",
    или: "یا",
    google: "Google کے ذریعے سائن اِن",
    googleДальше: "نیچے Google کا بٹن دبائیں",
    googleПояснение: "Google ہمیں صرف آپ کا ای میل اور اکاؤنٹ نمبر دیتا ہے — نام اور تصویر کے بغیر۔",
    кодОтправлен: "ہم نے کوڈ {почта} پر بھیج دیا ہے۔ اسپام فولڈر بھی دیکھیں۔",
    код: "ای میل والا کوڈ (4 ہندسے)",
    войти: "سائن اِن",
    ещёКод: "کوڈ دوبارہ بھیجیں",
    другаяПочта: "دوسرا ای میل",
    готово: "ہو گیا! آپ کی پیش رفت اکاؤنٹ میں محفوظ ہو رہی ہے۔",
    вошли: "سائن اِن: {почта}",
    синхронизировано: "ہم آہنگ ہوا: {когда}",
    толькоЧто: "ابھی",
    сегодня: "آج {время} بجے",
    ещёНет: "ابھی نہیں",
    идёт: "ہم آہنگ ہو رہا ہے…",
    нетСети: "کنکشن نہیں — واپس آنے پر ہم آہنگ کریں گے",
    ошибкаСинх: "ہم آہنگ نہیں ہو سکا — دوبارہ کوشش کریں گے",
    синхронизировать: "ابھی ہم آہنگ کریں",
    закят: "زکوٰۃ کی رقمیں اکاؤنٹ میں محفوظ کریں",
    закятВкл: "آن: زکوٰۃ کی رقمیں دوسرے آلات پر بھی",
    закятВыкл: "آف: زکوٰۃ کی رقمیں صرف اسی آلے پر",
    админка: "ایڈمن پینل",
    админкаПодпись: "دوسرے کوڈ کے بغیر کھولیں",
    скачать: "میرا ڈیٹا ڈاؤن لوڈ کریں",
    выйти: "سائن آؤٹ",
    выйтиПодпись: "اس آلے پر سب کچھ رہے گا",
    выйтиВезде: "تمام آلات سے سائن آؤٹ",
    удалить: "اکاؤنٹ حذف کریں",
    удалитьВопрос: "اکاؤنٹ اور سرور پر موجود تمام ڈیٹا حذف کریں؟ اس آلے پر سب کچھ رہے گا۔",
    удалитьДа: "حذف کریں",
    отмена: "منسوخ",
    недоступно: "سائن اِن aiustaz.pro پر دستیاب ہے۔",
    'ош.code': "کوڈ غلط ہے یا ختم ہو چکا ہے",
    'ош.age': "تصدیق کریں کہ آپ کی عمر 16 سال یا زیادہ ہے",
    'ош.email': "ای میل چیک کریں",
    'ош.rate': "بہت زیادہ کوششیں — بعد میں کوشش کریں",
    'ош.mail': "ای میل نہیں گیا — بعد میں کوشش کریں",
    'ош.сеть': "کنکشن نہیں — بعد میں کوشش کریں",
    'ош.google': "Google کے ذریعے سائن اِن نہیں ہو سکا",
    'ош.общая': "کچھ غلط ہو گیا — دوبارہ کوشش کریں",
  },
}, 'screens/AccountScreen');

type КлючОшибки = 'ош.code' | 'ош.age' | 'ош.email' | 'ош.rate' | 'ош.mail' | 'ош.сеть' | 'ош.google' | 'ош.общая';

function ключОшибки(код: string): КлючОшибки {
  if (код === 'нет-сети') return 'ош.сеть';
  if (код === 'token' || код === 'google' || код === 'keys') return 'ош.google';
  return (['code', 'age', 'email', 'rate', 'mail'].includes(код) ? 'ош.' + код : 'ош.общая') as КлючОшибки;
}

export function Аккаунт(_: ПропсыЭкрана<'аккаунт'>) {
  const т = useСловарь(СЛОВАРЬ);
  const я = useАккаунт();
  return (
    <Экран заголовок={т('заголовок')} testID="экран-аккаунт">
      {!входДоступен() ? <Текст вид="второй">{т('недоступно')}</Текст> : я ? <Вошли /> : <Вход />}
    </Экран>
  );
}

function Вход() {
  const т = useСловарь(СЛОВАРЬ);
  const { язык } = useПеревод();
  const { цвет, отступ, радиус, тёмная } = useТема();
  const [возраст, установитьВозраст] = useState(false);
  const [почта, установитьПочту] = useState('');
  const [код, установитьКод] = useState('');
  const [этап, установитьЭтап] = useState<'почта' | 'код'>('почта');
  const [занято, установитьЗанято] = useState(false);
  const [ошибка, установитьОшибку] = useState<string | null>(null);
  const [google, установитьGoogle] = useState<string | null>(null);
  const [googleЖдёт, установитьGoogleЖдёт] = useState(false);

  useEffect(() => {
    let живой = true;
    void api.настройкаВхода().then((о) => живой && о.ок && установитьGoogle(о.данные.google_client_id));
    return () => {
      живой = false;
    };
  }, []);

  const поле = {
    borderWidth: 1,
    borderColor: цвет.границаЭлемента,
    borderRadius: радиус.m,
    backgroundColor: цвет.поверхность,
    color: цвет.текст,
    fontFamily: ШРИФТ_ИНТЕРФЕЙСА,
    fontSize: 16,
    paddingHorizontal: отступ.m,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? ({ outlineColor: цвет.фокус } as object) : null),
  } as const;

  const вошёл = async (о: api.Ответ<{ я: api.Я }>) => {
    if (!о.ок) {
      установитьОшибку(ключОшибки(о.код));
      return;
    }
    задатьАккаунт({ email: о.данные.я.email, роль: о.данные.я.роль, закят: о.данные.я.закят, синхронизировано: null, статус: 'идёт' });
    void запуститьСинхронизацию();
  };

  const нуженВозраст = () => {
    if (возраст) return false;
    установитьОшибку('ош.age');
    return true;
  };

  const прислать = async () => {
    установитьОшибку(null);
    if (нуженВозраст()) return;
    установитьЗанято(true);
    const о = await api.прислатьКод(почта.trim());
    установитьЗанято(false);
    if (!о.ок) return установитьОшибку(ключОшибки(о.код));
    установитьЭтап('код');
    установитьКод('');
  };

  const проверить = async (к: string) => {
    if (занято) return;
    установитьОшибку(null);
    установитьЗанято(true);
    const о = await api.проверитьКод(почта.trim(), к);
    установитьЗанято(false);
    if (!о.ок) установитьКод('');
    await вошёл(о);
  };

  const сКодом = (текст: string) => {
    const цифры = текст.replace(/\D/g, '').slice(0, 4);
    установитьКод(цифры);
    if (цифры.length === 4) void проверить(цифры);
  };

  const googleНажали = async () => {
    установитьОшибку(null);
    if (нуженВозраст() || !google) return;
    установитьGoogleЖдёт(true);
    const итог = await войтиЧерезGoogle({
      clientId: google,
      контейнер: 'аккаунт-google-место',
      язык,
      тёмная,
      приВходе: async (credential) => вошёл(await api.войтиGoogle(credential)),
    });
    if (итог !== 'ок') {
      установитьGoogleЖдёт(false);
      установитьОшибку(итог === 'нет-сети' ? 'ош.сеть' : 'ош.google');
    }
  };

  const ош = ошибка ? (
    <Текст вид="обычный" цвет={цвет.внимание} testID="аккаунт-ошибка" accessibilityLiveRegion="polite">
      {т(ошибка as КлючОшибки)}
    </Текст>
  ) : null;

  return (
    <View style={{ gap: отступ.m }}>
      <Текст вид="обычный">{т('вступление')}</Текст>
      <View style={{ gap: отступ.s, padding: отступ.m, borderRadius: радиус.m, backgroundColor: цвет.поверхностьВторая }}>
        <Текст вид="метка">{т('чтоХранится')}</Текст>
        <Текст вид="мелкий">{т('чтоХранитсяТекст')}</Текст>
        <Текст вид="метка">{т('где')}</Текст>
        <Текст вид="мелкий">{т('гдеТекст')}</Текст>
        <Текст вид="метка">{т('какУдалить')}</Текст>
        <Текст вид="мелкий">{т('какУдалитьТекст')}</Текст>
      </View>
      <СтрокаПереключателя заголовок={т('возраст')} подпись={т('возрастПодпись')} включено={возраст} приСмене={(в) => { установитьВозраст(в); установитьОшибку(null); }} вид="карточка" testID="аккаунт-16" />
      {этап === 'почта' ? (
        <View style={{ gap: отступ.s }}>
          <Текст вид="мелкий" nativeID="аккаунт-почта-метка">{т('почта')}</Текст>
          <TextInput
            value={почта}
            onChangeText={установитьПочту}
            inputMode="email"
            keyboardType="email-address"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="name@example.com"
            placeholderTextColor={цвет.текстВторой}
            aria-labelledby="аккаунт-почта-метка"
            onSubmitEditing={() => void прислать()}
            style={поле}
            testID="аккаунт-почта"
          />
          <Кнопка надпись={т('получитьКод')} приНажатии={() => void прислать()} отключена={занято || !почта.includes('@')} testID="аккаунт-получить-код" />
          {google ? (
            <View style={{ gap: отступ.s }}>
              <Текст вид="мелкий" стиль={{ textAlign: 'center' }}>{т('или')}</Текст>
              {!googleЖдёт ? <Кнопка надпись={т('google')} вид="вторичная" значок="внешняя" приНажатии={() => void googleНажали()} testID="аккаунт-google" /> : <Текст вид="мелкий">{т('googleДальше')}</Текст>}
              <View nativeID="аккаунт-google-место" testID="аккаунт-google-кнопка" style={{ alignItems: 'center', minHeight: googleЖдёт ? 44 : 0 }} />
              <Текст вид="мелкий">{т('googleПояснение')}</Текст>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: отступ.s }}>
          <Текст вид="обычный">{т('кодОтправлен', { почта: почта.trim() })}</Текст>
          <Текст вид="мелкий" nativeID="аккаунт-код-метка">{т('код')}</Текст>
          <TextInput
            autoFocus
            value={код}
            onChangeText={сКодом}
            inputMode="numeric"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={4}
            placeholder="1234"
            placeholderTextColor={цвет.текстВторой}
            aria-labelledby="аккаунт-код-метка"
            style={{ ...поле, fontSize: 28, letterSpacing: 12, textAlign: 'center' }}
            testID="аккаунт-код"
          />
          <Кнопка надпись={т('войти')} приНажатии={() => void проверить(код)} отключена={занято || код.length !== 4} testID="аккаунт-войти" />
          <Кнопка надпись={т('ещёКод')} вид="тихая" приНажатии={() => void прислать()} отключена={занято} testID="аккаунт-ещё-код" />
          <Кнопка надпись={т('другаяПочта')} вид="тихая" приНажатии={() => { установитьЭтап('почта'); установитьОшибку(null); }} testID="аккаунт-другая-почта" />
        </View>
      )}
      {ош}
    </View>
  );
}

function Вошли() {
  const т = useСловарь(СЛОВАРЬ);
  const { язык } = useПеревод();
  const { цвет, отступ } = useТема();
  const я = useАккаунт();
  const [спросить, установитьСпросить] = useState(false);
  const [ошибка, установитьОшибку] = useState<КлючОшибки | null>(null);
  const [свежий] = useState(() => я?.синхронизировано == null);
  const [, тик] = useState(0);
  useEffect(() => {
    const и = setInterval(() => тик((х) => х + 1), 30_000);
    return () => clearInterval(и);
  }, []);
  if (!я) return null;

  const когда = (() => {
    const м = я.синхронизировано;
    if (!м) return т('ещёНет');
    if (Date.now() - м < 90_000) return т('толькоЧто');
    const д = new Date(м);
    const время = д.toLocaleTimeString(ЛОКАЛЬ_INTL[язык], { hour: '2-digit', minute: '2-digit' });
    return new Date().toDateString() === д.toDateString() ? т('сегодня', { время }) : д.toLocaleDateString(ЛОКАЛЬ_INTL[язык]) + ' ' + время;
  })();
  const статус = я.статус === 'идёт' ? т('идёт') : я.статус === 'нет-сети' ? т('нетСети') : я.статус === 'ошибка' ? т('ошибкаСинх') : т('синхронизировано', { когда });

  const выход = async (везде: boolean) => {
    const о = везде ? await api.выйтиВезде() : await api.выйти();
    if (!о.ок && о.код !== 'login') return установитьОшибку(ключОшибки(о.код));
    остановитьСинхронизацию();
    задатьАккаунт(null);
  };
  const удалить = async () => {
    const о = await api.удалитьАккаунт();
    if (!о.ок && о.код !== 'login') return установитьОшибку(ключОшибки(о.код));
    остановитьСинхронизацию();
    забытьСинхронизацию();
    задатьАккаунт(null);
  };
  const закят = async (вкл: boolean) => {
    const о = await api.задатьЗакят(вкл);
    if (!о.ок) return установитьОшибку(ключОшибки(о.код));
    обновитьАккаунт({ закят: вкл });
    void синхронизировать();
  };
  const вАдминку = async () => {
    const о = await api.вАдминку();
    if (!о.ок) return установитьОшибку(ключОшибки(о.код));
    window.location.assign(о.данные.адрес);
  };

  return (
    <View style={{ gap: отступ.m }}>
      {свежий ? (
        <Текст вид="обычный" цвет={цвет.акцент} testID="аккаунт-готово">
          {т('готово')}
        </Текст>
      ) : null}
      <Текст вид="подзаголовок" testID="аккаунт-почта-вошли">
        {т('вошли', { почта: я.email })}
      </Текст>
      <Текст вид="мелкий" testID="аккаунт-статус" accessibilityLiveRegion="polite">
        {статус}
      </Текст>
      <Кнопка надпись={т('синхронизировать')} вид="вторичная" приНажатии={() => void синхронизировать()} отключена={я.статус === 'идёт'} testID="аккаунт-синхронизировать" />
      <СтрокаПереключателя заголовок={т('закят')} подпись={т(я.закят ? 'закятВкл' : 'закятВыкл')} включено={я.закят} приСмене={(в) => void закят(в)} вид="карточка" testID="аккаунт-закят" />
      {я.роль ? <СтрокаСписка заголовок={т('админка')} подпись={т('админкаПодпись')} значок="настройки" приНажатии={() => void вАдминку()} testID="аккаунт-админка" /> : null}
      <СтрокаСписка заголовок={т('скачать')} значок="вниз" приНажатии={() => void api.скачатьМоиДанные().then((ок) => !ок && установитьОшибку('ош.общая'))} testID="аккаунт-скачать" />
      <СтрокаСписка заголовок={т('выйти')} подпись={т('выйтиПодпись')} значок="назад" приНажатии={() => void выход(false)} testID="аккаунт-выйти" />
      <СтрокаСписка заголовок={т('выйтиВезде')} значок="замок" приНажатии={() => void выход(true)} testID="аккаунт-выйти-везде" />
      {спросить ? (
        <View style={{ gap: отступ.s }}>
          <Текст вид="обычный">{т('удалитьВопрос')}</Текст>
          <Кнопка надпись={т('удалитьДа')} приНажатии={() => void удалить()} testID="аккаунт-удалить-да" />
          <Кнопка надпись={т('отмена')} вид="тихая" приНажатии={() => установитьСпросить(false)} testID="аккаунт-удалить-нет" />
        </View>
      ) : (
        <СтрокаСписка заголовок={т('удалить')} значок="удалить" приНажатии={() => установитьСпросить(true)} testID="аккаунт-удалить" />
      )}
      {ошибка ? (
        <Текст вид="обычный" цвет={цвет.внимание} testID="аккаунт-ошибка">
          {т(ошибка)}
        </Текст>
      ) : null}
    </View>
  );
}
