/**
 * Аккаунт — запросы к своему серверу (server/account.py; только свой адрес, cookie HttpOnly ставит сервер).
 *
 * Контракт: каждый запрос → Promise<Ответ<T>>: { ок: true, данные } | { ок: false, код } — код ошибки сервера
 * ('code', 'age', 'email', 'rate', 'login', …) или 'нет-сети'. Изменения — с заголовком X-Aiustaz-Account: 1.
 */
export type Я = { email: string; создан: number | null; способы: string[]; роль: 'owner' | 'admin' | 'viewer' | null; закят: boolean };
export type Настройка = { google_client_id: string | null; apple_services_id: string | null; apple_redirect: string | null; код: number };
export type Ответ<T> = { ок: true; данные: T } | { ок: false; код: string };
export type ДокСервера = { v: number; at: number; data: unknown };

const ЗАГОЛОВКИ = { 'Content-Type': 'application/json', 'X-Aiustaz-Account': '1' };

export async function запрос<T>(путь: string, метод: 'GET' | 'POST' | 'PUT' = 'GET', тело?: unknown): Promise<Ответ<T>> {
  try {
    const о = await fetch('/api/account/' + путь, {
      method: метод,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: ЗАГОЛОВКИ,
      body: тело === undefined ? undefined : JSON.stringify(тело),
    });
    const д = (await о.json().catch(() => null)) as (T & { ошибка?: string }) | null;
    if (!о.ok) return { ок: false, код: д?.ошибка ?? (о.status === 401 ? 'login' : 'ошибка') };
    return { ок: true, данные: д as T };
  } catch {
    return { ок: false, код: 'нет-сети' };
  }
}

export const настройкаВхода = () => запрос<Настройка>('config');
export const прислатьКод = (email: string) => запрос<{ ок: true }>('start', 'POST', { email });
export const проверитьКод = (email: string, code: string) => запрос<{ я: Я }>('verify', 'POST', { email, code, age16: true });
export const войтиGoogle = (credential: string) => запрос<{ я: Я }>('google', 'POST', { credential, age16: true });
export const кто = () => запрос<Я>('me');
export const выйти = () => запрос<{ ок: true }>('logout', 'POST', {});
export const выйтиВезде = () => запрос<{ ок: true; закрыто: number }>('logout-all', 'POST', {});
export const задатьЗакят = (zakat: boolean) => запрос<{ закят: boolean }>('settings', 'POST', { zakat });
export const удалитьАккаунт = () => запрос<{ ок: true }>('delete', 'POST', { confirm: true });
export const вАдминку = () => запрос<{ адрес: string }>('admin', 'POST', {});
export const документы = () => запрос<{ docs: Record<string, ДокСервера>; закят: boolean }>('sync');
export const записатьДокументы = (docs: Record<string, { base: number; data: unknown }>) =>
  запрос<{ docs: Record<string, { v: number; at: number }>; conflicts: Record<string, ДокСервера | null> }>('sync', 'PUT', { docs });

/** «Скачать мои данные»: JSON с сервера → файл (blob) на устройстве. */
export async function скачатьМоиДанные(): Promise<boolean> {
  try {
    const о = await fetch('/api/account/export', { credentials: 'same-origin', cache: 'no-store', headers: ЗАГОЛОВКИ });
    if (!о.ok) return false;
    const адрес = URL.createObjectURL(await о.blob());
    const а = document.createElement('a');
    а.href = адрес;
    а.download = 'aiustaz-my-data.json';
    document.body.appendChild(а);
    а.click();
    а.remove();
    setTimeout(() => URL.revokeObjectURL(адрес), 10_000);
    return true;
  } catch {
    return false;
  }
}
