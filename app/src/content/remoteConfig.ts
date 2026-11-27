/**
 * Настройки содержимого из админки: какие чтецы включены и кто по умолчанию, какие хадисы скрыты и какие проверил устаз.
 *
 * Владелец 27.11.2026: «Коран… записи всех чтецов… Раздел хадисы… чтобы мы там добавляли, убирали, отключали».
 * Сервер — server/content_admin.py (GET /api/content/config, свой домен, без cookie); docs/дизайн/12-админка-и-статистика.md.
 * Здесь только отметки к проверенным данным сборки: ни текста хадисов, ни Корана с сервера не приходит (правила 1 и 2).
 * Нет сети или не aiustaz.pro — работают данные сборки как раньше (последний ответ хранится в localStorage).
 *
 * Контракт:
 *   проверитьНастройки(сырые) → НастройкиСодержимого | null — чистая
 *   настройкиСодержимого() → НастройкиСодержимого | null — последние принятые
 *   обновитьНастройкиСодержимого() — из App.tsx один раз при запуске (только на aiustaz.pro или с тестовым флагом)
 *   отобратьЧтецов(источники) — включённые (если включённых нет среди известных — все), чтец по умолчанию первым
 *   применитьКХадисам(индекс) — «проверено устазом» из админки дополняет одобренных сборки (список хадисов не меняется:
 *     по нему сверяются порции и заголовки); скрытХадис(id) — скрыт в админке (списки, поиск, экран хадиса)
 */
import { Platform } from 'react-native';
import { видХоста } from '../install/platform';

export type НастройкиСодержимого = {
  версия: number;
  чтецы: { включены: string[] | null; поУмолчанию: string | null };
  хадисы: { скрыты: number[]; проверены: Record<string, [string, string]> };
};

const КЛЮЧ = 'aiustaz:content-config.v1';
const КЛЮЧ_ТЕСТА = 'aiustaz:content-test';
const АДРЕС = '/api/content/config';
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ДАТА = /^\d{4}-\d{2}-\d{2}$/;

export function проверитьНастройки(с: unknown): НастройкиСодержимого | null {
  if (!с || typeof с !== 'object') return null;
  const н = с as Record<string, unknown>;
  const ч = н.чтецы as Record<string, unknown> | undefined;
  const х = н.хадисы as Record<string, unknown> | undefined;
  if (typeof н.версия !== 'number' || !ч || !х) return null;
  const включены = ч.включены === null ? null : Array.isArray(ч.включены) && ч.включены.every((и) => typeof и === 'string' && ID.test(и)) ? (ч.включены as string[]) : undefined;
  const поУмолчанию = ч.поУмолчанию === null ? null : typeof ч.поУмолчанию === 'string' && ID.test(ч.поУмолчанию) ? ч.поУмолчанию : undefined;
  if (включены === undefined || поУмолчанию === undefined) return null;
  if (!Array.isArray(х.скрыты) || !х.скрыты.every((и) => Number.isInteger(и) && (и as number) > 0)) return null;
  const пр = х.проверены;
  if (!пр || typeof пр !== 'object') return null;
  const проверены: Record<string, [string, string]> = {};
  for (const [к, з] of Object.entries(пр as Record<string, unknown>)) {
    if (!/^\d{1,8}$/.test(к) || !Array.isArray(з) || typeof з[0] !== 'string' || !з[0] || з[0].length > 80 || typeof з[1] !== 'string' || !ДАТА.test(з[1])) return null;
    проверены[к] = [з[0], з[1]];
  }
  return { версия: н.версия, чтецы: { включены, поУмолчанию }, хадисы: { скрыты: х.скрыты as number[], проверены } };
}

let текущие: НастройкиСодержимого | null | undefined;

function хранилище(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function настройкиСодержимого(): НастройкиСодержимого | null {
  if (текущие === undefined) {
    try {
      const с = хранилище()?.getItem(КЛЮЧ);
      текущие = с ? проверитьНастройки(JSON.parse(с)) : null;
    } catch {
      текущие = null;
    }
  }
  return текущие;
}

export async function обновитьНастройкиСодержимого(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (видХоста(window.location?.hostname) !== 'свой' && хранилище()?.getItem(КЛЮЧ_ТЕСТА) !== '1') return;
  try {
    const ответ = await fetch(АДРЕС, { credentials: 'omit' });
    if (!ответ.ok) return;
    const н = проверитьНастройки(await ответ.json());
    if (!н) return;
    текущие = н;
    хранилище()?.setItem(КЛЮЧ, JSON.stringify(н));
  } catch {
    // нет сети — остаются прежние
  }
}

export function отобратьЧтецов<И extends { id: string }>(источники: readonly И[]): И[] {
  const н = настройкиСодержимого();
  if (!н) return [...источники];
  const вкл = н.чтецы.включены;
  let список = вкл ? источники.filter((и) => вкл.includes(и.id)) : [...источники];
  if (!список.length) список = [...источники];
  const по = н.чтецы.поУмолчанию;
  const и = по ? список.findIndex((з) => з.id === по) : -1;
  return и > 0 ? [список[и], ...список.slice(0, и), ...список.slice(и + 1)] : список;
}

export function применитьКХадисам<И extends { одобрено: Record<string, { кто: string; когда: string }> }>(индекс: И): И {
  const н = настройкиСодержимого();
  if (!н) return индекс;
  const одобрено = { ...индекс.одобрено };
  for (const [к, [кто, когда]] of Object.entries(н.хадисы.проверены)) if (!одобрено[к]) одобрено[к] = { кто, когда };
  return { ...индекс, одобрено };
}

export function скрытХадис(id: number): boolean {
  return настройкиСодержимого()?.хадисы.скрыты.includes(id) ?? false;
}
