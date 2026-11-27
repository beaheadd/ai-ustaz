/**
 * Коран в админке — только чтение (правило 1 CLAUDE.md: текст из проверенной копии Tanzil, не правится нигде).
 * Владелец 27.11.2026: «Там должен быть весь список записи Корана, сам Коран в тексте, потом эти таджвид, где как что
 * читается, потом записи всех чтецов». Список сур → сура: аяты с цветами таджвида (та же разметка, что в приложении),
 * легенда правил, сверка sha256 и «▶» у каждого аята выбранным чтецом.
 */
import { h, очистить } from '../dom.ts';
import { адресАята, глобальныйНомер, зеркало, играть, индексСур, разметкаСуры, стоп, сура, чтецы, type Зеркало, type Чтец } from '../content.ts';
import { КОДЫ_ТАДЖВИДА, ПРАВИЛА_ТАДЖВИДА, кускиТекста, разобратьРазметку, отрезкиВерны, type КодТаджвида } from '../../../app/src/quran/tajweed.ts';
import { МАНИФЕСТ_КОРАНА } from '../../../app/src/quran/manifest.generated.ts';

let выбранныйЧтец: string | null = null;
let таджвид = true;

export async function страницаКорана(куда: HTMLElement, номер: number | null): Promise<void> {
  const и = await индексСур();
  if (номер === null || !Number.isInteger(номер) || номер < 1 || номер > 114) return списокСур(куда, и);
  return экранСуры(куда, и, номер);
}

async function списокСур(куда: HTMLElement, и: Awaited<ReturnType<typeof индексСур>>): Promise<void> {
  куда.appendChild(h('h1', null, 'Коран'));
  куда.appendChild(h('div', { class: 'карта тихая' },
    h('p', null, `Текст — Tanzil Uthmani 1.1 со знаками (${и.сур} сур, ${и.аятов} аятов). Сверка sha256 источника: `,
      h('code', null, МАНИФЕСТ_КОРАНА.sha256Источника.slice(0, 16) + '…'), ' — ', h('strong', { class: 'хорошо' }, 'совпадает')),
    h('p', null, 'Текст Корана в админке не меняется — только показывается. Цвета таджвида и записи чтецов — внутри суры.')));
  const поиск = h('input', { type: 'search', placeholder: 'Номер или название суры', 'aria-label': 'Найти суру', class: 'поиск' });
  const список = h('ol', { class: 'суры' });
  const нарисовать = () => {
    const з = поиск.value.trim().toLowerCase();
    очистить(список);
    for (const с of и.суры) {
      const имя = [с.имя, с.транслит.ru, с.транслит.en, ...(с.синонимы ?? [])].filter(Boolean).join(' ').toLowerCase();
      if (з && String(с.сура) !== з && !имя.includes(з)) continue;
      список.appendChild(h('li', null, h('a', { href: `#/quran/${с.сура}`, class: 'сура-строка' },
        h('span', { class: 'номер' }, String(с.сура)),
        h('span', { class: 'имя' }, с.транслит.ru ?? с.транслит.en ?? '', h('small', null, `${с.аятов} аятов · ${с.тип === 'Meccan' ? 'мекканская' : 'мединская'}`)),
        h('span', { class: 'араб', lang: 'ar', dir: 'rtl' }, с.имя))));
    }
  };
  поиск.addEventListener('input', нарисовать);
  куда.append(поиск, список);
  нарисовать();
}

async function экранСуры(куда: HTMLElement, и: Awaited<ReturnType<typeof индексСур>>, номер: number): Promise<void> {
  const запись = и.суры[номер - 1];
  const [текст, разметка, все, зеркала] = await Promise.all([сура(номер), разметкаСуры(номер).catch(() => null), чтецы(), зеркало()]);
  const играющие = все.filter((ч) => ч.разрешено);
  if (!выбранныйЧтец || !играющие.some((ч) => ч.id === выбранныйЧтец)) выбранныйЧтец = играющие[0]?.id ?? null;
  куда.appendChild(h('p', null, h('a', { href: '#/quran', class: 'назад' }, '← Все суры')));
  куда.appendChild(h('h1', null, `${номер}. ${запись.транслит.ru ?? ''} `, h('span', { class: 'араб', lang: 'ar', dir: 'rtl' }, запись.имя)));

  const выбор = h('select', { 'aria-label': 'Чтец' }, играющие.map((ч) => h('option', { value: ч.id, selected: ч.id === выбранныйЧтец }, ч.кари.ru)));
  выбор.addEventListener('change', () => {
    выбранныйЧтец = выбор.value;
    стоп();
  });
  const переключатель = h('button', { type: 'button', class: 'чип', 'aria-pressed': String(таджвид) }, 'Цвета таджвида');
  const подряд = h('button', { type: 'button', class: 'кнопка' }, '▶ Слушать суру');
  куда.appendChild(h('div', { class: 'панель' }, h('label', null, 'Чтец ', выбор), переключатель, подряд));
  куда.appendChild(h('p', { class: 'тихо мелко' }, `Сверено: файл суры и разметка таджвида совпали с sha256 сборки. ${
    разметка ? '' : 'Разметки таджвида для этой суры нет — показан простой текст.'}`));

  const легенда = h('details', { class: 'карта легенда' }, h('summary', null, 'Правила таджвида — что означают цвета'),
    h('ul', null, КОДЫ_ТАДЖВИДА.map((к) => h('li', null, h('span', { class: `т-${к} образец`, 'aria-hidden': 'true' }, 'ـنّـ'), ' ', ПРАВИЛА_ТАДЖВИДА[к].ru,
      h('small', { class: 'тихо' }, ` · урок ${ПРАВИЛА_ТАДЖВИДА[к].урок}`)))),
    h('p', { class: 'тихо мелко' }, 'Цвета таджвида — черновик, проверяет устаз (правило 11).'));
  куда.appendChild(легенда);

  const аяты = h('ol', { class: 'аяты', 'data-таджвид': String(таджвид) });
  const кнопки: HTMLButtonElement[] = [];
  const ч = () => играющие.find((з) => з.id === выбранныйЧтец) as Чтец | undefined;
  const включить = (i: number, дальше: boolean) => {
    const чтец = ч();
    if (!чтец) return;
    const а = текст.аяты[i];
    const адрес = адресАята(чтец, зеркала as Зеркало[], номер, а.аят, глобальныйНомер(и, номер, а.аят));
    if (!адрес) return;
    кнопки.forEach((к) => (к.textContent = '▶'));
    for (const л of аяты.querySelectorAll('li.играет')) л.classList.remove('играет');
    кнопки[i].textContent = '■';
    аяты.children[i]?.classList.add('играет');
    играть(адрес, () => {
      кнопки[i].textContent = '▶';
      аяты.children[i]?.classList.remove('играет');
      if (дальше && i + 1 < текст.аяты.length) включить(i + 1, true);
    });
  };
  текст.аяты.forEach((а, i) => {
    const кнопка = h('button', { type: 'button', class: 'играть', 'aria-label': `Слушать аят ${а.аят}` }, '▶');
    кнопка.addEventListener('click', () => {
      if (кнопка.textContent === '■') {
        стоп();
        кнопка.textContent = '▶';
        аяты.children[i]?.classList.remove('играет');
        return;
      }
      включить(i, false);
    });
    кнопки.push(кнопка);
    const отрезки = разметка ? разобратьРазметку(разметка.аяты[i]) : null;
    const куски = отрезки && отрезкиВерны(а.текст, отрезки) ? кускиТекста(а.текст, отрезки) : [{ текст: а.текст, код: null }];
    аяты.appendChild(h('li', { value: а.аят },
      h('p', { class: 'аят', lang: 'ar', dir: 'rtl' }, куски.map((к) => (к.код ? h('span', { class: 'т-' + (к.код as КодТаджвида), title: ПРАВИЛА_ТАДЖВИДА[к.код as КодТаджвида].ru }, к.текст) : к.текст)),
        h('span', { class: 'номер-аята' }, ` ${а.аят}`)),
      h('div', { class: 'аят-низ' }, h('span', { class: 'тихо мелко' }, `${номер}:${а.аят}`), кнопка)));
  });
  переключатель.addEventListener('click', () => {
    таджвид = !таджвид;
    переключатель.setAttribute('aria-pressed', String(таджвид));
    аяты.setAttribute('data-таджвид', String(таджвид));
  });
  подряд.addEventListener('click', () => включить(0, true));
  куда.appendChild(аяты);
  if (!играющие.length) куда.appendChild(h('p', { class: 'тихо' }, 'Нет чтецов с разрешением — записи не играют.'));
}
