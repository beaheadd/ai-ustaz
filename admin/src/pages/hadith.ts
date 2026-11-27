/**
 * Хадисы в админке: показать/скрыть в приложении, отметка «Проверено устазом» (кто), «добавить» из списка «ждут устаза».
 * Владелец 27.11.2026: «Раздел хадисы… чтобы мы там добавляли, убирали, отключали». Правило 2 CLAUDE.md: только
 * записи проверенной базы HadeethEnc — текст, перевод и степень здесь не пишутся и не правятся (их нет в запросах
 * вовсе). «Добавить» = отметка устаза к хадису из «ждут устаза»; в приложении он появится следующей сборкой
 * (content/hadith/одобрено.json ← «Выгрузить отметки устаза»). Изменения — POST /api/admin/content/hadith (админ+).
 */
import { получить, отправить, текстОшибки } from '../api.ts';
import { h, число, очистить } from '../dom.ts';
import { заголовкиХадисов, индексХадисов } from '../content.ts';
import { можно, type Я } from '../roles.ts';

type Отметка = { id: number; скрыт: boolean; кто: string; когда: string | null; изменён: number | null; кем: string };
type Ждёт = { id: number; ссылка: string; причины: string[]; категории: { id: number; русское: string }[] };
const НА_СТРАНИЦЕ = 30;

export async function страницаХадисов(куда: HTMLElement, я: Я): Promise<void> {
  куда.appendChild(h('h1', null, 'Хадисы'));
  const [индекс, заголовки, ждут] = await Promise.all([
    индексХадисов(), заголовкиХадисов(),
    fetch('files/pending-hadith.json', { credentials: 'omit' }).then((о) => (о.ok ? о.json() : { хадисы: [] })).then((д: { хадисы: Ждёт[] }) => д.хадисы),
  ]);
  const правка = можно(я, 'admin');
  let отметки = new Map<number, Отметка>();
  const загрузитьОтметки = async () => {
    const о = await получить<{ хадисы: Отметка[] }>('/api/admin/content');
    отметки = new Map(о.хадисы.map((з) => [з.id, з]));
  };
  await загрузитьОтметки();

  куда.appendChild(h('div', { class: 'карта тихая' },
    h('p', null, `Сахих аль-Бухари с переводом HadeethEnc.com: в приложении ${число(индекс.хадисы.length)}, ждут устаза ${число(ждут.length)}. `,
      'Текст, перевод и степень — дословно из HadeethEnc; здесь их не правят (правило 2).'),
    h('p', null, 'Скрыть — хадис пропадёт из приложения сразу (до 5 минут). Проверено устазом — уберёт плашку «Черновик».')));

  const вкладки = h('div', { class: 'переключатель', role: 'tablist' });
  const тело = h('div');
  const сообщение = h('p', { class: 'сообщение', role: 'status', 'aria-live': 'polite' });
  куда.append(вкладки, сообщение, тело);
  let вкладка: 'в-приложении' | 'ждут' = 'в-приложении';
  let запрос = '';
  let страница = 0;

  const отметить = async (id: number, что: { скрыт?: boolean; проверил?: string }) => {
    try {
      const о = await отправить<{ версия: number }>('/api/admin/content/hadith', { id, ...что });
      сообщение.textContent = `Сохранено (№ ${id}). Версия настроек ${о.версия}.`;
      await загрузитьОтметки();
      нарисовать();
    } catch (е) {
      сообщение.textContent = текстОшибки(е);
    }
  };
  const спроситьУстаза = (id: number) => {
    const кто = window.prompt('Кто из устазов проверил? (имя — будет видно в приложении)', '');
    if (кто && кто.trim()) void отметить(id, { проверил: кто.trim() });
  };

  const строкаОтметки = (id: number, одобреноСборкой?: { кто: string; когда: string }) => {
    const о = отметки.get(id);
    const части: (Node | string)[] = [];
    if (одобреноСборкой) части.push(h('span', { class: 'метка хорошо' }, `проверил ${одобреноСборкой.кто}, ${одобреноСборкой.когда}`));
    else if (о?.кто) части.push(h('span', { class: 'метка хорошо' }, `проверил ${о.кто}, ${о.когда}`));
    else части.push(h('span', { class: 'метка черновик' }, 'черновик'));
    if (о?.скрыт) части.push(h('span', { class: 'метка плохо' }, 'скрыт'));
    return h('span', { class: 'метки' }, части);
  };

  function нарисовать(): void {
    очистить(вкладки);
    for (const [к, название] of [['в-приложении', `В приложении (${число(индекс.хадисы.length)})`], ['ждут', `Ждут устаза (${число(ждут.length)})`]] as const) {
      const кн = h('button', { type: 'button', class: 'чип', role: 'tab', 'aria-selected': String(вкладка === к) }, название);
      кн.addEventListener('click', () => {
        вкладка = к;
        страница = 0;
        нарисовать();
      });
      вкладки.appendChild(кн);
    }
    очистить(тело);
    const поиск = h('input', { type: 'search', class: 'поиск', placeholder: 'Номер (по порядку или HadeethEnc) или слова', value: запрос, 'aria-label': 'Найти хадис' });
    поиск.addEventListener('change', () => {
      запрос = поиск.value.trim().toLowerCase();
      страница = 0;
      нарисовать();
    });
    тело.appendChild(поиск);
    if (вкладка === 'в-приложении') {
      const все = индекс.хадисы.filter((х) => {
        if (!запрос) return true;
        if (/^\d+$/.test(запрос)) return String(х.n) === запрос || String(х.id) === запрос;
        return (заголовки.get(х.id)?.заголовок ?? '').toLowerCase().includes(запрос);
      });
      const часть = все.slice(страница * НА_СТРАНИЦЕ, (страница + 1) * НА_СТРАНИЦЕ);
      тело.appendChild(h('p', { class: 'тихо мелко' }, `Найдено: ${число(все.length)}.`));
      тело.appendChild(h('ul', { class: 'хадисы' }, часть.map((х) => {
        const з = заголовки.get(х.id);
        const о = отметки.get(х.id);
        const одобрено = индекс.одобрено[String(х.id)];
        const скрыть = h('button', { type: 'button', class: 'кнопка', disabled: !правка }, о?.скрыт ? 'Показать' : 'Скрыть');
        скрыть.addEventListener('click', () => void отметить(х.id, { скрыт: !о?.скрыт }));
        const устаз = h('button', { type: 'button', class: 'кнопка', disabled: !правка || !!одобрено }, о?.кто ? 'Снять отметку устаза' : 'Проверено устазом');
        устаз.addEventListener('click', () => (о?.кто ? void отметить(х.id, { проверил: '' }) : спроситьУстаза(х.id)));
        return h('li', { class: 'карта хадис' + (о?.скрыт ? ' выкл' : '') },
          h('div', { class: 'хадис-шапка' }, h('strong', null, `№ ${х.n}`), h('span', { class: 'тихо мелко' }, ` HadeethEnc ${х.id}`), строкаОтметки(х.id, одобрено)),
          h('p', null, з?.заголовок ?? '—'),
          h('p', { class: 'тихо мелко' }, `Степень (HadeethEnc): ${з?.степень ?? '—'}`),
          h('div', { class: 'панель' }, скрыть, устаз,
            h('a', { href: `https://hadeethenc.com/ru/browse/hadith/${х.id}`, target: '_blank', rel: 'noopener noreferrer' }, 'Открыть на HadeethEnc')));
      })));
      листалка(все.length);
    } else {
      const все = ждут.filter((х) => !запрос || String(х.id) === запрос || х.причины.join(' ').toLowerCase().includes(запрос) ||
        х.категории.some((к) => к.русское.toLowerCase().includes(запрос)));
      const часть = все.slice(страница * НА_СТРАНИЦЕ, (страница + 1) * НА_СТРАНИЦЕ);
      тело.appendChild(h('p', { class: 'тихо мелко' }, 'Эти хадисы не показываются в приложении, пока их не посмотрит устаз (правила 1, 5, 6, 11). ',
        'Отметка устаза добавит хадис в приложение следующей сборкой.'));
      тело.appendChild(h('ul', { class: 'хадисы' }, часть.map((х) => {
        const о = отметки.get(х.id);
        const устаз = h('button', { type: 'button', class: 'кнопка главная', disabled: !правка }, о?.кто ? 'Снять отметку' : 'Добавить: проверено устазом');
        устаз.addEventListener('click', () => (о?.кто ? void отметить(х.id, { проверил: '' }) : спроситьУстаза(х.id)));
        return h('li', { class: 'карта хадис' },
          h('div', { class: 'хадис-шапка' }, h('strong', null, `HadeethEnc ${х.id}`),
            о?.кто ? h('span', { class: 'метка хорошо' }, `проверил ${о.кто} — войдёт в следующую сборку`) : h('span', { class: 'метка' }, 'ждёт устаза')),
          h('ul', { class: 'тихо мелко' }, х.причины.map((п) => h('li', null, п))),
          h('p', { class: 'мелко' }, х.категории.map((к) => к.русское).join('; ')),
          h('div', { class: 'панель' }, устаз, h('a', { href: х.ссылка, target: '_blank', rel: 'noopener noreferrer' }, 'Прочитать на HadeethEnc')));
      })));
      листалка(все.length);
    }
    if (правка) {
      const выгрузить = h('button', { type: 'button', class: 'кнопка тихая' }, 'Выгрузить отметки устаза (одобрено.json)');
      выгрузить.addEventListener('click', async () => {
        try {
          const д = await получить<Record<string, { кто: string; когда: string }>>('/api/admin/content/hadith/approved');
          const ссылка = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(д, null, 2)], { type: 'application/json' })), download: 'одобрено-из-админки.json' });
          ссылка.click();
        } catch (е) {
          сообщение.textContent = текстОшибки(е);
        }
      });
      тело.appendChild(h('div', { class: 'панель' }, выгрузить,
        h('span', { class: 'тихо мелко' }, 'Для сборки: content/hadith/одобрено.json → tools/hadith/build_hadith.py.')));
    }
  }

  function листалка(всего: number): void {
    const страниц = Math.ceil(всего / НА_СТРАНИЦЕ);
    if (страниц <= 1) return;
    const назад = h('button', { type: 'button', class: 'кнопка', disabled: страница === 0 }, '← Назад');
    const вперёд = h('button', { type: 'button', class: 'кнопка', disabled: страница >= страниц - 1 }, 'Дальше →');
    назад.addEventListener('click', () => {
      страница -= 1;
      нарисовать();
      window.scrollTo(0, 0);
    });
    вперёд.addEventListener('click', () => {
      страница += 1;
      нарисовать();
      window.scrollTo(0, 0);
    });
    тело.appendChild(h('div', { class: 'панель листалка' }, назад, h('span', null, `${страница + 1} из ${страниц}`), вперёд));
  }

  нарисовать();
}
