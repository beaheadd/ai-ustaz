/**
 * Связь стека навигации с историей браузера — ВЕБ-версия.
 * Контракт — в шапке history.ts (нативная версия; API совпадает).
 *
 * Как устроено:
 * - каждый шаг навигации = запись в history (pushState) с hash-адресом (#/lesson/3)
 *   и полным стеком hash-адресов в history.state — поэтому «назад/вперёд» браузера
 *   и перезагрузка восстанавливают стек точно;
 * - видимый адрес: /aiustaz/index.html заменяется на /aiustaz (+ hash). Перезагрузка
 *   /aiustaz пройдёт через index.html сайта BATR, его скрипт перенаправит на
 *   /aiustaz/index.html с тем же hash (решение ведущего: nginx batr.kz не меняем).
 *   Выключается константой КРАСИВЫЙ_АДРЕС.
 */

const МЕТКА = 'aiustaz';
/** Заменять ли видимый /aiustaz/index.html на /aiustaz. */
const КРАСИВЫЙ_АДРЕС = true;

type НашеСостояние = { [МЕТКА]: { стек: string[] } };

function естьИстория(): boolean {
  return typeof window !== 'undefined' && typeof window.history?.pushState === 'function';
}

function нормализоватьХэш(хэш: string): string {
  if (!хэш || хэш === '#' || хэш === '#/') return '#/';
  return хэш.startsWith('#/') ? хэш : '#/' + хэш.replace(/^#/, '');
}

function стекИзСостояния(состояние: unknown): string[] | null {
  if (!состояние || typeof состояние !== 'object') return null;
  const наше = (состояние as Partial<НашеСостояние>)[МЕТКА];
  const стек = наше?.стек;
  if (!Array.isArray(стек) || стек.length === 0) return null;
  if (!стек.every((х) => typeof х === 'string' && х.startsWith('#/'))) return null;
  return [...стек];
}

let базовыйПуть: string | null = null;

function путьСтраницы(): string {
  if (базовыйПуть == null) {
    const путь = window.location.pathname;
    базовыйПуть = КРАСИВЫЙ_АДРЕС ? путь.replace(/\/index\.html$/, '') || '/' : путь;
  }
  return базовыйПуть;
}

function адрес(хэш: string): string {
  return путьСтраницы() + window.location.search + хэш;
}

function состояние(стек: readonly string[]): НашеСостояние {
  return { [МЕТКА]: { стек: [...стек] } };
}

export function прочитатьНачальныйАдрес(): { хэш: string; стек: string[] | null } | null {
  if (!естьИстория()) return null;
  return { хэш: нормализоватьХэш(window.location.hash), стек: стекИзСостояния(window.history.state) };
}

export function записатьСтек(стек: readonly string[], способ: 'push' | 'replace'): void {
  if (!естьИстория() || стек.length === 0) return;
  const хэш = стек[стек.length - 1];
  try {
    if (способ === 'push') window.history.pushState(состояние(стек), '', адрес(хэш));
    else window.history.replaceState(состояние(стек), '', адрес(хэш));
  } catch {
    // Браузер может ограничить частоту pushState — навигация в состоянии всё равно работает.
  }
}

export function шагНазад(шагов: number): boolean {
  if (!естьИстория() || шагов <= 0) return false;
  window.history.go(-шагов);
  return true;
}

export function подписатьсяНаИсторию(обработчик: (стек: string[] | null, хэш: string) => void): () => void {
  if (!естьИстория()) return () => {};
  const приСобытии = (событие: PopStateEvent) => {
    обработчик(стекИзСостояния(событие.state), нормализоватьХэш(window.location.hash));
  };
  window.addEventListener('popstate', приСобытии);
  return () => window.removeEventListener('popstate', приСобытии);
}

export function подписатьсяНаКнопкуНазад(_обработчик: () => boolean): () => void {
  // В браузере «назад» — это история (popstate), см. подписатьсяНаИсторию.
  return () => {};
}
