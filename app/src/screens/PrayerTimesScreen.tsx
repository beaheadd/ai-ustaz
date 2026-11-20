/**
 * Экран «Время намаза» (#/prayer): «Арка дня» на сегодня, «урок после намаза», таблица на неделю,
 * как считаем (метод ДУМК, сверка, источники).
 *
 * Контракт: ПропсыЭкрана<'намаз'>. Место — useМестоНамаза() (prayer/store.ts); выбор — экран 'городНамаза'.
 * - КарточкаНамаза (components/prayer) с кнопкой «Кибла» → экран 'кибла'.
 * - ПриглашениеПослеНамаза: через 10–40 мин после начала намаза — «5 минут урока?» → продолжение урока
 *   (следующийШаг главной: урок 0, первый непройденный урок или карта курса).
 * - Таблица: сегодня и ещё 7 дней (8 строк), сегодня выделено; время — в поясе места (РК — UTC+5), 24 ч. Шесть столбцов времени —
 *   одинаковой ширины (flex: 1, табличные цифры), день — 30 px; заголовки — до 2 строк по центру («Күн шығуы»
 *   переносится, а не режется); на окне уже 360 px строки значков в шапке нет. Для диктора — таблица
 *   (role table/row/columnheader/rowheader/cell). Таблица перерисовывается только при смене места или суток.
 * - «Время асра»: ханафитский (по умолчанию — линия проекта, CLAUDE.md правило 6) или шафиитский мазхаб; выбор
 *   хранится на телефоне (prayer/store.ts useМазхаб) и действует везде: карточка, неделя, уведомления.
 * - «Как считаем»: для РК — метод ДУМК и поправки, сверка ±1 мин; для других стран — метод страны места
 *   (prayer/methods.ts: углы, поправки, статус сверки — «сверено», «уточняется» или «стандарт, ведомство не найдено»);
 *   «это не таблица ведомства — сверяйтесь с мечетью», место и координаты, источники → «Лицензии». Плашка
 *   «Черновик — проверяет устаз» (время намаза — религиозный контент, CLAUDE.md, правило 11).
 * testID: экран-намаз, намаз-неделя, неделя-<ГГГГ-ММ-ДД>, неделя-<день>-<ключ>, намаз-аср, намаз-аср-hanafi,
 *   намаз-аср-shafi, намаз-метод, намаз-метод-черновик, намаз-метод-текст, намаз-место, намаз-лицензии
 *   (+ testID КарточкиНамаза и ПриглашенияПослеНамаза).
 * Владелец 20.11.2026: «Мы мировое приложение. У нас должно быть все времени намаза в мире.»
 * - КЗ/УЗ: официальная таблица ДУМК/УМУз на телефоне (prayer/officialStore.ts) — карточка и неделя из неё, в «Как
 *   считаем» — откуда таблица и что на сервер уходит только пункт списка (testID намаз-метод-официально). Решение
 *   владельца 20.11.2026: «Время намаза Казахстан, Узбекистан бери из официальных источников… один в один».
 * Источники: координаты — GeoNames (CC BY 4.0); 6 мест (Алатау, Қаскелең, Жем, Қордай, Байқоңыр, Казталов) —
 *   точки из общедоступного списка мест ДУМК (в GeoNames их нет или точка далеко) — так и пишем на экране.
 * Решение владельца 19.11.2026: «Всё ставь — время намаза и выбор киблы».
 */
import { memo, useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Карточка, Плашка, СтрокаСписка, Текст, Значок, ЗНАЧКИ_НАМАЗА, Экран } from '../components';
import { КарточкаНамаза, ПриглашениеПослеНамаза } from '../components/prayer';
import { номераУроков } from '../engine/lessonEngine';
import { useНавигация } from '../engine/navigation';
import { useПрогресс } from '../engine/progress';
import type { ПропсыЭкрана } from '../engine/routes';
import { создатьСловарь, useПеревод, useСловарь, type Язык } from '../i18n';
import { НАЗВАНИЯ, деньРК, короткийДень, подписьСмещения, сдвигДня, смещениеПояса, чч_мм } from '../prayer/day';
import { useЧасы } from '../prayer/hooks';
import { методСтраны, поправкиМетода, type Мазхаб, type Метод } from '../prayer/methods';
import { названиеМеста, оговоркаТочности, type Место } from '../prayer/places';
import { useМазхаб, useМестоНамаза } from '../prayer/store';
import { названиеСтраны } from '../prayer/world';
import { КЛЮЧИ_ВРЕМЁН, type ВременаДня, type КлючВремени } from '../prayer/times';
import { источникДня, временаДняКэш } from '../prayer/hooks';
import { useВерсияОфициальных } from '../prayer/officialStore';
import { useТема } from '../theme';
import { следующийШаг } from './HomeScreen';

const СЛОВАРЬ = создатьСловарь({
  ru: {
    заголовок: 'Время намаза',
    неделя: 'На неделю',
    сегодня: 'сегодня',
    пояс: 'Время — по Казахстану (UTC+5), 24 часа.',
    метод: 'Как считаем',
    метод1:
      'Время считает само приложение, на этом телефоне, по методу ДУМК: фаджр и иша — когда солнце на 15° под горизонтом, аср — по ханафитскому мазхабу. Поправки ДУМК: восход −3 мин, зухр, аср и магриб +3 мин; на 48° с. ш. и севернее — −5 и +5 мин. Летом на севере, когда ночь короткая, фаджр и иша — по правилу высоких широт, как у ДУМК.',
    метод2: 'Мы сверили расчёт с официальными таблицами ДУМК за каждый день 2026 года: разница — не больше 1 минуты.',
    метод3: 'Это не таблица ДУМК, а наш расчёт. Если время в вашей мечети отличается, сверяйтесь с расписанием мечети.',
    оговорка: 'Здесь расчёт может отличаться от таблиц ДУМК до 3 минут.',
    поясМеста: 'Время — по месту ({смещение}), 24 часа.',
    аср: 'Время асра',
    асрПояснение: 'По умолчанию — ханафитский мазхаб. Выбор хранится только на этом телефоне.',
    асрХанафи: 'Ханафитский мазхаб',
    асрХанафиПодпись: 'тень предмета — две его длины',
    асрШафии: 'Шафиитский мазхаб',
    асрШафииПодпись: 'тень предмета — одна его длина (так у большинства других мазхабов)',
    общий1:
      'Время считает само приложение, на этом телефоне, по методу, принятому в стране места ({страна}): {ведомство}. Фаджр — когда солнце на {фаджр}° под горизонтом, иша — {иша}. Аср — {аср}.{поправки}',
    ишаУгол: 'когда солнце на {угол}° под горизонтом',
    ишаМинуты: 'через {минут} мин после магриба',
    асрХ: 'по ханафитскому мазхабу',
    асрШ: 'по шафиитскому мазхабу',
    поправки: ' Поправки ведомства: {список}.',
    сверено: 'Мы сверили расчёт с опубликованными таблицами ведомства: разница — не больше {мин} мин.',
    оценка: 'Параметры подобраны по опубликованным таблицам ведомства и ещё уточняются — пока это черновик.',
    стандарт: 'Описания метода местного ведомства мы пока не нашли, поэтому считаем по общепринятому стандарту. Время может отличаться от расписания вашей мечети на несколько минут.',
    общий3: 'Это не таблица ведомства, а наш расчёт. Если время в вашей мечети отличается, сверяйтесь с расписанием мечети.',
    высокие: 'Летом на высоких широтах, когда ночь короткая, фаджр и иша — по правилу высоких широт.',
    источникиМир: 'Координаты — GeoNames (CC BY 4.0). Расчёт — библиотека adhan (MIT). Интернет для расчёта не нужен.',
    с: 'с. ш.',
    ю: 'ю. ш.',
    в: 'в. д.',
    з: 'з. д.',
    место: 'Место: {место} — {широта}° {сш}, {долгота}° {вд}.',
    источники:
      'Координаты — GeoNames (CC BY 4.0); 6 мест (Алатау, Каскелен, Жем, Кордай, Байконур, Казталовка) — точки из общедоступного списка мест ДУМК. Расчёт — библиотека adhan (MIT). Интернет не нужен.',
    лицензии: 'Лицензии и источники',
    черновик: 'Черновик — проверяет устаз',
    официальноТаблица:
      'Время — из официальной таблицы ДУМК на {год} год для пункта «{пункт}» (как на muftyat.kz). Наш сервер берёт таблицу у ДУМК, проверяет каждый день года и сверяет с нашим расчётом; телефон хранит её у себя. Обновлено {дата}.',
    официальноПравило:
      'Время — по правилу Управления мусульман Узбекистана для пункта «{пункт}» из их списка (как на muslim.uz и islom.uz: фаджр и иша — солнце на 15,5° под горизонтом, аср — по ханафитскому мазхабу, магриб — закат + 4 мин). Таблицу на {год} год считает наш сервер; телефон хранит её у себя. Обновлено {дата}.',
    официальноПриватность: 'На наш сервер уходит только пункт из списка приложения и год — ваши координаты не отправляются.',
    официальноЗапас: 'Без сети, на batr.kz и при шафиитском асре время считает само приложение тем же методом.',
  },
  kk: {
    заголовок: 'Намаз уақыты',
    неделя: 'Аптаға',
    сегодня: 'бүгін',
    пояс: 'Уақыт — Қазақстан бойынша (UTC+5), 24 сағат.',
    метод: 'Қалай есептейміз',
    метод1:
      'Уақытты қосымшаның өзі осы телефонда ҚМДБ әдісімен есептейді: таң мен құптан — күн көкжиектен 15° төмен болғанда, екінті — ханафи мазхабы бойынша. ҚМДБ түзетулері: күн шығуы −3 мин, бесін, екінті және ақшам +3 мин; 48° с. е. және солтүстікте — −5 және +5 мин. Жазда солтүстікте, түн қысқа кезде, таң мен құптан ҚМДБ-дағыдай жоғары ендіктер ережесімен есептеледі.',
    метод2: 'Есепті 2026 жылдың әр күні үшін ҚМДБ-ның ресми кестелерімен салыстырдық: айырмасы — 1 минуттан аспайды.',
    метод3: 'Бұл ҚМДБ кестесі емес, біздің есебіміз. Мешітіңіздегі уақыт өзгеше болса, мешіттің кестесімен салыстырыңыз.',
    оговорка: 'Мұнда есеп ҚМДБ кестесінен 3 минутқа дейін өзгеше болуы мүмкін.',
    поясМеста: 'Уақыт — жергілікті ({смещение}), 24 сағат.',
    аср: 'Екінті уақыты',
    асрПояснение: 'Әдепкі — ханафи мазхабы. Таңдау тек осы телефонда сақталады.',
    асрХанафи: 'Ханафи мазхабы',
    асрХанафиПодпись: 'заттың көлеңкесі — өз ұзындығынан екі есе',
    асрШафии: 'Шафиғи мазхабы',
    асрШафииПодпись: 'заттың көлеңкесі — өз ұзындығындай (басқа мазхабтардың көбінде осылай)',
    общий1:
      'Уақытты қосымшаның өзі осы телефонда орын тұрған елде ({страна}) қабылданған әдіспен есептейді: {ведомство}. Таң — күн көкжиектен {фаджр}° төмен болғанда, құптан — {иша}. Екінті — {аср}.{поправки}',
    ишаУгол: 'күн көкжиектен {угол}° төмен болғанда',
    ишаМинуты: 'ақшамнан {минут} минуттан кейін',
    асрХ: 'ханафи мазхабы бойынша',
    асрШ: 'шафиғи мазхабы бойынша',
    поправки: ' Мекеме түзетулері: {список}.',
    сверено: 'Есепті мекеменің жарияланған кестелерімен салыстырдық: айырмасы — {мин} минуттан аспайды.',
    оценка: 'Параметрлер мекеменің жарияланған кестелері бойынша таңдалды және әлі нақтыланады — әзірге бұл жоба.',
    стандарт: 'Жергілікті мекеменің әдісін әзірге таппадық, сондықтан жалпы қабылданған стандартпен есептейміз. Уақыт мешітіңіздің кестесінен бірнеше минутқа өзгеше болуы мүмкін.',
    общий3: 'Бұл мекеменің кестесі емес, біздің есебіміз. Мешітіңіздегі уақыт өзгеше болса, мешіттің кестесімен салыстырыңыз.',
    высокие: 'Жазда жоғары ендіктерде, түн қысқа кезде, таң мен құптан жоғары ендіктер ережесімен есептеледі.',
    источникиМир: 'Координаттар — GeoNames (CC BY 4.0). Есеп — adhan кітапханасы (MIT). Есептеуге интернет қажет емес.',
    с: 'с. е.',
    ю: 'о. е.',
    в: 'ш. б.',
    з: 'б. б.',
    место: 'Орын: {место} — {широта}° {сш}, {долгота}° {вд}.',
    источники:
      'Координаттар — GeoNames (CC BY 4.0); 6 елді мекен (Алатау, Қаскелең, Жем, Қордай, Байқоңыр, Казталов) — ҚМДБ-ның ашық елді мекендер тізіміндегі нүктелер. Есеп — adhan кітапханасы (MIT). Интернет қажет емес.',
    лицензии: 'Лицензиялар мен дереккөздер',
    черновик: 'Жоба — ұстаз тексеріп жатыр',
    официальноТаблица:
      'Уақыт — ҚМДБ-ның {год} жылғы ресми кестесінен, «{пункт}» елді мекені үшін (muftyat.kz-тегідей). Серверіміз кестені ҚМДБ-дан алып, жылдың әр күнін тексереді және өз есебімізбен салыстырады; телефон оны өзінде сақтайды. Жаңартылды: {дата}.',
    официальноПравило:
      'Уақыт — Өзбекстан мұсылмандары басқармасының ережесі бойынша, олардың тізіміндегі «{пункт}» елді мекені үшін (muslim.uz пен islom.uz-тегідей: таң мен құптан — күн көкжиектен 15,5° төмен, екінті — ханафи мазхабы, ақшам — күн батқаннан кейін 4 мин). {год} жылғы кестені серверіміз есептейді; телефон оны өзінде сақтайды. Жаңартылды: {дата}.',
    официальноПриватность: 'Серверімізге тек қосымша тізіміндегі елді мекен мен жыл жіберіледі — сіздің координаттарыңыз жіберілмейді.',
    официальноЗапас: 'Желі жоқ кезде, batr.kz-те және шафиғи екінтіде уақытты қосымшаның өзі сол әдіспен есептейді.',
  },
  uz: {
    заголовок: 'Namoz vaqti',
    неделя: 'Bir haftaga',
    сегодня: 'bugun',
    пояс: 'Vaqt — Qozogʻiston vaqti bilan (UTC+5), 24 soatlik.',
    метод: 'Qanday hisoblaymiz',
    метод1:
      'Vaqtni ilovaning oʻzi, shu telefonda, QMDB usuli boʻyicha hisoblaydi: bomdod va xufton — quyosh ufqdan 15° pastda boʻlganda, asr — hanafiy mazhabi boʻyicha. QMDB tuzatishlari: quyosh chiqishi −3 daq., peshin, asr va shom +3 daq.; 48° shimoliy kenglikda va undan shimolda — −5 va +5 daq. Yozda shimolda, tun qisqa boʻlganda, bomdod va xufton — QMDBdagi kabi yuqori kengliklar qoidasi boʻyicha.',
    метод2: 'Hisobni QMDBning 2026-yil har bir kuni uchun rasmiy jadvallari bilan solishtirdik: farq — 1 daqiqadan oshmaydi.',
    метод3: 'Bu QMDB jadvali emas, bizning hisobimiz. Masjidingizdagi vaqt farq qilsa, masjid jadvaliga qarang.',
    оговорка: 'Bu yerda hisob QMDB jadvallaridan 3 daqiqagacha farq qilishi mumkin.',
    поясМеста: 'Vaqt — joyga koʻra ({смещение}), 24 soatlik.',
    аср: 'Asr vaqti',
    асрПояснение: 'Standart boʻyicha — hanafiy mazhabi. Tanlov faqat shu telefonda saqlanadi.',
    асрХанафи: 'Hanafiy mazhabi',
    асрХанафиПодпись: 'narsaning soyasi — uning ikki baravari',
    асрШафии: 'Shofeʼiy mazhabi',
    асрШафииПодпись: 'narsaning soyasi — uning bir baravari (boshqa mazhablarning koʻpchiligida shunday)',
    общий1:
      'Vaqtni ilovaning oʻzi, shu telefonda, joy mamlakatida ({страна}) qabul qilingan usul boʻyicha hisoblaydi: {ведомство}. Bomdod — quyosh ufqdan {фаджр}° pastda boʻlganda, xufton — {иша}. Asr — {аср}.{поправки}',
    ишаУгол: 'quyosh ufqdan {угол}° pastda boʻlganda',
    ишаМинуты: 'shomdan {минут} daqiqa keyin',
    асрХ: 'hanafiy mazhabi boʻyicha',
    асрШ: 'shofeʼiy mazhabi boʻyicha',
    поправки: ' Idora tuzatishlari: {список}.',
    сверено: 'Hisobni idoraning eʼlon qilingan jadvallari bilan solishtirdik: farq — {мин} daqiqadan oshmaydi.',
    оценка: 'Parametrlar idoraning eʼlon qilingan jadvallari boʻyicha tanlangan va hali aniqlanmoqda — hozircha bu qoralama.',
    стандарт: 'Mahalliy idora usulining tavsifini hali topmadik, shuning uchun umumqabul qilingan standart boʻyicha hisoblaymiz. Vaqt masjidingiz jadvalidan bir necha daqiqa farq qilishi mumkin.',
    общий3: 'Bu idora jadvali emas, bizning hisobimiz. Masjidingizdagi vaqt farq qilsa, masjid jadvaliga qarang.',
    высокие: 'Yozda yuqori kengliklarda, tun qisqa boʻlganda, bomdod va xufton — yuqori kengliklar qoidasi boʻyicha.',
    источникиМир: 'Koordinatalar — GeoNames (CC BY 4.0). Hisob — adhan kutubxonasi (MIT). Hisob uchun internet kerak emas.',
    с: 'sh. k.',
    ю: 'j. k.',
    в: 'sh. u.',
    з: 'gʻ. u.',
    место: 'Joy: {место} — {широта}° {сш}, {долгота}° {вд}.',
    источники:
      'Koordinatalar — GeoNames (CC BY 4.0); 6 ta joy (Alatau, Kaskelen, Jem, Korday, Baykonur, Kaztalovka) — QMDBning ochiq joylar roʻyxatidagi nuqtalar. Hisob — adhan kutubxonasi (MIT). Internet kerak emas.',
    лицензии: 'Litsenziyalar va manbalar',
    черновик: 'Qoralama — ustoz tekshiryapti',
    официальноТаблица:
      'Vaqt — QMDBning {год}-yil uchun rasmiy jadvalidan, «{пункт}» punkti boʻyicha (muftyat.kz dagi kabi). Serverimiz jadvalni QMDBdan oladi, yilning har bir kunini tekshiradi va hisobimiz bilan solishtiradi; telefon uni oʻzida saqlaydi. Yangilandi: {дата}.',
    официальноПравило:
      'Vaqt — Oʻzbekiston musulmonlari idorasi qoidasi boʻyicha, ularning roʻyxatidagi «{пункт}» punkti uchun (muslim.uz va islom.uz dagi kabi: bomdod va xufton — quyosh ufqdan 15,5° pastda, asr — hanafiy mazhabi boʻyicha, shom — quyosh botishi + 4 daq.). {год}-yil jadvalini serverimiz hisoblaydi; telefon uni oʻzida saqlaydi. Yangilandi: {дата}.',
    официальноПриватность: 'Serverimizga faqat ilova roʻyxatidagi punkt va yil yuboriladi — koordinatalaringiz yuborilmaydi.',
    официальноЗапас: 'Tarmoqsiz, batr.kz saytida va shofeʼiy asrda vaqtni ilovaning oʻzi xuddi shu usul bilan hisoblaydi.',
  },
  en: {
    заголовок: 'Prayer times',
    неделя: 'For the week',
    сегодня: 'today',
    пояс: 'Times are in Kazakhstan time (UTC+5), 24-hour clock.',
    метод: 'How we calculate',
    метод1:
      "The app calculates the times itself, on this phone, by the SAMK method: Fajr and Isha — when the sun is 15° below the horizon, Asr — by the Hanafi madhhab. SAMK adjustments: sunrise −3 min, Dhuhr, Asr and Maghrib +3 min; at 48° N and further north — −5 and +5 min. In summer in the north, when the night is short, Fajr and Isha follow the high-latitude rule, as SAMK does.",
    метод2: 'We checked the calculation against the official SAMK tables for every day of 2026: the difference is no more than 1 minute.',
    метод3: 'This is not the SAMK table but our calculation. If the time at your mosque differs, follow the mosque schedule.',
    оговорка: 'Here the calculation may differ from the SAMK tables by up to 3 minutes.',
    поясМеста: 'Local time of the place ({смещение}), 24-hour clock.',
    аср: 'Asr time',
    асрПояснение: 'By default — the Hanafi madhhab. The choice is stored only on this phone.',
    асрХанафи: 'Hanafi madhhab',
    асрХанафиПодпись: "an object's shadow is twice its length",
    асрШафии: "Shafi'i madhhab",
    асрШафииПодпись: "an object's shadow equals its length (as in most other madhhabs)",
    общий1:
      'The app calculates the times itself, on this phone, by the method accepted in the country of the place ({страна}): {ведомство}. Fajr — when the sun is {фаджр}° below the horizon, Isha — {иша}. Asr — {аср}.{поправки}',
    ишаУгол: 'when the sun is {угол}° below the horizon',
    ишаМинуты: '{минут} min after Maghrib',
    асрХ: 'by the Hanafi madhhab',
    асрШ: "by the Shafi'i madhhab",
    поправки: ' Authority adjustments: {список}.',
    сверено: "We checked the calculation against the authority's published tables: the difference is no more than {мин} min.",
    оценка: "The parameters were fitted to the authority's published tables and are still being refined — a draft for now.",
    стандарт: "We have not yet found a description of the local authority's method, so we calculate by the common standard. The time may differ from your mosque schedule by a few minutes.",
    общий3: "This is not the authority's table but our calculation. If the time at your mosque differs, follow the mosque schedule.",
    высокие: 'In summer at high latitudes, when the night is short, Fajr and Isha follow the high-latitude rule.',
    источникиМир: 'Coordinates — GeoNames (CC BY 4.0). Calculation — the adhan library (MIT). No internet needed for the calculation.',
    с: 'N',
    ю: 'S',
    в: 'E',
    з: 'W',
    место: 'Place: {место} — {широта}° {сш}, {долгота}° {вд}.',
    источники:
      'Coordinates — GeoNames (CC BY 4.0); 6 places (Alatau, Kaskelen, Zhem, Korday, Baikonur, Kaztalovka) — points from the public SAMK list of places. Calculation — the adhan library (MIT). No internet needed.',
    лицензии: 'Licenses and sources',
    черновик: 'Draft — under review by an ustaz',
    официальноТаблица:
      'Times — from the official SAMK table for {год} for “{пункт}” (as on muftyat.kz). Our server takes the table from SAMK, checks every day of the year and compares it with our calculation; the phone keeps it locally. Updated {дата}.',
    официальноПравило:
      'Times — by the rule of the Muslim Board of Uzbekistan for “{пункт}” from their list (as on muslim.uz and islom.uz: Fajr and Isha — sun 15.5° below the horizon, Asr — by the Hanafi madhhab, Maghrib — sunset + 4 min). Our server calculates the table for {год}; the phone keeps it locally. Updated {дата}.',
    официальноПриватность: 'Only the place from the app list and the year go to our server — your coordinates are not sent.',
    официальноЗапас: "Offline, on batr.kz and with the Shafi'i Asr, the app calculates the times itself by the same method.",
  },
});

const ДНЕЙ = 8;

type ТСловаря = (ключ: keyof (typeof СЛОВАРЬ)['ru'], параметры?: Record<string, string | number>) => string;

const ИМЕНА_ПОПРАВОК: Record<Язык, Record<string, string>> = {
  ru: { fajr: 'фаджр', sunrise: 'восход', dhuhr: 'зухр', asr: 'аср', maghrib: 'магриб', isha: 'иша' },
  kk: { fajr: 'таң', sunrise: 'күн шығуы', dhuhr: 'бесін', asr: 'екінті', maghrib: 'ақшам', isha: 'құптан' },
  uz: { fajr: 'bomdod', sunrise: 'quyosh chiqishi', dhuhr: 'peshin', asr: 'asr', maghrib: 'shom', isha: 'xufton' },
  en: { fajr: 'Fajr', sunrise: 'sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' },
};

/** Текст «как считаем» для страны не РК — из таблицы метода (prayer/methods.ts), без ручных абзацев на страну. */
function описаниеМетода(метод: Метод, мазхаб: Мазхаб, страна: string, язык: Язык, т: ТСловаря, широта: number): string {
  const п = поправкиМетода(метод, широта);
  const список = Object.entries(п)
    .filter(([, мин]) => мин !== 0)
    .map(([к, мин]) => `${ИМЕНА_ПОПРАВОК[язык][к]} ${мин > 0 ? '+' : '−'}${Math.abs(мин)} ${язык === 'uz' ? 'daq.' : язык === 'en' ? 'min' : 'мин'}`)
    .join(', ');
  const иша = typeof метод.иша === 'number' ? т('ишаУгол', { угол: String(метод.иша).replace('.', ',') }) : т('ишаМинуты', { минут: метод.иша.минут });
  return т('общий1', {
    страна: названиеСтраны(страна, язык),
    ведомство: метод.ведомство[язык],
    фаджр: String(метод.фаджр).replace('.', ','),
    иша,
    аср: т(мазхаб === 'hanafi' ? 'асрХ' : 'асрШ'),
    поправки: список ? т('поправки', { список }) : '',
  });
}

export function ВремяНамаза(_: ПропсыЭкрана<'намаз'>) {
  const { язык } = useПеревод();
  const т = useСловарь(СЛОВАРЬ);
  const { перейти, перейтиВкладку } = useНавигация();
  const { прогресс } = useПрогресс();
  const { отступ } = useТема();
  const { место } = useМестоНамаза();
  const { мазхаб, выбрать: выбратьМазхаб } = useМазхаб();
  const пояс = место.пояс;
  // Сутки места — перерисовка экрана раз в сутки, а не каждую минуту (минутный отсчёт — внутри КарточкиНамаза).
  const сегодня = useЧасы((мс) => деньРК(мс, пояс));
  const рк = место.страна === 'KZ';
  const метод = методСтраны(место.страна);
  useВерсияОфициальных(); // пришла официальная таблица — перерисовать «Как считаем»
  const официально = источникДня(место, сегодня, мазхаб);

  const продолжитьУрок = () => {
    const шаг = следующийШаг(прогресс, номераУроков());
    if (шаг.вид === 'урок0') перейти('урок0');
    else if (шаг.вид === 'урок') перейти('урок', { номер: шаг.номер });
    else перейтиВкладку('таджвид');
  };

  const число = (х: number) => Math.abs(х).toFixed(2).replace('.', ',');
  const текстПояса = рк ? т('пояс') : т('поясМеста', { смещение: подписьСмещения(смещениеПояса(пояс, Date.now())) });

  return (
    <Экран заголовок={т('заголовок')} testID="экран-намаз">
      <КарточкаНамаза перейтиККибле={() => перейти('кибла')} />

      <ПриглашениеПослеНамаза продолжить={продолжитьУрок} видКнопки="основная" />

      <View style={{ gap: отступ.s }}>
        <Текст вид="подзаголовок" accessibilityRole="header">
          {т('неделя')}
        </Текст>
        <ТаблицаНедели место={место} мазхаб={мазхаб} сегодня={сегодня} подписьСегодня={т('сегодня')} />
        <Текст вид="мелкий">{текстПояса}</Текст>
      </View>

      <View style={{ gap: отступ.s }} testID="намаз-аср">
        <Текст вид="подзаголовок" accessibilityRole="header">
          {т('аср')}
        </Текст>
        <View role="radiogroup" aria-label={т('аср')}>
          {(['hanafi', 'shafi'] as const).map((м) => (
            <СтрокаСписка
              key={м}
              вид="плоская"
              заголовок={т(м === 'hanafi' ? 'асрХанафи' : 'асрШафии')}
              подпись={т(м === 'hanafi' ? 'асрХанафиПодпись' : 'асрШафииПодпись')}
              выбрана={мазхаб === м}
              приНажатии={() => void выбратьМазхаб(м)}
              testID={'намаз-аср-' + м}
            />
          ))}
        </View>
        <Текст вид="мелкий">{т('асрПояснение')}</Текст>
      </View>

      <Карточка вид="акцент" заголовок={т('метод')} testID="намаз-метод">
        <Плашка вид="черновик" надпись={т('черновик')} testID="намаз-метод-черновик" />
        {официально ? (
          <View style={{ gap: отступ.s }} testID="намаз-метод-официально">
            <Текст testID="намаз-метод-текст">
              {т(официально.метод === 'rule' ? 'официальноПравило' : 'официальноТаблица', {
                год: сегодня.slice(0, 4),
                пункт: официально.точка.name,
                дата: официально.обновлено.split('-').reverse().join('.'),
              })}
            </Текст>
            <Текст>{т('официальноПриватность')}</Текст>
            <Текст>{т('официальноЗапас')}</Текст>
          </View>
        ) : рк ? (
          <>
            <Текст testID="намаз-метод-текст">{т('метод1')}</Текст>
            <Текст>{т('метод2')}</Текст>
            <Текст>{т('метод3')}</Текст>
          </>
        ) : (
          <>
            <Текст testID="намаз-метод-текст">{описаниеМетода(метод, мазхаб, место.страна, язык, т, место.широта)}</Текст>
            <Текст>{метод.статус === 'сверено' ? т('сверено', { мин: метод.точность ?? 1 }) : т(метод.статус)}</Текст>
            <Текст>{т('общий3')}</Текст>
            {Math.abs(место.широта) >= 48 ? <Текст>{т('высокие')}</Текст> : null}
          </>
        )}
        {!официально && оговоркаТочности(место) ? <Текст>{т('оговорка')}</Текст> : null}
        <Текст вид="второй" testID="намаз-место">
          {т('место', {
            место: названиеМеста(место, язык),
            широта: число(место.широта),
            долгота: число(место.долгота),
            сш: т(место.широта >= 0 ? 'с' : 'ю'),
            вд: т(место.долгота >= 0 ? 'в' : 'з'),
          })}
        </Текст>
        <Текст вид="второй">{т(рк ? 'источники' : 'источникиМир')}</Текст>
      </Карточка>

      <СтрокаСписка заголовок={т('лицензии')} значок="инфо" приНажатии={() => перейти('лицензии')} testID="намаз-лицензии" />
    </Экран>
  );
}

/**
 * Столбец времени не уже этого: «чч:мм» с табличными цифрами (13 px ≈ 37 px, 12 px ≈ 34 px) + ≥ 4 px —
 * соседние времена не слипаются. На окне уже 360 px время и заголовки — 12 px, день — 26 px.
 */
const МИН_СТОЛБЕЦ = { обычно: 42, узко: 39 } as const;

/**
 * Сегодня и ещё 7 дней: строка — день, столбцы — шесть времён по порядку дня. Влезает в 286 px (окно 320 px).
 * Столбцы: каждый не уже МИН_СТОЛБЕЦ (времена не слипаются) и не уже самого длинного слова заголовка (слово не
 * рвётся посередине: «Магриб», «Құптан», «шығуы»); остаток ширины делится поровну (flexGrow 1) — на 360 px и шире
 * столбцы почти равные. Ширину слов меряет скрытая строка (onLayout) тем же шрифтом. День — 30 px (узко — 26).
 * Заголовки — до 2 строк по центру («Күн шығуы» — в 2 строки, а не «Күн»); на окне уже 360 px строки значков в шапке
 * нет, а заголовки и время — 12 px (единственное место вне шкалы: окно 320 px = увеличение 400 %, WCAG 1.4.10).
 * memo: пропсы — место, мазхаб, день, подпись.
 */
const ТаблицаНедели = memo(function ТаблицаНедели({
  место,
  мазхаб,
  сегодня,
  подписьСегодня,
}: {
  место: Место;
  мазхаб: Мазхаб;
  сегодня: string;
  подписьСегодня: string;
}) {
  const { язык } = useПеревод();
  const { цвет, отступ, радиус } = useТема();
  const { width } = useWindowDimensions();
  const узко = width < 360;
  const { пояс } = место;
  const официальные = useВерсияОфициальных();
  const [слова, установитьСлова] = useState<Partial<Record<КлючВремени, number>>>({});
  // КЗ/УЗ — из официальной таблицы, если она на телефоне (как карточка), иначе расчёт; полярный день/ночь — строки нет.
  const дни = useMemo(() => {
    const итог: ВременаДня[] = [];
    for (let i = 0; i < ДНЕЙ; i++) {
      const в = временаДняКэш(место, сдвигДня(сегодня, i), мазхаб);
      if (в) итог.push(в);
    }
    return итог;
  }, [место, мазхаб, сегодня, официальные]);

  const мелко = узко ? { fontSize: 12, lineHeight: 16 } : null;
  const стильЗаголовка = [{ textAlign: 'center' as const }, мелко];
  const мин = узко ? МИН_СТОЛБЕЦ.узко : МИН_СТОЛБЕЦ.обычно;
  const длинноеСлово = (к: КлючВремени) => НАЗВАНИЯ[к][язык].split(' ').reduce((а, б) => (б.length > а.length ? б : а), '');
  const столбец = (к: КлючВремени) => {
    const основа = Math.max(мин, Math.ceil((слова[к] ?? 0) + 2));
    return { flexGrow: 1, flexShrink: 1, flexBasis: основа, minWidth: мин, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: отступ.s };
  };
  const деньСтолбец = { width: узко ? 26 : 30, paddingLeft: отступ.xs, justifyContent: 'center' as const, paddingVertical: отступ.s };

  return (
    <View
      role="table"
      aria-label={{ ru: 'Время намаза на неделю', kk: 'Аптаға арналған намаз уақыты', uz: 'Bir haftalik namoz vaqti', en: 'Prayer times for the week' }[язык]}
      testID="намаз-неделя"
      style={{ borderRadius: радиус.l, borderWidth: 1, borderColor: цвет.граница, backgroundColor: цвет.поверхность, overflow: 'hidden' }}
    >
      {/* Скрытый замер: ширина самого длинного слова каждого заголовка тем же шрифтом. */}
      <View aria-hidden style={{ position: 'absolute', left: 0, top: 0, opacity: 0, flexDirection: 'row', pointerEvents: 'none' }}>
        {КЛЮЧИ_ВРЕМЁН.map((к) => (
          <Текст
            key={к + язык + узко}
            вид="мелкий"
            numberOfLines={1}
            стиль={стильЗаголовка}
            onLayout={(е) => {
              const ш = е.nativeEvent.layout.width;
              установитьСлова((с) => (Math.abs((с[к] ?? 0) - ш) < 0.5 ? с : { ...с, [к]: ш }));
            }}
          >
            {длинноеСлово(к)}
          </Текст>
        ))}
      </View>
      <View role="row" style={{ flexDirection: 'row', backgroundColor: цвет.поверхностьВторая }}>
        <View role="columnheader" aria-label={{ ru: 'День', kk: 'Күн', uz: 'Kun', en: 'Day' }[язык]} style={деньСтолбец} />
        {КЛЮЧИ_ВРЕМЁН.map((к) => (
          <View key={к} role="columnheader" style={[столбец(к), { gap: 2, paddingHorizontal: 1 }]}>
            {узко ? null : <Значок имя={ЗНАЧКИ_НАМАЗА[к]} размер={16} цвет={к === 'sunrise' ? цвет.текстВторой : цвет.акцент} />}
            <Текст
              вид="мелкий"
              цвет={к === 'sunrise' ? цвет.текстВторой : цвет.текст}
              numberOfLines={2}
              стиль={стильЗаголовка}
              testID={'неделя-заголовок-' + к}
            >
              {НАЗВАНИЯ[к][язык]}
            </Текст>
          </View>
        ))}
      </View>
      {дни.map((в) => {
        const этоСегодня = в.день === сегодня;
        const к = короткийДень(в.день, язык);
        return (
          <View
            key={в.день}
            role="row"
            testID={'неделя-' + в.день}
            style={{
              flexDirection: 'row',
              borderTopWidth: 1,
              borderTopColor: цвет.граница,
              backgroundColor: этоСегодня ? цвет.акцентМягкий : 'transparent',
            }}
          >
            <View role="rowheader" aria-label={`${этоСегодня ? подписьСегодня + ', ' : ''}${к.деньНедели} ${к.дата}`} style={деньСтолбец}>
              <View aria-hidden>
                <Текст вид="метка" цвет={этоСегодня ? цвет.акцент : цвет.текст}>
                  {к.деньНедели}
                </Текст>
                <Текст вид="мелкий" табличные>
                  {к.число}
                </Текст>
              </View>
            </View>
            {КЛЮЧИ_ВРЕМЁН.map((кл) => (
              <View key={кл} role="cell" style={[столбец(кл), { paddingHorizontal: 2 }]}>
                <Текст вид="мелкий" табличные цвет={кл === 'sunrise' ? цвет.текстВторой : цвет.текст} стиль={мелко} testID={`неделя-${в.день}-${кл}`}>
                  {чч_мм(в[кл], пояс)}
                </Текст>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
});
