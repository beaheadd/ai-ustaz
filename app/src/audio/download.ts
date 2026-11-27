/**
 * Скачивание чтения кари для прослушивания без интернета: аят, сура, список скачанного и удаление.
 *
 * Владелец 27.11.2026: «Некоторые люди хотят скачать Коран. У нас должна быть кнопка „Скачать“ по каждому аяту.
 * Человек, если скачивает, то он может в любое время без интернета слушать».
 *
 * Как устроено: файлы аятов берём ТОЛЬКО со своего домена (зеркало /aiustaz-audio/…, audio/mirror.ts — издание
 * опубликовано на сервере целиком) и кладём в кэш браузера «aiustaz-аудио-v1» (Cache API). Service worker
 * (public/push-sw.js) отдаёт оттуда /aiustaz-audio/… без сети, с поддержкой Range (перемотка). С CDN не скачиваем.
 * Где можно: там же, где работает офлайн (offline/offline.ts можноОфлайн(): aiustaz.pro или тестовый флаг) и есть
 * caches; на batr.kz, в нативной сборке и без зеркала издания кнопок нет. Ничего не отправляем, в кэше — только
 * файлы записей кари (правило 3: живые записи, без синтеза).
 *
 * Контракт:
 *   КЭШ_АУДИО; ПРЕФИКС = '/aiustaz-audio/'
 *   можноСкачать(источник) → boolean
 *   адресаАята(источник, сура, аят) / адресаСуры(источник, сура) → string[] (с бисмиллой — файлом 1:1 — перед 1-м аятом
 *     суры, кроме 1 и 9: так её играет плеер)
 *   скачать(адреса, ход?) → Promise<{ готово, ошибок }> — по 3 файла сразу, только ответ 200 с audio/*
 *   useСкачанное() → { есть(адрес), версия } — набор скачанных адресов (из кэша, обновляется после скачивания/удаления)
 *   сводкаСкачанного() → Promise<{ издание, битрейт, файлов, байт }[]>; удалитьСкачанное(ключИздания?) — одно издание
 *     ('128/ar.husary') или всё
 */
import { useEffect, useSyncExternalStore } from 'react';
import { можноОфлайн } from '../offline/offline';
import { адресАята, аятовВСуре } from './core';
import { ЗЕРКАЛО, вЗеркале, сЗеркалом } from './mirror';
import type { ИсточникЧтения } from './sources';

export const КЭШ_АУДИО = 'aiustaz-аудио-v1';
export const ПРЕФИКС = ЗЕРКАЛО + '/';
const ПОТОКОВ = 3;

function естьКэш(): boolean {
  return typeof caches !== 'undefined' && typeof caches.open === 'function';
}

export function можноСкачать(и: ИсточникЧтения | null | undefined): boolean {
  return !!и && !!и.cdn && естьКэш() && можноОфлайн() && вЗеркале(и.cdn);
}

function адрес(и: ИсточникЧтения, сура: number, аят: number): string {
  return адресАята(сЗеркалом(и), сура, аят);
}

export function адресаАята(и: ИсточникЧтения, сура: number, аят: number): string[] {
  const а = [адрес(и, сура, аят)];
  if (аят === 1 && сура !== 1 && сура !== 9) а.unshift(адрес(и, 1, 1));
  return а;
}

export function адресаСуры(и: ИсточникЧтения, сура: number): string[] {
  const а: string[] = [];
  if (сура !== 1 && сура !== 9) а.push(адрес(и, 1, 1));
  for (let н = 1; н <= аятовВСуре(сура); н += 1) а.push(адрес(и, сура, н));
  return а;
}

// ── Набор скачанного (для отметок) ──

let скачано: Set<string> | null = null;
let версия = 0;
const слушатели = new Set<() => void>();

function оповестить() {
  версия += 1;
  for (const ф of [...слушатели]) ф();
}

async function перечитать(): Promise<void> {
  if (!естьКэш()) return;
  try {
    const кэш = await caches.open(КЭШ_АУДИО);
    скачано = new Set((await кэш.keys()).map((з) => new URL(з.url).pathname).filter((п) => п.startsWith(ПРЕФИКС)));
  } catch {
    скачано = new Set();
  }
  оповестить();
}

export async function скачать(адреса: readonly string[], ход?: (готово: number, всего: number) => void): Promise<{ готово: number; ошибок: number }> {
  if (!естьКэш()) return { готово: 0, ошибок: адреса.length };
  const кэш = await caches.open(КЭШ_АУДИО);
  const всего = адреса.length;
  let готово = 0;
  let ошибок = 0;
  const очередь: string[] = [];
  for (const а of адреса) {
    if (!а.startsWith(ПРЕФИКС)) {
      ошибок += 1; // только свой домен
      continue;
    }
    if (await кэш.match(а)) готово += 1;
    else очередь.push(а);
  }
  ход?.(готово, всего);
  async function поток() {
    while (очередь.length) {
      const а = очередь.shift()!;
      try {
        const ответ = await fetch(а, { credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (ответ.ok && ответ.status === 200 && (ответ.headers.get('content-type') ?? '').toLowerCase().startsWith('audio/')) {
          await кэш.put(а, ответ);
          (скачано ??= new Set()).add(а);
          готово += 1;
        } else ошибок += 1;
      } catch {
        ошибок += 1;
      }
      ход?.(готово, всего);
    }
  }
  await Promise.all(Array.from({ length: ПОТОКОВ }, поток));
  оповестить();
  return { готово, ошибок };
}

function подписаться(ф: () => void) {
  слушатели.add(ф);
  return () => {
    слушатели.delete(ф);
  };
}

/** Набор скачанных адресов: есть(адрес) и версия (для перерисовки). */
export function useСкачанное(): { есть: (адрес: string) => boolean; версия: number } {
  const в = useSyncExternalStore(подписаться, () => версия, () => 0);
  useEffect(() => {
    if (скачано === null) void перечитать();
  }, []);
  return { есть: (а) => !!скачано?.has(а), версия: в };
}

export type СводкаИздания = { издание: string; битрейт: number; файлов: number; байт: number };

export async function сводкаСкачанного(): Promise<СводкаИздания[]> {
  if (!естьКэш()) return [];
  const кэш = await caches.open(КЭШ_АУДИО);
  const поКлючу = new Map<string, СводкаИздания>();
  for (const з of await кэш.keys()) {
    const м = /^\/aiustaz-audio\/(\d+)\/([a-z]{2}\.[a-z0-9-]+)\/\d+\.mp3$/.exec(new URL(з.url).pathname);
    if (!м) continue;
    const к = м[1] + '/' + м[2];
    const с = поКлючу.get(к) ?? { издание: м[2], битрейт: Number(м[1]), файлов: 0, байт: 0 };
    с.файлов += 1;
    const ответ = await кэш.match(з);
    const длина = Number(ответ?.headers.get('content-length') ?? 0);
    с.байт += длина > 0 ? длина : ((await ответ?.blob())?.size ?? 0);
    поКлючу.set(к, с);
  }
  return [...поКлючу.values()];
}

/** Удалить скачанное: одно издание ('128/ar.husary') или всё. */
export async function удалитьСкачанное(ключИздания?: string): Promise<void> {
  if (!естьКэш()) return;
  if (!ключИздания) await caches.delete(КЭШ_АУДИО);
  else {
    const кэш = await caches.open(КЭШ_АУДИО);
    const префикс = ПРЕФИКС + ключИздания + '/';
    for (const з of await кэш.keys()) if (new URL(з.url).pathname.startsWith(префикс)) await кэш.delete(з);
  }
  await перечитать();
}
