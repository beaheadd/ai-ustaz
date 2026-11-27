/**
 * Своя статистика посещений: какие экраны открывали и сколько времени. Только на aiustaz.pro, только своему серверу.
 *
 * Владелец 27.11.2026: «Сколько человек зашло, сколько человек пользовались, какие страницы смотрели, сколько времени
 * находились на сайте… начнем уже фиксировать людей». Сервер и админка — server/stats.py, admin/;
 * docs/дизайн/12-админка-и-статистика.md. CLAUDE.md: без рекламы, рекламного трекинга и сторонней аналитики.
 *
 * Что уходит (POST /api/stats/e, свой домен, без cookie): случайный анонимный id устройства (localStorage
 * aiustaz:sid.v1) и сеанса, язык, класс устройства (phone/tablet/desktop, семейство ОС — без строки браузера),
 * открыто ли как установленное приложение, откуда пришли (только домен, в начале сеанса), путь экрана латиницей
 * (quran/sura) и номер (сура, хадис, урок), пульс раз в 30 с, пока страница видна. Ни города, ни координат, ни
 * текста поиска, ни записей голоса.
 * Не отправляем: не веб; не aiustaz.pro (batr.kz, тесты) — кроме флага localStorage «aiustaz:stats-test» = «1» для
 * e2e; при «Не отслеживать» (doNotTrack / globalPrivacyControl); когда человек выключил в «Ещё» → «Статистика».
 *
 * Контракт:
 *   статистикаВключена() / задатьСтатистику(вкл) — переключатель (localStorage aiustaz:stats-off.v1 = «1» — выключено)
 *   можноСчитать() — все условия выше
 *   запуститьСтатистику(язык: () => string) → стоп()  — из App.tsx один раз: пульс, отправка при скрытии
 *   отметитьЭкран(хэш) — при смене верхнего экрана ('#/quran/sura?n=2&a=5' → экран quran/sura, номер 2)
 *   ключЭкрана(хэш) → { s, n? } — чистая
 */
import { Platform } from 'react-native';
import { видХоста } from '../install/platform';

const КЛЮЧ_ID = 'aiustaz:sid.v1';
const КЛЮЧ_ВЫКЛ = 'aiustaz:stats-off.v1';
const КЛЮЧ_ТЕСТА = 'aiustaz:stats-test';
const АДРЕС = '/api/stats/e';
const ПУЛЬС_МС = 30_000;
const ТИШИНА_МС = 30 * 60_000;

type Событие = { t: 'o' | 'v' | 'b'; s?: string; n?: number; d?: number };

let очередь: Событие[] = [];
let сеанс = '';
let последняя = 0;
let экран = '';
let отсчёт = 0;
let язык: () => string = () => '-';
let откуда = '';

function хранилище(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function случайный(): string {
  const б = new Uint8Array(15);
  crypto.getRandomValues(б);
  return btoa(String.fromCharCode(...б)).replace(/\+/g, '-').replace(/\//g, '_');
}

export function статистикаВключена(): boolean {
  return хранилище()?.getItem(КЛЮЧ_ВЫКЛ) !== '1';
}

export function задатьСтатистику(вкл: boolean): void {
  const х = хранилище();
  try {
    if (вкл) х?.removeItem(КЛЮЧ_ВЫКЛ);
    else х?.setItem(КЛЮЧ_ВЫКЛ, '1');
  } catch {
    // нет хранилища — останется как было
  }
  if (!вкл) очередь = [];
}

export function можноСчитать(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!статистикаВключена()) return false;
  const н = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (н.doNotTrack === '1' || н.globalPrivacyControl === true) return false;
  if (видХоста(window.location?.hostname) === 'свой') return true;
  return хранилище()?.getItem(КЛЮЧ_ТЕСТА) === '1';
}

export function ключЭкрана(хэш: string): { s: string; n?: number } {
  const [путь, запрос = ''] = хэш.replace(/^#\/?/, '').split('?');
  const части = путь.split('/').filter(Boolean);
  let n: number | undefined;
  const м = /(?:^|&)n=(\d{1,6})(?:&|$)/.exec(запрос);
  if (м) n = Number(м[1]);
  else if (части.length > 1 && /^\d{1,6}$/.test(части[части.length - 1])) n = Number(части.pop());
  const s = части.join('/').toLowerCase().replace(/[^a-z0-9/-]/g, '').slice(0, 40);
  return n === undefined ? { s } : { s, n };
}

function устройство(): { dev: string; os: string } {
  const u = navigator.userAgent || '';
  const os = /Android/i.test(u) ? 'android' : /iPhone|iPad|iPod/i.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? 'ios'
    : /Windows/i.test(u) ? 'windows' : /Macintosh/i.test(u) ? 'mac' : /Linux/i.test(u) ? 'linux' : 'other';
  const dev = /iPad|Tablet/i.test(u) || (os === 'android' && !/Mobile/i.test(u)) || (os === 'ios' && !/iPhone|iPod/.test(u)) ? 'tablet'
    : /Mobi|iPhone|Android/i.test(u) ? 'phone' : 'desktop';
  return { dev, os };
}

function установлено(): boolean {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

function sid(): string {
  const х = хранилище();
  let з = х?.getItem(КЛЮЧ_ID) ?? '';
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(з)) {
    з = случайный();
    try {
      х?.setItem(КЛЮЧ_ID, з);
    } catch {
      // без хранилища — id на один заход
    }
  }
  return з;
}

/** Новый сеанс после 30 минут тишины (и при первом событии). */
function продлить(сейчас: number): void {
  if (!сеанс || сейчас - последняя > ТИШИНА_МС) {
    сеанс = случайный();
    очередь.push({ t: 'o' });
    if (!откуда) {
      try {
        const х = document.referrer ? new URL(document.referrer).hostname : '';
        откуда = видХоста(х) === 'другой' ? х.replace(/^www\./, '').slice(0, 40) : '';
      } catch {
        откуда = '';
      }
    }
  }
  последняя = сейчас;
}

function отправить(при_уходе: boolean): void {
  if (!очередь.length || !можноСчитать()) {
    очередь = [];
    return;
  }
  const { dev, os } = устройство();
  const тело = JSON.stringify({
    v: 1, sid: sid(), sess: сеанс, lang: язык(), dev, os, st: установлено() ? 1 : 0, ref: откуда, ver: '',
    ev: очередь.splice(0, 60),
  });
  откуда = '';
  try {
    if (при_уходе && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(АДРЕС, new Blob([тело], { type: 'application/json' }));
    } else {
      void fetch(АДРЕС, { method: 'POST', body: тело, headers: { 'Content-Type': 'application/json' }, credentials: 'omit', keepalive: true })
        .catch(() => undefined);
    }
  } catch {
    // статистика не должна мешать приложению
  }
}

function пульс(при_уходе = false): void {
  const сейчас = Date.now();
  if (отсчёт) {
    const d = Math.min(60, Math.round((сейчас - отсчёт) / 1000));
    if (d > 0) {
      продлить(сейчас);
      очередь.push({ t: 'b', s: экран, d });
    }
  }
  отсчёт = document.visibilityState === 'visible' && !при_уходе ? сейчас : 0;
  отправить(при_уходе);
}

export function отметитьЭкран(хэш: string): void {
  if (!можноСчитать()) return;
  const сейчас = Date.now();
  if (отсчёт) пульс(); // время — прежнему экрану
  const к = ключЭкрана(хэш);
  экран = к.s;
  продлить(сейчас);
  очередь.push({ t: 'v', ...к });
  if (!отсчёт && document.visibilityState === 'visible') отсчёт = сейчас;
  отправить(false);
}

export function запуститьСтатистику(получитьЯзык: () => string): () => void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return () => undefined;
  язык = получитьЯзык;
  отсчёт = document.visibilityState === 'visible' ? Date.now() : 0;
  const таймер = setInterval(() => {
    if (можноСчитать() && document.visibilityState === 'visible') пульс();
  }, ПУЛЬС_МС);
  const видимость = () => {
    if (!можноСчитать()) return;
    if (document.visibilityState === 'hidden') пульс(true);
    else {
      отсчёт = Date.now();
      if (Date.now() - последняя > ТИШИНА_МС) {
        продлить(Date.now());
        очередь.push({ t: 'v', s: экран });
        отправить(false);
      }
    }
  };
  const уход = () => можноСчитать() && пульс(true);
  document.addEventListener('visibilitychange', видимость);
  window.addEventListener('pagehide', уход);
  return () => {
    clearInterval(таймер);
    document.removeEventListener('visibilitychange', видимость);
    window.removeEventListener('pagehide', уход);
  };
}
