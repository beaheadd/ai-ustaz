/**
 * Цены золота и серебра за 1 г в тенге для калькулятора закята — с нашего сервера, без участия человека.
 *
 * Владелец 28.11.2026: «Данные серебра и золота подтягивай сам из официальных источников. Не нужно, чтобы человек это
 * делал.» Сервер — server/metals.py, GET /api/zakat/prices (относительный адрес; CSP connect-src 'self'): золото —
 * Национальный банк РК («Стоимость 1 грамма золота в тенге»), серебро — по той же формуле НБ РК из учётной цены Банка
 * России. На сервер ничего не уходит: запрос без тела, без cookie (credentials: 'omit').
 * Только на своём домене (aiustaz.pro): на batr.kz /api/zakat/ нет — там, без сети и без сохранённых цен остаётся ручной
 * ввод, как раньше. Последние принятые цены — в localStorage (aiustaz:zakat-prices.v1) вместе с датой: без сети
 * калькулятор подставляет их и показывает ту же дату.
 *
 * Контракт (чистые функции — без React; тест scripts/test-zakat.mjs):
 *   проверитьЦены(сырое) → ЦеныМеталлов | null — ответ сервера или сохранённое: дата ГГГГ-ММ-ДД, числа в разумных границах
 *     (золото 10 000–1 000 000 ₸/г, серебро 50–20 000 ₸/г), источник — https-страница хоста nationalbank.kz; иначе null;
 *   датаПодписи('2026-11-27') → '27.11.2026';
 *   ценаВПоле(52553.84) → '52 553,84' (как очиститьВвод — для полей «вручную»);
 *   загрузитьЦены({ получить?, хост?, хранилище? }) → Promise<{ цены, откуда: 'сеть' | 'память' } | null> —
 *     свой домен (или тестовый флаг aiustaz:zakat-prices-test = '1'): запрос; удалось — запомнить и вернуть 'сеть';
 *     503 / нет сети / неверный ответ — сохранённые ('память') или null; чужой домен — null (ручной ввод);
 *   сохранённыеЦены(хранилище?) → ЦеныМеталлов | null — для первого кадра без мигания.
 */
import { видХоста } from '../install/platform.ts';
import { очиститьВвод } from './calc.ts';

export type ЦеныМеталлов = {
  /** Дата цены НБ РК, ГГГГ-ММ-ДД. */
  дата: string;
  золото: number;
  серебро: number;
  /** Страница НБ РК (золото). */
  источник: string;
  /** Когда сервер последний раз сверил цену (ISO). */
  обновлено: string;
};

export type ЗагруженныеЦены = { цены: ЦеныМеталлов; откуда: 'сеть' | 'память' };

export const АДРЕС_ЦЕН = '/api/zakat/prices';
export const КЛЮЧ_ЦЕН = 'aiustaz:zakat-prices.v1';
export const КЛЮЧ_ТЕСТА_ЦЕН = 'aiustaz:zakat-prices-test';
const ДАТА = /^\d{4}-\d{2}-\d{2}$/;
const ЗОЛОТО: readonly [number, number] = [10_000, 1_000_000];
const СЕРЕБРО: readonly [number, number] = [50, 20_000];

const вГраницах = (ч: unknown, [от, до]: readonly [number, number]) => typeof ч === 'number' && Number.isFinite(ч) && ч >= от && ч <= до;

/** Страница Нацбанка РК (https, хост nationalbank.kz) — другой источник не показываем. */
function этоНБК(адрес: string): boolean {
  try {
    const u = new URL(адрес);
    return u.protocol === 'https:' && u.hostname === 'nationalbank.kz';
  } catch {
    return false;
  }
}

/** Ответ сервера ({date, gold_per_g, silver_per_g, source, updated}) или сохранённое (те же поля) → ЦеныМеталлов | null. */
export function проверитьЦены(сырое: unknown): ЦеныМеталлов | null {
  if (!сырое || typeof сырое !== 'object') return null;
  const с = сырое as Record<string, unknown>;
  const дата = с.date;
  if (typeof дата !== 'string' || !ДАТА.test(дата) || Number.isNaN(Date.parse(дата + 'T00:00:00Z'))) return null;
  if (!вГраницах(с.gold_per_g, ЗОЛОТО) || !вГраницах(с.silver_per_g, СЕРЕБРО)) return null;
  const источник = с.source;
  if (typeof источник !== 'string' || источник.length > 200 || !этоНБК(источник)) return null;
  const обновлено = typeof с.updated === 'string' && с.updated.length <= 40 ? с.updated : '';
  return { дата, золото: с.gold_per_g as number, серебро: с.silver_per_g as number, источник, обновлено };
}

/** '2026-11-27' → '27.11.2026'. */
export function датаПодписи(дата: string): string {
  const [г, м, д] = дата.split('-');
  return `${д}.${м}.${г}`;
}

/** Цена → строка поля ввода (разряды пробелом, дробь запятой): 52553.84 → '52 553,84', 600 → '600'. */
export function ценаВПоле(цена: number): string {
  return очиститьВвод(String(Math.round(цена * 100) / 100).replace('.', ','), 2);
}

type Хранилище = Pick<Storage, 'getItem' | 'setItem'>;

function хранилищеПоУмолчанию(): Хранилище | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Как отдаёт сервер — так и храним (одна проверка для сети и памяти). */
function вСырое(ц: ЦеныМеталлов) {
  return { date: ц.дата, gold_per_g: ц.золото, silver_per_g: ц.серебро, source: ц.источник, updated: ц.обновлено };
}

export function сохранённыеЦены(хранилище: Хранилище | null = хранилищеПоУмолчанию()): ЦеныМеталлов | null {
  try {
    const с = хранилище?.getItem(КЛЮЧ_ЦЕН);
    const з = с ? (JSON.parse(с) as { версия?: number; цены?: unknown }) : null;
    return з?.версия === 1 ? проверитьЦены(з.цены) : null;
  } catch {
    return null;
  }
}

export async function загрузитьЦены({
  получить = typeof fetch === 'function' ? fetch : undefined,
  хост = typeof window !== 'undefined' ? window.location?.hostname : undefined,
  хранилище = хранилищеПоУмолчанию(),
}: {
  получить?: (адрес: string, параметры: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;
  хост?: string;
  хранилище?: Хранилище | null;
} = {}): Promise<ЗагруженныеЦены | null> {
  let тест = false;
  try {
    тест = хранилище?.getItem(КЛЮЧ_ТЕСТА_ЦЕН) === '1';
  } catch {
    тест = false;
  }
  if (видХоста(хост) !== 'свой' && !тест) return null;
  const память = (): ЗагруженныеЦены | null => {
    const ц = сохранённыеЦены(хранилище);
    return ц ? { цены: ц, откуда: 'память' } : null;
  };
  if (!получить) return память();
  try {
    const ответ = await получить(АДРЕС_ЦЕН, { credentials: 'omit', headers: { Accept: 'application/json' } });
    if (!ответ.ok) return память();
    const ц = проверитьЦены(await ответ.json());
    if (!ц) return память();
    try {
      хранилище?.setItem(КЛЮЧ_ЦЕН, JSON.stringify({ версия: 1, цены: вСырое(ц) }));
    } catch {
      // хранилище недоступно — цены всё равно подставим
    }
    return { цены: ц, откуда: 'сеть' };
  } catch {
    return память();
  }
}
