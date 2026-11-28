/**
 * Переключатель «Перевод: вкл/выкл» под аятами — выбор человека, только на устройстве (как вид чтения, readingView.ts).
 *
 * Владелец 28.11.2026: «Нужна функция, чтобы можно было включить перевод и видеть каждый аят сразу с переводом! Если
 * выключить — только арабский». По умолчанию — включён. Мусхаф («как книга») переключатель не меняет: страница мусхафа
 * остаётся страницей, перевод — в листе аята.
 *
 * Контракт: useПереводВкл() → boolean; установитьПереводВкл(вкл); переводВклИз(сырые) — разбор хранимого (для node).
 *   Хранение: localStorage «aiustaz:quran-trans.v1» = { версия: 1, вкл } (в try/catch: приватный режим — до перезагрузки).
 * Без импортов кода, кроме React.
 */
import { useSyncExternalStore } from 'react';

const КЛЮЧ = 'aiustaz:quran-trans.v1';

export function переводВклИз(сырые: unknown): boolean {
  const д = сырые && typeof сырые === 'object' ? (сырые as { версия?: unknown; вкл?: unknown }) : null;
  return !(д && д.версия === 1 && д.вкл === false);
}

let сейчас: boolean | null = null;
const слушатели = new Set<() => void>();

function текущий(): boolean {
  if (сейчас === null) {
    try {
      const с = globalThis.localStorage?.getItem(КЛЮЧ);
      сейчас = с ? переводВклИз(JSON.parse(с)) : true;
    } catch {
      сейчас = true;
    }
  }
  return сейчас;
}

export function установитьПереводВкл(вкл: boolean): void {
  if (текущий() === вкл) return;
  сейчас = вкл;
  try {
    globalThis.localStorage?.setItem(КЛЮЧ, JSON.stringify({ версия: 1, вкл }));
  } catch {
    // приватный режим или переполнено — выбор живёт до перезагрузки
  }
  for (const ф of [...слушатели]) ф();
}

function подписаться(ф: () => void): () => void {
  слушатели.add(ф);
  return () => {
    слушатели.delete(ф);
  };
}

export function useПереводВкл(): boolean {
  return useSyncExternalStore(подписаться, текущий, текущий);
}
