/**
 * Аккаунт — что знает основной чанк: вошёл ли человек (для строки «Ещё» и запуска синхронизации). Остальное —
 * ленивыми чанками: экран (screens/AccountScreen.tsx), синхронизация (account/sync.ts), слияние (account/merge.ts).
 *
 * Владелец 28.11.2026: «создай вход, чтобы кто хочет, мог заходить входом, и у него прогресс сохраняется. И с другого
 * устройства он также может зайти… И тогда ты смело можешь сделать мне вход на мой аккаунт». Вход — по желанию,
 * только на aiustaz.pro (сервер в Казахстане, cookie своего домена); на batr.kz строки входа нет.
 *
 * Контракт:
 *   входДоступен() — веб и aiustaz.pro (или флаг тестов localStorage «aiustaz:account-test» = «1»);
 *   useАккаунт() → Аккаунт | null — кто вошёл (почта, роль админки, «закят», когда синхронизировано, статус);
 *   текущийАккаунт(), задатьАккаунт(а | null), обновитьАккаунт(часть) — то же без React (ключ aiustaz:account.v1:
 *     почта и отметки для экрана; токена здесь нет — он в cookie HttpOnly);
 *   запуститьАккаунт() — App.tsx, один раз: если человек вошёл — грузит чанк синхронизации и сверяет данные.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { видХоста } from '../install/platform';

export type Аккаунт = {
  email: string;
  роль: 'owner' | 'admin' | 'viewer' | null;
  закят: boolean;
  /** Когда последний раз сошлись с сервером (мс) и чем кончилась последняя попытка. */
  синхронизировано: number | null;
  статус: 'ок' | 'идёт' | 'нет-сети' | 'ошибка';
};

const КЛЮЧ = 'aiustaz:account.v1';
const КЛЮЧ_ТЕСТА = 'aiustaz:account-test';

export function входДоступен(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (видХоста(window.location?.hostname) === 'свой') return true;
  try {
    return window.localStorage?.getItem(КЛЮЧ_ТЕСТА) === '1';
  } catch {
    return false;
  }
}

function прочитать(): Аккаунт | null {
  if (Platform.OS !== 'web') return null;
  try {
    const з = JSON.parse(globalThis.localStorage?.getItem(КЛЮЧ) ?? 'null') as Partial<Аккаунт> | null;
    if (!з || typeof з.email !== 'string' || !з.email.includes('@')) return null;
    const роль = з.роль === 'owner' || з.роль === 'admin' || з.роль === 'viewer' ? з.роль : null;
    return { email: з.email, роль, закят: з.закят === true, синхронизировано: typeof з.синхронизировано === 'number' ? з.синхронизировано : null, статус: 'ок' };
  } catch {
    return null;
  }
}

let аккаунт: Аккаунт | null = прочитать();
const слушатели = new Set<() => void>();

export function текущийАккаунт(): Аккаунт | null {
  return аккаунт;
}

export function задатьАккаунт(а: Аккаунт | null): void {
  аккаунт = а;
  try {
    if (а) globalThis.localStorage?.setItem(КЛЮЧ, JSON.stringify({ email: а.email, роль: а.роль, закят: а.закят, синхронизировано: а.синхронизировано }));
    else globalThis.localStorage?.removeItem(КЛЮЧ);
  } catch {
    // приватный режим — помним до перезагрузки
  }
  for (const ф of [...слушатели]) ф();
}

export function обновитьАккаунт(часть: Partial<Аккаунт>): void {
  if (аккаунт) задатьАккаунт({ ...аккаунт, ...часть });
}

export function useАккаунт(): Аккаунт | null {
  return useSyncExternalStore(
    (ф) => {
      слушатели.add(ф);
      return () => {
        слушатели.delete(ф);
      };
    },
    () => аккаунт,
    () => null,
  );
}

let запущено = false;

export function запуститьАккаунт(): void {
  if (запущено || !аккаунт || !входДоступен()) return;
  запущено = true;
  void import('./account').then((м) => м.запуститьСинхронизацию()).catch(() => {
    запущено = false; // чанк не загрузился (нет сети) — попробуем при следующем открытии
  });
}
