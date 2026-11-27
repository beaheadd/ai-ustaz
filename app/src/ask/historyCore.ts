/**
 * История чата — чистые функции (без хранилища; проверяются в node: scripts/test-ask.mjs). Хранение — ask/history.ts.
 */
import type { ОтветУстаза } from './api';

export const МАКС_ЗАПИСЕЙ = 40;

export type ЗаписьЧата = { кто: 'вы'; текст: string; ид: string } | { кто: 'устаз'; ответ: ОтветУстаза; ид: string };

export function новыйИд(): string {
  const байты = new Uint8Array(8);
  try {
    crypto.getRandomValues(байты);
  } catch {
    for (let i = 0; i < байты.length; i++) байты[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(байты, (б) => б.toString(16).padStart(2, '0')).join('');
}

export function проверитьИсторию(сырое: unknown, разобрать: (данные: unknown) => ОтветУстаза | null): ЗаписьЧата[] {
  if (!Array.isArray(сырое)) return [];
  const итог: ЗаписьЧата[] = [];
  for (const з of сырое.slice(-МАКС_ЗАПИСЕЙ)) {
    const д = з as Record<string, unknown> | null;
    const ид = typeof д?.ид === 'string' && /^[a-z0-9-]{8,40}$/.test(д.ид) ? д.ид : новыйИд();
    if (д?.кто === 'вы' && typeof д.текст === 'string' && д.текст.trim()) итог.push({ кто: 'вы', текст: д.текст.slice(0, 500), ид });
    else if (д?.кто === 'устаз') {
      const ответ = разобрать(д.ответ);
      if (ответ) итог.push({ кто: 'устаз', ответ, ид });
    }
  }
  return итог;
}
