/**
 * Веб-зависимости плеера чтения кари: настоящий HTMLAudioElement, navigator.mediaSession, MediaMetadata, localStorage,
 * предзагрузка следующего аята fetch → Blob → object URL, navigator.onLine.
 *
 * Отдельно от audio/player.ts, чтобы ровно эти функции проверялись в Chromium (scripts/e2e-audio.mjs) без сборки:
 * файл без импортов кода (только `import type`), типы снимает node.
 * Решение владельца 19.11.2026: «плеер … чтобы можно было слушать, и когда экран выключен» (docs/дизайн/05, §2.3).
 *
 * Контракт: зависимостиВеба() → часть ЗависимостиПлеера (создатьЭлемент, сессия, метаданные, хранилище,
 *   предзагрузить, освободить, вСети); есть ли веб-звук — естьЗвукВеба().
 * Правила: запросы — только на свой адрес (CSP connect-src и media-src 'self'), без cookie и referrer;
 * в хранилище — только номер суры и аята и повтор (никаких записей голоса); всё в try/catch.
 */
import type { ЗависимостиПлеера, ИсточникЗвука, СессияМедиа, ХранилищеПлеера, ЭлементЗвука } from './core';

type ВебЗависимости = Required<
  Pick<ЗависимостиПлеера<ИсточникЗвука>, 'создатьЭлемент' | 'сессия' | 'метаданные' | 'хранилище' | 'предзагрузить' | 'освободить' | 'вСети'>
>;

type ГлобальноеОкно = {
  HTMLAudioElement?: unknown;
  Audio?: new () => unknown;
  MediaMetadata?: new (данные: { title: string; artist: string; album: string }) => unknown;
  localStorage?: { getItem(к: string): string | null; setItem(к: string, з: string): void };
  navigator?: { mediaSession?: unknown; onLine?: boolean };
  fetch?: typeof fetch;
  URL?: { createObjectURL?(б: Blob): string; revokeObjectURL?(u: string): void };
};

const г = () => globalThis as unknown as ГлобальноеОкно;

export function естьЗвукВеба(): boolean {
  return typeof г().HTMLAudioElement === 'function' && typeof г().Audio === 'function';
}

const хранилище: ХранилищеПлеера = {
  прочитать(ключ) {
    try {
      return г().localStorage?.getItem(ключ) ?? null;
    } catch {
      return null; // приватный режим, запрет сайта
    }
  },
  записать(ключ, значение) {
    try {
      г().localStorage?.setItem(ключ, значение);
    } catch {
      // переполнено или запрещено — плеер работает и без памяти
    }
  },
};

/**
 * Скачать файл заранее: blob: URL или null (тогда играет прямой адрес). Только audio/* — ответ-заглушка сайта
 * (index.html вместо файла) не играется.
 */
export async function предзагрузитьФайл(адрес: string): Promise<string | null> {
  const о = г();
  if (typeof о.fetch !== 'function' || typeof о.URL?.createObjectURL !== 'function') return null;
  try {
    const ответ = await о.fetch(адрес, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!ответ.ok) return null;
    const тип = (ответ.headers.get('content-type') ?? '').toLowerCase();
    if (!тип.startsWith('audio/')) return null;
    return о.URL.createObjectURL(await ответ.blob());
  } catch {
    return null; // нет связи — по `ended` сыграет прямой адрес (или покажет «нет связи»)
  }
}

export function зависимостиВеба(): ВебЗависимости {
  return {
    создатьЭлемент: () => {
      if (!естьЗвукВеба()) return null;
      const Конструктор = г().Audio as new () => ЭлементЗвука;
      return new Конструктор();
    },
    сессия: () => {
      const н = г().navigator;
      return н && н.mediaSession ? (н.mediaSession as СессияМедиа) : null;
    },
    метаданные: (данные) => {
      const Конструктор = г().MediaMetadata;
      // Без artwork: растровых файлов в сборке нет (check-dist), SVG поддерживают не все.
      return Конструктор ? new Конструктор({ title: данные.title, artist: данные.artist, album: данные.album }) : null;
    },
    хранилище,
    предзагрузить: предзагрузитьФайл,
    освободить: (url) => {
      try {
        г().URL?.revokeObjectURL?.(url);
      } catch {
        // уже освобождён
      }
    },
    вСети: () => г().navigator?.onLine !== false,
  };
}
