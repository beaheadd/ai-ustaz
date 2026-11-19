/**
 * Реестр контента: единая точка входа к данным /content для экранов и тестов.
 *
 * Контракт:
 *   загрузитьКурс(): Promise<КартаКурсаДанные | null>  — карта курса (проверенная форма), отдельный чанк
 *   пунктКурса(курс, номер): ПунктКурса | undefined
 *   естьУрок(номер): boolean                  — есть ли играбельный урок (0, 1–16, К1 = 101)
 *   загрузитьУрок(номер): Promise<Урок | null>  — урок отдельным чанком (lazy, файл с хэшем), с проверкой
 *   загрузитьУрок0(): Promise<Урок0Данные | null>; загрузитьДемоФатихи(): Promise<ДемоФатихи | null>
 *   загрузитьБуквы(): Promise<БукваДанные[]>; загрузитьЗнаки(): Promise<ЗнакДанные[]>
 *   загрузитьМедиа(): Promise<МедиаДанные | null>  — видео и аудио партнёров (показ — только с разрешением автора,
 *                                                   media/media.ts материалыУрока)
 *
 * Реализация не дублируется: уроки грузит и проверяет движок (engine/lessonEngine.ts, require.context
 * по /content/lessons), остальные файлы — components/info/data.ts (с проверкой формы и sha256 аятов).
 * Здесь — только фасад. Данные собирает tools/build_content.py, проверяет tools/check_content.py (python3 -I).
 * Всё грузится лениво: Metro пишет кириллицу как \uXXXX, и данные в основном бандле быстро съедают
 * бюджет check-dist (JS ≤ 1200 КБ без сжатия).
 */
import type {
  БукваДанные,
  ДемоФатихи,
  ЗнакДанные,
  КартаКурсаДанные,
  МедиаДанные,
  ПунктКурса,
  Урок,
  Урок0Данные,
} from './types';

import { загрузитьДанные } from '../components/info/data';
import { естьУрок as естьФайлУрока, загрузитьУрок as загрузитьУрокДвижка } from '../engine/lessonEngine';

type Модуль = { default?: unknown };
const изМодуля = <T,>(м: Модуль | unknown): T => ((м as Модуль).default ?? м) as T;

export function загрузитьКурс(): Promise<КартаКурсаДанные | null> {
  return загрузитьДанные('course');
}

export function пунктКурса(курс: КартаКурсаДанные, номер: number): ПунктКурса | undefined {
  for (const уровень of курс.уровни) {
    const пункт = уровень.пункты.find((п) => п.номер === номер);
    if (пункт) return пункт;
  }
  return undefined;
}

export function естьУрок(номер: number): boolean {
  return номер === 0 || естьФайлУрока(номер);
}

/** Урок 1–16 или К1 (101); для 0 — загрузитьУрок0(). null — урока в прототипе нет или данные не прошли проверку;
 *  отклоняется — чанк не загрузился (нет сети). */
export function загрузитьУрок(номер: number): Promise<Урок | null> {
  return загрузитьУрокДвижка(номер);
}

export function загрузитьУрок0(): Promise<Урок0Данные | null> {
  return загрузитьДанные('lesson0');
}

export function загрузитьДемоФатихи(): Promise<ДемоФатихи | null> {
  return загрузитьДанные('fatiha-demo');
}

export function загрузитьМедиа(): Promise<МедиаДанные | null> {
  return загрузитьДанные('media');
}

export async function загрузитьБуквы(): Promise<БукваДанные[]> {
  return изМодуля<БукваДанные[]>(await import('@content/letters.json'));
}

export async function загрузитьЗнаки(): Promise<ЗнакДанные[]> {
  return изМодуля<ЗнакДанные[]>(await import('@content/harakat.json'));
}
