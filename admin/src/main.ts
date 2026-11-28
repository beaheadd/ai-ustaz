/**
 * Админка AI Ustaz (https://aiustaz.pro/admin/) — отдельное маленькое веб-приложение, не в сборке приложения.
 *
 * Владелец 27.11.2026: «Создай админ панель, админку меня назначь админом, чтобы потом я другим давал доступ. На админ
 * панели первая страница должно быть показ статистики… Потом дальше блок должен быть Коран… таджвид… записи всех чтецов…
 * Раздел хадисы… добавляли, убирали, отключали». Сервер — server/admin.py, stats.py, content_admin.py;
 * docs/дизайн/12-админка-и-статистика.md. Русский интерфейс (казахский — позже).
 *
 * Разделы (hash-адреса): #/ — статистика; #/quran, #/quran/<сура> — Коран с таджвидом и чтецами (только чтение);
 * #/reciters — чтецы (включить в приложении, по умолчанию); #/hadith — хадисы (скрыть, отметка устаза, из «ждут
 * устаза»); #/feedback, #/feedback/<id> — «Ошибки»: сообщения людей из приложения (владелец 28.11.2026: «Любой человек
 * увидел ошибку, нажал, он попадает к нам и обрабатывает»; число новых — на пункте меню); #/admins — админы (только
 * владелец); #/audit — журнал; #/sessions — мои входы; #/dhikr, #/namaz, #/notify — заготовки. Вход — почта и код из письма.
 */
import { получить, отправить, приНеВошли, текстОшибки } from './api.ts';
import { h, очистить } from './dom.ts';
import { страницаАдминов, страницаЖурнала, страницаСеансов } from './pages/users.ts';
import { страницаХадисов } from './pages/hadith.ts';
import { страницаКорана } from './pages/quran.ts';
import { страницаЧтецов } from './pages/reciters.ts';
import { страницаСтатистики } from './pages/stats.ts';
import { страницаЗаготовки } from './pages/stubs.ts';
import { страницаСообщений, type Счёт } from './pages/feedback.ts';
import { можно, type Я } from './roles.ts';


const РАЗДЕЛЫ: { путь: string; название: string; роль?: Я['роль'] }[] = [
  { путь: '', название: 'Статистика' },
  { путь: 'quran', название: 'Коран' },
  { путь: 'reciters', название: 'Чтецы' },
  { путь: 'hadith', название: 'Хадисы' },
  { путь: 'feedback', название: 'Ошибки' },
  { путь: 'dhikr', название: 'Зикры и дуа' },
  { путь: 'namaz', название: 'Намаз' },
  { путь: 'notify', название: 'Уведомления' },
  { путь: 'admins', название: 'Админы', роль: 'owner' },
  { путь: 'audit', название: 'Журнал', роль: 'admin' },
  { путь: 'sessions', название: 'Мои входы' },
];

const корень = document.getElementById('app') as HTMLElement;
let я: Я | null = null;

function вход(): void {
  я = null;
  очистить(корень);
  const сообщение = h('p', { class: 'сообщение', role: 'status', 'aria-live': 'polite' });
  const почта = h('input', { type: 'email', id: 'почта', autocomplete: 'email', inputmode: 'email', required: true, placeholder: 'name@example.com' });
  // Код — 4 цифры (владелец 28.11.2026: «Код четырёхзначный сделай, чтобы было проще»); после 4-й цифры — сразу «Войти».
  const код = h('input', { type: 'text', id: 'код', autocomplete: 'one-time-code', inputmode: 'numeric', pattern: '[0-9]{4}', maxlength: 4, placeholder: '1234' });
  const шагКода = h('div', { class: 'поле', hidden: true }, h('label', { for: 'код' }, 'Код из письма'), код,
    h('p', { class: 'подсказка' }, 'Код действует 10 минут. Письмо может попасть в «Спам».'));
  const кнопка = h('button', { type: 'submit', class: 'кнопка главная' }, 'Прислать код');
  let этап: 'почта' | 'код' = 'почта';
  const форма = h('form', { class: 'вход', novalidate: true },
    h('div', { class: 'знак', 'aria-hidden': 'true' }, '☪'),
    h('h1', null, 'Админка AI Ustaz'),
    h('p', { class: 'подсказка' }, 'Вход — по коду из письма. Доступ даёт владелец.'),
    h('div', { class: 'поле' }, h('label', { for: 'почта' }, 'Почта'), почта),
    шагКода, кнопка, сообщение);
  форма.addEventListener('submit', async (с) => {
    с.preventDefault();
    сообщение.textContent = '';
    кнопка.disabled = true;
    try {
      if (этап === 'почта') {
        await отправить('/api/admin/login/code', { email: почта.value });
        этап = 'код';
        шагКода.hidden = false;
        почта.readOnly = true;
        кнопка.textContent = 'Войти';
        сообщение.textContent = 'Если эта почта есть в списке админов, на неё ушёл код.';
        код.focus();
      } else {
        const о = await отправить<{ я: Я }>('/api/admin/login/verify', { email: почта.value, code: код.value.trim() });
        я = о.я;
        оболочка();
      }
    } catch (е) {
      сообщение.textContent = текстОшибки(е);
    } finally {
      кнопка.disabled = false;
    }
  });
  код.addEventListener('input', () => {
    const цифры = код.value.replace(/\D/g, '').slice(0, 4);
    if (цифры !== код.value) код.value = цифры;
    if (цифры.length === 4 && этап === 'код' && !кнопка.disabled) форма.requestSubmit();
  });
  корень.appendChild(h('main', { class: 'экран-входа' }, форма));
  почта.focus();
}

let содержимое: HTMLElement;
let меню: HTMLElement;

function оболочка(): void {
  if (!я) return вход();
  очистить(корень);
  const выйти = h('button', { class: 'кнопка тихая', type: 'button' }, 'Выйти');
  выйти.addEventListener('click', async () => {
    try {
      await отправить('/api/admin/logout');
    } catch {
      // всё равно на экран входа
    }
    вход();
  });
  меню = h('nav', { class: 'меню', 'aria-label': 'Разделы' });
  содержимое = h('main', { class: 'содержимое', id: 'содержимое', tabindex: -1 });
  корень.appendChild(
    h('div', { class: 'каркас' },
      h('header', { class: 'шапка' },
        h('a', { href: '#/', class: 'логотип' }, 'AI Ustaz', h('span', null, ' · админка')),
        h('span', { class: 'кто' }, я.имя || я.email.split('@')[0], h('small', null, { owner: 'владелец', admin: 'админ', viewer: 'просмотр' }[я.роль])),
        выйти),
      меню, содержимое));
  показать();
}

function показать(): void {
  if (!я || !содержимое) return;
  const путь = location.hash.replace(/^#\/?/, '');
  const [раздел, параметр] = путь.split('/');
  очистить(меню);
  for (const р of РАЗДЕЛЫ) {
    if (р.роль && !можно(я, р.роль)) continue;
    меню.appendChild(h('a', { href: '#/' + р.путь, class: 'пункт', 'aria-current': р.путь === (раздел ?? '') ? 'page' : null }, р.название));
  }
  меню.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  void числоНовых();
  очистить(содержимое);
  const страницы: Record<string, () => Promise<void> | void> = {
    '': () => страницаСтатистики(содержимое),
    quran: () => страницаКорана(содержимое, параметр ? Number(параметр) : null),
    reciters: () => страницаЧтецов(содержимое, я!),
    hadith: () => страницаХадисов(содержимое, я!),
    feedback: () => страницаСообщений(содержимое, я!, параметр && /^\d+$/.test(параметр) ? Number(параметр) : null),
    admins: () => страницаАдминов(содержимое, я!),
    audit: () => страницаЖурнала(содержимое),
    sessions: () => страницаСеансов(содержимое),
    dhikr: () => страницаЗаготовки(содержимое, 'Зикры и дуа', 'Список зикров и дуа из приложения, отметки устаза и «скрыть» — следующим шагом. Сейчас тексты меняются только через проверенную сборку (tools/dhikr).'),
    namaz: () => страницаЗаготовки(содержимое, 'Учимся намазу', 'Разделы «Учимся намазу» и чек-лист устаза — следующим шагом. Сейчас — через проверенную сборку (tools/namaz).'),
    notify: () => страницаЗаготовки(содержимое, 'Уведомления о намазе', 'Сколько подписок на уведомления — на странице «Статистика». Рассылок вручную нет: уведомления только о времени намаза.', true),
  };
  const страница = страницы[раздел ?? ''] ?? страницы[''];
  Promise.resolve(страница()).catch((е) => содержимое.appendChild(h('p', { class: 'ошибка' }, текстОшибки(е))));
  содержимое.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/** Число новых сообщений об ошибках — значком на пункте «Ошибки» (при каждой смене раздела и после разбора). */
async function числоНовых(): Promise<void> {
  try {
    const с = await получить<Счёт>('/api/admin/feedback/count');
    const пункт = меню?.querySelector<HTMLElement>('a.пункт[href="#/feedback"]');
    if (!пункт) return;
    пункт.querySelector('.число-новых')?.remove();
    if (с.новых > 0) пункт.appendChild(h('span', { class: 'число-новых', 'aria-label': `новых: ${с.новых}` }, с.новых > 99 ? '99+' : String(с.новых)));
  } catch {
    // нет связи — без значка
  }
}
window.addEventListener('ошибки-изменены', () => void числоНовых());

приНеВошли(вход);
window.addEventListener('hashchange', показать);
получить<Я>('/api/admin/me').then(
  (о) => {
    я = о;
    оболочка();
  },
  () => вход(),
);
