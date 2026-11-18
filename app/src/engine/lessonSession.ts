/**
 * Незаконченное прохождение урока — чтобы перезагрузка страницы или случайный уход не теряли место.
 *
 * Контракт:
 *   сохранитьПрохождение(п: СохранённоеПрохождение): void  — на каждом шаге заданий;
 *   прочитатьПрохождение(номер, всего, версия) → СохранённоеПрохождение | null
 *       — только если это тот же урок той же версии и с тем же числом заданий, индекс ≥ 1;
 *   забытьПрохождение(): void                                — итог урока, «Выйти», «Начать заново».
 * Где: sessionStorage браузера (ключ «aiustaz:прохождение» — живёт до закрытия вкладки); если его нет
 * (телефон, приватный режим) — память процесса. Что: номер и версия урока, номер задания и итоги
 * заданий (верно/неверно, без оценки голоса). Без аудио и персональных данных; никуда не отправляется.
 */
import type { ИтогЗадания } from './lessonEngine';

const КЛЮЧ = 'aiustaz:прохождение';

export type СохранённоеПрохождение = {
  номер: number;
  версия: string | null;
  всего: number;
  /** Задание, на котором остановились (0…всего-1). */
  индекс: number;
  итоги: Array<ИтогЗадания | null>;
};

let вПамяти: string | null = null;

function хранилище(): Storage | null {
  try {
    const с = (globalThis as { sessionStorage?: Storage }).sessionStorage;
    return с ?? null;
  } catch {
    return null;
  }
}

export function сохранитьПрохождение(п: СохранённоеПрохождение): void {
  const строка = JSON.stringify(п);
  вПамяти = строка;
  try {
    хранилище()?.setItem(КЛЮЧ, строка);
  } catch {
    // хранилище недоступно — остаётся копия в памяти
  }
}

export function забытьПрохождение(): void {
  вПамяти = null;
  try {
    хранилище()?.removeItem(КЛЮЧ);
  } catch {
    // нечего удалять
  }
}

function этоИтог(и: unknown): и is ИтогЗадания | null {
  if (и === null) return true;
  if (!и || typeof и !== 'object') return false;
  const о = и as Record<string, unknown>;
  return о.оценивается === false || (о.оценивается === true && typeof о.верно === 'boolean');
}

export function прочитатьПрохождение(номер: number, всего: number, версия: string | null | undefined): СохранённоеПрохождение | null {
  let строка: string | null = null;
  try {
    строка = хранилище()?.getItem(КЛЮЧ) ?? null;
  } catch {
    строка = null;
  }
  строка = строка ?? вПамяти;
  if (!строка) return null;
  try {
    const п = JSON.parse(строка) as Partial<СохранённоеПрохождение>;
    if (п.номер !== номер || п.всего !== всего || (п.версия ?? null) !== (версия ?? null)) return null;
    if (typeof п.индекс !== 'number' || !Number.isInteger(п.индекс) || п.индекс < 1 || п.индекс >= всего) return null;
    if (!Array.isArray(п.итоги) || п.итоги.length !== всего || !п.итоги.every(этоИтог)) return null;
    if (п.итоги.slice(0, п.индекс).some((и) => и == null)) return null;
    return { номер, версия: версия ?? null, всего, индекс: п.индекс, итоги: п.итоги };
  } catch {
    return null;
  }
}
