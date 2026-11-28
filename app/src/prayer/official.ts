/**
 * Официальное время намаза Казахстана (ДУМК) и Узбекистана (УМУз): какой пункт спросить, разбор и проверка таблицы,
 * времена дня из неё, подпись — чистые функции (без React, без сети; node снимает типы сам — scripts/test-prayer.mjs).
 *
 * Решение владельца 20.11.2026: «Время намаза Казахстан, Узбекистан бери из официальных источников… чтобы с местными один
 * в один у нас время было. А остальные по такой методологии можно считать.» Таблицы скачивает и проверяет наш сервер
 * (server/prayer.py, GET /api/prayer/official), телефон берёт годовую таблицу пункта и хранит её у себя
 * (prayer/officialStore.ts). Нет таблицы (batr.kz, нет сети, сервер ещё не скачал, аср не ханафитский) — свой расчёт тем же
 * методом, подпись «Расчёт по методу …».
 *
 * Контракт:
 *   type ИсточникОфициальный = 'dumk' | 'umuz'.
 *   пунктОфициальный(место) → { src, id, км } | null — место из списка KZ/UZ → его id; своя точка в KZ/UZ → id ближайшего
 *     места списка, если до него ≤ БЛИЖЕ_КМ (25 км), иначе null (свой расчёт по точке). КООРДИНАТЫ НЕ УХОДЯТ — только id.
 *   разобратьТаблицу(данные, src, id, год) → ТаблицаОфициальная | null — ответ сервера: те же src/place/year, offset 300,
 *     365/366 дней × 6 «ЧЧ:ММ», порядок фаджр < восход < зухр < аср < магриб < иша (иша после полуночи — допустима),
 *     sha, updated 'ГГГГ-ММ-ДД'. Что-то не так — null (покажем свой расчёт).
 *   временаИзТаблицы(таблица, день 'ГГГГ-ММ-ДД') → ВременаДня | null — моменты UTC (мс) из местного «ЧЧ:ММ» и offset.
 *   ВЕДОМСТВО_ОФИЦИАЛЬНОЕ[src] → { ru, kk } — «ДУМК» / «Управления мусульман Узбекистана».
 *   подписьОфициального(src, обновлено, язык) → «По данным ДУМК · обновлено 20.11.2026»; kk — черновик.
 */
import type { ВременаДня, КлючВремени } from './times';

export type ИсточникОфициальный = 'dumk' | 'umuz';

export type ТаблицаОфициальная = {
  src: ИсточникОфициальный;
  id: string;
  год: number;
  /** Смещение местного времени таблицы от UTC, мин (KZ и UZ — 300). */
  смещение: number;
  /** [фаджр, восход, зухр, аср, магриб, иша] «ЧЧ:ММ» × дни года. */
  дни: string[][];
  точка: { id: string; name: string };
  /** 'table' — таблица ведомства; 'rule' — сервер посчитал по правилу и точке ведомства (УМУз). */
  метод: 'table' | 'rule';
  обновлено: string;
  sha: string;
};

export const ИСТОЧНИК_СТРАНЫ: Readonly<Record<string, ИсточникОфициальный>> = { KZ: 'dumk', UZ: 'umuz' };
export const БЛИЖЕ_КМ = 25;
const КЛЮЧИ: readonly КлючВремени[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const ВРЕМЯ = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ДАТА = /^(\d{4})-(\d{2})-(\d{2})$/;

type МестоДляПункта = {
  id: string;
  вид: 'место' | 'точка';
  страна?: string;
  ближайшее?: { id: string; км: number };
};

export function пунктОфициальный(место: МестоДляПункта): { src: ИсточникОфициальный; id: string; км: number } | null {
  const src = ИСТОЧНИК_СТРАНЫ[место.страна ?? 'KZ'];
  if (!src) return null;
  if (место.вид === 'место') return ID.test(место.id) ? { src, id: место.id, км: 0 } : null;
  const б = место.ближайшее;
  return б && ID.test(б.id) && б.км <= БЛИЖЕ_КМ ? { src, id: б.id, км: б.км } : null;
}

function днейВГоду(год: number): number {
  return (год % 4 === 0 && год % 100 !== 0) || год % 400 === 0 ? 366 : 365;
}

const минуты = (в: string) => Number(в.slice(0, 2)) * 60 + Number(в.slice(3));

export function разобратьТаблицу(данные: unknown, src: ИсточникОфициальный, id: string, год: number): ТаблицаОфициальная | null {
  const д = данные as Record<string, unknown> | null;
  if (!д || typeof д !== 'object') return null;
  if (д.src !== src || д.place !== id || д.year !== год || д.offset !== 300) return null;
  const дни = д.days;
  if (!Array.isArray(дни) || дни.length !== днейВГоду(год)) return null;
  for (const с of дни) {
    if (!Array.isArray(с) || с.length !== 6 || !с.every((в) => typeof в === 'string' && ВРЕМЯ.test(в))) return null;
    const м = (с as string[]).map(минуты);
    if (м[5] < м[4]) м[5] += 1440;
    for (let i = 0; i < 5; i++) if (!(м[i] < м[i + 1])) return null;
  }
  const т = д.point as { id?: unknown; name?: unknown } | null;
  if (!т || typeof т.id !== 'string' || typeof т.name !== 'string') return null;
  if (typeof д.sha !== 'string' || !/^[0-9a-f]{64}$/.test(д.sha)) return null;
  if (typeof д.updated !== 'string' || !ДАТА.test(д.updated)) return null;
  if (д.method !== 'table' && д.method !== 'rule') return null;
  return {
    src,
    id,
    год,
    смещение: 300,
    дни: дни as string[][],
    точка: { id: т.id.slice(0, 20), name: т.name.slice(0, 80) },
    метод: д.method,
    обновлено: д.updated,
    sha: д.sha,
  };
}

/** Порядковый номер дня в году (0 — 1 января) для 'ГГГГ-ММ-ДД'; не тот год или кривая строка — −1. */
function номерДня(день: string, год: number): number {
  const р = ДАТА.exec(день);
  if (!р || Number(р[1]) !== год) return -1;
  const мс = Date.UTC(год, Number(р[2]) - 1, Number(р[3]));
  return Math.round((мс - Date.UTC(год, 0, 1)) / 86_400_000);
}

export function временаИзТаблицы(таблица: ТаблицаОфициальная, день: string): ВременаДня | null {
  const н = номерДня(день, таблица.год);
  const с = н >= 0 ? таблица.дни[н] : undefined;
  if (!с) return null;
  const р = ДАТА.exec(день)!;
  const полночь = Date.UTC(Number(р[1]), Number(р[2]) - 1, Number(р[3])) - таблица.смещение * 60_000;
  const итог = { день } as ВременаДня;
  const магриб = минуты(с[4]);
  КЛЮЧИ.forEach((к, i) => {
    let м = минуты(с[i]);
    if (к === 'isha' && м < магриб) м += 1440; // иша после полуночи — уже следующие сутки
    итог[к] = полночь + м * 60_000;
  });
  return итог;
}

type Язык = import('../i18n/languages').Язык;

export const ВЕДОМСТВО_ОФИЦИАЛЬНОЕ: Readonly<Record<ИсточникОфициальный, Record<Язык, string>>> = {
  dumk: { ru: 'ДУМК', kk: 'ҚМДБ', uz: 'QMDB', en: 'SAMK', ar: 'الإدارة الدينية لمسلمي كازاخستان', tr: 'Kazakistan Müslümanları Dini İdaresi', id: 'Dewan Agama Muslim Kazakhstan', ur: 'قازقستان کے مسلمانوں کی دینی انتظامیہ' },
  umuz: { ru: 'Управления мусульман Узбекистана', kk: 'Өзбекстан мұсылмандары басқармасының', uz: 'Oʻzbekiston musulmonlari idorasi', en: 'the Muslim Board of Uzbekistan', ar: 'إدارة مسلمي أوزبكستان', tr: 'Özbekistan Müslümanları İdaresi', id: 'Dewan Muslim Uzbekistan', ur: 'ازبکستان کے مسلمانوں کی انتظامیہ' },
};

/** «По данным ДУМК · обновлено 20.11.2026» / «ҚМДБ деректері бойынша · 20.11.2026 жаңартылды» /
 * «QMDB maʼlumotlari boʻyicha · 20.11.2026 yangilandi» / «Per SAMK data · updated 20.11.2026» (kk, uz и en — черновики).
 * кратко (владелец 28.11.2026: «во многих местах не писать „по ДУМК Казахстана“») — без имени ведомства: «По
 * официальным данным вашей страны · обновлено …» (главная, карточка); полная подпись — экран «Как считаем». */
export function подписьОфициального(src: ИсточникОфициальный, обновлено: string, язык: Язык, { кратко = false }: { кратко?: boolean } = {}): string {
  const р = ДАТА.exec(обновлено);
  const дата = р ? `${р[3]}.${р[2]}.${р[1]}` : обновлено;
  const правило = src === 'umuz';
  if (кратко)
    return {
      ru: `${правило ? 'По официальному правилу' : 'По официальным данным'} вашей страны · обновлено ${дата}`,
      kk: `Еліңіздің ресми ${правило ? 'ережесі' : 'деректері'} бойынша · ${дата} жаңартылды`,
      uz: `Mamlakatingiz rasmiy ${правило ? 'qoidasi' : 'maʼlumotlari'} boʻyicha · ${дата} yangilandi`,
      en: `Per your country's official ${правило ? 'rule' : 'data'} · updated ${дата}`,
      ar: `وفق ${правило ? 'القاعدة الرسمية' : 'البيانات الرسمية'} في بلدك · حُدّث ${дата}`,
      tr: `Ülkenizin resmî ${правило ? 'kuralına' : 'verilerine'} göre · güncelleme ${дата}`,
      id: `Menurut ${правило ? 'aturan' : 'data'} resmi negara Anda · diperbarui ${дата}`,
      ur: `آپ کے ملک کے سرکاری ${правило ? 'قاعدے' : 'اعداد و شمار'} کے مطابق · تازہ کاری ${дата}`,
    }[язык];
  const в = ВЕДОМСТВО_ОФИЦИАЛЬНОЕ[src][язык];
  // УМУз не публикует машиночитаемых таблиц: сервер считает их по правилу и точкам ведомства (как islom.uz) — честно
  // «по правилу», а не «по данным» (ведущий, 20.11.2026). ДУМК — таблица скачана у ведомства: «по данным».
  switch (язык) {
    case 'uz':
      return правило ? `${в} qoidasi boʻyicha · ${дата} yangilandi` : `${в} maʼlumotlari boʻyicha · ${дата} yangilandi`;
    case 'en':
      return правило ? `Per ${в} rule · updated ${дата}` : `Per ${в} data · updated ${дата}`;
    case 'kk':
      return правило ? `${в} ережесі бойынша · ${дата} жаңартылды` : `${в} деректері бойынша · ${дата} жаңартылды`;
    case 'ar':
      return правило ? `وفق قاعدة ${в} · حُدّث ${дата}` : `وفق بيانات ${в} · حُدّث ${дата}`;
    case 'tr':
      return правило ? `${в} kuralına göre · güncelleme ${дата}` : `${в} verilerine göre · güncelleme ${дата}`;
    case 'id':
      return правило ? `Menurut aturan ${в} · diperbarui ${дата}` : `Menurut data ${в} · diperbarui ${дата}`;
    case 'ur':
      return правило ? `${в} کے قاعدے کے مطابق · تازہ کاری ${дата}` : `${в} کے اعداد و شمار کے مطابق · تازہ کاری ${дата}`;
    default:
      return правило ? `По правилу ${в} · обновлено ${дата}` : `По данным ${в} · обновлено ${дата}`;
  }
}
