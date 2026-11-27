/**
 * Голосовой вопрос в чат AI Ustaz: запись с микрофона и жест 🎤 «как в WhatsApp» (тап — запись со «Стоп» и ✕;
 * удержание — отпустил → распознать, сдвинул влево → отмена). Чистые функции + запись (среда передаётся снаружи).
 *
 * Источник: beaheadd/aialem@b72d5e5 web/src/educat/ui/asktutor.js (раздел «Голосовой вопрос» и «Жест 🎤») —
 * переписано на TypeScript; изменено: лимит записи 30 с (сервер AI Ustaz берёт ≤ 1,5 МБ ≈ 30 с), нет base64-тела (запись
 * уходит сырым телом на НАШ сервер /api/ask/voice), нет распознавания «на лету» через внешний сервис (CLAUDE.md: речь —
 * только на своих серверах в РК; аудио во внешние API не отправляем). docs/источники-кода.md.
 * Запись живёт только в памяти до отправки; на телефоне и на сервере не хранится.
 */

export const ГОЛОС_МАКС_С = 30;
export const ГОЛОС_МАКС_БАЙТ = 1_500_000;
export const ГОЛОС_МИН_МС = 700;
const БИТРЕЙТ = 32000;
const ТИПЫ = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];

type Окно = { MediaRecorder?: unknown; navigator?: { mediaDevices?: { getUserMedia?: unknown } }; isSecureContext?: boolean };

/** Можно ли записать голос: MediaRecorder + getUserMedia в защищённом контексте. */
export function голосПоддерживается(окно?: Окно): boolean {
  try {
    const w = окно ?? (typeof window !== 'undefined' ? (window as unknown as Окно) : {});
    return typeof w.MediaRecorder === 'function' && typeof w.navigator?.mediaDevices?.getUserMedia === 'function' && w.isSecureContext !== false;
  } catch {
    return false;
  }
}

export function выбратьТип(поддерживается?: (т: string) => boolean): string {
  if (typeof поддерживается !== 'function') return '';
  for (const т of ТИПЫ) {
    try {
      if (поддерживается(т)) return т;
    } catch {
      /* ок */
    }
  }
  return '';
}

/** Ошибка микрофона → 'запрещён' | 'нет' | 'сбой'. */
export function ошибкаМикрофона(е: unknown): 'запрещён' | 'нет' | 'сбой' {
  const имя = String((е as { name?: string } | null)?.name || '');
  if (/NotAllowed|Security|PermissionDenied/.test(имя)) return 'запрещён';
  if (/NotFound|DevicesNotFound|Overconstrained/.test(имя)) return 'нет';
  return 'сбой';
}

export function ммсс(сек: number): string {
  const с = Math.max(0, Math.floor(Number(сек) || 0));
  return Math.floor(с / 60) + ':' + String(с % 60).padStart(2, '0');
}

/** Распознанный текст — в поле: пустое — сам текст, иначе через пробел; не длиннее макс. */
export function добавитьСказанное(было: string, сказано: string, макс = 500): string {
  const а = String(было || '').replace(/\s+$/, '');
  const б = String(сказано || '').trim();
  if (!б) return String(было || '');
  return (а ? а + ' ' + б : б).slice(0, макс);
}

type Рекордер = {
  state: string;
  mimeType?: string;
  start(ms?: number): void;
  stop(): void;
  ondataavailable: ((е: { data?: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
};
type КлассРекордера = { new (поток: MediaStream, параметры?: object): Рекордер; isTypeSupported?: (т: string) => boolean };
export type СредаЗаписи = {
  getUserMedia: (о: MediaStreamConstraints) => Promise<MediaStream>;
  Recorder: КлассРекордера;
  сейчас?: () => number;
  макс?: number;
  наТик?: (сек: number) => void;
};
export type Запись = { стоп(): void; отмена(): void; тип: string; готово: Promise<{ blob: Blob; мс: number } | null> };

/** Запись с микрофона; микрофон выключается сразу после остановки; на «макс» секундах — авто-стоп. */
export async function начатьЗапись(среда: СредаЗаписи): Promise<Запись> {
  const сейчас = среда.сейчас ?? (() => Date.now());
  const макс = среда.макс ?? ГОЛОС_МАКС_С;
  const поток = await среда.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const выключить = () => {
    try {
      поток.getTracks().forEach((д) => д.stop());
    } catch {
      /* ок */
    }
  };
  const тип = выбратьТип(среда.Recorder.isTypeSupported ? (т) => среда.Recorder.isTypeSupported!(т) : undefined);
  let р: Рекордер;
  try {
    р = new среда.Recorder(поток, тип ? { mimeType: тип, audioBitsPerSecond: БИТРЕЙТ } : { audioBitsPerSecond: БИТРЕЙТ });
  } catch {
    try {
      р = new среда.Recorder(поток);
    } catch (е) {
      выключить();
      throw е;
    }
  }
  const куски: Blob[] = [];
  const т0 = сейчас();
  let отменено = false;
  let таймер: ReturnType<typeof setInterval> | null = null;
  let кончено = false;
  const готово = new Promise<{ blob: Blob; мс: number } | null>((решить) => {
    const конец = (ок: boolean) => {
      if (кончено) return;
      кончено = true;
      if (таймер != null) clearInterval(таймер);
      выключить();
      if (!ок || отменено) return решить(null);
      const т = р.mimeType || тип || куски[0]?.type || '';
      решить({ blob: new Blob(куски, т ? { type: т } : {}), мс: сейчас() - т0 });
    };
    р.ondataavailable = (е) => {
      if (е?.data?.size) куски.push(е.data);
    };
    р.onstop = () => конец(true);
    р.onerror = () => конец(false);
  });
  const стоп = () => {
    try {
      if (р.state !== 'inactive') р.stop();
    } catch {
      /* ок */
    }
  };
  try {
    р.start(1000);
  } catch (е) {
    выключить();
    throw е;
  }
  таймер = setInterval(() => {
    const сек = (сейчас() - т0) / 1000;
    try {
      среда.наТик?.(Math.min(сек, макс));
    } catch {
      /* ок */
    }
    if (сек >= макс) стоп();
  }, 250);
  return { стоп, отмена: () => ((отменено = true), стоп()), тип, готово };
}

// ── Жест 🎤 ──
export const УДЕРЖАНИЕ_МС = 250;
export const УДЕРЖАНИЕ_МИН_МС = 700;
export const СДВИГ_ОТМЕНЫ = 80;
export const ДАЛЕКО = 120;

export function сдвигОтменяет(dx: number, заКраем: number): boolean {
  return (Number(dx) || 0) <= -СДВИГ_ОТМЕНЫ || (Number(заКраем) || 0) >= ДАЛЕКО;
}
export function заКраем(р: { left: number; right: number; top: number; bottom: number } | null, x: number, y: number): number {
  if (!р) return 0;
  const д = Math.max(0, р.left - x, x - р.right, р.top - y, y - р.bottom);
  return Number.isFinite(д) ? д : 0;
}
export function сдвигПодсказки(dx: number): number {
  return Math.max(-СДВИГ_ОТМЕНЫ, Math.min(0, Math.round(Number(dx) || 0)));
}
/** Отпустили палец → 'тап' | 'разрешить' | 'отмена' | 'коротко' | 'отправить' (как micRelease Айалема). */
export function отпустили(мс: number, идёт: boolean, отмена: boolean): 'тап' | 'разрешить' | 'отмена' | 'коротко' | 'отправить' {
  const т = Number(мс) || 0;
  if (т < УДЕРЖАНИЕ_МС) return 'тап';
  if (!идёт) return 'разрешить';
  if (отмена) return 'отмена';
  if (т < УДЕРЖАНИЕ_МИН_МС) return 'коротко';
  return 'отправить';
}
