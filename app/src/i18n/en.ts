/**
 * Английский словарь интерфейса.
 *
 * ЧЕРНОВИК для редактора-носителя языка (CLAUDE.md): не выдавать за окончательный перевод.
 * Решение владельца 20.11.2026: “Потом нам нужен ещё английский язык … 4 языка должно быть для старта”.
 * Переведено с русского (ru.ts) по смыслу, без добавлений. Исламские термины — принятой английской
 * транслитерацией (Quran, surah, ayah, tajweed, ustaz, qari; Fajr, Dhuhr, Asr, Maghrib, Isha), апостроф — ASCII '.
 * Термины — docs/HANDOFF.md, раздел “Языки: английский”.
 *
 * Контракт: те же ключи, что в ru.ts (тип Record<КлючСтроки, string> — пропуск ключа
 * ломает typecheck). Подстановки {имя} — те же, что в русской строке.
 */
import type { КлючСтроки } from './ru';

export const en: Record<КлючСтроки, string> = {
  'приложение.название': 'AI Ustaz',

  'общее.назад': 'Back',
  'общее.далее': 'Next',
  'общее.понятно': 'Got it',
  'общее.загрузка': 'Loading…',
  'общее.вРазработке': 'This screen is in development.',
  'общее.нетСвязи': 'No connection — it did not load. Check your internet and tap “Retry”.',
  'общее.повторить': 'Retry',

  'язык.заголовок': 'Language',
  'язык.ru': 'Русский',
  'язык.kk': 'Қазақша',
  'язык.uz': 'Oʻzbekcha',
  'язык.en': 'English',

  'плашка.урок': 'Prototype. Draft lesson — under review by an ustaz',
  'плашка.общая': 'Prototype: no AI voice check yet',
  'плашка.общаяПроверка': 'Prototype: the AI checks your reading with gentle hints and can make mistakes',

  'прогресс.задание': 'Task {текущий} of {всего}',

  'экран.главная': 'AI Ustaz',
  'экран.онбординг': 'Welcome',
  'экран.урок0': 'Lesson 0. Introduction',
  'экран.картаКурса': 'Tajweed',
  'экран.урок': 'Lesson {номер}',
  'экран.какОбъясняем': 'How we explain mistakes',
  'экран.оПроекте': 'About',
  'экран.лицензии': 'Licenses',
  'экран.коран': 'Quran',
  'экран.хадисы': 'Hadith',
  'экран.зикры': 'Dhikr',
  'экран.дуа': 'Duas',
  'экран.зикр': 'Dhikr',
  'экран.учимсяНамазу': 'Learn salah',
  'экран.разделНамаза': 'Salah',
  'экран.махраджи': 'How to pronounce letters',
  'экран.букваМахраджа': 'Letter makhraj',
  'экран.ещё': 'More',

  'главная.подзаголовок': 'A trainer for correct Quran reading using the method of Ahmadhadi Maksudi',
  'главная.прототип.заголовок': 'This is a prototype',
  'главная.прототип.вступление': 'We are showing the first steps of the future app. What it has so far and what it does not:',
  'главная.прототип.голос': 'There is no artificial intelligence voice check yet. You record yourself and listen — without a “correct” or “mistake” verdict.',
  'главная.прототип.кари': 'There is no qari voice yet — it will appear once the reference recording is made.',
  'главная.прототип.черновик': 'The lessons are a draft: an ustaz is reviewing them, and we correct them as we go.',
  'главная.прототип.данные': 'Progress is stored only on this device. No sign-in, no server and no data sending.',
  'главная.прототип.бесплатно': 'Free, with no ads and no tracking.',
  'главная.начать': 'Start',
  'главная.продолжить': 'Continue',
  'главная.картаКурса': 'Course map',
  'главная.какОбъясняем': 'How we explain mistakes',
  'главная.оПроекте': 'About',
  'главная.дниЗанятий': 'Study days: {дней} of the last 30',

  'микрофон.заголовок': 'Before recording your voice',
  'микрофон.нажатие': 'Recording starts only after you tap the button.',
  'микрофон.память': 'The recording stays only on this page. We do not send it anywhere and do not store it.',
  'микрофон.удаление': 'When you leave the exercise, the recording is deleted.',
  'микрофон.безОценки': 'The prototype has no AI voice check — you simply listen to yourself.',
  'микрофон.памятьПроверка': 'The recording stays on this page. It goes to the AI Ustaz server only if you tap “Check”.',
  'микрофон.проверка': 'The AI check can make mistakes and does not replace an ustaz.',
  'микрофон.сайт':
    'The browser gives microphone permission to the whole batr.kz site. After the lesson you can turn it off in the site settings (the lock icon in the address bar).',
  'микрофон.сайтСвой': 'The browser gives microphone permission to the whole site. After the lesson you can turn it off in the site settings (the lock icon in the address bar).',
  'микрофон.разрешить': 'Got it, turn on the microphone',
  'микрофон.позже': 'Later — without recording',

  'запись.начать': 'Record',
  'запись.остановить': 'Stop',
  'запись.слушать': 'Listen to myself',
  'запись.остановитьВоспроизведение': 'Stop',
  'запись.удалить': 'Delete recording',
  'запись.ещё': 'Record again',
  'запись.включить': 'Turn on voice recording',
  'запись.готово': 'Recorded! Listen to yourself.',
  'запись.идёт': 'Recording… {секунд} s',
  'запись.запрос': 'Allow microphone access in the browser window.',
  'запись.уровень': 'Volume',
  'запись.безОценки': 'No verdict: there is no AI voice check yet.',
  'запись.голосКари': 'The qari voice will appear once the reference recording is made.',
  'запись.ошибка.нет-доступа': 'No access to the microphone. Allow it in the browser settings — or continue without recording.',
  'запись.ошибка.нет-микрофона': 'No microphone found.',
  'запись.ошибка.не-поддерживается': 'This browser cannot record sound. Try Chrome, Safari or Firefox.',
  'запись.ошибка.небезопасно': 'Recording works only on a secure address (https).',
  'запись.ошибка.занят': 'The microphone is busy with another program.',
  'запись.ошибка.неизвестно': 'Recording failed. Please try again.',

  'урок.неНайден': 'Lesson not found.',

  'оПроекте.казахский': 'The Kazakh, Uzbek and English texts are a draft for a native-speaker editor.',
  'оПроекте.версияКонтента': 'Lesson version: {версия} ({статус})',
  'оПроекте.удалитьДанные': 'Delete my progress on this device',
  'оПроекте.данныеУдалены': 'Progress on this device has been deleted.',
};
