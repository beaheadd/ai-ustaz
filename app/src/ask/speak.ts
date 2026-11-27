/**
 * 🔊 под ответом чата: озвучка ТЕКСТА ОТВЕТА синтезом речи телефона (speechSynthesis), с пометкой «синтезированный голос».
 *
 * Правило 7 CLAUDE.md: синтез НЕ озвучивает ни арабские слова, ни их транслитерацию — на месте слова клип кари или
 * запись самого пользователя. Поэтому:
 *   - озвучиваем только текст ответа и переводы/пояснения источников (никогда — заголовки зикров и дуа: это
 *     транслитерация, и не поле «произношение»: оно в ответ не приходит вовсе);
 *   - арабское письмо вырезаем (текстДляОзвучки);
 *   - слова в «ёлочках» и курсиве-транслитерации («Субханаллах», «Ля иляха илляЛлах») — пропускаем: всё, что в
 *     кавычках и похоже на транслитерацию (апостроф-айн ‘, дефисы аль-/ль-, «-Ллах»), заменяется паузой;
 *   - голос только своего языка (ru-RU, kk-KZ, uz-UZ, en-*); голоса нет — кнопку не показываем (чужим акцентом не читаем).
 * Источник логики выбора голоса: beaheadd/aialem@b72d5e5 web/src/educat/ui/speech.js (pickVoice, speakSynth) —
 * переписано на TypeScript; без серверного mp3 (у AI Ustaz своего синтеза нет). docs/источники-кода.md.
 */
import type { ЯзыкВопроса } from './api';

const АРАБСКОЕ = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]+/g;
const ПОХОЖЕ_НА_ТРАНСЛИТ = /[‘’ʿʾ]|(?:^|[\s-])(?:аль|ал|ль|уль|иль|ар|ас|ат|ан|al|ul|il)-|Ллах|ллах|-ллах|ЛЛах/i;

export function текстДляОзвучки(текст: string): string {
  let т = String(текст || '').replace(АРАБСКОЕ, ' ');
  т = т.replace(/«([^«»]{1,80})»|“([^“”]{1,80})”|"([^"]{1,80})"/g, (целиком, а, б, в) => (ПОХОЖЕ_НА_ТРАНСЛИТ.test(а || б || в || '') ? ', ' : целиком));
  т = т.replace(/\([^()]*[‘’ʿʾ][^()]*\)/g, ' ');
  return т.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
}

type Голос = { lang: string; localService?: boolean; default?: boolean };
const ДОМ: Record<ЯзыкВопроса, string> = { ru: 'ru-ru', kk: 'kk-kz', uz: 'uz-uz', en: 'en-gb' };

export function выбратьГолос<Г extends Голос>(голоса: readonly Г[], язык: ЯзыкВопроса): Г | null {
  const я = (г: Голос) => String(г.lang || '').replace('_', '-').toLowerCase();
  const свои = голоса.filter((г) => new RegExp('^' + язык + '(-|$)').test(я(г)));
  const ранг = (г: Голос) => (г.localService ? 0 : 1) + (г.default ? 0 : 0.5);
  const лучший = (условие: (г: Г) => boolean) => свои.filter(условие).sort((а, б) => ранг(а) - ранг(б))[0] ?? null;
  return лучший((г) => я(г) === ДОМ[язык]) ?? (язык === 'en' ? лучший((г) => я(г) === 'en-us') : null) ?? лучший(() => true);
}

function синтез(): SpeechSynthesis | null {
  try {
    if (typeof window === 'undefined') return null;
    const с = window.speechSynthesis;
    return с && typeof с.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function' ? с : null;
  } catch {
    return null;
  }
}

export function озвучкаЕсть(язык: ЯзыкВопроса): boolean {
  const с = синтез();
  return !!с && !!выбратьГолос(с.getVoices?.() ?? [], язык);
}

export function остановитьОзвучку(): void {
  try {
    синтез()?.cancel();
  } catch {
    /* ок */
  }
}

/** Прочитать текст; конец — колбэк (погасить кнопку). Возвращает false, если голоса языка нет. */
export function озвучить(текст: string, язык: ЯзыкВопроса, конец?: () => void): boolean {
  const с = синтез();
  const чистый = текстДляОзвучки(текст);
  if (!с || !чистый) return false;
  const голос = выбратьГолос(с.getVoices?.() ?? [], язык);
  if (!голос) return false;
  остановитьОзвучку();
  const ф = new window.SpeechSynthesisUtterance(чистый.slice(0, 1500));
  ф.lang = голос.lang;
  try {
    ф.voice = голос as SpeechSynthesisVoice;
  } catch {
    /* голос не того типа (старый WebView) — останется язык */
  }
  ф.rate = 0.95;
  ф.onend = () => конец?.();
  ф.onerror = () => конец?.();
  try {
    с.speak(ф);
  } catch {
    return false;
  }
  return true;
}
