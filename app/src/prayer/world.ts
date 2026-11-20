/**
 * Места мира: свёртка для поиска, разбор индекса, шардов и плиток, поиск, ближайшее место, склонение по сетке —
 * чистые функции (без сети и без React; загрузку делает prayer/store.ts).
 *
 * Владелец 20.11.2026: «Не должно быть выбора страны. Мы мировое приложение.» Данные — статические файлы сборки
 * app/public/prayer (tools/prayer/build_world.py, формат — в его шапке): индекс world.<хэш>.json, шарды поиска
 * w/<пп>.<хэш>.json (по первым двум буквам свёртки английского имени) и плитки 10°×10° t/<ш>_<д>.<хэш>.json.
 *
 * Контракт:
 *   свернуть(строка) → ключ поиска: нижний регистр, без диакритики, кириллица (ru/kk/uz/uk…) → латиница, фонетические
 *     слияния (dzh/zh → j, kh/x → h, q → k, c → k, w → v, y → i), без двойных букв. ТОЧНАЯ копия свернуть() в
 *     build_world.py — иначе ключи шардов не совпадут (scripts/test-prayer.mjs сверяет на выборке мест).
 *   префиксШарда(ключ) → 'ta' | 's_' (две буквы; пробел и нехватка — '_').
 *   разобратьИндекс(сырое) → ИндексМира | null.
 *   местаШарда(индекс, п, сырое) → Место[] (id 'w:<п>:<номер>'); ключиШарда(сырое) → [ключ, шард, номер][].
 *   найтиВМире(индекс, запрос, шарды(п) → { места, ключи } | null, предел) → { места, нужныШарды } — сначала совпадения
 *     с начала имени, крупные города выше; нужныШарды — какие ещё шарды загрузить (ключ ведёт в другой шард).
 *   плиткиВокруг(точка) → ключи 3×3 плиток вокруг точки; ближайшееВПлитках(точка, плитки) → { шард, номер, км } | null;
 *   расстояние(а, б) → км по большому кругу.
 *   склонениеВТочке(индекс, ш, д) → ° (билинейно по сетке 5°, целые градусы; вне сетки — 0).
 *   названиеСтраны(код, язык, индекс?) → 'Узбекистан' (Intl.DisplayNames; нет — английское из индекса или код).
 * Модуль без импортов своих файлов, кроме типов (node снимает типы сам — scripts/test-prayer.mjs).
 */
import type { Место } from './places';

type Язык = 'ru' | 'kk' | 'uz';

export type ИндексМира = {
  страны: [string, string][];
  пояса: string[];
  регионы: string[];
  шарды: Record<string, string>;
  плитки: Record<string, string>;
  склонение: { шаг: number; широта: [number, number]; строки: number[][] } | null;
  мест: number;
};

const КИРИЛЛИЦА: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya', ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i', ҳ: 'h', ҷ: 'j',
  є: 'e', ґ: 'g', ј: 'j', џ: 'dzh', ћ: 'ch', ђ: 'dj', љ: 'lj', њ: 'nj', ѓ: 'g', ќ: 'k', ѕ: 'dz',
};
const ЛАТИНИЦА: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', ı: 'i', þ: 'th', ð: 'd', ŋ: 'n' };
const ФОНЕТИКА: [RegExp, string][] = [
  [/dzh/g, 'j'],
  [/zh/g, 'j'],
  [/kh/g, 'h'],
  [/x/g, 'h'],
  [/q/g, 'k'],
  [/ck/g, 'k'],
  [/c(?!h)/g, 'k'],
  [/w/g, 'v'],
  [/y/g, 'i'],
];

export function свернуть(строка: string): string {
  let с = строка.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  с = Array.from(с, (б) => КИРИЛЛИЦА[б] ?? ЛАТИНИЦА[б] ?? б).join('');
  с = с.replace(/[^a-z0-9]+/g, ' ');
  for (const [было, стало] of ФОНЕТИКА) с = с.replace(было, стало);
  с = с.replace(/([a-z])\1+/g, '$1');
  return с.replace(/ +/g, ' ').trim();
}

export function префиксШарда(ключ: string): string {
  return (ключ + '__').slice(0, 2).replace(/ /g, '_');
}

const СТРОКА = (з: unknown): з is string => typeof з === 'string';
const ЧИСЛО = (з: unknown): з is number => typeof з === 'number' && Number.isFinite(з);

export function разобратьИндекс(сырое: unknown): ИндексМира | null {
  const и = (сырое ?? {}) as Partial<Record<keyof ИндексМира, unknown>>;
  if (!Array.isArray(и.страны) || !Array.isArray(и.пояса) || !Array.isArray(и.регионы)) return null;
  if (!и.шарды || typeof и.шарды !== 'object' || !и.плитки || typeof и.плитки !== 'object') return null;
  const скл = и.склонение as ИндексМира['склонение'] | undefined;
  return {
    страны: (и.страны as unknown[]).filter((с): с is [string, string] => Array.isArray(с) && СТРОКА(с[0]) && СТРОКА(с[1])),
    пояса: (и.пояса as unknown[]).filter(СТРОКА),
    регионы: (и.регионы as unknown[]).map((р) => (СТРОКА(р) ? р : '')),
    шарды: и.шарды as Record<string, string>,
    плитки: и.плитки as Record<string, string>,
    склонение: скл && ЧИСЛО(скл.шаг) && Array.isArray(скл.строки) ? скл : null,
    мест: ЧИСЛО(и.мест) ? и.мест : 0,
  };
}

export type Шард = { места: Место[]; ключи: [string, string, number][] };

export function разобратьШард(индекс: ИндексМира, п: string, сырое: unknown): Шард {
  const д = (сырое ?? {}) as { м?: unknown; к?: unknown };
  const места: Место[] = [];
  const записи = Array.isArray(д.м) ? д.м : [];
  записи.forEach((з, номер) => {
    if (!Array.isArray(з)) return;
    const [en, ru, ш, дл, стр, пояс, рег, нас] = з as unknown[];
    const страна = индекс.страны[стр as number]?.[0];
    const имяПояса = индекс.пояса[пояс as number];
    if (!СТРОКА(en) || !en || !ЧИСЛО(ш) || !ЧИСЛО(дл) || !страна || !имяПояса) return;
    const регион = индекс.регионы[рег as number] ?? '';
    const широта = ш / 100;
    const долгота = дл / 100;
    const имяРу = СТРОКА(ru) && ru ? ru : en;
    места[номер] = {
      id: `w:${п}:${номер}`,
      вид: 'место',
      kk: имяРу,
      ru: имяРу,
      en,
      страна,
      пояс: имяПояса,
      область: регион ? { kk: регион, ru: регион } : null,
      тип: '',
      население: ЧИСЛО(нас) ? нас : 0,
      широта,
      долгота,
      склонение: склонениеВТочке(индекс, широта, долгота),
    };
  });
  const ключи = (Array.isArray(д.к) ? д.к : []).filter(
    (к): к is [string, string, number] => Array.isArray(к) && СТРОКА(к[0]) && СТРОКА(к[1]) && ЧИСЛО(к[2]),
  );
  return { места, ключи };
}

/** Оценка совпадения имени с запросом: 3 — имя целиком, 2 — с начала, 0 — нет. */
function совпадение(ключ: string, з: string): number {
  if (ключ === з) return 3;
  return ключ.startsWith(з) ? 2 : 0;
}

/**
 * Поиск в загруженных шардах. шард(п) — уже загруженный шард или null. Возвращает найденные места (до предела) и
 * шарды, которые ещё надо загрузить (ключ ведёт в другой шард) — после загрузки вызвать снова.
 */
export function найтиВМире(
  индекс: ИндексМира,
  запрос: string,
  шард: (п: string) => Шард | null,
  предел = 20,
): { места: Место[]; нужныШарды: string[] } {
  const з = свернуть(запрос);
  if (з.length < 2) return { места: [], нужныШарды: [] };
  const п = префиксШарда(з);
  if (!индекс.шарды[п]) return { места: [], нужныШарды: [] };
  const свой = шард(п);
  if (!свой) return { места: [], нужныШарды: [п] };
  const оценки = new Map<string, { м: Место; о: number }>();
  const учесть = (м: Место | undefined, о: number) => {
    if (!м || о <= 0) return;
    const было = оценки.get(м.id);
    if (!было || было.о < о) оценки.set(м.id, { м, о });
  };
  for (const м of свой.места) {
    if (!м) continue;
    учесть(м, Math.max(совпадение(свернуть(м.en ?? ''), з), совпадение(свернуть(м.ru), з)));
  }
  const нужны = new Set<string>();
  for (const [ключ, куда, номер] of свой.ключи) {
    const о = совпадение(ключ, з);
    if (!о) continue;
    const где = куда || п;
    const ш = где === п ? свой : шард(где);
    if (!ш) {
      if (индекс.шарды[где]) нужны.add(где);
      continue;
    }
    учесть(ш.места[номер], о);
  }
  const итог = [...оценки.values()].sort((а, б) => б.о - а.о || (б.м.население ?? 0) - (а.м.население ?? 0) || а.м.ru.localeCompare(б.м.ru));
  return { места: итог.slice(0, предел).map((х) => х.м), нужныШарды: [...нужны] };
}

export function ключПлитки(широта: number, долгота: number): string {
  return `${Math.floor(широта / 10)}_${Math.floor(долгота / 10)}`;
}

/** Плитка и 8 соседей (по долготе — через 180°). */
export function плиткиВокруг(точка: { широта: number; долгота: number }): string[] {
  const ш = Math.floor(точка.широта / 10);
  const д = Math.floor(точка.долгота / 10);
  const итог: string[] = [];
  for (let дш = -1; дш <= 1; дш++) {
    for (let дд = -1; дд <= 1; дд++) {
      const к = (((д + дд + 18) % 36) + 36) % 36 - 18;
      итог.push(`${ш + дш}_${к}`);
    }
  }
  return итог;
}

function км(ш1: number, д1: number, ш2: number, д2: number): number {
  const р = Math.PI / 180;
  const дш = (ш2 - ш1) * р;
  const дд = (д2 - д1) * р;
  const х = Math.sin(дш / 2) ** 2 + Math.cos(ш1 * р) * Math.cos(ш2 * р) * Math.sin(дд / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(х)));
}

export function расстояние(а: { широта: number; долгота: number }, б: { широта: number; долгота: number }): number {
  return км(а.широта, а.долгота, б.широта, б.долгота);
}

/** Ближайшее место по загруженным плиткам: плитки — { ключ: сырые записи [ш, д, «шард»+номер] }. */
export function ближайшееВПлитках(
  точка: { широта: number; долгота: number },
  плитки: Record<string, unknown>,
): { шард: string; номер: number; км: number } | null {
  let лучшее: { шард: string; номер: number; км: number } | null = null;
  for (const [ключ, сырое] of Object.entries(плитки)) {
    const [пш, пд] = ключ.split('_').map(Number);
    if (!Array.isArray(сырое)) continue;
    for (const з of сырое) {
      if (!Array.isArray(з) || !ЧИСЛО(з[0]) || !ЧИСЛО(з[1]) || !СТРОКА(з[2])) continue;
      const ш = (пш * 1000 + з[0]) / 100;
      const д = (пд * 1000 + з[1]) / 100;
      const к = км(точка.широта, точка.долгота, ш, д);
      if (!лучшее || к < лучшее.км) лучшее = { шард: з[2].slice(0, 2), номер: Number(з[2].slice(2)), км: к };
    }
  }
  return лучшее;
}

export function склонениеВТочке(индекс: Pick<ИндексМира, 'склонение'>, широта: number, долгота: number): number {
  const с = индекс.склонение;
  if (!с) return 0;
  const [от, до] = с.широта;
  const ш = Math.min(до, Math.max(от, широта));
  const i = (ш - от) / с.шаг;
  const j = (долгота + 180) / с.шаг;
  const i0 = Math.min(с.строки.length - 2, Math.floor(i));
  const j0 = Math.min(с.строки[0].length - 2, Math.max(0, Math.floor(j)));
  const ti = i - i0;
  const tj = j - j0;
  const в = (а: number, б: number) => с.строки[а]?.[б] ?? 0;
  const знач = в(i0, j0) * (1 - ti) * (1 - tj) + в(i0 + 1, j0) * ti * (1 - tj) + в(i0, j0 + 1) * (1 - ti) * tj + в(i0 + 1, j0 + 1) * ti * tj;
  return Math.round(знач * 10) / 10;
}

const СВОИ_СТРАНЫ: Record<string, Record<Язык, string>> = {
  KZ: { ru: 'Казахстан', kk: 'Қазақстан', uz: 'Qozogʻiston' },
  UZ: { ru: 'Узбекистан', kk: 'Өзбекстан', uz: 'Oʻzbekiston' },
};
const имена = new Map<Язык, Intl.DisplayNames | null>();

export function названиеСтраны(код: string, язык: Язык, индекс?: Pick<ИндексМира, 'страны'> | null): string {
  if (СВОИ_СТРАНЫ[код]) return СВОИ_СТРАНЫ[код][язык];
  if (!имена.has(язык)) {
    let и: Intl.DisplayNames | null = null;
    try {
      // uz — латиница: запасной язык английский (латиница), не русский.
      const теги = язык === 'uz' ? ['uz-Latn', 'en'] : [язык, 'ru'];
      и = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(теги, { type: 'region' }) : null;
    } catch {
      и = null;
    }
    имена.set(язык, и);
  }
  try {
    const имя = имена.get(язык)?.of(код);
    if (имя && имя !== код) return имя;
  } catch {
    // неизвестный код — ниже английское имя
  }
  return индекс?.страны.find((с) => с[0] === код)?.[1] ?? код;
}
