/**
 * Узбекский словарь интерфейса (латиница).
 *
 * ЧЕРНОВИК для редактора-носителя языка (CLAUDE.md): не выдавать за окончательный перевод.
 * Решение владельца 20.11.2026: «Потом нужно добавить узбекский язык», алфавит — латиница.
 * Переведено с русского (ru.ts) по смыслу, без добавлений. Орфография: «ʻ» (U+02BB) в oʻ/gʻ,
 * «ʼ» (U+02BC) — тутук белгиси (Qurʼon, maʼlumot). Термины — docs/HANDOFF.md, раздел «Языки».
 *
 * Контракт: те же ключи, что в ru.ts (тип Record<КлючСтроки, string> — пропуск ключа
 * ломает typecheck). Подстановки {имя} — те же, что в русской строке.
 */
import type { КлючСтроки } from './ru';

export const uz: Record<КлючСтроки, string> = {
  'приложение.название': 'AI Ustaz',

  'общее.назад': 'Orqaga',
  'общее.далее': 'Keyingi',
  'общее.понятно': 'Tushunarli',
  'общее.загрузка': 'Yuklanmoqda…',
  'общее.вРазработке': 'Bu ekran ishlab chiqilmoqda.',
  'общее.нетСвязи': 'Aloqa yoʻq — yuklanmadi. Internetni tekshiring va «Qayta urinish» tugmasini bosing.',
  'перевод.готовится': 'Tilingizga tarjima tayyorlanmoqda — hozircha matn inglizcha.',
  'общее.повторить': 'Qayta urinish',

  'язык.заголовок': 'Til',
  'язык.ru': 'Русский',
  'язык.kk': 'Қазақша',
  'язык.uz': 'Oʻzbekcha',
  'язык.en': 'English',
  'язык.ar': 'العربية',
  'язык.tr': 'Türkçe',
  'язык.id': 'Bahasa Indonesia',
  'язык.ur': 'اردو',

  'плашка.урок': 'Prototip. Dars qoralamasi — ustoz tekshiruvidan oʻtmoqda',
  'плашка.общая': 'Prototip: ovozni SI hali tekshirmaydi',
  'плашка.общаяПроверка': 'Prototip: SI oʻqishni yumshoq maslahatlar bilan tekshiradi va xato qilishi mumkin',

  'прогресс.задание': 'Topshiriq: {текущий} / {всего}',

  'экран.главная': 'AI Ustaz',
  'экран.онбординг': 'Sozlash',
  'экран.урок0': '0-dars. Kirish',
  'экран.картаКурса': 'Tajvid',
  'экран.урок': '{номер}-dars',
  'экран.какОбъясняем': 'Xatolarni qanday tushuntiramiz',
  'экран.оПроекте': 'Loyiha haqida',
  'экран.лицензии': 'Litsenziyalar',
  'экран.коран': 'Qurʼon',
  'экран.хадисы': 'Hadislar',
  'экран.зикры': 'Zikrlar',
  'экран.дуа': 'Duolar',
  'экран.зикр': 'Zikr',
  'экран.учимсяНамазу': 'Namozni oʻrganish',
  'экран.разделНамаза': 'Namoz',
  'экран.махраджи': 'Harflarni qanday aytish',
  'экран.букваМахраджа': 'Harf maxraji',
  'экран.ещё': 'Yana',

  'главная.подзаголовок': 'Ahmadhodiy Maqsudiy uslubi boʻyicha Qurʼonni toʻgʻri oʻqish murabbiyi',
  'главная.прототип.заголовок': 'Bu — prototip',
  'главная.прототип.вступление': 'Kelajakdagi ilovaning ilk qadamlarini koʻrsatyapmiz. Hozir unda nima bor va nima yoʻq:',
  'главная.прототип.голос': 'Ovozni sunʼiy intellekt hali tekshirmaydi. Siz oʻzingizni yozib olib, tinglaysiz — «toʻgʻri» yoki «xato» degan baho yoʻq.',
  'главная.прототип.кари': 'Qori ovozi hali yoʻq — u namuna yozib olingandan keyin qoʻshiladi.',
  'главная.прототип.черновик': 'Darslar — qoralama: ularni ustoz koʻrib chiqyapti, biz yoʻl-yoʻlakay tuzatamiz.',
  'главная.прототип.данные': 'Natijalaringiz faqat shu qurilmada saqlanadi. Roʻyxatdan oʻtish, server va maʼlumot yuborish yoʻq.',
  'главная.прототип.бесплатно': 'Bepul, reklamasiz va kuzatuvsiz.',
  'главная.начать': 'Boshlash',
  'главная.продолжить': 'Davom etish',
  'главная.картаКурса': 'Kurs xaritasi',
  'главная.какОбъясняем': 'Xatolarni qanday tushuntiramiz',
  'главная.оПроекте': 'Loyiha haqida',
  'главная.дниЗанятий': 'Mashgʻulot kunlari: oxirgi 30 kundan {дней} kun',

  'микрофон.заголовок': 'Ovoz yozishdan oldin',
  'микрофон.нажатие': 'Yozuv faqat siz tugmani bosganingizdan keyin boshlanadi.',
  'микрофон.память': 'Yozuv faqat shu sahifada qoladi. Biz uni hech qayerga yubormaymiz va saqlamaymiz.',
  'микрофон.удаление': 'Mashqdan chiqib ketsangiz, yozuv oʻchib ketadi.',
  'микрофон.безОценки': 'Prototipda ovozni SI tekshirmaydi — siz shunchaki oʻzingizni tinglaysiz.',
  'микрофон.памятьПроверка': 'Yozuv shu sahifada qoladi. U AI Ustaz serveriga faqat «Tekshirish» tugmasini bossangiz yuboriladi.',
  'микрофон.проверка': 'SI tekshiruvi xato qilishi mumkin va ustozning oʻrnini bosmaydi.',
  'микрофон.сайт':
    'Mikrofonga ruxsatni brauzer butun batr.kz saytiga beradi. Mashgʻulotdan keyin uni sayt sozlamalarida oʻchirib qoʻyish mumkin (manzil satridagi qulf belgisi).',
  'микрофон.сайтСвой': 'Mikrofonga ruxsatni brauzer butun saytga beradi. Mashgʻulotdan keyin uni sayt sozlamalarida oʻchirib qoʻyish mumkin (manzil satridagi qulf belgisi).',
  'микрофон.разрешить': 'Tushunarli, mikrofonni yoqish',
  'микрофон.позже': 'Keyinroq — yozuvsiz',

  'запись.начать': 'Yozib olish',
  'запись.остановить': 'Toʻxtatish',
  'запись.слушать': 'Oʻzimni tinglash',
  'запись.остановитьВоспроизведение': 'Toʻxtatish',
  'запись.удалить': 'Yozuvni oʻchirish',
  'запись.ещё': 'Yana yozib olish',
  'запись.включить': 'Ovoz yozishni yoqish',
  'запись.готово': 'Yozib olindi! Oʻzingizni tinglang.',
  'запись.идёт': 'Yozilmoqda… {секунд} s',
  'запись.запрос': 'Brauzer oynasida mikrofonga ruxsat bering.',
  'запись.уровень': 'Ovoz balandligi',
  'запись.безОценки': 'Bahosiz: ovozni SI hali tekshirmaydi.',
  'запись.голосКари': 'Qori ovozi namuna yozib olingandan keyin qoʻshiladi.',
  'запись.ошибка.нет-доступа': 'Mikrofonga ruxsat yoʻq. Uni brauzer sozlamalarida yoqing — yoki yozuvsiz davom eting.',
  'запись.ошибка.нет-микрофона': 'Mikrofon topilmadi.',
  'запись.ошибка.не-поддерживается': 'Bu brauzer ovoz yozib ololmaydi. Chrome, Safari yoki Firefox brauzerini sinab koʻring.',
  'запись.ошибка.небезопасно': 'Yozuv faqat himoyalangan manzilda (https) ishlaydi.',
  'запись.ошибка.занят': 'Mikrofon boshqa dastur bilan band.',
  'запись.ошибка.неизвестно': 'Yozib boʻlmadi. Yana urinib koʻring.',

  'урок.неНайден': 'Dars topilmadi.',

  'оПроекте.казахский': 'Qozoq, oʻzbek, ingliz, arab, turk, indonez va urdu tillaridagi matnlar — til sohibi muharriri uchun qoralama.',
  'оПроекте.версияКонтента': 'Darslar versiyasi: {версия} ({статус})',
  'оПроекте.удалитьДанные': 'Shu qurilmadagi natijalarimni oʻchirish',
  'оПроекте.данныеУдалены': 'Shu qurilmadagi natijalar oʻchirildi.',
};
