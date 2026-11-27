/**
 * Работа без сети: регистрация service worker'а (public/push-sw.js) и докачка данных в его кэш.
 *
 * Владелец 27.11.2026: «пусть все суры и другая информация сохраняются, чтобы не грузить заново каждый раз и чтобы
 * можно было пользоваться офлайн».
 *
 * Как устроено: worker /aiustaz/push-sw.js (тот же, что для уведомлений, область /aiustaz/) при установке кладёт в кэш
 * оболочку приложения (JS, шрифты, значки), дальше отдаёт свои файлы с хэшем в имени из кэша, а index.html — из сети с
 * откатом на сохранённую копию. Список файлов — dist/offline/files.<хэш>.json (scripts/after-export.mjs).
 * Группы данных докачиваются по просьбе страницы: Коран, зикры, махраджи — сами, в простое после запуска (не при
 * «экономии трафика»); хадисы (≈7 МБ) — кнопкой на экране «Хадисы»; время намаза считается на телефоне, файлы мест —
 * по мере открытия. Аудио кари не трогаем. Всё — только свои файлы со своего домена, ничего не отправляется.
 *
 * Контракт:
 *   можноОфлайн() — веб, есть serviceWorker, сайт aiustaz.pro (на batr.kz свой worker сайта — наш не ставим) или
 *     тестовый флаг localStorage «aiustaz:sw-test» = «1» (scripts/e2e-offline.mjs на 127.0.0.1);
 *   включитьОфлайн() — из App.tsx один раз: регистрация и фоновая докачка АВТО_ГРУППЫ (ошибки — тихо);
 *   состояниеОфлайн() → СостояниеОфлайн | null; докачать(группа, ход?) → итог группы | null;
 *   useГруппаОфлайн(группа) → { можно, есть, всего, байт, идёт, готово, скачать() } — для кнопки «Скачать хадисы».
 */
import { useCallback, useEffect, useState } from 'react';
import { видХоста } from '../install/platform';
import { АДРЕС_SW, ОБЛАСТЬ_SW } from '../notify/push';

export type ГруппаОфлайн = 'коран' | 'зикры' | 'махраджи' | 'хадисы' | 'намаз';
export type ИтогГруппы = { есть: number; всего: number; байт: number };
export type СостояниеОфлайн = { группы: Partial<Record<ГруппаОфлайн, ИтогГруппы>>; оболочка: boolean };

export const КЛЮЧ_ТЕСТА = 'aiustaz:sw-test';
export const АВТО_ГРУППЫ: readonly ГруппаОфлайн[] = ['коран', 'зикры', 'махраджи'];
const ПАУЗА_ДО_ДОКАЧКИ_МС = 2500;
const ОТВЕТ_МС = 15_000;

type Связь = { saveData?: boolean };

export function можноОфлайн(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (видХоста(window.location?.hostname) === 'свой') return true;
  try {
    return window.localStorage?.getItem(КЛЮЧ_ТЕСТА) === '1';
  } catch {
    return false;
  }
}

async function работник(): Promise<ServiceWorker | null> {
  if (!можноОфлайн()) return null;
  const sw = navigator.serviceWorker;
  if (sw.controller) return sw.controller;
  const рег = await Promise.race([sw.ready, new Promise<null>((готово) => setTimeout(() => готово(null), ОТВЕТ_МС))]);
  return рег?.active ?? null;
}

/** Сообщение worker'у с ответом по MessageChannel; приНаходе — промежуточные ответы (ход загрузки). */
async function спросить<Т>(данные: object, ждём: (о: Record<string, unknown>) => boolean, приНаходе?: (о: Record<string, unknown>) => void): Promise<Т | null> {
  const р = await работник();
  if (!р) return null;
  return new Promise<Т | null>((готово) => {
    const канал = new MessageChannel();
    let таймер = setTimeout(() => готово(null), ОТВЕТ_МС);
    канал.port1.onmessage = (е: MessageEvent) => {
      const о = (е.data ?? {}) as Record<string, unknown>;
      clearTimeout(таймер);
      if (ждём(о)) {
        канал.port1.close();
        готово(о.тип === 'ошибка' ? null : (о as Т));
      } else {
        приНаходе?.(о);
        таймер = setTimeout(() => готово(null), ОТВЕТ_МС);
      }
    };
    р.postMessage(данные, [канал.port2]);
  });
}

export function состояниеОфлайн(): Promise<СостояниеОфлайн | null> {
  return спросить<СостояниеОфлайн>({ тип: 'состояние' }, () => true);
}

export function докачать(группа: ГруппаОфлайн, ход?: (готово: number, всего: number) => void): Promise<ИтогГруппы | null> {
  return спросить<ИтогГруппы>(
    { тип: 'докачать', группа },
    (о) => о.тип === 'готово' || о.тип === 'ошибка',
    (о) => {
      if (о.тип === 'ход' && typeof о.готово === 'number' && typeof о.всего === 'number') ход?.(о.готово, о.всего);
    },
  );
}

let включено = false;

/** Регистрация worker'а и фоновая докачка Корана, зикров и махраджей (один раз за запуск). */
export function включитьОфлайн(): void {
  if (включено || !можноОфлайн()) return;
  включено = true;
  void (async () => {
    try {
      const sw = navigator.serviceWorker;
      const есть = await sw.getRegistration(ОБЛАСТЬ_SW);
      if (!есть || !(есть.active || есть.waiting || есть.installing)?.scriptURL.endsWith(АДРЕС_SW)) {
        await sw.register(АДРЕС_SW, { scope: ОБЛАСТЬ_SW, updateViaCache: 'none' });
      }
      await new Promise((готово) => setTimeout(готово, ПАУЗА_ДО_ДОКАЧКИ_МС));
      if ((navigator as Navigator & { connection?: Связь }).connection?.saveData) return;
      for (const г of АВТО_ГРУППЫ) await докачать(г);
    } catch {
      // без worker'а приложение работает как раньше — только с сетью
    }
  })();
}

/** Группа для кнопки «Скачать для офлайн»: сколько файлов уже в кэше, скачать остальное с ходом загрузки. */
export function useГруппаОфлайн(группа: ГруппаОфлайн): { можно: boolean; есть: number; всего: number; байт: number; идёт: boolean; скачать: () => void } {
  const [итог, установитьИтог] = useState<ИтогГруппы | null>(null);
  const [идёт, установитьИдёт] = useState(false);
  const можно = можноОфлайн();
  useEffect(() => {
    if (!можно) return;
    let живой = true;
    void состояниеОфлайн().then((с) => {
      if (живой && с?.группы[группа]) установитьИтог(с.группы[группа] ?? null);
    });
    return () => {
      живой = false;
    };
  }, [можно, группа]);
  const скачать = useCallback(() => {
    if (идёт) return;
    установитьИдёт(true);
    void докачать(группа, (готово, всего) => установитьИтог((и) => ({ есть: готово, всего, байт: и?.байт ?? 0 }))).then((и) => {
      if (и) установитьИтог(и);
      установитьИдёт(false);
    });
  }, [группа, идёт]);
  return { можно: можно && итог !== null, есть: итог?.есть ?? 0, всего: итог?.всего ?? 0, байт: итог?.байт ?? 0, идёт, скачать };
}
