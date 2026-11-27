/**
 * Данные приложения для админки — те же проверенные файлы сборки (/aiustaz/quran, /aiustaz/hadith) и те же проверки,
 * что в приложении: загрузчик Корана со сверкой sha256 (app/src/quran/loader.ts), разметка таджвида (mushaf.ts,
 * tajweed.ts), хадисы (hadith/loader.ts). Текст Корана и хадисов админка только показывает (правила 1 и 2 CLAUDE.md).
 * Чтецы — content/audio-sources.json (копия в сборке админки: files/audio-sources.json); зеркало аудио на своём сервере —
 * /aiustaz-audio/editions.json (deploy/aiustaz-audio-mirror.py в batr-world).
 */
import { файл } from './api.ts';
import { sha256Hex } from './sha256.ts';
import { создатьЗагрузчик, type ИндексСур, type СураКорана } from '../../app/src/quran/loader.ts';
import { МАНИФЕСТ_КОРАНА } from '../../app/src/quran/manifest.generated.ts';
import { МАНИФЕСТ_ТАДЖВИДА } from '../../app/src/quran/tajweedManifest.generated.ts';
import { проверитьИндексМусхафа, проверитьРазметкуСуры, type ИндексМусхафа, type РазметкаСуры } from '../../app/src/quran/mushaf.ts';
import { МАНИФЕСТ_ХАДИСОВ } from '../../app/src/hadith/manifest.generated.ts';
import { проверитьЗаголовки, проверитьИндекс as проверитьИндексХадисов, type Заголовки, type ИндексХадисов } from '../../app/src/hadith/loader.ts';

async function получитьФайл(адрес: string) {
  const о = await fetch(адрес, { credentials: 'omit' });
  const текст = о.ok ? await о.text() : '';
  return { ok: о.ok, status: о.status, text: async () => текст, тип: о.headers.get('content-type') };
}

export const коран = создатьЗагрузчик({ база: '/aiustaz', манифест: МАНИФЕСТ_КОРАНА, получить: получитьФайл, sha256: sha256Hex });

export async function индексСур(): Promise<ИндексСур> {
  const р = await коран.загрузитьИндексСур();
  if (!р.ок) throw new Error(р.причина);
  return р.данные;
}

export async function сура(н: number): Promise<СураКорана> {
  const р = await коран.загрузитьСуру(н);
  if (!р.ок) throw new Error(р.причина);
  return р.данные;
}

async function проверенный<Т>(путь: string, sha: string, проверить: (с: unknown) => Т | null): Promise<Т> {
  const текст = await файл(путь);
  if (sha256Hex(текст) !== sha) throw new Error('не-прошло-сверку');
  const р = проверить(JSON.parse(текст));
  if (!р) throw new Error('не-прошло-сверку');
  return р;
}

let мусхаф: Promise<ИндексМусхафа> | null = null;
export function индексТаджвида(): Promise<ИндексМусхафа> {
  мусхаф ??= проверенный(МАНИФЕСТ_ТАДЖВИДА.индекс, МАНИФЕСТ_ТАДЖВИДА.sha256Индекса, (с) => проверитьИндексМусхафа(с, МАНИФЕСТ_ТАДЖВИДА));
  return мусхаф;
}

export async function разметкаСуры(н: number): Promise<РазметкаСуры> {
  const и = await индексТаджвида();
  const з = и.суры.find((с) => с.сура === н);
  if (!з) throw new Error('нет-файла');
  return проверенный(з.файл, з.sha256, (с) => проверитьРазметкуСуры(с, з));
}

let хадисы: Promise<ИндексХадисов> | null = null;
export function индексХадисов(): Promise<ИндексХадисов> {
  хадисы ??= проверенный(МАНИФЕСТ_ХАДИСОВ.индекс, МАНИФЕСТ_ХАДИСОВ.sha256Индекса, (с) => проверитьИндексХадисов(с, МАНИФЕСТ_ХАДИСОВ));
  return хадисы;
}

let заголовки: Promise<Заголовки> | null = null;
export function заголовкиХадисов(): Promise<Заголовки> {
  заголовки ??= индексХадисов().then((и) => проверенный(и.заголовки.ru.файл, и.заголовки.ru.sha256, (с) => проверитьЗаголовки(с, 'ru', и)));
  return заголовки;
}

// ───────────── чтецы ─────────────
export type Чтец = {
  id: string;
  кари: { ru: string; ar?: string };
  cdn?: { хост: string; издание: string; битрейт: number };
  база: string;
  шаблон: string;
  разрешено: boolean;
  дата_разрешения: string | null;
  условия: string | null;
  атрибуция: { ru: string };
};
export type Зеркало = { edition: string; bitrate: number; count: number; bytes: number; published: string };

let чтецыДанные: Promise<Чтец[]> | null = null;
export function чтецы(): Promise<Чтец[]> {
  чтецыДанные ??= fetch('files/audio-sources.json', { credentials: 'omit' }).then((о) => о.json()).then((д: { источники: Чтец[] }) => д.источники);
  return чтецыДанные;
}

export async function зеркало(): Promise<Зеркало[]> {
  try {
    const о = await fetch('/aiustaz-audio/editions.json', { credentials: 'omit', cache: 'no-store' });
    if (!о.ok) return [];
    const д = (await о.json()) as { editions?: Зеркало[] };
    return Array.isArray(д.editions) ? д.editions : [];
  } catch {
    return [];
  }
}

/** Адрес записи аята: своё зеркало, если издание опубликовано целиком; иначе CDN AlQuran Cloud; иначе — своя база. */
export function адресАята(ч: Чтец, зеркала: Зеркало[], сура: number, аят: number, глобальный: number): string | null {
  if (!ч.разрешено) return null;
  if (ч.cdn) {
    const з = зеркала.find((м) => м.edition === ч.cdn!.издание && м.bitrate === ч.cdn!.битрейт && м.count === 6236);
    if (з) return `/aiustaz-audio/${з.bitrate}/${з.edition}/${глобальный}.mp3`;
    return `https://${ч.cdn.хост}/quran/audio/${ч.cdn.битрейт}/${ч.cdn.издание}/${глобальный}.mp3`;
  }
  if (ч.база && ч.шаблон) {
    const н3 = (н: number) => String(н).padStart(3, '0');
    return `${ч.база}/${ч.шаблон.replace('{sura3}', н3(сура)).replace('{aya3}', н3(аят))}`;
  }
  return null;
}

/** Номер аята по порядку во всём Коране (1…6236) — так названы файлы AlQuran Cloud. */
export function глобальныйНомер(и: ИндексСур, сура: number, аят: number): number {
  let н = 0;
  for (const з of и.суры) {
    if (з.сура === сура) return н + аят;
    н += з.аятов;
  }
  return 0;
}

/** Один плеер на всю админку: новая запись останавливает прежнюю. */
let звук: HTMLAudioElement | null = null;
export function играть(адрес: string, когдаКончится?: () => void): HTMLAudioElement {
  звук?.pause();
  звук = new Audio(адрес);
  звук.preload = 'auto';
  if (когдаКончится) звук.addEventListener('ended', когдаКончится);
  void звук.play().catch(() => undefined);
  return звук;
}
export function стоп(): void {
  звук?.pause();
  звук = null;
}
