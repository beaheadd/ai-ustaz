/**
 * Первая страница админки — статистика (владелец 27.11.2026: «Сколько человек зашло, сколько человек пользовались, какие
 * страницы смотрели, сколько времени находились на сайте»). Данные — GET /api/admin/stats?days=1|7|30|90
 * (server/stats.py: анонимные устройства, без имён, IP и мест).
 * Графики — по методу dataviz: одна серия — один цвет (--серия), без легенды; тонкие линии, подписи текстом, наведение
 * с подсказкой; рядом всегда таблица/числа (цвет не единственный носитель смысла).
 */
import { получить } from '../api.ts';
import { h, s, длительность, число, очистить, процент } from '../dom.ts';

type Ряд = { день: string; посетители: number; новые: number; сеансы: number; просмотры: number; секунд: number; установлено: number };
type Разрез = { ключ: string; посетители: number }[];
type Сводка = {
  дней: number; с: string; по: string;
  карточки: Record<'сегодня' | '7' | '30', { посетители: number; новые: number; сеансы: number; просмотры: number }>;
  время: { сеансов: number; среднее: number; медиана: number; наПосетителяВДень: number };
  ряд: Ряд[];
  экраны: { экран: string; просмотры: number; посетители: number; секунд: number }[];
  номера: Record<string, { номер: number; просмотры: number }[]>;
  языки: Разрез; устройства: Разрез; системы: Разрез; откуда: Разрез;
  установлено: number; часы: Record<string, number>;
  удержание: { d1: { когорта: number; вернулись: number }; d7: { когорта: number; вернулись: number } };
  уведомления: { подписок: number };
};

/** Путь экрана (routes.ts ПУТИ) → понятное имя. */
export const ЭКРАНЫ: Record<string, string> = {
  '': 'Главная', onboarding: 'Первый вход', lesson0: 'Урок 0', course: 'Карта курса', lesson: 'Урок', how: 'Как объясняем',
  about: 'О проекте', licenses: 'Лицензии', qibla: 'Кибла', prayer: 'Время намаза', 'prayer-city': 'Город',
  quran: 'Коран: список сур', 'quran/sura': 'Коран: сура', 'quran/check': 'Коран: проверка чтения', hadith: 'Хадисы',
  'hadith/list': 'Хадисы: раздел', 'hadith/item': 'Хадис', ask: 'Спросить AI Ustaz', dhikr: 'Зикры', dua: 'Дуа',
  'dhikr/item': 'Зикр (счётчик)', makharij: 'Махраджи', 'makharij/letter': 'Махрадж буквы', namaz: 'Учимся намазу',
  'namaz/section': 'Учимся намазу: раздел', more: 'Ещё', install: 'Установка', notifications: 'Уведомления',
};
const ЯЗЫКИ: Record<string, string> = { ru: 'Русский', kk: 'Қазақша', uz: 'Oʻzbekcha', en: 'English', '-': 'не указан' };
const УСТРОЙСТВА: Record<string, string> = { phone: 'Телефон', tablet: 'Планшет', desktop: 'Компьютер', '-': 'другое' };
const СИСТЕМЫ: Record<string, string> = { android: 'Android', ios: 'iPhone / iPad', windows: 'Windows', mac: 'Mac', linux: 'Linux', other: 'другое' };
const НОМЕРА: Record<string, string> = { 'quran/sura': 'Суры', 'hadith/item': 'Хадисы (№ HadeethEnc)', lesson: 'Уроки', 'dhikr/item': 'Зикры', 'namaz/section': 'Намаз: разделы' };

const ПЕРИОДЫ = [
  { дней: 1, название: 'Сегодня' },
  { дней: 7, название: '7 дней' },
  { дней: 30, название: '30 дней' },
  { дней: 90, название: '90 дней' },
];
let выбрано = 30;

export async function страницаСтатистики(куда: HTMLElement): Promise<void> {
  const заголовок = h('div', { class: 'строка-заголовка' }, h('h1', null, 'Статистика'));
  const периоды = h('div', { class: 'переключатель', role: 'group', 'aria-label': 'Период' });
  const тело = h('div', { class: 'тело-статистики', 'aria-live': 'polite' }, h('p', { class: 'тихо' }, 'Загружаю…'));
  куда.append(заголовок, периоды, тело);
  const нарисовать = async () => {
    очистить(периоды);
    for (const п of ПЕРИОДЫ) {
      const к = h('button', { type: 'button', class: 'чип', 'aria-pressed': String(п.дней === выбрано) }, п.название);
      к.addEventListener('click', () => {
        выбрано = п.дней;
        void нарисовать();
      });
      периоды.appendChild(к);
    }
    const с = await получить<Сводка>('/api/admin/stats?days=' + выбрано);
    очистить(тело);
    сводка(тело, с);
  };
  await нарисовать();
}

function плитка(подпись: string, значение: string, пояснение?: string): HTMLElement {
  return h('div', { class: 'плитка' }, h('span', { class: 'подпись' }, подпись), h('strong', { class: 'значение' }, значение),
    пояснение ? h('span', { class: 'пояснение' }, пояснение) : null);
}

function сводка(куда: HTMLElement, с: Сводка): void {
  const к = с.карточки;
  куда.appendChild(h('section', { 'aria-label': 'Главное' },
    h('div', { class: 'плитки' },
      плитка('Зашли сегодня', число(к.сегодня.посетители), `новых: ${число(к.сегодня.новые)}`),
      плитка('За 7 дней', число(к['7'].посетители), `новых: ${число(к['7'].новые)}`),
      плитка('За 30 дней', число(к['30'].посетители), `новых: ${число(к['30'].новые)}`),
      плитка('Сеансов', число(с.время.сеансов), `за ${периодТекст(с.дней)}`),
      плитка('Время за сеанс', длительность(с.время.среднее), `медиана ${длительность(с.время.медиана)}`),
      плитка('Время в день на человека', длительность(с.время.наПосетителяВДень)),
      плитка('Установили приложение', число(с.установлено), 'открывали с экрана телефона'),
      плитка('Подписки на уведомления', число(с.уведомления.подписок), 'активные сейчас'),
    ),
    h('p', { class: 'тихо мелко' }, 'Человек = анонимное устройство (браузер телефона). Без имён, телефонов, IP и мест. ',
      'Кто выключил статистику или включил «Не отслеживать», не считается.')));

  куда.appendChild(раздел('Посетители по дням', линия(с.ряд), таблицаДней(с.ряд)));

  const всегоПросмотров = с.экраны.reduce((а, э) => а + э.просмотры, 0);
  куда.appendChild(раздел('Какие страницы смотрели',
    полосы(с.экраны.map((э) => ({ подпись: ЭКРАНЫ[э.экран] ?? э.экран, значение: э.просмотры,
      справа: `${число(э.просмотры)} · ${число(э.посетители)} чел. · ${длительность(э.секунд)}` }))),
    h('p', { class: 'тихо мелко' }, `Всего просмотров: ${число(всегоПросмотров)}. Справа: просмотры · людей · общее время на странице.`)));

  const номера = Object.entries(с.номера).filter(([, з]) => з.length);
  if (номера.length) {
    куда.appendChild(раздел('Что открывали чаще', h('div', { class: 'колонки' }, номера.map(([экран, з]) =>
      h('div', null, h('h3', null, НОМЕРА[экран] ?? экран),
        h('ol', { class: 'список-номеров' }, з.map((н) => h('li', null, `№ ${н.номер}`, h('span', null, число(н.просмотры))))))))));
  }

  куда.appendChild(h('div', { class: 'колонки' },
    раздел('Языки', полосы(с.языки.map((з) => ({ подпись: ЯЗЫКИ[з.ключ] ?? з.ключ, значение: з.посетители })))),
    раздел('Устройства', полосы(с.устройства.map((з) => ({ подпись: УСТРОЙСТВА[з.ключ] ?? з.ключ, значение: з.посетители })))),
    раздел('Системы', полосы(с.системы.map((з) => ({ подпись: СИСТЕМЫ[з.ключ] ?? з.ключ, значение: з.посетители })))),
    раздел('Откуда пришли', полосы(с.откуда.map((з) => ({ подпись: з.ключ || 'напрямую / по ссылке без источника', значение: з.посетители })))),
  ));

  const д1 = с.удержание.d1, д7 = с.удержание.d7;
  куда.appendChild(раздел('Возвращаются ли',
    h('div', { class: 'плитки' },
      плитка('На следующий день', процент(д1.вернулись, д1.когорта), `${число(д1.вернулись)} из ${число(д1.когорта)} новых`),
      плитка('В течение недели', процент(д7.вернулись, д7.когорта), `${число(д7.вернулись)} из ${число(д7.когорта)} новых`)),
    h('p', { class: 'тихо мелко' }, 'Считаем по новым устройствам этого периода, у которых уже прошёл день (неделя).')));

  куда.appendChild(раздел('Когда заходят (по Алматы)', часы(с.часы)));
}

function периодТекст(дней: number): string {
  return дней === 1 ? 'сегодня' : `${дней} дней`;
}

function раздел(заголовок: string, ...дети: (Node | null)[]): HTMLElement {
  return h('section', { class: 'карта' }, h('h2', null, заголовок), ...дети);
}

/** Горизонтальные полосы одной серии: подпись, полоса, число текстом. */
function полосы(строки: { подпись: string; значение: number; справа?: string }[]): HTMLElement {
  if (!строки.length) return h('p', { class: 'тихо' }, 'Пока нет данных.');
  const макс = Math.max(...строки.map((с) => с.значение), 1);
  return h('ul', { class: 'полосы' }, строки.map((с) => h('li', null,
    h('span', { class: 'подпись' }, с.подпись),
    h('span', { class: 'дорожка', 'aria-hidden': 'true' }, h('span', { class: 'полоса', style: `width:${Math.max(2, (с.значение / макс) * 100)}%` })),
    h('span', { class: 'число' }, с.справа ?? число(с.значение)))));
}

const ДЕНЬ = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const деньТекст = (д: string) => ДЕНЬ.format(new Date(д + 'T00:00:00Z'));

/** Линия «посетители по дням»: одна серия, точки на краях, перекрестие и подсказка при наведении/касании. */
function линия(ряд: Ряд[]): HTMLElement {
  const Ш = 640, В = 200, Л = 36, П = 12, Вх = 12, Н = 28;
  const макс = Math.max(4, ...ряд.map((р) => р.посетители));
  const шаг = Math.pow(10, Math.floor(Math.log10(макс)));
  const верх = Math.ceil(макс / шаг) * шаг;
  const x = (i: number) => Л + (ряд.length <= 1 ? (Ш - Л - П) / 2 : (i * (Ш - Л - П)) / (ряд.length - 1));
  const y = (v: number) => Вх + (1 - v / верх) * (В - Вх - Н);
  const svg = s('svg', { viewBox: `0 0 ${Ш} ${В}`, class: 'график', role: 'img', 'aria-label': `Посетители по дням, максимум ${макс}` });
  for (let i = 0; i <= 4; i++) {
    const v = (верх * i) / 4;
    svg.appendChild(s('line', { x1: Л, x2: Ш - П, y1: y(v), y2: y(v), class: 'сетка' }));
    svg.appendChild(s('text', { x: Л - 6, y: y(v) + 4, class: 'ось', 'text-anchor': 'end' }, число(Math.round(v))));
  }
  const метки = ряд.length <= 7 ? ряд.map((_, i) => i) : [0, Math.floor(ряд.length / 2), ряд.length - 1];
  for (const i of метки) svg.appendChild(s('text', { x: x(i), y: В - 8, class: 'ось', 'text-anchor': i === 0 ? 'start' : i === ряд.length - 1 ? 'end' : 'middle' }, деньТекст(ряд[i].день)));
  if (ряд.length > 1) svg.appendChild(s('path', { d: ряд.map((р, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(р.посетители).toFixed(1)}`).join(''), class: 'линия' }));
  else if (ряд.length === 1) svg.appendChild(s('circle', { cx: x(0), cy: y(ряд[0].посетители), r: 5, class: 'точка' }));
  const курсор = s('line', { y1: Вх, y2: В - Н, class: 'курсор', visibility: 'hidden' });
  const точка = s('circle', { r: 5, class: 'точка', visibility: 'hidden' });
  svg.append(курсор, точка);
  const подсказка = h('div', { class: 'подсказка-графика', hidden: true });
  const обёртка = h('div', { class: 'обёртка-графика' }, svg, подсказка);
  const показать = (клиентX: number) => {
    const р = svg.getBoundingClientRect();
    const вх = ((клиентX - р.left) / р.width) * Ш;
    const i = Math.max(0, Math.min(ряд.length - 1, Math.round(((вх - Л) / (Ш - Л - П)) * (ряд.length - 1))));
    const д = ряд[i];
    if (!д) return;
    for (const [э, атр] of [[курсор, { x1: x(i), x2: x(i) }], [точка, { cx: x(i), cy: y(д.посетители) }]] as const)
      for (const [к, з] of Object.entries(атр)) э.setAttribute(к, String(з));
    курсор.setAttribute('visibility', 'visible');
    точка.setAttribute('visibility', 'visible');
    подсказка.hidden = false;
    подсказка.textContent = `${деньТекст(д.день)}: ${число(д.посетители)} чел., новых ${число(д.новые)}, сеансов ${число(д.сеансы)}`;
    подсказка.style.left = `${Math.min(Math.max(0, (x(i) / Ш) * р.width - 90), р.width - 180)}px`;
  };
  const спрятать = () => {
    курсор.setAttribute('visibility', 'hidden');
    точка.setAttribute('visibility', 'hidden');
    подсказка.hidden = true;
  };
  svg.addEventListener('pointermove', (с) => показать((с as PointerEvent).clientX));
  svg.addEventListener('pointerdown', (с) => показать((с as PointerEvent).clientX));
  svg.addEventListener('pointerleave', спрятать);
  return обёртка;
}

function таблицаДней(ряд: Ряд[]): HTMLElement {
  const строки = [...ряд].reverse().map((р) =>
    h('tr', null,
      h('td', null, деньТекст(р.день)), h('td', null, число(р.посетители)), h('td', null, число(р.новые)),
      h('td', null, число(р.сеансы)), h('td', null, число(р.просмотры)), h('td', null, длительность(р.секунд))));
  const шапка = h('tr', null, ...['День', 'Людей', 'Новых', 'Сеансов', 'Просмотров', 'Время'].map((т) => h('th', null, т)));
  const таблица = h('table', { class: 'таблица' }, h('thead', null, шапка), h('tbody', null, строки));
  return h('details', { class: 'таблица-дней' }, h('summary', null, 'Таблица по дням'), h('div', { class: 'прокрутка' }, таблица));
}

function часы(данные: Record<string, number>): HTMLElement {
  const значения = Array.from({ length: 24 }, (_, ч) => данные[String(ч).padStart(2, '0')] ?? 0);
  const макс = Math.max(1, ...значения);
  return h('div', { class: 'часы', role: 'img', 'aria-label': 'Сеансы по часам: ' + значения.map((з, ч) => `${ч} ч — ${з}`).join(', ') },
    значения.map((з, ч) => h('div', { class: 'час', title: `${ч}:00 — ${з} сеансов` },
      h('span', { class: 'столбик', style: `height:${з ? Math.max(4, (з / макс) * 100) : 0}%` }),
      h('span', { class: 'метка' }, ч % 3 === 0 ? String(ч) : ''))));
}
