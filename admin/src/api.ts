/**
 * Запросы админки к своему серверу (server/admin.py, content_admin.py). Только свой домен, cookie сеанса — HttpOnly
 * (её не видно из JS). Изменения — POST с заголовком X-Aiustaz-Admin: 1 (сервер без него отвечает 403).
 */
export class ОшибкаApi extends Error {
  constructor(public статус: number, public код: string) {
    super(код);
  }
}

let приВыходе: () => void = () => undefined;
export function приНеВошли(ф: () => void): void {
  приВыходе = ф;
}

async function ответ<Т>(о: Response): Promise<Т> {
  let тело: unknown = null;
  try {
    тело = await о.json();
  } catch {
    тело = null;
  }
  if (!о.ok) {
    const код = (тело as { ошибка?: string } | null)?.ошибка ?? String(о.status);
    if (о.status === 401) приВыходе();
    throw new ОшибкаApi(о.status, код);
  }
  return тело as Т;
}

export async function получить<Т>(путь: string): Promise<Т> {
  return ответ<Т>(await fetch(путь, { credentials: 'same-origin', headers: { Accept: 'application/json' } }));
}

export async function отправить<Т>(путь: string, данные: unknown = {}): Promise<Т> {
  return ответ<Т>(
    await fetch(путь, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Aiustaz-Admin': '1' },
      body: JSON.stringify(данные),
    }),
  );
}

/** Файл сборки приложения (Коран, таджвид, хадисы): /aiustaz/… — свой домен, без cookie. */
export async function файл(путь: string): Promise<string> {
  const о = await fetch('/aiustaz/' + путь, { credentials: 'omit' });
  if (!о.ok) throw new ОшибкаApi(о.status, 'file');
  return о.text();
}

export const ТЕКСТ_ОШИБКИ: Record<string, string> = {
  login: 'Нужно войти заново.',
  role: 'Не хватает прав для этого действия.',
  rate: 'Слишком часто. Подождите несколько минут.',
  code: 'Код неверный или устарел. Запросите новый.',
  email: 'Проверьте почту.',
  mail: 'Письмо не ушло. Попробуйте позже или сообщите разработчику.',
  no_secret: 'Вход ещё не настроен на сервере.',
  exists: 'Такой админ уже есть.',
  env_owner: 'Этого владельца назначает сервер — здесь его не изменить.',
  self: 'Себя нельзя понизить, отключить или удалить.',
  default_off: 'Чтец по умолчанию должен быть включён.',
  none_on: 'Нужен хотя бы один включённый чтец.',
};

export function текстОшибки(е: unknown): string {
  if (е instanceof ОшибкаApi) return ТЕКСТ_ОШИБКИ[е.код] ?? `Ошибка: ${е.код}`;
  return 'Нет связи с сервером.';
}
