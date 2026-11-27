/**
 * Маленький помощник DOM для админки (без фреймворка — меньше зависимостей): h('div', {class: 'карта'}, 'текст', узел).
 * Текст всегда вставляется как текст (textContent), не как HTML — данные из базы и файлов не исполняются.
 */
export type Ребёнок = Node | string | number | null | undefined | false | Ребёнок[];
type Атрибуты = Record<string, string | number | boolean | null | undefined | EventListener>;

export function h<К extends keyof HTMLElementTagNameMap>(тег: К, атрибуты: Атрибуты | null = null, ...дети: Ребёнок[]): HTMLElementTagNameMap[К] {
  const э = document.createElement(тег);
  for (const [к, з] of Object.entries(атрибуты ?? {})) {
    if (з === null || з === undefined || з === false) continue;
    if (к.startsWith('on') && typeof з === 'function') э.addEventListener(к.slice(2), з as EventListener);
    // style — через CSSOM (CSP админки без 'unsafe-inline': атрибут style из разметки запрещён, свойство — можно)
    else if (к === 'style') э.style.cssText = String(з);
    else if (з === true) э.setAttribute(к, '');
    else э.setAttribute(к, String(з));
  }
  добавить(э, дети);
  return э;
}

export function добавить(родитель: Node, дети: Ребёнок[]): void {
  for (const р of дети) {
    if (р === null || р === undefined || р === false) continue;
    if (Array.isArray(р)) добавить(родитель, р);
    else родитель.appendChild(typeof р === 'object' ? р : document.createTextNode(String(р)));
  }
}

const SVG = 'http://www.w3.org/2000/svg';
export function s(тег: string, атрибуты: Record<string, string | number> = {}, ...дети: (Node | string)[]): SVGElement {
  const э = document.createElementNS(SVG, тег);
  for (const [к, з] of Object.entries(атрибуты)) э.setAttribute(к, String(з));
  for (const р of дети) э.appendChild(typeof р === 'string' ? document.createTextNode(р) : р);
  return э;
}

export function очистить(э: Element): void {
  while (э.firstChild) э.removeChild(э.firstChild);
}

const ЧИСЛО = new Intl.NumberFormat('ru-RU');
export const число = (n: number): string => ЧИСЛО.format(n);

/** 3725 с → «1 ч 2 мин»; 95 → «1 мин 35 с». */
export function длительность(сек: number): string {
  const с = Math.max(0, Math.round(сек));
  if (с < 60) return `${с} с`;
  const м = Math.floor(с / 60);
  if (м < 60) return `${м} мин${с % 60 ? ' ' + (с % 60) + ' с' : ''}`;
  return `${Math.floor(м / 60)} ч ${м % 60} мин`;
}

export function дата(мс: number | null | undefined): string {
  if (!мс) return '—';
  return new Date(мс).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function процент(часть: number, всего: number): string {
  return всего ? `${Math.round((часть / всего) * 100)}%` : '—';
}
