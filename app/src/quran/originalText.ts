/**
 * Исходный текст Корана из DOM (веб): копирование и «Сообщить об ошибке» отдают строку Tanzil, а не подстроенную для
 * шрифта «Мединский мусхаф» (quran/displayKfgqpc.ts; решение владельца 28.11.2026).
 *
 * Подстроенный кусок рисуется как <span data-o="исходный кусок">подстроенный кусок</span> (components/quran/QuranFont.tsx
 * кусокКорана). Здесь: исходныйТекстЭлемента(э) — textContent с data-o вместо подстроенного; исходныйТекстВыделения(в) —
 * то же для выделения (частичное выделение куска — через карту смещений, исходныйОтрезок); перенос строк между блоками —
 * как у браузера (innerText копии выделения в невидимом контейнере), знаки конца аята (data-end, user-select: none) —
 * не копируются, как и раньше. включитьКопированиеИсходного() — один раз: обработчик «copy» заменяет текст в буфере, только
 * если в выделении есть подстроенный кусок; иначе браузер копирует сам.
 * Нативно ничего не делает (нативной сборки пока нет; TODO при сборке Android/iOS).
 */
import { исходныйОтрезок } from './displayKfgqpc';

const АТРИБУТ = 'data-o';

function кусокНад(узел: Node | null): HTMLElement | null {
  const э = узел && (узел.nodeType === 1 ? (узел as HTMLElement) : узел.parentElement);
  return (э?.closest?.(`[${АТРИБУТ}]`) as HTMLElement | null) ?? null;
}

/** textContent элемента, где каждый подстроенный кусок заменён исходным. */
export function исходныйТекстЭлемента(э: Element): string {
  const копия = э.cloneNode(true) as Element;
  for (const к of [...копия.querySelectorAll(`[${АТРИБУТ}]`)]) к.replaceWith(к.getAttribute(АТРИБУТ) ?? '');
  return копия.textContent ?? '';
}

/** Смещение внутри куска (по его единственному текстовому узлу); не текстовый узел — край куска. */
function смещение(кусок: HTMLElement, контейнер: Node, смещ: number, конец: boolean): number {
  if (контейнер.nodeType === 3 && контейнер.parentElement === кусок) return смещ;
  return конец ? (кусок.textContent ?? '').length : 0;
}

export function исходныйТекстВыделения(в: Selection | null): string {
  if (!в || в.isCollapsed || !в.rangeCount || typeof document === 'undefined') return '';
  const д = в.getRangeAt(0);
  const начало = кусокНад(д.startContainer);
  const конец = кусокНад(д.endContainer);
  // Всё выделение внутри одного куска.
  if (начало && начало === конец) {
    const исх = начало.getAttribute(АТРИБУТ) ?? '';
    return исходныйОтрезок(исх, смещение(начало, д.startContainer, д.startOffset, false), смещение(начало, д.endContainer, д.endOffset, true));
  }
  const фрагмент = д.cloneContents();
  const куски = [...фрагмент.querySelectorAll(`[${АТРИБУТ}]`)];
  if (!куски.length && !начало && !конец) return в.toString();
  куски.forEach((к, i) => {
    const исх = к.getAttribute(АТРИБУТ) ?? '';
    const полный = подстроеннаяДлина(исх);
    const с = i === 0 && начало ? смещение(начало, д.startContainer, д.startOffset, false) : 0;
    const по = i === куски.length - 1 && конец ? смещение(конец, д.endContainer, д.endOffset, true) : полный;
    к.replaceWith(исходныйОтрезок(исх, с, по));
  });
  for (const з of [...фрагмент.querySelectorAll('[data-end]')]) з.remove();
  // innerText считает переносы строк по раскладке — контейнер должен быть отрисован (невидимо, вне экрана).
  const контейнер = document.createElement('div');
  контейнер.setAttribute('aria-hidden', 'true');
  контейнер.style.cssText = 'position:fixed;left:-100000px;top:0;width:600px;opacity:0;pointer-events:none;white-space:normal';
  контейнер.appendChild(фрагмент);
  document.body.appendChild(контейнер);
  const текст = контейнер.innerText;
  контейнер.remove();
  return текст;
}

function подстроеннаяДлина(исх: string): number {
  // Длина подстроенного куска = исходная минус удалённые татвили перед ٰ.
  let н = исх.length;
  for (let i = 0; i + 1 < исх.length; i++) if (исх[i] === 'ـ' && исх[i + 1] === 'ٰ') н -= 1;
  return н;
}

/** Есть ли в выделении подстроенный кусок (иначе копирование не трогаем). */
function естьПодстройка(в: Selection): boolean {
  if (в.isCollapsed || !в.rangeCount) return false;
  const д = в.getRangeAt(0);
  if (кусокНад(д.startContainer) || кусокНад(д.endContainer)) return true;
  return !!д.cloneContents().querySelector(`[${АТРИБУТ}]`);
}

let включено = false;
export function включитьКопированиеИсходного(): void {
  if (включено || typeof document === 'undefined') return;
  включено = true;
  document.addEventListener('copy', (е) => {
    const в = document.getSelection();
    if (!в || !естьПодстройка(в)) return;
    const текст = исходныйТекстВыделения(в);
    if (!е.clipboardData) return;
    е.clipboardData.setData('text/plain', текст);
    е.preventDefault();
  });
}
