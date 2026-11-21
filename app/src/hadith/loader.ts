/**
 * Хадисы аль-Бухари из HadeethEnc.com — чистая часть: типы, проверки формы файлов, выбор перевода, поиск, дерево
 * категорий. Без импортов (проверяется в node: scripts/test-hadith.mjs). Сеть и sha256 — src/hadith/data.ts.
 *
 * Решение владельца 21.11.2026: «Добавь хадисы Аль-Бухари ещё перевод!». Данные — статические файлы сборки
 * (app/public/hadith → dist/hadith; собирает tools/hadith/build_hadith.py из выгрузок HadeethEnc). Цепочка доверия:
 * манифест в бандле (имя и sha256 индекса) → индекс (имя и sha256 файлов заголовков и порций) → файл. Что не прошло
 * сверку — не показывается. Условия HadeethEnc: без изменений, добавлений и удалений — строки выводятся как есть;
 * ИИ хадисы не пишет, не переводит и не пересказывает (правило 2 CLAUDE.md).
 *
 * Контракт:
 *   проверитьИндекс(сырые, манифест) → ИндексХадисов | null   — форма, номера 1…N, порции и заголовки с sha256
 *   проверитьЗаголовки(сырые, язык, индекс) → Заголовки | null — [id, title, grade] ровно для хадисов с этим переводом
 *   проверитьПорцию(сырые, язык, порция, индекс) → Map<id, ЗаписьАр | ЗаписьПеревода> | null
 *   языкПеревода(языкИнтерфейса, языкиХадиса) → { язык: 'ru'|'en'|'uz'; запасной: boolean }
 *     ru → ru; en/uz → свой, если есть, иначе ru (запасной); kk → ru (перевода на казахский у HadeethEnc нет; запасной)
 *   языкЗаголовков(языкИнтерфейса) → 'ru'|'en'|'uz' (kk → ru)
 *   найти(индекс, заголовки, запрос) → ЗаписьХадиса[] — номер (n или id HadeethEnc) или слова заголовка
 *     (все слова запроса, без регистра и ё/е); пустой запрос — []
 *   подкатегории(индекс, id), хадисыКатегории(индекс, id), категория(индекс, id), названиеКатегории(к, язык)
 *   арабскийТекст(ar, перевод) — hadeeth_ar перевода (другая редакция), иначе hadeeth арабской выгрузки
 *   ССЫЛКА_HADEETHENC — https://hadeethenc.com/<язык>/browse/hadith/<id>; ссылкаВерна(ссылка, язык, id)
 */

export type ЯзыкПеревода = 'ru' | 'en' | 'uz';
export const ЯЗЫКИ_ПЕРЕВОДА: readonly ЯзыкПеревода[] = ['ru', 'en', 'uz'];

export type МанифестХадисов = {
  readonly формат: number;
  readonly индекс: string;
  readonly sha256Индекса: string;
  readonly хадисов: number;
  readonly источник: string;
};

export type ФайлДанных = { файл: string; sha256: string; хадисов: number };

export type КатегорияХадисов = {
  id: number;
  родитель: number;
  хадисов: number;
  /** Названия раздела из выгрузок HadeethEnc как есть (ar, ru, en, uz; перевода может не быть — null). */
  название: { ar: string | null; ru: string | null; en: string | null; uz: string | null };
};

export type ЗаписьХадиса = {
  /** Номер по порядку в разделе «Хадисы» (1…N). */
  n: number;
  /** Номер хадиса на HadeethEnc.com. */
  id: number;
  категории: number[];
  порция: number;
  /** Языки перевода HadeethEnc у этого хадиса (ru — всегда). */
  языки: ЯзыкПеревода[];
};

export type ИндексХадисов = {
  издатель: string;
  условия: string;
  условияАдрес: string;
  выгрузки: Record<'ar' | ЯзыкПеревода, { версия: string; дата: string }>;
  сборник: string;
  статус: string;
  хадисов: number;
  порция: number;
  категории: КатегорияХадисов[];
  хадисы: ЗаписьХадиса[];
  заголовки: Record<ЯзыкПеревода, ФайлДанных>;
  порции: Record<'ar' | ЯзыкПеревода, (ФайлДанных | null)[]>;
  /** id → кто и когда из устазов одобрил (без плашки «Черновик»). */
  одобрено: Record<string, { кто: string; когда: string }>;
  скрыто: { хадисов: number };
};

/** [id, title, grade] — как в выгрузке языка. */
export type Заголовки = Map<number, { заголовок: string; степень: string }>;

/** Арабская выгрузка: поля HadeethEnc как есть. */
export type ЗаписьАр = {
  id: number;
  version: number;
  hadeeth: string;
  grade: string;
  attribution: string;
  reference: string | null;
  words_meanings: { word: string; meaning: string }[] | null;
  link: string;
};

/** Перевод: поля HadeethEnc как есть; hadeeth_ar — только если перевод сделан по другой редакции арабского текста. */
export type ЗаписьПеревода = {
  id: number;
  title: string;
  hadeeth: string;
  explanation: string;
  grade: string;
  attribution: string;
  hints: string[];
  ar_version: number;
  hadeeth_ar?: string;
  link: string;
};

export const ИСТОЧНИК_ХАДИСОВ = 'hadeethenc';
const ФАЙЛ_ИНДЕКСА = /^hadith\/index\.([0-9a-f]{20})\.json$/;
const SHA = /^[0-9a-f]{64}$/;

function объект(з: unknown): Record<string, unknown> | null {
  return з && typeof з === 'object' && !Array.isArray(з) ? (з as Record<string, unknown>) : null;
}
function целое(з: unknown, мин = 0, макс = Number.MAX_SAFE_INTEGER): з is number {
  return typeof з === 'number' && Number.isInteger(з) && з >= мин && з <= макс;
}
function строка(з: unknown): з is string {
  return typeof з === 'string' && з.length > 0;
}
function строкаИлиNull(з: unknown): з is string | null {
  return з === null || typeof з === 'string';
}

export const ССЫЛКА_HADEETHENC = 'https://hadeethenc.com/';
export function ссылкаВерна(ссылка: unknown, язык: string, id: number): boolean {
  return ссылка === `${ССЫЛКА_HADEETHENC}${язык}/browse/hadith/${id}`;
}

function файлДанных(з: unknown, путь: RegExp): ФайлДанных | null {
  const ф = объект(з);
  if (!ф || !строка(ф.файл) || !строка(ф.sha256) || !SHA.test(ф.sha256) || !целое(ф.хадисов, 1)) return null;
  const м = путь.exec(ф.файл);
  if (!м || м[м.length - 1] !== ф.sha256.slice(0, 20)) return null;
  return { файл: ф.файл, sha256: ф.sha256, хадисов: ф.хадисов };
}

/** Индекс: форма, номера 1…N подряд, id без повторов, у каждого хадиса — ru; порции и заголовки — пути с хэшем. */
export function проверитьИндекс(сырые: unknown, м: МанифестХадисов): ИндексХадисов | null {
  const и = объект(сырые);
  if (!и || и.формат !== м.формат || и.источник !== м.источник || !ФАЙЛ_ИНДЕКСА.test(м.индекс)) return null;
  if (!строка(и.условия) || !строка(и.издатель) || !строка(и.условияАдрес) || !строка(и.сборник)) return null;
  if (!Array.isArray(и.хадисы) || и.хадисы.length !== м.хадисов || и.хадисов !== м.хадисов || !целое(и.порция, 1)) return null;
  const порция = и.порция;
  const категории: КатегорияХадисов[] = [];
  const idКатегорий = new Set<number>();
  for (const з of Array.isArray(и.категории) ? и.категории : []) {
    const к = объект(з);
    const н = объект(к?.название);
    if (!к || !н || !целое(к.id, 1) || !целое(к.родитель) || !целое(к.хадисов, 1)) return null;
    if (!строка(н.ar) || !строкаИлиNull(н.ru) || !строкаИлиNull(н.en) || !строкаИлиNull(н.uz)) return null;
    категории.push({ id: к.id, родитель: к.родитель, хадисов: к.хадисов, название: { ar: н.ar, ru: н.ru || null, en: н.en || null, uz: н.uz || null } });
    idКатегорий.add(к.id);
  }
  const хадисы: ЗаписьХадиса[] = [];
  const виденные = new Set<number>();
  for (let i = 0; i < и.хадисы.length; i++) {
    const з = объект(и.хадисы[i]);
    if (!з || з.n !== i + 1 || !целое(з.id, 1) || виденные.has(з.id) || з.порция !== Math.floor(i / порция)) return null;
    if (!Array.isArray(з.категории) || !з.категории.every((к) => целое(к, 1) && idКатегорий.has(к))) return null;
    if (!Array.isArray(з.языки) || !з.языки.includes('ru') || !з.языки.every((я) => (ЯЗЫКИ_ПЕРЕВОДА as readonly unknown[]).includes(я))) return null;
    виденные.add(з.id);
    хадисы.push({ n: i + 1, id: з.id, категории: з.категории as number[], порция: з.порция as number, языки: з.языки as ЯзыкПеревода[] });
  }
  const з = объект(и.заголовки);
  const п = объект(и.порции);
  if (!з || !п) return null;
  const заголовки = {} as Record<ЯзыкПеревода, ФайлДанных>;
  for (const я of ЯЗЫКИ_ПЕРЕВОДА) {
    const ф = файлДанных(з[я], new RegExp(`^hadith/titles-${я}\\.([0-9a-f]{20})\\.json$`));
    if (!ф) return null;
    заголовки[я] = ф;
  }
  const частей = Math.ceil(хадисы.length / порция);
  const порции = {} as Record<'ar' | ЯзыкПеревода, (ФайлДанных | null)[]>;
  for (const я of ['ar', ...ЯЗЫКИ_ПЕРЕВОДА] as const) {
    const список = п[я];
    if (!Array.isArray(список) || список.length !== частей) return null;
    порции[я] = [];
    for (let ч = 0; ч < частей; ч++) {
      if (список[ч] === null && я !== 'ar' && я !== 'ru') {
        порции[я].push(null);
        continue;
      }
      const ф = файлДанных(список[ч], new RegExp(`^hadith/${я}/${String(ч).padStart(3, '0')}\\.([0-9a-f]{20})\\.json$`));
      if (!ф) return null;
      порции[я].push(ф);
    }
  }
  const в = объект(и.выгрузки);
  const выгрузки = {} as ИндексХадисов['выгрузки'];
  for (const я of ['ar', ...ЯЗЫКИ_ПЕРЕВОДА] as const) {
    const з = объект(в?.[я]);
    if (!з || !строка(з.версия) || !строка(з.дата)) return null;
    выгрузки[я] = { версия: з.версия, дата: з.дата };
  }
  const одобрено: ИндексХадисов['одобрено'] = {};
  for (const [ключ, з] of Object.entries(объект(и.одобрено) ?? {})) {
    const о = объект(з);
    if (!о || !строка(о.кто) || !строка(о.когда)) return null;
    одобрено[ключ] = { кто: о.кто, когда: о.когда };
  }
  const скрыто = объект(и.скрыто);
  return {
    издатель: и.издатель,
    условия: и.условия,
    условияАдрес: и.условияАдрес,
    выгрузки,
    сборник: и.сборник,
    статус: строка(и.статус) ? и.статус : 'черновик',
    хадисов: хадисы.length,
    порция,
    категории,
    хадисы,
    заголовки,
    порции,
    одобрено,
    скрыто: { хадисов: целое(скрыто?.хадисов) ? (скрыто?.хадисов as number) : 0 },
  };
}

/** Заголовки языка: ровно хадисы с этим переводом, по порядку номеров; title и grade — непустые строки. */
export function проверитьЗаголовки(сырые: unknown, язык: ЯзыкПеревода, индекс: ИндексХадисов): Заголовки | null {
  const д = объект(сырые);
  if (!д || д.язык !== язык || д.источник !== ИСТОЧНИК_ХАДИСОВ || !Array.isArray(д.заголовки)) return null;
  const нужные = индекс.хадисы.filter((х) => х.языки.includes(язык)).map((х) => х.id);
  if (д.заголовки.length !== нужные.length) return null;
  const итог: Заголовки = new Map();
  for (let i = 0; i < нужные.length; i++) {
    const с = д.заголовки[i];
    if (!Array.isArray(с) || с.length !== 3 || с[0] !== нужные[i] || !строка(с[1]) || !строка(с[2])) return null;
    итог.set(с[0], { заголовок: с[1], степень: с[2] });
  }
  return итог;
}

function записьАр(з: Record<string, unknown>): ЗаписьАр | null {
  if (!целое(з.id, 1) || !целое(з.version, 1) || !строка(з.hadeeth) || !строка(з.grade) || !строка(з.attribution)) return null;
  if (!строкаИлиNull(з.reference ?? null) || !ссылкаВерна(з.link, 'ar', з.id)) return null;
  const сз = з.words_meanings ?? null;
  if (сз !== null && !(Array.isArray(сз) && сз.every((с) => объект(с) && typeof (с as Record<string, unknown>).word === 'string' && typeof (с as Record<string, unknown>).meaning === 'string'))) return null;
  return {
    id: з.id,
    version: з.version,
    hadeeth: з.hadeeth,
    grade: з.grade,
    attribution: з.attribution,
    reference: (з.reference as string | null) ?? null,
    words_meanings: сз as ЗаписьАр['words_meanings'],
    link: з.link as string,
  };
}

function записьПеревода(з: Record<string, unknown>, язык: ЯзыкПеревода): ЗаписьПеревода | null {
  if (!целое(з.id, 1) || !строка(з.title) || !строка(з.hadeeth) || !строка(з.grade) || !строка(з.attribution)) return null;
  if (typeof з.explanation !== 'string' || !Array.isArray(з.hints) || !з.hints.every((х) => typeof х === 'string')) return null;
  if (!целое(з.ar_version, 1) || (з.hadeeth_ar !== undefined && !строка(з.hadeeth_ar)) || !ссылкаВерна(з.link, язык, з.id)) return null;
  return {
    id: з.id,
    title: з.title,
    hadeeth: з.hadeeth,
    explanation: з.explanation,
    grade: з.grade,
    attribution: з.attribution,
    hints: з.hints as string[],
    ar_version: з.ar_version,
    ...(з.hadeeth_ar !== undefined ? { hadeeth_ar: з.hadeeth_ar as string } : null),
    link: з.link as string,
  };
}

/** Порция языка: ровно хадисы этой порции (ar — все; перевод — с этим языком), каждая запись — форма HadeethEnc. */
export function проверитьПорцию(
  сырые: unknown,
  язык: 'ar' | ЯзыкПеревода,
  порция: number,
  индекс: ИндексХадисов,
): Map<number, ЗаписьАр | ЗаписьПеревода> | null {
  const д = объект(сырые);
  if (!д || д.язык !== язык || д.порция !== порция || д.источник !== ИСТОЧНИК_ХАДИСОВ || !Array.isArray(д.хадисы)) return null;
  const нужные = индекс.хадисы.filter((х) => х.порция === порция && (язык === 'ar' || х.языки.includes(язык))).map((х) => х.id);
  if (д.хадисы.length !== нужные.length) return null;
  const итог = new Map<number, ЗаписьАр | ЗаписьПеревода>();
  for (let i = 0; i < нужные.length; i++) {
    const з = объект(д.хадисы[i]);
    if (!з || з.id !== нужные[i]) return null;
    const запись = язык === 'ar' ? записьАр(з) : записьПеревода(з, язык);
    if (!запись) return null;
    итог.set(нужные[i], запись);
  }
  return итог;
}

/** Перевод для языка интерфейса: свой, если есть у этого хадиса; иначе русский (kk — всегда русский). */
export function языкПеревода(языкИнтерфейса: string, языкиХадиса: readonly ЯзыкПеревода[]): { язык: ЯзыкПеревода; запасной: boolean } {
  if (языкИнтерфейса === 'en' || языкИнтерфейса === 'uz') {
    return языкиХадиса.includes(языкИнтерфейса) ? { язык: языкИнтерфейса, запасной: false } : { язык: 'ru', запасной: true };
  }
  return { язык: 'ru', запасной: языкИнтерфейса !== 'ru' };
}

/** Файл заголовков для языка интерфейса: kk → ru (свой файл есть у ru, en, uz). */
export function языкЗаголовков(языкИнтерфейса: string): ЯзыкПеревода {
  return языкИнтерфейса === 'en' || языкИнтерфейса === 'uz' ? языкИнтерфейса : 'ru';
}

/** Арабский текст к переводу: hadeeth_ar перевода (другая редакция), иначе hadeeth арабской выгрузки. */
export function арабскийТекст(ar: ЗаписьАр, перевод: ЗаписьПеревода): string {
  return перевод.hadeeth_ar ?? ar.hadeeth;
}

function сложить(с: string): string {
  return с.toLocaleLowerCase('ru').replace(/ё/g, 'е');
}

/**
 * Поиск в пределах загруженного индекса: число — номер по порядку (n) или номер HadeethEnc (id) точно;
 * иначе — все слова запроса в заголовке (title) языка, без регистра, ё = е. Пустой запрос — пусто.
 * Заголовок языка, которого у хадиса нет, ищется в запасных (ru).
 */
export function найти(индекс: ИндексХадисов, заголовки: readonly (Заголовки | null)[], запрос: string): ЗаписьХадиса[] {
  const з = запрос.trim();
  if (!з) return [];
  const число = /^№?\s*(\d{1,6})$/.exec(з);
  if (число) {
    const н = Number(число[1]);
    return индекс.хадисы.filter((х) => х.n === н || х.id === н);
  }
  const слова = сложить(з).split(/\s+/).filter(Boolean);
  return индекс.хадисы.filter((х) => {
    for (const з of заголовки) {
      const т = з?.get(х.id);
      if (т) {
        const с = сложить(т.заголовок);
        return слова.every((сл) => с.includes(сл));
      }
    }
    return false;
  });
}

export function категория(индекс: ИндексХадисов, id: number): КатегорияХадисов | null {
  return индекс.категории.find((к) => к.id === id) ?? null;
}

export function подкатегории(индекс: ИндексХадисов, id: number): КатегорияХадисов[] {
  return индекс.категории.filter((к) => к.родитель === id);
}

/** Хадисы, отнесённые к разделу прямо (не к его подразделам), по порядку номеров. */
export function хадисыКатегории(индекс: ИндексХадисов, id: number): ЗаписьХадиса[] {
  return индекс.хадисы.filter((х) => х.категории.includes(id));
}

/** Путь раздела от корня: [корень, …, раздел]. */
export function путьКатегории(индекс: ИндексХадисов, id: number): КатегорияХадисов[] {
  const путь: КатегорияХадисов[] = [];
  let к = категория(индекс, id);
  while (к && !путь.includes(к)) {
    путь.unshift(к);
    к = к.родитель ? категория(индекс, к.родитель) : null;
  }
  return путь;
}

/** Название раздела на языке интерфейса (kk → ru; нет перевода — ru, затем арабское). */
export function названиеКатегории(к: КатегорияХадисов, языкИнтерфейса: string): string {
  const я = языкЗаголовков(языкИнтерфейса);
  return к.название[я] ?? к.название.ru ?? к.название.ar ?? String(к.id);
}

export type ПричинаОтказа = 'нет-связи' | 'сбой-сервера' | 'нет-файла' | 'не-прошло-сверку';
export type Результат<Т> = { ок: true; данные: Т } | { ок: false; причина: ПричинаОтказа };
