/**
 * Запись голоса — БРАУЗЕР: MediaRecorder (запись) + AnalyserNode (уровень громкости).
 * Интерфейс, правила приватности и смысл методов — speech/record.ts.
 *
 * Важно:
 * - запись — Blob в памяти страницы + object URL для воспроизведения; сама ничего не
 *   отправляет и не пишет в хранилище (данные() отдаёт Blob только для «Проверить», speech/check.ts);
 * - микрофон (MediaStream) освобождается сразу после остановки: индикатор записи
 *   браузера гаснет; AudioContext закрывается;
 * - уход со страницы или скрытие вкладки останавливают запись;
 * - освободить() отзывает object URL и стирает данные.
 */
import type * as Интерфейс from './record';
import type { ОшибкаЗаписи, СнимокЗаписи, СостояниеЗаписи } from './record';

const ТИПЫ = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const МАКС_ПО_УМОЛЧАНИЮ_МС = 30_000;

type КонструкторКонтекста = typeof AudioContext;

function конструкторКонтекста(): КонструкторКонтекста | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: КонструкторКонтекста; webkitAudioContext?: КонструкторКонтекста };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function выбратьТип(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return ТИПЫ.find((т) => MediaRecorder.isTypeSupported(т));
}

function видОшибки(ошибка: unknown): ОшибкаЗаписи {
  const имя = (ошибка as { name?: unknown } | null)?.name;
  switch (имя) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'нет-доступа';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'нет-микрофона';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'занят';
    case 'NotSupportedError':
      return 'не-поддерживается';
    default:
      return 'неизвестно';
  }
}

export const записьПоддерживается: typeof Интерфейс.записьПоддерживается = () =>
  typeof window !== 'undefined' &&
  typeof window.MediaRecorder === 'function' &&
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function';

export const создатьЗаписьГолоса: typeof Интерфейс.создатьЗаписьГолоса = (настройки) => {
  const максМс = настройки?.максДлительностьМс ?? МАКС_ПО_УМОЛЧАНИЮ_МС;

  let состояние: СостояниеЗаписи = 'ожидание';
  let ошибка: ОшибкаЗаписи | null = null;
  let длительностьМс = 0;
  let снимок: СнимокЗаписи = { состояние, ошибка, длительностьМс, естьЗапись: false };

  let поток: MediaStream | null = null;
  let рекордер: MediaRecorder | null = null;
  let куски: Blob[] = [];
  let контекст: AudioContext | null = null;
  let анализатор: AnalyserNode | null = null;
  let буфер: Float32Array<ArrayBuffer> | null = null;
  let адресЗаписи: string | null = null;
  let blobЗаписи: Blob | null = null;
  let плеер: HTMLAudioElement | null = null;
  let началоМс = 0;
  let таймерАвтостопа: ReturnType<typeof setTimeout> | null = null;
  let таймерСекунд: ReturnType<typeof setInterval> | null = null;
  let освобождён = false;
  const слушатели = new Set<(с: СнимокЗаписи) => void>();

  function сообщить() {
    снимок = { состояние, ошибка, длительностьМс, естьЗапись: адресЗаписи != null };
    for (const слушатель of [...слушатели]) слушатель(снимок);
  }

  function сейчас() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function остановитьТаймеры() {
    if (таймерАвтостопа) clearTimeout(таймерАвтостопа);
    if (таймерСекунд) clearInterval(таймерСекунд);
    таймерАвтостопа = null;
    таймерСекунд = null;
  }

  function освободитьМикрофон() {
    if (поток) for (const дорожка of поток.getTracks()) дорожка.stop();
    поток = null;
    анализатор = null;
    буфер = null;
    if (контекст) void контекст.close().catch(() => {});
    контекст = null;
  }

  function стеретьЗапись() {
    if (плеер) {
      плеер.pause();
      плеер.removeAttribute('src');
      плеер = null;
    }
    if (адресЗаписи) URL.revokeObjectURL(адресЗаписи);
    адресЗаписи = null;
    blobЗаписи = null;
    куски = [];
  }

  function приСкрытии() {
    if (document.visibilityState === 'hidden' && состояние === 'запись') запись.остановить();
  }
  function приУходе() {
    if (состояние === 'запись') запись.остановить();
  }

  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', приСкрытии);
    window.addEventListener('pagehide', приУходе);
  }

  const запись: Интерфейс.ЗаписьГолоса = {
    поддерживается: записьПоддерживается,

    снимок: () => снимок,

    подписаться(слушатель) {
      слушатели.add(слушатель);
      return () => {
        слушатели.delete(слушатель);
      };
    },

    async начать() {
      if (освобождён || состояние === 'запрос' || состояние === 'запись') return;
      запись.остановитьВоспроизведение();
      стеретьЗапись();
      длительностьМс = 0;
      ошибка = null;

      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        ошибка = 'небезопасно';
        состояние = 'ожидание';
        сообщить();
        return;
      }
      if (!записьПоддерживается()) {
        ошибка = 'не-поддерживается';
        состояние = 'ожидание';
        сообщить();
        return;
      }

      состояние = 'запрос';
      сообщить();
      let новыйПоток: MediaStream;
      try {
        новыйПоток = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (е) {
        ошибка = видОшибки(е);
        состояние = 'ожидание';
        сообщить();
        return;
      }
      if (освобождён) {
        for (const дорожка of новыйПоток.getTracks()) дорожка.stop();
        return;
      }
      поток = новыйПоток;

      // Уровень громкости — по желанию: без AudioContext запись всё равно работает.
      const Контекст = конструкторКонтекста();
      if (Контекст) {
        try {
          контекст = new Контекст();
          const источник = контекст.createMediaStreamSource(поток);
          анализатор = контекст.createAnalyser();
          анализатор.fftSize = 1024;
          источник.connect(анализатор);
          буфер = new Float32Array(new ArrayBuffer(анализатор.fftSize * 4));
          if (контекст.state === 'suspended') void контекст.resume().catch(() => {});
        } catch {
          анализатор = null;
          буфер = null;
        }
      }

      try {
        const тип = выбратьТип();
        const новыйРекордер = new MediaRecorder(поток, тип ? { mimeType: тип } : undefined);
        рекордер = новыйРекордер;
        куски = [];
        новыйРекордер.ondataavailable = (событие) => {
          if (событие.data && событие.data.size > 0) куски.push(событие.data);
        };
        новыйРекордер.onstop = () => {
          освободитьМикрофон();
          if (освобождён || рекордер !== новыйРекордер) return;
          рекордер = null;
          if (куски.length > 0) {
            const blob = new Blob(куски, { type: новыйРекордер.mimeType || тип || 'audio/webm' });
            адресЗаписи = URL.createObjectURL(blob);
            blobЗаписи = blob;
          }
          куски = [];
          состояние = адресЗаписи ? 'записано' : 'ожидание';
          if (!адресЗаписи) ошибка = 'неизвестно';
          сообщить();
        };
        новыйРекордер.onerror = () => {
          остановитьТаймеры();
          освободитьМикрофон();
          рекордер = null;
          куски = [];
          ошибка = 'неизвестно';
          состояние = 'ожидание';
          сообщить();
        };
        новыйРекордер.start();
      } catch (е) {
        освободитьМикрофон();
        рекордер = null;
        ошибка = видОшибки(е) === 'неизвестно' ? 'не-поддерживается' : видОшибки(е);
        состояние = 'ожидание';
        сообщить();
        return;
      }

      началоМс = сейчас();
      состояние = 'запись';
      таймерАвтостопа = setTimeout(() => запись.остановить(), максМс);
      таймерСекунд = setInterval(() => {
        длительностьМс = сейчас() - началоМс;
        сообщить();
      }, 250);
      сообщить();
    },

    остановить() {
      if (состояние !== 'запись' || !рекордер) return;
      остановитьТаймеры();
      длительностьМс = сейчас() - началоМс;
      try {
        if (рекордер.state !== 'inactive') рекордер.stop(); // onstop соберёт запись
      } catch {
        освободитьМикрофон();
        рекордер = null;
        ошибка = 'неизвестно';
        состояние = 'ожидание';
        сообщить();
      }
    },

    async воспроизвести() {
      if (освобождён || !адресЗаписи || состояние === 'запись' || состояние === 'запрос') return;
      запись.остановитьВоспроизведение();
      const новыйПлеер = new Audio(адресЗаписи);
      плеер = новыйПлеер;
      новыйПлеер.onended = () => {
        if (плеер !== новыйПлеер) return;
        плеер = null;
        состояние = 'записано';
        сообщить();
      };
      состояние = 'воспроизведение';
      сообщить();
      try {
        await новыйПлеер.play();
      } catch {
        if (плеер === новыйПлеер) {
          плеер = null;
          состояние = адресЗаписи ? 'записано' : 'ожидание';
          сообщить();
        }
      }
    },

    остановитьВоспроизведение() {
      if (!плеер) return;
      плеер.pause();
      плеер = null;
      if (состояние === 'воспроизведение') {
        состояние = 'записано';
        сообщить();
      }
    },

    удалить() {
      if (состояние === 'запись' || состояние === 'запрос') return;
      стеретьЗапись();
      длительностьМс = 0;
      состояние = 'ожидание';
      сообщить();
    },

    данные() {
      return освобождён || состояние === 'запись' || состояние === 'запрос' ? null : blobЗаписи;
    },

    уровень() {
      if (состояние !== 'запись' || !анализатор || !буфер) return 0;
      анализатор.getFloatTimeDomainData(буфер);
      let сумма = 0;
      for (let i = 0; i < буфер.length; i += 1) сумма += буфер[i] * буфер[i];
      const rms = Math.sqrt(сумма / буфер.length);
      const дб = 20 * Math.log10(rms + 1e-8);
      return Math.min(1, Math.max(0, (дб + 60) / 50));
    },

    освободить() {
      if (освобождён) return;
      освобождён = true;
      остановитьТаймеры();
      if (рекордер) {
        рекордер.ondataavailable = null;
        рекордер.onstop = null;
        рекордер.onerror = null;
        try {
          if (рекордер.state !== 'inactive') рекордер.stop();
        } catch {
          // уже остановлен
        }
        рекордер = null;
      }
      освободитьМикрофон();
      стеретьЗапись();
      слушатели.clear();
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', приСкрытии);
        window.removeEventListener('pagehide', приУходе);
      }
    },
  };

  return запись;
};
