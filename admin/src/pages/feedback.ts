/**
 * «Ошибки» — сообщения людей из приложения: выделили текст и нажали «⚠ Ошибка» или «Сообщить об ошибке» в «Ещё» и в
 * меню суры и хадиса. Владелец 28.11.2026: «Любой человек увидел ошибку, нажал, он попадает к нам и обрабатывает. Если
 * это реальная ошибка, то мы улучшаем». Сервер — server/feedback.py.
 *
 * #/feedback — список (новые сверху), фильтры по статусу и категории, «Показать ещё»; #/feedback/<id> — сообщение:
 * выделенный текст, что не так, экран со ссылкой «Открыть это место в приложении», версия сборки, язык, тема,
 * устройство; статус и заметка (админ+; просмотр — только читает). Контакт видят только админы: он нужен лишь для ответа
 * и удаляется через 90 дней после закрытия. Каждое изменение — в журнал (сервер).
 * Текст сообщений — только как текст (dom.ts h()), не HTML.
 */
import { получить, отправить, текстОшибки } from '../api.ts';
import { дата, h, очистить, число } from '../dom.ts';
import { можно, type Я } from '../roles.ts';
import { ЭКРАНЫ } from './stats.ts';

export type Сообщение = {
  id: number; создано: number; статус: Статус; категория: string; цитата: string | null; экран: string; место: string | null;
  текст: string; контакт?: string | null; естьКонтакт: boolean; версия: string; язык: string; тема: string; устройство: string;
  заметка?: string; кто: string | null; когда: number | null; закрыто: number | null;
};
type Статус = 'новое' | 'в работе' | 'исправлено' | 'не ошибка' | 'дубль';
export type Счёт = { новых: number; заНеделю: number; новыхЗаНеделю: number; всего: number };

export const СТАТУСЫ: Статус[] = ['новое', 'в работе', 'исправлено', 'не ошибка', 'дубль'];
export const КАТЕГОРИИ: Record<string, string> = {
  quran: 'Коран / таджвид', hadith: 'Хадис', translation: 'Перевод', dhikr: 'Зикр / дуа', prayer: 'Время намаза',
  ui: 'Интерфейс', other: 'Другое',
};
const ВИД_СТАТУСА: Record<Статус, string> = { новое: 'плохо', 'в работе': 'черновик', исправлено: 'хорошо', 'не ошибка': '', дубль: '' };
const ЯЗЫКИ: Record<string, string> = { ru: 'Русский', kk: 'Қазақша', uz: 'Oʻzbekcha', en: 'English', '-': '—' };
const УСТРОЙСТВА: Record<string, string> = { phone: 'Телефон', tablet: 'Планшет', desktop: 'Компьютер', '-': '—' };
const ТЕМЫ: Record<string, string> = { light: 'светлая', dark: 'тёмная', '-': '—' };

/** '#/quran/sura?n=2&a=255' → «Коран: сура». */
export function имяЭкрана(маршрут: string): string {
  const путь = маршрут.replace(/^#\/?/, '').split('?')[0].replace(/\/\d+$/, '');
  return ЭКРАНЫ[путь] ?? (путь || 'Главная');
}

/** Место: '2:255' → «сура 2, аят 255»; 'hadith:1751' → «хадис HadeethEnc 1751». */
export function имяМеста(место: string | null): string {
  if (!место) return '';
  let м = /^(\d{1,3}):(\d{1,3})$/.exec(место);
  if (м) return `сура ${м[1]}, аят ${м[2]}`;
  if (/^\d{1,3}$/.test(место)) return `сура ${место}`;
  м = /^([a-z]+):(\d+)$/.exec(место);
  const виды: Record<string, string> = { hadith: 'хадис HadeethEnc', dhikr: 'зикр №', lesson: 'урок', namaz: 'раздел намаза', letter: 'буква №' };
  return м ? `${виды[м[1]] ?? м[1]} ${м[2]}` : место;
}

const метка = (с: Статус) => h('span', { class: 'метка ' + (ВИД_СТАТУСА[с] ?? '') }, с);

let фильтрСтатуса = '';
let фильтрКатегории = '';

export async function страницаСообщений(куда: HTMLElement, я: Я, ид: number | null): Promise<void> {
  if (ид) return карточка(куда, я, ид);
  куда.appendChild(h('h1', null, 'Ошибки'));
  куда.appendChild(h('p', { class: 'карта тихая' },
    'Сообщения из приложения: человек выделил текст и нажал «⚠ Ошибка» или «Сообщить об ошибке». ',
    'Проверьте, исправьте (религиозный текст — с устазом) и поставьте статус. Контакт — только для ответа; ',
    'он удаляется через 90 дней после закрытия.'));
  const сводка = h('div', { class: 'плитки' });
  const статусы = h('div', { class: 'переключатель', role: 'group', 'aria-label': 'Статус' });
  const категория = h('select', { id: 'категория-ошибок', 'aria-label': 'Категория' },
    h('option', { value: '' }, 'Все категории'), Object.entries(КАТЕГОРИИ).map(([к, н]) => h('option', { value: к }, н)));
  категория.value = фильтрКатегории;
  const список = h('ul', { class: 'хадисы', 'aria-live': 'polite' });
  const ещё = h('button', { type: 'button', class: 'кнопка', hidden: true }, 'Показать ещё');
  куда.append(сводка, статусы, h('div', { class: 'панель' }, категория), список, h('div', { class: 'панель листалка' }, ещё));

  получить<Счёт>('/api/admin/feedback/count').then((с) => {
    сводка.append(
      плитка('Новых', число(с.новых), 'ждут разбора'),
      плитка('За 7 дней', число(с.заНеделю), `из них новых: ${число(с.новыхЗаНеделю)}`),
      плитка('Всего', число(с.всего)));
  }, () => undefined);

  let дальше: number | null = null;
  const загрузить = async (сначала: boolean) => {
    const п = new URLSearchParams({ limit: '30' });
    if (фильтрСтатуса) п.set('status', фильтрСтатуса);
    if (фильтрКатегории) п.set('cat', фильтрКатегории);
    if (!сначала && дальше) п.set('before', String(дальше));
    try {
      const о = await получить<{ сообщения: Сообщение[]; дальше: number | null }>('/api/admin/feedback?' + п.toString());
      if (сначала) очистить(список);
      дальше = о.дальше;
      ещё.hidden = дальше === null;
      if (сначала && !о.сообщения.length) список.appendChild(h('li', { class: 'тихо' }, 'Сообщений нет.'));
      for (const з of о.сообщения) список.appendChild(строка(з));
    } catch (е) {
      очистить(список);
      список.appendChild(h('li', { class: 'ошибка' }, текстОшибки(е)));
    }
  };
  const нарисоватьСтатусы = () => {
    очистить(статусы);
    for (const [з, н] of [['', 'Все'], ...СТАТУСЫ.map((с) => [с, с])]) {
      const к = h('button', { type: 'button', class: 'чип', 'aria-pressed': String(фильтрСтатуса === з) }, н);
      к.addEventListener('click', () => {
        фильтрСтатуса = з;
        нарисоватьСтатусы();
        void загрузить(true);
      });
      статусы.appendChild(к);
    }
  };
  категория.addEventListener('change', () => {
    фильтрКатегории = категория.value;
    void загрузить(true);
  });
  ещё.addEventListener('click', () => void загрузить(false));
  нарисоватьСтатусы();
  await загрузить(true);
  void я;
}

function плитка(подпись: string, значение: string, пояснение?: string): HTMLElement {
  return h('div', { class: 'плитка' }, h('span', { class: 'подпись' }, подпись), h('strong', { class: 'значение' }, значение),
    пояснение ? h('span', { class: 'пояснение' }, пояснение) : null);
}

function строка(з: Сообщение): HTMLElement {
  return h('li', { class: 'карта сообщение-ошибки' + (з.статус === 'новое' ? ' новое' : '') },
    h('a', { href: `#/feedback/${з.id}`, class: 'ссылка-карты' },
      h('div', { class: 'хадис-шапка' }, h('strong', null, `№ ${з.id}`), метка(з.статус),
        h('span', { class: 'метка' }, КАТЕГОРИИ[з.категория] ?? з.категория), h('span', { class: 'тихо мелко' }, дата(з.создано))),
      з.цитата ? h('blockquote', { class: 'цитата', dir: 'auto' }, з.цитата) : null,
      h('p', { dir: 'auto' }, з.текст),
      h('p', { class: 'тихо мелко' }, [имяЭкрана(з.экран), имяМеста(з.место)].filter(Boolean).join(' · '),
        з.естьКонтакт ? ' · есть контакт' : '')));
}

async function карточка(куда: HTMLElement, я: Я, ид: number): Promise<void> {
  куда.appendChild(h('a', { href: '#/feedback', class: 'назад' }, '← Все сообщения'));
  const тело = h('div');
  куда.appendChild(тело);
  const { сообщение: з } = await получить<{ сообщение: Сообщение }>('/api/admin/feedback/item?id=' + ид);
  const правка = можно(я, 'admin');
  const нарисовать = (з: Сообщение) => {
    очистить(тело);
    тело.appendChild(h('div', { class: 'строка-заголовка' }, h('h1', null, `Ошибка № ${з.id}`), метка(з.статус)));
    тело.appendChild(h('section', { class: 'карта' },
      h('h2', null, 'Выделенный текст'),
      з.цитата ? h('blockquote', { class: 'цитата', dir: 'auto', 'data-testid': 'ошибка-цитата' }, з.цитата) : h('p', { class: 'тихо' }, 'Без выделения (из меню).'),
      h('h2', null, 'Что не так'),
      h('p', { class: 'текст-сообщения', dir: 'auto', 'data-testid': 'ошибка-текст' }, з.текст)));
    const адрес = '/aiustaz/' + з.экран;
    тело.appendChild(h('section', { class: 'карта' },
      h('dl', { class: 'свойства' },
        h('dt', null, 'Экран'), h('dd', null, [имяЭкрана(з.экран), имяМеста(з.место)].filter(Boolean).join(' · '), ' ',
          h('a', { href: адрес, target: '_blank', rel: 'noopener', 'data-testid': 'ошибка-открыть' }, 'Открыть это место в приложении ↗')),
        h('dt', null, 'Адрес'), h('dd', null, h('code', null, з.экран)),
        h('dt', null, 'Категория'), h('dd', null, КАТЕГОРИИ[з.категория] ?? з.категория),
        h('dt', null, 'Пришло'), h('dd', null, дата(з.создано)),
        h('dt', null, 'Версия сборки'), h('dd', null, з.версия ? h('code', null, з.версия.slice(0, 7)) : '—'),
        h('dt', null, 'Язык · тема · устройство'), h('dd', null, `${ЯЗЫКИ[з.язык] ?? з.язык} · ${ТЕМЫ[з.тема] ?? з.тема} · ${УСТРОЙСТВА[з.устройство] ?? з.устройство}`),
        h('dt', null, 'Контакт'), h('dd', { 'data-testid': 'ошибка-контакт' },
          з.контакт ? [з.контакт, h('span', { class: 'тихо мелко' }, ' — только для ответа; удалится через 90 дней после закрытия')]
            : з.естьКонтакт ? h('span', { class: 'тихо' }, 'оставлен (видят админы)') : h('span', { class: 'тихо' }, 'не оставлен')),
        з.кто ? [h('dt', null, 'Разбирал'), h('dd', null, `${з.кто}, ${дата(з.когда)}`)] : null)));

    const статус = h('select', { id: 'статус-ошибки', disabled: !правка }, СТАТУСЫ.map((с) => h('option', { value: с, selected: с === з.статус }, с)));
    const заметка = h('textarea', { id: 'заметка-ошибки', rows: 3, maxlength: 2000, disabled: !правка, placeholder: 'Что сделали: «исправили в L07, проверил устаз…»' });
    заметка.value = з.заметка ?? '';
    const сохранить = h('button', { type: 'button', class: 'кнопка главная', disabled: !правка }, 'Сохранить');
    const сообщение = h('p', { class: 'сообщение', role: 'status', 'aria-live': 'polite' });
    сохранить.addEventListener('click', async () => {
      сохранить.disabled = true;
      try {
        const о = await отправить<{ сообщение: Сообщение }>('/api/admin/feedback/update', { id: з.id, status: статус.value, note: заметка.value });
        нарисовать(о.сообщение);
        тело.querySelector('.сообщение')!.textContent = 'Сохранено. Изменение записано в журнал.';
        window.dispatchEvent(new Event('ошибки-изменены'));
      } catch (е) {
        сообщение.textContent = текстОшибки(е);
        сохранить.disabled = false;
      }
    });
    тело.appendChild(h('section', { class: 'карта форма' },
      h('h2', null, 'Разбор'),
      h('div', { class: 'поле' }, h('label', { for: 'статус-ошибки' }, 'Статус'), статус),
      h('div', { class: 'поле' }, h('label', { for: 'заметка-ошибки' }, 'Заметка'), заметка),
      правка ? null : h('p', { class: 'подсказка' }, 'Роль «просмотр»: можно читать, менять — админ.'),
      h('div', { class: 'панель' }, сохранить), сообщение));
  };
  нарисовать(з);
}
