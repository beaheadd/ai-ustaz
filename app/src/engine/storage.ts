/**
 * Локальное хранилище (AsyncStorage; в браузере — localStorage).
 *
 * Контракт:
 *   прочитатьJSON<T>(ключ, поУмолчанию): Promise<T>  — никогда не бросает;
 *   записатьJSON(ключ, значение): Promise<boolean>     — false, если хранилище недоступно;
 *   удалитьКлюч(ключ): Promise<void>.
 * Ключи автоматически получают префикс «aiustaz:» (на batr.kz общий origin с сайтом BATR).
 *
 * Аккаунт (по желанию, владелец 28.11.2026: «кто хочет, мог заходить входом, и у него прогресс сохраняется»):
 *   наблюдатьЗаписи(ф) — синхронизация (src/account/sync.ts) узнаёт о записи ключа и отправляет изменения с задержкой;
 *   приВнешнемИзменении(ключ, ф) → отписка — модуль перечитывает свой ключ, когда синхронизация записала в него данные
 *     другого устройства; сообщитьВнешнееИзменение(ключи) — это зовёт синхронизация после записи.
 *
 * Правила: только локально; на сервер AI Ustaz — только если человек сам вошёл в аккаунт, и только ключи из списка
 * синхронизации (src/account/merge.ts). Хранить можно только номера уроков, результаты, даты и настройки — никаких
 * персональных данных и записей голоса.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const ПРЕФИКС = 'aiustaz:';

export async function прочитатьJSON<T>(ключ: string, поУмолчанию: T): Promise<T> {
  try {
    const строка = await AsyncStorage.getItem(ПРЕФИКС + ключ);
    if (строка == null) return поУмолчанию;
    return JSON.parse(строка) as T;
  } catch {
    return поУмолчанию;
  }
}

let наблюдатель: ((ключ: string) => void) | null = null;
const внешние = new Map<string, Set<() => void>>();

export function наблюдатьЗаписи(ф: ((ключ: string) => void) | null): void {
  наблюдатель = ф;
}

export function приВнешнемИзменении(ключ: string, ф: () => void): () => void {
  const н = внешние.get(ключ) ?? new Set();
  н.add(ф);
  внешние.set(ключ, н);
  return () => {
    н.delete(ф);
  };
}

export function сообщитьВнешнееИзменение(ключи: readonly string[]): void {
  for (const к of ключи) for (const ф of [...(внешние.get(к) ?? [])]) ф();
  // Модули без зависимостей (quran/fontSize, readingView, wordHighlight — их импортируют тесты под node) слушают событие.
  if (typeof CustomEvent === 'function') globalThis.dispatchEvent?.(new CustomEvent(СОБЫТИЕ_ВНЕШНЕЕ, { detail: [...ключи] }));
}

/** Имя события окна: detail — изменённые ключи (без «aiustaz:»). */
export const СОБЫТИЕ_ВНЕШНЕЕ = 'aiustaz:внешнее';

export async function записатьJSON(ключ: string, значение: unknown): Promise<boolean> {
  try {
    await AsyncStorage.setItem(ПРЕФИКС + ключ, JSON.stringify(значение));
    наблюдатель?.(ключ);
    return true;
  } catch {
    return false;
  }
}

export async function удалитьКлюч(ключ: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(ПРЕФИКС + ключ);
  } catch {
    // хранилище недоступно (приватный режим и т. п.) — нечего удалять
  }
}
