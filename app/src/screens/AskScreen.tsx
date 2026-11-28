/**
 * «AI Ustaz» — чат-наставник по исламу в центре нижнего меню (#/ask): ответы ТОЛЬКО по проверенным материалам сайта.
 *
 * Владелец 27.11.2026: «должен быть в нижнем меню посередине Ай-Устаз, то есть искусственный интеллект, чат, где люди
 * могут писать и получить ответы. Например, как читается такой-то аят, по хадису вопросы. Но этот чат, пусть он не лезет
 * в интернет … только с информацией, которая у нас внутри сайта находится» и «Так же, как здесь [чат «Спросите Айалем»] …
 * могут голосом спросить, текстом спросить, могут прикрепить картинку … образ AI Устаза без лица … в одежде сунна».
 * Вид и поведение — по образцу beaheadd/aialem@b72d5e5 web/src/educat/ui/AskTutor.jsx (шапка, пузыри с аватаром,
 * «Пожаловаться» с листом причин, 🔊, чипы под ответом, поле с 📷 🖼 🎤 ➤, запись «как в WhatsApp»), переписано под
 * React Native Web + TS и правила AI Ustaz (docs/источники-кода.md).
 * Сервер — server/ask.py (поиск по базе, без внешнего ИИ), server/ask_media.py (жалоба, голос и фото — свои серверы РК).
 * Владелец 28.11.2026: «Текстовой чат, только оставь текст. Аудио распознавание, фото убери» — 🎤 📷 🖼 выключены
 *   (ГОЛОС_И_ФОТО = false), даже если сервер их объявляет; код оставлен на случай, если владелец вернёт. 🔊 — остаётся.
 *
 * Жёсткие правила (CLAUDE.md):
 *   1 — аят показываем ТОЛЬКО из своей копии Tanzil по ссылке «сура:аят» (сервер текста Корана не присылает);
 *   2 — хадис: сборник, номер, степень и кто её дал; ничего не генерируем;
 *   5 — «к имаму» и «вне темы» — наш шаблон; без фетв и ИИ-тафсира;
 *   7 — 🔊 (синтез телефона, пометка «синтезированный голос») не читает арабские слова и транслитерацию (ask/speak.ts);
 *   данные — история переписки только на этом телефоне («Очистить»); на сервер — вопрос без истории; голос и фото
 *     распознаёт НАШ сервер в РК и сразу удаляет; «Пожаловаться» — id ответа, причина, комментарий, без вопроса.
 * testID: экран-устаз, устаз-шапка, устаз-образ, устаз-граница, устаз-ии, устаз-пусто, устаз-пример-<n>, устаз-поле,
 *   устаз-отправить, устаз-микрофон, устаз-камера, устаз-галерея, устаз-запись, устаз-запись-стоп, устаз-запись-отмена,
 *   устаз-вопрос-<i>, устаз-ответ-<i>, устаз-ответ-<i>-текст, устаз-источник-<id>, устаз-аят, устаз-аят-слушать,
 *   устаз-пожаловаться-<i>, устаз-озвучить-<i>, устаз-чип-<подробнее|источник|проверка>-<i>, устаз-жалоба,
 *   устаз-жалоба-причина-<п>, устаз-жалоба-отправить, устаз-проверка, устаз-ждём, устаз-ошибка, устаз-выключено,
 *   устаз-очистить, устаз-к-имаму, устаз-распознано.
 * kk, uz, en — черновики для редактора-носителя.
 */
import { createElement, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { доступныйИсточник, плеер } from '../audio/player';
import { АрабскийТекст, Плашка, Текст, Значок, Экран } from '../components';
import { ОбразУстаза } from '../components/UstazFigure';
import {
  МАКС_ВОПРОС,
  МИН_ВОПРОС,
  возможностиЧата,
  голосом,
  пожаловаться,
  спросить,
  контекстИзОтвета,
  спроситьВключено,
  ссылкаАята,
  фотографией,
  type ИсточникОтвета,
  type ОтветУстаза,
  type ПричинаЖалобы,
  type ПричинаОтказа,
  type ВозможностиЧата,
} from '../ask/api';
import { новыйИд, очиститьИсторию, прочитатьИсторию, записатьИсторию, type ЗаписьЧата } from '../ask/history';
import { сжатьФото } from '../ask/photo';
import { взятьВопрос, type ВопросПроверки } from '../ask/quiz';
import { озвучить, озвучкаЕсть, остановитьОзвучку } from '../ask/speak';
import {
  ГОЛОС_МАКС_БАЙТ,
  ГОЛОС_МИН_МС,
  голосПоддерживается,
  добавитьСказанное,
  заКраем,
  начатьЗапись,
  ммсс,
  ошибкаМикрофона,
  отпустили,
  сдвигОтменяет,
  сдвигПодсказки,
  УДЕРЖАНИЕ_МС,
  type Запись as ЗаписьГолоса,
} from '../ask/voice';
import { useНавигация } from '../engine/navigation';
import { useПрогресс } from '../engine/progress';
import { записатьJSON, прочитатьJSON } from '../engine/storage';
import { изХэша, type ПропсыЭкрана } from '../engine/routes';
import { основной, создатьСловарь, useПеревод, useСловарь } from '../i18n';
import { useСура } from '../quran/data';
import { ТаджвидАята } from './quran/AyahActions';
import { СлойАята, useЕстьПеревод } from '../components/quran/AyahMeaning';
import { ШИРИНА_КОЛОНКИ, ШРИФТ_ИНТЕРФЕЙСА, useТема, useУменьшитьДвижение } from '../theme';

const ВЕБ = Platform.OS === 'web';
/** Поле растёт с текстом вверх до 4 строк (строка 20 px + поля 16 px; владелец 28.11.2026: «компактнее»). */
const МАКС_ВЫСОТА_ПОЛЯ = 4 * 20 + 16;
const МИН_ВЫСОТА_ПОЛЯ = 40;
/** Предупреждение сверху ленты свёрнуто «×» — запоминаем на этом телефоне (только флаг). */
const КЛЮЧ_ПРЕДУПРЕЖДЕНИЯ = 'ask-notice-collapsed.v1';
const ПРЕДУПРЕЖДЕНИЕ = { fontSize: 13, lineHeight: 18 } as const;
/** Шрифты чата (владелец 28.11.2026: «уменьшить текст»): пузырь 16, заголовок карточки 16 semibold, текст 15, чип 14. */
const ШРИФТ_ПУЗЫРЯ = { fontSize: 16, lineHeight: 23 } as const;

const СЛОВАРЬ = создатьСловарь({
  ru: {
    заголовок: 'Спросите AI Ustaz',
    подзаголовок: 'Наставник по исламу — по проверенным материалам',
    граница: 'Отвечает только по проверенным материалам AI Ustaz. Не фетва — личные вопросы к имаму или в духовное управление мусульман вашей страны.',
    ии: 'AI Ustaz — помощник, а не учёный: ищет по нашей базе и может ошибаться. Сверяйте с источниками.',
    пусто: 'Ассаляму алейкум! Спросите о чтении Корана, таджвиде, хадисах, дуа или намазе.',
    пример1: 'Как читается аят 2:255?',
    пример2: 'Что такое ихфа?',
    пример3: 'Хадис о намерении',
    пример4: 'Дуа при выходе из дома',
    поле: 'Ваш вопрос',
    полеПодсказка: 'Напишите вопрос…',
    отправить: 'Отправить',
    микрофон: 'Спросить голосом: держите и говорите',
    камера: 'Сфотографировать',
    галерея: 'Выбрать фото',
    личное: 'Не пишите имён, телефонов и других личных данных.',
    очистить: 'Очистить',
    ждём: 'Ищу в нашей базе…',
    слушаю: 'Распознаю голос…',
    смотрю: 'Смотрю фото…',
    запись: 'Говорите… {в}',
    записьТап: 'Говорите… {в} · нажмите «Стоп»',
    сдвиг: '‹ влево — отмена',
    стоп: 'Стоп',
    отмена: 'Отменить запись',
    проверьтеТекст: 'Проверьте текст и отправьте.',
    устаз: 'AI Ustaz',
    черновик: 'Черновик — проверяет устаз',
    коран: 'Коран, {с}',
    открыть: 'Открыть {с} в Коране',
    открытьМатериал: 'Открыть в приложении',
    слушать: 'Слушать чтеца',
    какЧитается: 'Как читается этот аят',
    тафсирКарточка: 'AI Ustaz не толкует Коран от себя. Ниже — изданный перевод смыслов этого аята, как есть, с названием издания. Толкование (тафсир) объясняют учёные — спросите имама.',
    смыслАята: 'Перевод смыслов {с}',
    нетЗвука: 'Запись чтеца здесь недоступна.',
    хадис: 'Хадис',
    степень: 'Степень: {с} (оценил: {к})',
    тафсир: 'Тафсир',
    статья: 'Материал',
    справка: 'О приложении',
    источник: 'Источник: {и}',
    аятЗагрузка: 'Загружаем аят…',
    шаблонОтвет: 'Вот что есть в нашей базе по вашему вопросу:',
    шаблонНет: 'В нашей базе пока нет ответа на этот вопрос. Спросите иначе или обратитесь к имаму.',
    шаблонИмам: 'Это личный вопрос фикха — на него отвечает имам. Задайте его имаму вашей мечети или в духовное управление мусульман вашей страны. AI Ustaz фетв не даёт.',
    шаблонВне: 'Здесь отвечаем только по нашей базе: Коран, таджвид, хадисы, дуа, намаз и как пользоваться AI Ustaz.',
    общие: 'Общие сведения из нашей базы — не ответ на ваш случай:',
    распознано: 'На фото: «{т}»',
    пожаловаться: 'Пожаловаться',
    озвучить: 'Прочитать ответ вслух',
    синтез: 'синтезированный голос',
    подробнее: 'Подробнее',
    покажите: 'Покажите источник',
    проверьте: 'Проверьте меня',
    жалоба: 'Что не так с ответом?',
    'причина.неверно': 'Неверно',
    'причина.непонятно': 'Непонятно',
    'причина.другое': 'Другое',
    комментарий: 'Комментарий (необязательно)',
    комментарийПодсказка: 'Что исправить? Без личных данных.',
    жалобаОтправить: 'Отправить',
    жалобаОтмена: 'Отмена',
    жалобаСпасибо: 'Спасибо! Устаз посмотрит этот ответ.',
    жалобаНеУшла: 'Не отправилось — проверьте связь.',
    проверкаНет: 'Проверю вас, когда пройдёте хотя бы один урок таджвида: вопросы — только по пройденному.',
    проверкаУрок: 'Вопрос из урока {н}',
    верно: 'Верно!',
    неверно: 'Не совсем. Верный ответ отмечен.',
    'ошибка.вопрос': 'Вопрос должен быть от 3 до 500 символов.',
    'ошибка.лимит': 'Слишком много вопросов подряд — подождите минуту.',
    'ошибка.нет-базы': 'База знаний сейчас недоступна. Попробуйте позже.',
    'ошибка.нет-связи': 'Нет связи — вопрос не отправлен. Проверьте интернет.',
    'ошибка.сбой': 'Что-то пошло не так — попробуйте ещё раз.',
    'ошибка.микЗапрещён': 'Разрешите доступ к микрофону в настройках браузера и попробуйте ещё раз.',
    'ошибка.микНет': 'Микрофон не найден.',
    'ошибка.микСбой': 'Не удалось включить микрофон.',
    'ошибка.голосПусто': 'Не расслышал — скажите ещё раз, ближе к телефону.',
    'ошибка.держите': 'Держите кнопку, пока говорите.',
    'ошибка.голосБольшой': 'Запись слишком длинная — до 30 секунд.',
    'ошибка.голосВыкл': 'Вопрос голосом сейчас недоступен — напишите текстом.',
    'ошибка.фото': 'Не удалось подготовить фото — выберите другое.',
    выключено: 'AI Ustaz отвечает на нашем сайте aiustaz.pro.',
  },
  kk: {
    заголовок: 'AI Ustaz-ға сұрақ қойыңыз',
    подзаголовок: 'Ислам бойынша тәлімгер — тексерілген материалдар бойынша',
    граница: 'Тек AI Ustaz-тың тексерілген материалдары бойынша жауап береді. Пәтуа емес — жеке сұрақтар имамға немесе еліңіздің мұсылмандар діни басқармасына.',
    ии: 'AI Ustaz — ғалым емес, көмекші: базамыздан іздейді және қателесуі мүмкін. Дереккөздермен салыстырыңыз.',
    пусто: 'Ассаламу алейкум! Құран оқу, тәжуид, хадис, дұға немесе намаз туралы сұраңыз.',
    пример1: '2:255 аяты қалай оқылады?',
    пример2: 'Ихфа деген не?',
    пример3: 'Ниет туралы хадис',
    пример4: 'Үйден шыққандағы дұға',
    поле: 'Сұрағыңыз',
    полеПодсказка: 'Сұрағыңызды жазыңыз…',
    отправить: 'Жіберу',
    микрофон: 'Дауыспен сұрау: басып тұрып сөйлеңіз',
    камера: 'Суретке түсіру',
    галерея: 'Сурет таңдау',
    личное: 'Аты-жөн, телефон және басқа жеке деректерді жазбаңыз.',
    очистить: 'Тазалау',
    ждём: 'Базамыздан іздеп жатырмын…',
    слушаю: 'Дауысты танып жатырмын…',
    смотрю: 'Суретті қарап жатырмын…',
    запись: 'Сөйлеңіз… {в}',
    записьТап: 'Сөйлеңіз… {в} · «Тоқтату» басыңыз',
    сдвиг: '‹ солға — болдырмау',
    стоп: 'Тоқтату',
    отмена: 'Жазбаны болдырмау',
    проверьтеТекст: 'Мәтінді тексеріп, жіберіңіз.',
    устаз: 'AI Ustaz',
    черновик: 'Жоба — ұстаз тексереді',
    коран: 'Құран, {с}',
    открыть: '{с} аятын Құраннан ашу',
    открытьМатериал: 'Қолданбада ашу',
    слушать: 'Қари оқуын тыңдау',
    какЧитается: 'Бұл аят қалай оқылады',
    тафсирКарточка: 'AI Ustaz Құранды өз бетінше түсіндірмейді. Төменде — осы аяттың басылған мағына аудармасы, сол күйінде, басылым атауымен. Тәпсірді ғалымдар түсіндіреді — имамнан сұраңыз.',
    смыслАята: '{с} — мағына аудармасы',
    нетЗвука: 'Мұнда қари жазбасы қолжетімсіз.',
    хадис: 'Хадис',
    степень: 'Дәрежесі: {с} (бағалаған: {к})',
    тафсир: 'Тәпсір',
    статья: 'Материал',
    справка: 'Қолданба туралы',
    источник: 'Дереккөз: {и}',
    аятЗагрузка: 'Аят жүктелуде…',
    шаблонОтвет: 'Сұрағыңыз бойынша базамызда мыналар бар:',
    шаблонНет: 'Базамызда бұл сұраққа әзірге жауап жоқ. Басқаша сұраңыз немесе имамға жүгініңіз.',
    шаблонИмам: 'Бұл — жеке фиқһ сұрағы, оған имам жауап береді. Мешітіңіздің имамына немесе еліңіздің мұсылмандар діни басқармасына қойыңыз. AI Ustaz пәтуа бермейді.',
    шаблонВне: 'Мұнда тек базамыз бойынша жауап береміз: Құран, тәжуид, хадис, дұға, намаз және AI Ustaz-ды қолдану.',
    общие: 'Базамыздағы жалпы мәліметтер — сіздің жағдайыңызға жауап емес:',
    распознано: 'Суретте: «{т}»',
    пожаловаться: 'Шағымдану',
    озвучить: 'Жауапты дауыстап оқу',
    синтез: 'синтезделген дауыс',
    подробнее: 'Толығырақ',
    покажите: 'Дереккөзді көрсетіңіз',
    проверьте: 'Мені тексеріңіз',
    жалоба: 'Жауапта не дұрыс емес?',
    'причина.неверно': 'Қате',
    'причина.непонятно': 'Түсініксіз',
    'причина.другое': 'Басқа',
    комментарий: 'Пікір (міндетті емес)',
    комментарийПодсказка: 'Нені түзету керек? Жеке деректерсіз.',
    жалобаОтправить: 'Жіберу',
    жалобаОтмена: 'Болдырмау',
    жалобаСпасибо: 'Рақмет! Ұстаз бұл жауапты қарайды.',
    жалобаНеУшла: 'Жіберілмеді — байланысты тексеріңіз.',
    проверкаНет: 'Кем дегенде бір тәжуид сабағын өткенде тексеремін: сұрақтар — тек өткен тақырып бойынша.',
    проверкаУрок: '{н}-сабақтан сұрақ',
    верно: 'Дұрыс!',
    неверно: 'Толық емес. Дұрыс жауап белгіленді.',
    'ошибка.вопрос': 'Сұрақ 3-тен 500 таңбаға дейін болуы керек.',
    'ошибка.лимит': 'Сұрақ тым көп — бір минут күтіңіз.',
    'ошибка.нет-базы': 'Білім базасы қазір қолжетімсіз. Кейінірек көріңіз.',
    'ошибка.нет-связи': 'Байланыс жоқ — сұрақ жіберілмеді. Интернетті тексеріңіз.',
    'ошибка.сбой': 'Бірдеңе дұрыс болмады — қайта көріңіз.',
    'ошибка.микЗапрещён': 'Браузер баптауларында микрофонға рұқсат беріп, қайта көріңіз.',
    'ошибка.микНет': 'Микрофон табылмады.',
    'ошибка.микСбой': 'Микрофонды қосу мүмкін болмады.',
    'ошибка.голосПусто': 'Естімедім — телефонға жақынырақ қайта айтыңыз.',
    'ошибка.держите': 'Сөйлеп тұрғанда түймені басып тұрыңыз.',
    'ошибка.голосБольшой': 'Жазба тым ұзын — 30 секундқа дейін.',
    'ошибка.голосВыкл': 'Дауыспен сұрау қазір қолжетімсіз — мәтінмен жазыңыз.',
    'ошибка.фото': 'Суретті дайындау мүмкін болмады — басқасын таңдаңыз.',
    выключено: 'AI Ustaz біздің сайтта жауап береді: aiustaz.pro.',
  },
  uz: {
    заголовок: 'AI Ustazdan soʻrang',
    подзаголовок: 'Islom boʻyicha ustoz — tekshirilgan materiallar asosida',
    граница: 'Faqat AI Ustazning tekshirilgan materiallari boʻyicha javob beradi. Fatvo emas — shaxsiy savollar imomga yoki mamlakatingiz musulmonlari diniy idorasiga.',
    ии: 'AI Ustaz — olim emas, yordamchi: bazamizdan qidiradi va xato qilishi mumkin. Manbalar bilan solishtiring.',
    пусто: 'Assalomu alaykum! Qurʼon oʻqish, tajvid, hadis, duo yoki namoz haqida soʻrang.',
    пример1: '2:255 oyati qanday oʻqiladi?',
    пример2: 'Ixfo nima?',
    пример3: 'Niyat haqidagi hadis',
    пример4: 'Uydan chiqishdagi duo',
    поле: 'Savolingiz',
    полеПодсказка: 'Savolingizni yozing…',
    отправить: 'Yuborish',
    микрофон: 'Ovoz bilan soʻrash: bosib turib gapiring',
    камера: 'Suratga olish',
    галерея: 'Rasm tanlash',
    личное: 'Ism, telefon va boshqa shaxsiy maʼlumotlarni yozmang.',
    очистить: 'Tozalash',
    ждём: 'Bazamizdan qidiryapman…',
    слушаю: 'Ovozni aniqlayapman…',
    смотрю: 'Rasmni koʻryapman…',
    запись: 'Gapiring… {в}',
    записьТап: 'Gapiring… {в} · «Toʻxtatish»ni bosing',
    сдвиг: '‹ chapga — bekor qilish',
    стоп: 'Toʻxtatish',
    отмена: 'Yozuvni bekor qilish',
    проверьтеТекст: 'Matnni tekshirib, yuboring.',
    устаз: 'AI Ustaz',
    черновик: 'Qoralama — ustoz tekshiradi',
    коран: 'Qurʼon, {с}',
    открыть: '{с} oyatini Qurʼonda ochish',
    открытьМатериал: 'Ilovada ochish',
    слушать: 'Qori tilovatini tinglash',
    какЧитается: 'Bu oyat qanday oʻqiladi',
    тафсирКарточка: 'AI Ustaz Qurʼonni oʻzicha talqin qilmaydi. Quyida — shu oyatning nashr qilingan maʼnolar tarjimasi, oʻz holicha, nashr nomi bilan. Tafsirni olimlar tushuntiradi — imomdan soʻrang.',
    смыслАята: '{с} — maʼnolar tarjimasi',
    нетЗвука: 'Bu yerda qori yozuvi mavjud emas.',
    хадис: 'Hadis',
    степень: 'Darajasi: {с} (baholagan: {к})',
    тафсир: 'Tafsir',
    статья: 'Material',
    справка: 'Ilova haqida',
    источник: 'Manba: {и}',
    аятЗагрузка: 'Oyat yuklanmoqda…',
    шаблонОтвет: 'Savolingiz boʻyicha bazamizda quyidagilar bor:',
    шаблонНет: 'Bazamizda bu savolga hozircha javob yoʻq. Boshqacha soʻrang yoki imomga murojaat qiling.',
    шаблонИмам: 'Bu shaxsiy fiqh savoli — unga imom javob beradi. Uni masjidingiz imomiga yoki mamlakatingiz musulmonlari diniy idorasiga bering. AI Ustaz fatvo bermaydi.',
    шаблонВне: 'Bu yerda faqat bazamiz boʻyicha javob beramiz: Qurʼon, tajvid, hadis, duo, namoz va AI Ustazdan foydalanish.',
    общие: 'Bazamizdagi umumiy maʼlumotlar — sizning holatingizga javob emas:',
    распознано: 'Rasmda: «{т}»',
    пожаловаться: 'Shikoyat qilish',
    озвучить: 'Javobni ovoz chiqarib oʻqish',
    синтез: 'sintez qilingan ovoz',
    подробнее: 'Batafsil',
    покажите: 'Manbani koʻrsating',
    проверьте: 'Meni tekshiring',
    жалоба: 'Javobda nima notoʻgʻri?',
    'причина.неверно': 'Notoʻgʻri',
    'причина.непонятно': 'Tushunarsiz',
    'причина.другое': 'Boshqa',
    комментарий: 'Izoh (ixtiyoriy)',
    комментарийПодсказка: 'Nimani tuzatish kerak? Shaxsiy maʼlumotlarsiz.',
    жалобаОтправить: 'Yuborish',
    жалобаОтмена: 'Bekor qilish',
    жалобаСпасибо: 'Rahmat! Ustoz bu javobni koʻrib chiqadi.',
    жалобаНеУшла: 'Yuborilmadi — aloqani tekshiring.',
    проверкаНет: 'Kamida bitta tajvid darsini oʻtganingizda tekshiraman: savollar — faqat oʻtilgan mavzu boʻyicha.',
    проверкаУрок: '{н}-darsdan savol',
    верно: 'Toʻgʻri!',
    неверно: 'Unchalik emas. Toʻgʻri javob belgilandi.',
    'ошибка.вопрос': 'Savol 3 tadan 500 tagacha belgidan iborat boʻlishi kerak.',
    'ошибка.лимит': 'Savollar juda koʻp — bir daqiqa kuting.',
    'ошибка.нет-базы': 'Bilim bazasi hozir mavjud emas. Keyinroq urinib koʻring.',
    'ошибка.нет-связи': 'Aloqa yoʻq — savol yuborilmadi. Internetni tekshiring.',
    'ошибка.сбой': 'Nimadir notoʻgʻri ketdi — qayta urinib koʻring.',
    'ошибка.микЗапрещён': 'Brauzer sozlamalarida mikrofonga ruxsat bering va qayta urinib koʻring.',
    'ошибка.микНет': 'Mikrofon topilmadi.',
    'ошибка.микСбой': 'Mikrofonni yoqib boʻlmadi.',
    'ошибка.голосПусто': 'Eshitmadim — telefonga yaqinroq qayta ayting.',
    'ошибка.держите': 'Gapirayotganda tugmani bosib turing.',
    'ошибка.голосБольшой': 'Yozuv juda uzun — 30 soniyagacha.',
    'ошибка.голосВыкл': 'Ovoz bilan soʻrash hozir mavjud emas — matn bilan yozing.',
    'ошибка.фото': 'Rasmni tayyorlab boʻlmadi — boshqasini tanlang.',
    выключено: 'AI Ustaz saytimizda javob beradi: aiustaz.pro.',
  },
  en: {
    заголовок: 'Ask AI Ustaz',
    подзаголовок: 'A mentor on Islam — from verified materials',
    граница: 'Answers only from verified AI Ustaz materials. Not a fatwa — ask an imam or the Muslim religious authority of your country your personal questions.',
    ии: 'AI Ustaz is a helper, not a scholar: it searches our base and can be wrong. Check against the sources.',
    пусто: 'Assalamu alaikum! Ask about Quran reading, tajweed, hadith, dua or prayer.',
    пример1: 'How is ayah 2:255 read?',
    пример2: 'What is ikhfa?',
    пример3: 'Hadith about intention',
    пример4: 'Dua when leaving home',
    поле: 'Your question',
    полеПодсказка: 'Type your question…',
    отправить: 'Send',
    микрофон: 'Ask by voice: hold and speak',
    камера: 'Take a photo',
    галерея: 'Choose a photo',
    личное: 'Do not write names, phone numbers or other personal data.',
    очистить: 'Clear',
    ждём: 'Searching our base…',
    слушаю: 'Recognising your voice…',
    смотрю: 'Looking at the photo…',
    запись: 'Speak… {в}',
    записьТап: 'Speak… {в} · tap “Stop”',
    сдвиг: '‹ slide left to cancel',
    стоп: 'Stop',
    отмена: 'Cancel recording',
    проверьтеТекст: 'Check the text and send it.',
    устаз: 'AI Ustaz',
    черновик: 'Draft — under review by an ustaz',
    коран: 'Quran, {с}',
    открыть: 'Open {с} in the Quran',
    открытьМатериал: 'Open in the app',
    слушать: 'Listen to the reciter',
    какЧитается: 'How this ayah is read',
    тафсирКарточка: 'AI Ustaz does not interpret the Quran on its own. Below is a published translation of the meanings of this ayah, as is, with the name of the edition. Tafsir is explained by scholars — ask an imam.',
    смыслАята: 'Translation of the meanings of {с}',
    нетЗвука: 'The reciter recording is not available here.',
    хадис: 'Hadith',
    степень: 'Grade: {с} (graded by: {к})',
    тафсир: 'Tafsir',
    статья: 'Article',
    справка: 'About the app',
    источник: 'Source: {и}',
    аятЗагрузка: 'Loading the ayah…',
    шаблонОтвет: 'Here is what our base has on your question:',
    шаблонНет: 'Our base has no answer to this question yet. Ask differently or ask an imam.',
    шаблонИмам: 'This is a personal fiqh question — an imam answers it. Ask the imam of your mosque or the Muslim religious authority of your country. AI Ustaz does not give fatwas.',
    шаблонВне: 'Here we answer only from our base: the Quran, tajweed, hadith, dua, prayer and how to use AI Ustaz.',
    общие: 'General information from our base — not an answer for your case:',
    распознано: 'In the photo: “{т}”',
    пожаловаться: 'Report',
    озвучить: 'Read the answer aloud',
    синтез: 'synthesised voice',
    подробнее: 'More',
    покажите: 'Show the source',
    проверьте: 'Test me',
    жалоба: 'What is wrong with the answer?',
    'причина.неверно': 'Wrong',
    'причина.непонятно': 'Unclear',
    'причина.другое': 'Other',
    комментарий: 'Comment (optional)',
    комментарийПодсказка: 'What should be fixed? No personal data.',
    жалобаОтправить: 'Send',
    жалобаОтмена: 'Cancel',
    жалобаСпасибо: 'Thank you! An ustaz will look at this answer.',
    жалобаНеУшла: 'Not sent — check your connection.',
    проверкаНет: 'I will test you once you pass at least one tajweed lesson: questions only on what you have covered.',
    проверкаУрок: 'A question from lesson {н}',
    верно: 'Correct!',
    неверно: 'Not quite. The correct answer is marked.',
    'ошибка.вопрос': 'The question must be 3 to 500 characters long.',
    'ошибка.лимит': 'Too many questions in a row — please wait a minute.',
    'ошибка.нет-базы': 'The knowledge base is unavailable right now. Please try later.',
    'ошибка.нет-связи': 'No connection — the question was not sent. Check your internet.',
    'ошибка.сбой': 'Something went wrong — please try again.',
    'ошибка.микЗапрещён': 'Allow microphone access in the browser settings and try again.',
    'ошибка.микНет': 'No microphone found.',
    'ошибка.микСбой': 'Could not turn on the microphone.',
    'ошибка.голосПусто': 'I did not catch that — say it again, closer to the phone.',
    'ошибка.держите': 'Hold the button while you speak.',
    'ошибка.голосБольшой': 'The recording is too long — up to 30 seconds.',
    'ошибка.голосВыкл': 'Voice questions are unavailable right now — type your question.',
    'ошибка.фото': 'Could not prepare the photo — choose another one.',
    выключено: 'AI Ustaz answers on our website aiustaz.pro.',
  },
}, 'screens/AskScreen');
type Т = ReturnType<typeof useСловарь<keyof (typeof СЛОВАРЬ)['ru']>>;
type Ключ = Parameters<Т>[0];
type Заметка =
  | 'вопрос'
  | 'лимит'
  | 'нет-базы'
  | 'нет-связи'
  | 'сбой'
  | 'микЗапрещён'
  | 'микНет'
  | 'микСбой'
  | 'голосПусто'
  | 'держите'
  | 'голосБольшой'
  | 'голосВыкл'
  | 'фото';

const ПРИМЕРЫ = ['пример1', 'пример2', 'пример3', 'пример4'] as const;
/** Вопрос голосом и по фото (владелец 28.11.2026: «только оставь текст») — выключено. */
const ГОЛОС_И_ФОТО = false;

const ПРИЧИНЫ: readonly ПричинаЖалобы[] = ['неверно', 'непонятно', 'другое'];

/** Переписка в памяти страницы (между разделами); на телефоне — ask/history.ts. */
let переписка: ЗаписьЧата[] | null = null;

export function СпроситьУстаза(_: ПропсыЭкрана<'устаз'>) {
  const т = useСловарь(СЛОВАРЬ);
  const { язык } = useПеревод();
  const { цвет, отступ } = useТема();
  const уменьшить = useУменьшитьДвижение();
  const [записи, установитьЗаписи] = useState<ЗаписьЧата[]>(переписка ?? []);
  const [вопрос, установитьВопрос] = useState('');
  const [занят, установитьЗанят] = useState<null | 'ответ' | 'голос' | 'фото'>(null);
  const [заметка, установитьЗаметку] = useState<Заметка | null>(null);
  const [услышано, установитьУслышано] = useState(false);
  const [возможности, установитьВозможности] = useState<ВозможностиЧата>({
    голос: false,
    фото: false,
  });
  const [жалоба, установитьЖалобу] = useState<string | null>(null);
  const [запись, установитьЗапись] = useState<null | {
    сек: number;
    тап: boolean;
  }>(null);
  const [сдвиг, установитьСдвиг] = useState(0);
  const [высотаПоля, установитьВысотуПоля] = useState(44);
  const [вФокусе, установитьВФокусе] = useState(false);
  const [предупреждениеСвёрнуто, установитьСвёрнуто] = useState(false);
  useEffect(() => {
    void прочитатьJSON<boolean>(КЛЮЧ_ПРЕДУПРЕЖДЕНИЯ, false).then((с) => живой.current && установитьСвёрнуто(с === true));
  }, []);
  const свернутьПредупреждение = (с: boolean) => {
    установитьСвёрнуто(с);
    void записатьJSON(КЛЮЧ_ПРЕДУПРЕЖДЕНИЯ, с);
  };
  const включено = спроситьВключено();
  const свиток = useRef<ComponentRef<typeof ScrollView>>(null);
  const живой = useRef(true);
  const рекордер = useRef<ЗаписьГолоса | { ждём: true } | null>(null);
  const жест = useRef<null | {
    ид: number;
    x: number;
    y: number;
    т0: number;
    рамка: DOMRect | null;
    таймер: ReturnType<typeof setTimeout>;
  }>(null);
  const файлКамера = useRef<HTMLInputElement | null>(null);
  const файлГалерея = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    живой.current = true;
    if (переписка === null) void прочитатьИсторию().then((з) => живой.current && ((переписка = з), установитьЗаписи(з)));
    if (включено && ГОЛОС_И_ФОТО) void возможностиЧата().then((в) => живой.current && установитьВозможности(в));
    return () => {
      живой.current = false;
      остановитьОзвучку();
      отменитьЗапись();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    переписка = записи;
    void записатьИсторию(записи);
  }, [записи]);
  useEffect(() => {
    const таймер = setTimeout(() => свиток.current?.scrollToEnd({ animated: !уменьшить }), 60);
    return () => clearTimeout(таймер);
  }, [записи.length, занят, уменьшить]);

  function добавитьОтвет(ответ: ОтветУстаза) {
    установитьЗаписи((з) => [...з, { кто: 'устаз', ответ, ид: новыйИд() }]);
  }

  async function отправить(текст: string) {
    const q = текст.trim();
    if (!включено || занят) return;
    if (q.length < МИН_ВОПРОС || q.length > МАКС_ВОПРОС) return установитьЗаметку('вопрос');
    установитьЗаметку(null);
    установитьУслышано(false);
    установитьВопрос('');
    установитьЗаписи((з) => [...з, { кто: 'вы', текст: q, ид: новыйИд() }]);
    установитьЗанят('ответ');
    // Контекст — ссылка прошлого ответа Устаза (аят или хадис), без текстов вопросов (владелец 28.11.2026).
    const прошлый = [...записи].reverse().find((з) => з.кто === 'устаз');
    const итог = await спросить(q, основной(язык), { контекст: контекстИзОтвета(прошлый && прошлый.кто === 'устаз' ? прошлый.ответ : null) });
    if (!живой.current) return;
    установитьЗанят(null);
    if (итог.ок) добавитьОтвет(итог.ответ);
    else установитьЗаметку(итог.причина as ПричинаОтказа);
  }

  // ── фото: 📷 камера / 🖼 галерея → сжатие на телефоне → наш сервер (OCR) ──
  async function отправитьФото(файл: File | undefined) {
    if (!файл || занят) return;
    установитьЗаметку(null);
    let картинка: Blob;
    try {
      картинка = await сжатьФото(файл);
    } catch {
      return установитьЗаметку('фото');
    }
    установитьЗанят('фото');
    const итог = await фотографией(картинка, основной(язык));
    if (!живой.current) return;
    установитьЗанят(null);
    if (итог.ок) добавитьОтвет(итог.ответ);
    else установитьЗаметку(итог.причина);
  }

  // ── 🎤 «как в WhatsApp»: нажал — запись сразу; отпустил быстро — тап (Стоп и ✕); держал — отпустил → распознать ──
  async function начатьГолос() {
    if (занят || рекордер.current) return;
    остановитьОзвучку();
    установитьЗаметку(null);
    const ждём = { ждём: true as const };
    рекордер.current = ждём;
    let р: ЗаписьГолоса;
    try {
      р = await начатьЗапись({
        getUserMedia: (о) => navigator.mediaDevices.getUserMedia(о),
        Recorder: (window as unknown as { MediaRecorder: never }).MediaRecorder,
        наТик: (сек) => живой.current && рекордер.current === р && установитьЗапись((з) => (з ? { ...з, сек } : з)),
      });
    } catch (е) {
      if (рекордер.current === ждём) рекордер.current = null;
      const почему = ошибкаМикрофона(е);
      установитьЗаметку(почему === 'запрещён' ? 'микЗапрещён' : почему === 'нет' ? 'микНет' : 'микСбой');
      return;
    }
    if (!живой.current || рекордер.current !== ждём) return р.отмена();
    рекордер.current = р;
    установитьЗапись({ сек: 0, тап: false });
    const готово = await р.готово;
    if (рекордер.current === р) рекордер.current = null;
    if (!живой.current) return;
    установитьЗапись(null);
    установитьСдвиг(0);
    if (!готово) return;
    if (готово.мс < ГОЛОС_МИН_МС || !готово.blob.size) return установитьЗаметку('голосПусто');
    if (готово.blob.size > ГОЛОС_МАКС_БАЙТ) return установитьЗаметку('голосБольшой');
    установитьЗанят('голос');
    const итог = await голосом(готово.blob, основной(язык));
    if (!живой.current) return;
    установитьЗанят(null);
    if (итог.ок) {
      установитьВопрос((б) => добавитьСказанное(б, итог.текст, МАКС_ВОПРОС));
      установитьУслышано(true);
    } else
      установитьЗаметку(
        итог.причина === 'пусто'
          ? 'голосПусто'
          : итог.причина === 'выключено'
            ? 'голосВыкл'
            : итог.причина === 'большой'
              ? 'голосБольшой'
              : итог.причина === 'лимит'
                ? 'лимит'
                : итог.причина === 'нет-связи'
                  ? 'нет-связи'
                  : 'сбой',
      );
  }
  function стопГолос() {
    const р = рекордер.current;
    if (р && 'стоп' in р) р.стоп();
  }
  function отменитьЗапись() {
    const р = рекордер.current;
    рекордер.current = null;
    установитьЗапись(null);
    установитьСдвиг(0);
    if (р && 'отмена' in р) р.отмена();
  }
  const жестМикрофона = ВЕБ
    ? {
        onPointerDown: (е: PointerEvent) => {
          if (е.button !== 0 || жест.current || занят || рекордер.current) return;
          е.preventDefault();
          const эл = е.currentTarget as HTMLElement;
          try {
            эл.setPointerCapture(е.pointerId);
          } catch {
            /* ок */
          }
          жест.current = {
            ид: е.pointerId,
            x: е.clientX,
            y: е.clientY,
            т0: Date.now(),
            рамка: эл.getBoundingClientRect?.() ?? null,
            таймер: setTimeout(() => undefined, УДЕРЖАНИЕ_МС),
          };
          void начатьГолос();
        },
        onPointerMove: (е: PointerEvent) => {
          const г = жест.current;
          if (!г || е.pointerId !== г.ид) return;
          const dx = е.clientX - г.x;
          if (сдвигОтменяет(dx, заКраем(г.рамка, е.clientX, е.clientY))) {
            жест.current = null;
            отменитьЗапись();
            return;
          }
          установитьСдвиг(сдвигПодсказки(dx));
        },
        onPointerUp: (е: PointerEvent) => {
          const г = жест.current;
          if (!г || е.pointerId !== г.ид) return;
          жест.current = null;
          clearTimeout(г.таймер);
          const р = рекордер.current;
          const как = отпустили(Date.now() - г.т0, !!(р && 'стоп' in р), false);
          if (как === 'тап') return установитьЗапись((з) => (з ? { ...з, тап: true } : { сек: 0, тап: true }));
          if (как === 'отправить') return стопГолос();
          отменитьЗапись();
          if (как === 'коротко') установитьЗаметку('держите');
          else if (как === 'разрешить') установитьЗаметку('микЗапрещён');
        },
        onPointerCancel: () => {
          жест.current = null;
          отменитьЗапись();
        },
      }
    : {};

  const колонка = {
    width: '100%' as const,
    maxWidth: ШИРИНА_КОЛОНКИ,
    alignSelf: 'center' as const,
  };
  const есть = вопрос.trim().length >= МИН_ВОПРОС;
  const голосЕсть = ГОЛОС_И_ФОТО && включено && возможности.голос && голосПоддерживается();
  const фотоЕсть = ГОЛОС_И_ФОТО && включено && возможности.фото && ВЕБ;

  // Шапка экрана (владелец 27.11.2026, как у Айалема): образ Устаза, «Спросите AI Ustaz», подзаголовок; справа «Очистить».
  // Шапка — одна строка (владелец 28.11.2026: «уменьшить … место»): аватар 32, «AI Ustaz»; подзаголовок — в
  // предупреждении сверху ленты. Свернули предупреждение — справа значок «i», чтобы снова открыть.
  const шапка = (
    <View testID="устаз-шапка" style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.s, alignSelf: 'stretch', paddingStart: 4 }}>
      <ОбразУстаза размер={32} testID="устаз-образ" />
      <Текст вид="метка" numberOfLines={1} стиль={{ flex: 1, minWidth: 0, fontSize: 17 }} {...((ВЕБ ? { 'aria-hidden': true } : {}) as object)}>
        {т('устаз')}
      </Текст>
      {предупреждениеСвёрнуто ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={т('граница')}
          {...((ВЕБ ? { 'aria-expanded': false } : { accessibilityState: { expanded: false } }) as object)}
          onPress={() => свернутьПредупреждение(false)}
          testID="устаз-граница-открыть"
          style={({ pressed }) => ({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Значок имя="инфо" размер={20} цвет={цвет.текстВторой} />
        </Pressable>
      ) : null}
    </View>
  );
  const очистить = записи.length ? (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        остановитьОзвучку();
        установитьЗаписи([]);
        void очиститьИсторию();
      }}
      testID="устаз-очистить"
      style={({ pressed }) => ({ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: отступ.s, opacity: pressed ? 0.6 : 1 })}
    >
      <Текст вид="метка" цвет={цвет.акцент}>
        {т('очистить')}
      </Текст>
    </Pressable>
  ) : null;

  return (
    <Экран заголовок={т('заголовок')} заголовокСкрыт эмблема={false} посередине={шапка} справа={очистить} прокрутка={false} testID="экран-устаз">
      <ScrollView
        ref={свиток}
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={[колонка, { padding: отступ.l, gap: отступ.m }]}
        keyboardShouldPersistTaps="handled"
      >
        {предупреждениеСвёрнуто ? null : (
          <View
            testID="устаз-граница"
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, borderRadius: 10, backgroundColor: цвет.акцентМягкий, paddingVertical: 6, paddingStart: 10, paddingEnd: 2 }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Текст вид="мелкий" стиль={ПРЕДУПРЕЖДЕНИЕ}>
                {т('подзаголовок')}. {т('граница')}
              </Текст>
              <Текст вид="мелкий" цвет={цвет.текстВторой} стиль={ПРЕДУПРЕЖДЕНИЕ} testID="устаз-ии">
                {т('ии')}
              </Текст>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={т('граница')}
              {...((ВЕБ ? { 'aria-expanded': true } : { accessibilityState: { expanded: true } }) as object)}
              onPress={() => свернутьПредупреждение(true)}
              testID="устаз-граница-свернуть"
              hitSlop={6}
              style={({ pressed }) => ({ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
            >
              <Значок имя="закрыть" размер={16} цвет={цвет.текстВторой} />
            </Pressable>
          </View>
        )}
        {записи.length === 0 ? (
          <View
            testID="устаз-пусто"
            style={{
              alignItems: 'center',
              gap: отступ.m,
              paddingTop: отступ.s,
            }}
          >
            <ОбразУстаза размер={160} фон testID="устаз-образ-большой" />
            <Текст стиль={{ textAlign: 'center' }}>{т('пусто')}</Текст>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: отступ.s,
              }}
            >
              {ПРИМЕРЫ.map((к, i) => (
                <Чип key={к} надпись={т(к)} выкл={!включено} приНажатии={() => void отправить(т(к))} testID={'устаз-пример-' + (i + 1)} />
              ))}
            </View>
          </View>
        ) : (
          записи.map((з, i) =>
            з.кто === 'вы' ? (
              <View
                key={з.ид}
                testID={'устаз-вопрос-' + i}
                style={{
                  alignSelf: 'flex-end',
                  maxWidth: '85%',
                  backgroundColor: цвет.акцент,
                  borderRadius: 18,
                  borderBottomEndRadius: 6,
                  paddingHorizontal: отступ.m,
                  paddingVertical: отступ.s,
                }}
              >
                <Текст цвет={цвет.акцентТекст}>{з.текст}</Текст>
              </View>
            ) : (
              <Ответ key={з.ид} ид={з.ид} ответ={з.ответ} номер={i} т={т} пожаловаться={() => установитьЖалобу(з.ид)} спроситьПример={(q) => void отправить(q)} />
            ),
          )
        )}
        {занят ? (
          <View
            testID="устаз-ждём"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: отступ.s,
            }}
            {...((ВЕБ ? { role: 'status' } : {}) as object)}
          >
            <ОбразУстаза размер={32} />
            <Текст вид="второй">{т(занят === 'голос' ? 'слушаю' : занят === 'фото' ? 'смотрю' : 'ждём')}</Текст>
          </View>
        ) : null}
      </ScrollView>

      {/* Нижний блок (владелец 28.11.2026: «большое место берёт блок с чатом, где пишешь»): в покое — одна строка
          ≈ 44 px в одной рамке [📷][🖼][ поле ][🎤 | ➤]; поле растёт вверх до 4 строк, кнопки — внизу той же строки;
          ➤ заменяет 🎤, когда есть текст. Подпись о личных данных — только при фокусе в поле. Снизу — 20 px под круг
          AI Ustaz в меню (он выступает над линией меню). */}
      <View style={{ borderTopWidth: 1, borderTopColor: цвет.граница, backgroundColor: цвет.фон }} testID="устаз-низ">
        <View style={[колонка, { paddingHorizontal: отступ.s, paddingTop: 5, paddingBottom: 20, gap: 3 }]}>
          {заметка ? (
            <Текст вид="мелкий" цвет={цвет.текстВторой} testID="устаз-ошибка" {...((ВЕБ ? { role: 'alert' } : {}) as object)}>
              {т(('ошибка.' + заметка) as Ключ)}
            </Текст>
          ) : услышано ? (
            <Текст вид="мелкий" цвет={цвет.текстВторой} testID="устаз-услышано">
              {т('проверьтеТекст')}
            </Текст>
          ) : null}
          {!включено ? (
            <Текст вид="мелкий" testID="устаз-выключено">
              {т('выключено')}
            </Текст>
          ) : null}
          {вФокусе && !заметка && !услышано ? (
            <Текст вид="мелкий" цвет={цвет.текстВторой} стиль={{ fontSize: 12, lineHeight: 16, textAlign: 'center' }} testID="устаз-личное">
              {т('личное')}
            </Текст>
          ) : null}
          <View
            testID="устаз-рамка"
            style={{ flexDirection: 'row', alignItems: 'flex-end', borderRadius: 22, borderWidth: 1, borderColor: вФокусе ? цвет.акцент : цвет.граница, backgroundColor: цвет.поверхность, paddingHorizontal: 2, minHeight: 44 }}
          >
            {фотоЕсть && !запись ? (
              <>
                <КругКнопка значок="камера" подпись={т('камера')} выкл={!!занят} мелкая приНажатии={() => файлКамера.current?.click()} testID="устаз-камера" />
                <КругКнопка значок="галерея" подпись={т('галерея')} выкл={!!занят} мелкая приНажатии={() => файлГалерея.current?.click()} testID="устаз-галерея" />
                {createElement('input', {
                  ref: файлКамера,
                  type: 'file',
                  accept: 'image/*',
                  capture: 'environment',
                  hidden: true,
                  'data-testid': 'устаз-файл-камера',
                  onChange: (е: { target: HTMLInputElement }) => {
                    void отправитьФото(е.target.files?.[0]);
                    е.target.value = '';
                  },
                })}
                {createElement('input', {
                  ref: файлГалерея,
                  type: 'file',
                  accept: 'image/*',
                  hidden: true,
                  'data-testid': 'устаз-файл-галерея',
                  onChange: (е: { target: HTMLInputElement }) => {
                    void отправитьФото(е.target.files?.[0]);
                    е.target.value = '';
                  },
                })}
              </>
            ) : null}
            {запись ? (
              <View
                testID="устаз-запись"
                style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: отступ.s, minHeight: 42, paddingHorizontal: отступ.s }}
                {...((ВЕБ ? { role: 'status' } : {}) as object)}
              >
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#C0392B' }} />
                <Текст вид="мелкий" стиль={{ flex: 1, transform: [{ translateX: сдвиг }] }} numberOfLines={1}>
                  {т(запись.тап ? 'записьТап' : 'запись', { в: ммсс(запись.сек) })}
                  {запись.тап ? '' : '  ' + т('сдвиг')}
                </Текст>
              </View>
            ) : (
              <TextInput
                value={вопрос}
                onChangeText={(т_) => установитьВопрос(т_.slice(0, МАКС_ВОПРОС))}
                onSubmitEditing={() => void отправить(вопрос)}
                onFocus={() => установитьВФокусе(true)}
                onBlur={() => установитьВФокусе(false)}
                placeholder={т('полеПодсказка')}
                placeholderTextColor={цвет.текстВторой}
                accessibilityLabel={т('поле')}
                editable={включено}
                multiline
                maxLength={МАКС_ВОПРОС}
                blurOnSubmit
                enterKeyHint="send"
                testID="устаз-поле"
                onContentSizeChange={(е) => установитьВысотуПоля(е.nativeEvent.contentSize.height)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: МИН_ВЫСОТА_ПОЛЯ,
                  height: вопрос ? Math.min(Math.max(МИН_ВЫСОТА_ПОЛЯ, высотаПоля), МАКС_ВЫСОТА_ПОЛЯ) : МИН_ВЫСОТА_ПОЛЯ,
                  maxHeight: МАКС_ВЫСОТА_ПОЛЯ,
                  marginVertical: 1,
                  paddingHorizontal: 6,
                  paddingVertical: 10,
                  fontFamily: ШРИФТ_ИНТЕРФЕЙСА,
                  fontSize: 16,
                  lineHeight: 20,
                  color: цвет.текст,
                  ...(ВЕБ ? ({ outlineStyle: 'none', resize: 'none' } as object) : null),
                }}
              />
            )}
            {запись?.тап ? (
              <>
                <КругКнопка значок="закрыть" подпись={т('отмена')} мелкая приНажатии={отменитьЗапись} testID="устаз-запись-отмена" />
                <КругКнопка значок="стоп" подпись={т('стоп')} акцент мелкая приНажатии={стопГолос} testID="устаз-запись-стоп" />
              </>
            ) : голосЕсть && (!есть || запись) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={т('микрофон')}
                disabled={!!занят}
                testID="устаз-микрофон"
                {...(жестМикрофона as object)}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  margin: 1,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: запись ? '#C0392B' : 'transparent',
                  transform: [{ scale: запись ? 1.15 : 1 }],
                  opacity: занят ? 0.5 : pressed ? 0.7 : 1,
                  ...(ВЕБ ? ({ touchAction: 'none', userSelect: 'none' } as object) : null),
                })}
              >
                <Значок имя="микрофон" размер={22} цвет={запись ? '#FFFFFF' : цвет.акцент} толщина={2} />
              </Pressable>
            ) : (
              <КругКнопка
                значок="вперёд"
                подпись={т('отправить')}
                акцент={есть && включено && !занят}
                круг
                мелкая
                выкл={!есть || !включено || !!занят}
                приНажатии={() => void отправить(вопрос)}
                testID="устаз-отправить"
              />
            )}
          </View>
        </View>
      </View>
      <ЛистЖалобы т={т} открыт={жалоба !== null} ответ={записи.find((з) => з.ид === жалоба)} закрыть={() => установитьЖалобу(null)} />
    </Экран>
  );
}

function Чип({ надпись, приНажатии, testID, выкл }: { надпись: string; приНажатии: () => void; testID?: string; выкл?: boolean }) {
  const { цвет, отступ } = useТема();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={выкл}
      onPress={приНажатии}
      testID={testID}
      hitSlop={{ top: 5, bottom: 5 }}
      style={({ pressed }) => ({
        minHeight: 34,
        maxHeight: 36,
        justifyContent: 'center',
        paddingHorizontal: отступ.m,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: цвет.акцент,
        backgroundColor: pressed ? цвет.акцентМягкий : цвет.поверхность,
        opacity: выкл ? 0.5 : 1,
      })}
    >
      <Текст вид="мелкий" цвет={цвет.акцент} numberOfLines={1} стиль={{ fontWeight: '600', fontSize: 14, lineHeight: 18 }}>
        {надпись}
      </Текст>
    </Pressable>
  );
}

function КругКнопка({
  значок,
  подпись,
  приНажатии,
  testID,
  акцент,
  выкл,
  круг,
  мелкая,
}: {
  значок: 'камера' | 'галерея' | 'вперёд' | 'стоп' | 'закрыть';
  подпись: string;
  приНажатии: () => void;
  testID: string;
  акцент?: boolean;
  выкл?: boolean;
  /** Всегда круг (➤ «Отправить»): без акцента — серый. */
  круг?: boolean;
  /** 40 px внутри рамки поля (владелец 28.11.2026: «компактнее»). */
  мелкая?: boolean;
}) {
  const { цвет } = useТема();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={подпись}
      disabled={выкл}
      onPress={приНажатии}
      testID={testID}
      style={({ pressed }) => ({
        width: мелкая ? 40 : 44,
        height: мелкая ? 40 : 44,
        margin: мелкая ? 1 : 0,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: акцент ? цвет.акцент : круг ? цвет.граница : 'transparent',
        opacity: выкл && !круг ? 0.45 : pressed ? 0.7 : 1,
      })}
    >
      <Значок имя={значок} размер={22} цвет={акцент ? цвет.акцентТекст : круг ? цвет.текстВторой : цвет.акцент} толщина={2} />
    </Pressable>
  );
}

/** Пузырь ответа Устаза: аватар, текст, аят (если «как читается»), источники, «Пожаловаться», 🔊, чипы. */
function Ответ({
  ид,
  ответ,
  номер,
  т,
  пожаловаться: открытьЖалобу,
  спроситьПример,
}: {
  ид: string;
  ответ: ОтветУстаза;
  номер: number;
  т: Т;
  пожаловаться: () => void;
  /** Чип-пример под приветствием или «уточните» — сразу задать этот вопрос. */
  спроситьПример?: (вопрос: string) => void;
}) {
  const { цвет, отступ, радиус } = useТема();
  const { язык } = useПеревод();
  const { перейти } = useНавигация();
  const { прогресс } = useПрогресс();
  const [говорю, установитьГоворю] = useState(false);
  const [подробно, установитьПодробно] = useState(false);
  const [проверка, установитьПроверку] = useState<ВопросПроверки | null | 'нет' | 'ждём'>(null);
  const шаблон: Record<ОтветУстаза['вид'], Ключ> = {
    ответ: 'шаблонОтвет',
    'нет-в-базе': 'шаблонНет',
    'к-имаму': 'шаблонИмам',
    'вне-темы': 'шаблонВне',
  };
  const аят = ответ.намерение === 'аят' ? ответ.источники.find((и) => и.вид === 'коран') : undefined;
  // Тафсир (владелец 28.11.2026): ИИ-тафсира нет; ссылка на аят — только для чипов «Как читается…», «Слушать», «Открыть».
  const аятТафсира = ответ.намерение === 'тафсир' ? ссылкаАята(ответ.источники.find((и) => и.вид === 'коран')?.ссылка) : null;
  const прочие = ответ.источники.filter((и) => и !== аят && !(аятТафсира && и.вид === 'коран'));
  // Владелец 28.11.2026: на «о чём этот аят?» — карточка изданного перевода смыслов аята из файлов приложения
  // (quran-trans, QuranEnc.com, как есть), без тафсира (решение владельца 28.11.2026), и только если перевод на языке
  // интерфейса есть (en, tr, id, ur, uz). Текст сервера («тафсира не даём…») заменяет наш шаблон, только когда карточка
  // есть и своих записей тафсира в базе нет; сервер не менялся.
  const естьПеревод = useЕстьПеревод();
  const карточкаСмысла = !!аятТафсира && прочие.length === 0 && естьПеревод;
  const текст = карточкаСмысла ? т('тафсирКарточка') : ответ.вид === 'ответ' && ответ.текст ? ответ.текст : т(шаблон[ответ.вид]);
  // 🔊 — только наш текст ответа и переводы/пояснения источников; заголовки (транслитерация названий дуа) — нет.
  const дляОзвучки = [текст, ...прочие.slice(0, 2).map((и) => и.текст)].join('. ');
  const озвучкаМожно = озвучкаЕсть(основной(язык));
  const первая = прочие.find((и) => адресИсточника(и));
  const чипыПримеров = ответ.намерение === 'приветствие' || ответ.намерение === 'уточнить';
  const чипыПродолжения = ответ.вид === 'ответ' && !ответ.намерение;
  return (
    <View testID={'устаз-ответ-' + номер} style={{ alignSelf: 'stretch', gap: отступ.s }}>
      {/* Как у Айалема (владелец 28.11.2026): аватар — слева у низа пузыря; «Пожаловаться» и 🔊 — в нижней строке
          пузыря справа; под пузырём — чипы-продолжения. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: отступ.s }}>
        <ОбразУстаза размер={32} testID={'устаз-аватар-' + номер} />
        <View
          testID={ответ.вид === 'к-имаму' ? 'устаз-к-имаму' : 'устаз-пузырь-' + номер}
          style={{
            flex: 1,
            minWidth: 0,
            backgroundColor: цвет.поверхность,
            borderRadius: радиус.l,
            borderBottomStartRadius: 6,
            borderWidth: 1,
            borderColor: ответ.вид === 'к-имаму' ? цвет.акцент : цвет.граница,
            paddingTop: отступ.s,
            paddingHorizontal: отступ.m,
            paddingBottom: 2,
            gap: отступ.s,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.s, flexWrap: 'wrap' }}>
            <Текст вид="метка" цвет={цвет.акцент}>
              {т('устаз')}
            </Текст>
            {ответ.черновик ? <Плашка вид="черновик" надпись={т('черновик')} малая /> : null}
          </View>
          {ответ.распознано ? (
            <Текст вид="мелкий" цвет={цвет.текстВторой} testID="устаз-распознано">
              {т('распознано', { т: ответ.распознано })}
            </Текст>
          ) : null}
          <Текст testID={'устаз-ответ-' + номер + '-текст'} стиль={ШРИФТ_ПУЗЫРЯ}>
            {текст}
          </Текст>
          {ответ.вид === 'к-имаму' && прочие.length ? <Текст вид="мелкий">{т('общие')}</Текст> : null}
          {аят ? <АятОтвет и={аят} т={т} /> : null}
          {карточкаСмысла && аятТафсира ? <КарточкаСмысла сура={аятТафсира.сура} аят={аятТафсира.аят} т={т} номер={номер} /> : null}
          {прочие.length ? (
            <View style={{ gap: отступ.s }} {...((ВЕБ ? { role: 'list' } : {}) as object)}>
              {прочие.map((и) => (
                <КарточкаИсточника key={и.id} и={и} т={т} полностью={подробно} />
              ))}
            </View>
          ) : null}
          <View testID={'устаз-действия-' + номер} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: отступ.m }}>
            {говорю ? (
              <Текст вид="мелкий" цвет={цвет.текстВторой} стиль={{ flex: 1 }}>
                {т('синтез')}
              </Текст>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={открытьЖалобу}
              testID={'устаз-пожаловаться-' + номер}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, opacity: pressed ? 0.6 : 1 })}
            >
              <Значок имя="флаг" размер={15} цвет={цвет.текстВторой} />
              <Текст вид="мелкий" цвет={цвет.текстВторой}>
                {т('пожаловаться')}
              </Текст>
            </Pressable>
            {озвучкаМожно ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={т('озвучить')}
                onPress={() => {
                  if (говорю) {
                    остановитьОзвучку();
                    установитьГоворю(false);
                  } else if (озвучить(дляОзвучки, основной(язык), () => установитьГоворю(false))) установитьГоворю(true);
                }}
                testID={'устаз-озвучить-' + номер}
                style={({ pressed }) => ({ minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
              >
                <Значок имя={говорю ? 'стоп' : 'аудио'} размер={20} цвет={цвет.акцент} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
      {чипыПримеров && спроситьПример ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: отступ.s, paddingStart: 32 + отступ.s }}>
          {ПРИМЕРЫ.map((к, i) => (
            <Чип key={к} надпись={т(к)} приНажатии={() => спроситьПример(т(к))} testID={'устаз-чип-пример-' + номер + '-' + (i + 1)} />
          ))}
        </View>
      ) : null}
      {аятТафсира ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: отступ.s, paddingLeft: 32 + отступ.s }} testID={'устаз-чипы-тафсира-' + номер}>
          {спроситьПример ? (
            <Чип
              надпись={т('какЧитается')}
              приНажатии={() => спроситьПример(`${т('какЧитается')} ${аятТафсира.сура}:${аятТафсира.аят}`)}
              testID={'устаз-чип-как-читается-' + номер}
            />
          ) : null}
          <Чип
            надпись={т('слушать')}
            приНажатии={() => {
              if (доступныйИсточник()) плеер.играть({ сура: аятТафсира.сура, сАята: аятТафсира.аят });
            }}
            testID={'устаз-чип-слушать-' + номер}
          />
          <Чип
            надпись={т('открыть', { с: аятТафсира.сура + ':' + аятТафсира.аят })}
            приНажатии={() => перейти('сура', { номер: аятТафсира.сура, аят: аятТафсира.аят })}
            testID={'устаз-чип-открыть-' + номер}
          />
        </View>
      ) : null}
      {чипыПродолжения ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: отступ.s, paddingStart: 32 + отступ.s }}>
          {первая ? <Чип надпись={т('подробнее')} приНажатии={() => открыть(перейти, первая)} testID={'устаз-чип-подробнее-' + номер} /> : null}
          {прочие.length ? <Чип надпись={т('покажите')} приНажатии={() => установитьПодробно((п) => !п)} testID={'устаз-чип-источник-' + номер} /> : null}
          <Чип
            надпись={т('проверьте')}
            приНажатии={() => {
              установитьПроверку('ждём');
              void взятьВопрос(прогресс).then((в) => установитьПроверку(в ?? 'нет'));
            }}
            testID={'устаз-чип-проверка-' + номер}
          />
        </View>
      ) : null}
      {проверка && проверка !== 'ждём' ? (
        <View style={{ paddingStart: 32 + отступ.s }}>
          <Проверка вопрос={проверка} т={т} ключ={ид} />
        </View>
      ) : null}
    </View>
  );
}

function адресИсточника(и: ИсточникОтвета): string | null {
  if (и.вид === 'хадис') {
    const м = /^site\.hadith\.(\d{1,6})$/.exec(и.id);
    return м ? '#/hadith/item?n=' + м[1] : null;
  }
  return и.ссылка && и.ссылка.startsWith('#/') && изХэша(и.ссылка) ? и.ссылка : null;
}

function открыть(перейти: ReturnType<typeof useНавигация>['перейти'], и: ИсточникОтвета) {
  const адрес = адресИсточника(и);
  const цель = адрес ? изХэша(адрес) : null;
  if (цель) (перейти as (э: string, п?: unknown) => void)(цель.экран, цель.параметры);
}

/** «Как читается аят»: аят из СВОЕЙ копии Tanzil с цветами таджвида и правилами, ▶ чтец, «Открыть в Коране». */
/** Перевод смыслов аята в ответе чата — те же файлы и подписи, что в листе аята (components/quran/AyahMeaning). */
function КарточкаСмысла({ сура, аят, т, номер }: { сура: number; аят: number; т: Т; номер: number }) {
  const { цвет, отступ, радиус } = useТема();
  return (
    <View
      testID={'устаз-смысл-' + номер}
      style={{ borderRadius: радиус.l, borderWidth: 1, borderColor: цвет.граница, borderStartWidth: 4, borderStartColor: цвет.золотоДекор, padding: отступ.m, gap: отступ.m, backgroundColor: цвет.фон }}
    >
      <Текст вид="метка" цвет={цвет.акцент}>
        {т('смыслАята', { с: сура + ':' + аят })}
      </Текст>
      <СлойАята сура={сура} аят={аят} мелко testID={'устаз-смысл-перевод-' + номер} />
    </View>
  );
}

function АятОтвет({ и, т }: { и: ИсточникОтвета; т: Т }) {
  const { цвет, отступ, радиус } = useТема();
  const { перейти } = useНавигация();
  const ссылка = ссылкаАята(и.ссылка);
  const с = useСура(ссылка?.сура ?? 1);
  const [нетЗвука, установитьНетЗвука] = useState(false);
  if (!ссылка) return null;
  const аяты = Array.from({ length: ссылка.до - ссылка.аят + 1 }, (_, к) => ссылка.аят + к).slice(0, 7);
  const подпись = ссылка.сура + ':' + ссылка.аят + (ссылка.до > ссылка.аят ? '–' + ссылка.до : '');
  return (
    <View
      testID="устаз-аят"
      style={{
        borderRadius: радиус.l,
        borderWidth: 1,
        borderColor: цвет.граница,
        borderStartWidth: 4,
        borderStartColor: цвет.золотоДекор,
        padding: отступ.m,
        gap: отступ.s,
        backgroundColor: цвет.фон,
      }}
    >
      <Текст вид="метка" цвет={цвет.акцент}>
        {т('коран', { с: подпись })}
      </Текст>
      {с.состояние === 'есть' ? (
        аяты.map((н) => (с.данные.аяты[н - 1] ? <ТаджвидАята key={н} сура={с.данные} аят={н} /> : null))
      ) : (
        <Текст вид="мелкий">{т('аятЗагрузка')}</Текст>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: отступ.s }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (!доступныйИсточник()) return установитьНетЗвука(true);
            плеер.играть({ сура: ссылка.сура, сАята: ссылка.аят });
          }}
          testID="устаз-аят-слушать"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minHeight: 44,
            paddingHorizontal: отступ.m,
            borderRadius: 22,
            backgroundColor: цвет.акцент,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Значок имя="играть" размер={18} цвет={цвет.акцентТекст} />
          <Текст вид="метка" цвет={цвет.акцентТекст}>
            {т('слушать')}
          </Текст>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => перейти('сура', { номер: ссылка.сура, аят: ссылка.аят })}
          testID={`устаз-открыть-${ссылка.сура}-${ссылка.аят}`}
          style={({ pressed }) => ({
            minHeight: 44,
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Текст вид="метка" цвет={цвет.акцент} стиль={{ textDecorationLine: 'underline' }}>
            {т('открыть', { с: ссылка.сура + ':' + ссылка.аят })}
          </Текст>
        </Pressable>
      </View>
      {нетЗвука ? <Текст вид="мелкий">{т('нетЗвука')}</Текст> : null}
    </View>
  );
}

function КарточкаИсточника({ и, т, полностью }: { и: ИсточникОтвета; т: Т; полностью: boolean }) {
  const { цвет, отступ, радиус } = useТема();
  const { перейти } = useНавигация();
  const [развёрнут, установитьРазвёрнут] = useState(false);
  const аят = и.вид === 'коран' ? ссылкаАята(и.ссылка) : null;
  const метка =
    и.вид === 'коран' && аят ? т('коран', { с: аят.сура + ':' + аят.аят }) : и.вид === 'хадис' ? т('хадис') + (и.ссылка ? ' · ' + и.ссылка : '') : т(и.вид);
  const адрес = адресИсточника(и);
  // Владелец 28.11.2026 («уменьшить текст»): заголовок 16 semibold ≤ 3 строк, текст 15 — 5 строк и «Подробнее ›»
  // (разворачивает); «Открыть в приложении ›» — открывает хадис, дуа, урок в своём разделе.
  const весь = полностью || развёрнут;
  const длинный = и.текст.length > 220;
  return (
    <View
      testID={'устаз-источник-' + и.id}
      {...((ВЕБ ? { role: 'listitem' } : {}) as object)}
      style={{
        borderRadius: радиус.m,
        borderWidth: 1,
        borderColor: цвет.граница,
        borderStartWidth: 3,
        borderStartColor: цвет.золотоДекор,
        paddingVertical: отступ.s,
        paddingHorizontal: 10,
        gap: 4,
        backgroundColor: цвет.фон,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.s, flexWrap: 'wrap' }}>
        <Текст вид="мелкий" цвет={цвет.акцент} стиль={{ fontWeight: '600', fontSize: 13 }}>
          {метка}
        </Текст>
        {и.черновик ? <Плашка вид="черновик" надпись={т('черновик')} малая /> : null}
      </View>
      <Текст numberOfLines={3} стиль={{ fontSize: 16, lineHeight: 22, fontWeight: '600' }} testID={'устаз-источник-заголовок-' + и.id}>
        {и.заголовок}
      </Текст>
      {и.вид === 'хадис' && и.арабский && весь ? (
        <АрабскийТекст размер="малый" выравнивание="right">
          {и.арабский}
        </АрабскийТекст>
      ) : null}
      {и.текст ? (
        <Текст numberOfLines={весь ? undefined : 5} стиль={{ fontSize: 15, lineHeight: 21 }} testID={'устаз-источник-текст-' + и.id}>
          {и.текст}
        </Текст>
      ) : null}
      {и.вид === 'хадис' && и.степень && и.кто_оценил ? (
        <Текст вид="мелкий" стиль={{ fontSize: 13 }}>
          {т('степень', { с: и.степень, к: и.кто_оценил })}
        </Текст>
      ) : null}
      {весь ? (
        <Текст вид="мелкий" цвет={цвет.текстВторой} стиль={{ fontSize: 12 }}>
          {т('источник', { и: и.источник })}
        </Текст>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: отступ.m }}>
        {длинный && !весь ? (
          <Pressable
            accessibilityRole="button"
            {...((ВЕБ ? { 'aria-expanded': false } : { accessibilityState: { expanded: false } }) as object)}
            onPress={() => установитьРазвёрнут(true)}
            testID={'устаз-развернуть-' + и.id}
            style={({ pressed }) => ({ minHeight: 32, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Текст вид="мелкий" цвет={цвет.акцент} стиль={{ fontWeight: '600', fontSize: 14 }}>
              {т('подробнее')} ›
            </Текст>
          </Pressable>
        ) : null}
        {адрес ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => открыть(перейти, и)}
            testID={'устаз-открыть-' + и.id}
            style={({ pressed }) => ({ minHeight: 32, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Текст вид="мелкий" цвет={цвет.акцент} стиль={{ fontWeight: '600', fontSize: 14 }}>
              {т('открытьМатериал')} ›
            </Текст>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** «Проверьте меня»: задание «выбор» из пройденного урока (ask/quiz.ts); пояснение — из утверждённой базы. */
function Проверка({ вопрос, т, ключ }: { вопрос: ВопросПроверки | 'нет'; т: Т; ключ: string }) {
  const { цвет, отступ, радиус } = useТема();
  const { язык } = useПеревод();
  const [выбран, установитьВыбран] = useState<number | null>(null);
  if (вопрос === 'нет') {
    return (
      <View
        testID="устаз-проверка"
        style={{
          borderRadius: радиус.l,
          backgroundColor: цвет.акцентМягкий,
          padding: отступ.m,
        }}
      >
        <Текст вид="мелкий">{т('проверкаНет')}</Текст>
      </View>
    );
  }
  const з = вопрос.задание;
  const текстЯз = (л: { ru: string; kk: string; uz?: string; en?: string } | undefined) => (л ? (л as Record<string, string | undefined>)[язык] || л.ru : '');
  return (
    <View
      testID="устаз-проверка"
      key={ключ}
      style={{
        borderRadius: радиус.l,
        borderWidth: 1,
        borderColor: цвет.акцент,
        padding: отступ.m,
        gap: отступ.s,
        backgroundColor: цвет.поверхность,
      }}
    >
      <Текст вид="мелкий" цвет={цвет.текстВторой}>
        {т('проверкаУрок', { н: String(вопрос.урок) })}
      </Текст>
      <Текст стиль={{ fontWeight: '600' }}>{текстЯз(з.вопрос)}</Текст>
      {з.показ ? (
        <АрабскийТекст размер="крупный" выравнивание="center">
          {з.показ}
        </АрабскийТекст>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: отступ.s }}>
        {з.варианты.map((в, i) => {
          const верный = i === з.верный;
          const отмечен = выбран !== null && (верный || i === выбран);
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              disabled={выбран !== null}
              onPress={() => установитьВыбран(i)}
              testID={'устаз-проверка-вариант-' + i}
              style={{
                minWidth: 56,
                minHeight: 48,
                paddingHorizontal: отступ.m,
                borderRadius: радиус.m,
                borderWidth: 2,
                alignItems: 'center',
                justifyContent: 'center',
                borderColor: отмечен ? (верный ? цвет.акцент : цвет.текстВторой) : цвет.граница,
                backgroundColor: отмечен && верный ? цвет.акцентМягкий : цвет.фон,
              }}
            >
              {'арабский' in в ? <АрабскийТекст размер="средний">{в.арабский}</АрабскийТекст> : <Текст>{текстЯз(в.текст)}</Текст>}
            </Pressable>
          );
        })}
      </View>
      {выбран !== null ? (
        <Текст {...((ВЕБ ? { role: 'status' } : {}) as object)} testID="устаз-проверка-итог">
          {т(выбран === з.верный ? 'верно' : 'неверно')} {текстЯз(з.пояснение)}
        </Текст>
      ) : null}
    </View>
  );
}

/** «Пожаловаться»: причина (обязательно) и комментарий (по желанию) → /api/ask/report (id ответа, без вопроса). */
function ЛистЖалобы({ т, открыт, ответ, закрыть }: { т: Т; открыт: boolean; ответ: ЗаписьЧата | undefined; закрыть: () => void }) {
  const { цвет, отступ, радиус } = useТема();
  const [причина, установитьПричину] = useState<ПричинаЖалобы | null>(null);
  const [комментарий, установитьКомментарий] = useState('');
  const [итог, установитьИтог] = useState<null | 'ок' | 'нет' | 'ждём'>(null);
  useEffect(() => {
    if (открыт) {
      установитьПричину(null);
      установитьКомментарий('');
      установитьИтог(null);
    }
  }, [открыт]);
  async function отправитьЖалобу() {
    if (!причина || !ответ || ответ.кто !== 'устаз') return;
    установитьИтог('ждём');
    const ок = await пожаловаться(
      ответ.ид,
      причина,
      комментарий,
      ответ.ответ.источники.map((и) => и.id),
    );
    установитьИтог(ок ? 'ок' : 'нет');
    if (ок) setTimeout(закрыть, 1200);
  }
  return (
    <Modal visible={открыт} transparent animationType="fade" onRequestClose={закрыть}>
      <Pressable
        onPress={закрыть}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'flex-end',
        }}
        accessibilityLabel={т('жалобаОтмена')}
      >
        <Pressable
          onPress={() => undefined}
          testID="устаз-жалоба"
          style={{
            backgroundColor: цвет.фон,
            borderTopLeftRadius: радиус.l,
            borderTopRightRadius: радиус.l,
            padding: отступ.l,
            gap: отступ.m,
            width: '100%',
            maxWidth: ШИРИНА_КОЛОНКИ,
            alignSelf: 'center',
          }}
        >
          <Текст вид="подзаголовок" accessibilityRole="header">
            {т('жалоба')}
          </Текст>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: отступ.s }}
            {...((ВЕБ ? { role: 'radiogroup', 'aria-label': т('жалоба') } : {}) as object)}
          >
            {ПРИЧИНЫ.map((п) => (
              <Pressable
                key={п}
                {...((ВЕБ
                  ? { role: 'radio', 'aria-checked': причина === п }
                  : {
                      accessibilityRole: 'radio',
                      accessibilityState: { checked: причина === п },
                    }) as object)}
                onPress={() => установитьПричину(п)}
                testID={'устаз-жалоба-причина-' + п}
                style={{
                  minHeight: 40,
                  paddingHorizontal: отступ.m,
                  justifyContent: 'center',
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: причина === п ? цвет.акцент : цвет.граница,
                  backgroundColor: причина === п ? цвет.акцентМягкий : цвет.поверхность,
                }}
              >
                <Текст вид="мелкий" стиль={{ fontWeight: причина === п ? '600' : '400' }}>
                  {т(('причина.' + п) as Ключ)}
                </Текст>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={комментарий}
            onChangeText={(с) => установитьКомментарий(с.slice(0, 500))}
            placeholder={т('комментарийПодсказка')}
            placeholderTextColor={цвет.текстВторой}
            accessibilityLabel={т('комментарий')}
            multiline
            maxLength={500}
            testID="устаз-жалоба-комментарий"
            style={{
              minHeight: 72,
              padding: отступ.s,
              borderRadius: радиус.m,
              borderWidth: 1,
              borderColor: цвет.граница,
              backgroundColor: цвет.поверхность,
              color: цвет.текст,
              fontFamily: ШРИФТ_ИНТЕРФЕЙСА,
              fontSize: 16,
              textAlignVertical: 'top',
            }}
          />
          {итог === 'ок' || итог === 'нет' ? (
            <Текст вид="мелкий" testID="устаз-жалоба-итог" {...((ВЕБ ? { role: 'status' } : {}) as object)}>
              {т(итог === 'ок' ? 'жалобаСпасибо' : 'жалобаНеУшла')}
            </Текст>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              gap: отступ.s,
              justifyContent: 'flex-end',
            }}
          >
            <Pressable
              accessibilityRole="button"
              onPress={закрыть}
              style={{
                minHeight: 44,
                paddingHorizontal: отступ.m,
                justifyContent: 'center',
              }}
            >
              <Текст вид="метка" цвет={цвет.акцент}>
                {т('жалобаОтмена')}
              </Текст>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!причина || итог === 'ждём' || итог === 'ок'}
              onPress={() => void отправитьЖалобу()}
              testID="устаз-жалоба-отправить"
              style={{
                minHeight: 44,
                paddingHorizontal: отступ.l,
                justifyContent: 'center',
                borderRadius: 22,
                backgroundColor: причина ? цвет.акцент : цвет.граница,
              }}
            >
              <Текст вид="метка" цвет={причина ? цвет.акцентТекст : цвет.текстВторой}>
                {т('жалобаОтправить')}
              </Текст>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
