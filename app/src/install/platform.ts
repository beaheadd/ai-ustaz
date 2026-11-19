/**
 * Установка AI Ustaz на телефон — где открыта страница и что показать (чистые функции, без импортов).
 *
 * Назначение: экран «Установить приложение» (#/install) и подсказка на главной решают по этим функциям, как
 * поставить AI Ustaz на экран «Домой»: кнопка Chrome (beforeinstallprompt), меню браузера, «Поделиться» в Safari,
 * «откройте в браузере» во встроенных браузерах соцсетей, «откройте на телефоне» на компьютере.
 * Тест — scripts/test-install.mjs (разные userAgent).
 *
 * Контракт:
 *   видХоста(хост) → 'свой' (aiustaz.pro, www) | 'batr' (batr.kz и поддомены) | 'другой' (localhost, тест);
 *   определитьСреду({ ua, касаний?, автономно?, источник?, реферер?, хост? }) → Среда:
 *     ос — 'android' | 'ios' | 'другая' (iPad в «режиме компьютера» — iOS по касаниям);
 *     браузер — 'chrome' | 'edge' | 'samsung' | 'firefox' | 'yandex' | 'opera' | 'safari' | 'chrome-ios' |
 *               'firefox-ios' | 'edge-ios' | 'другой';
 *     встроенный — имя встроенного браузера ('Instagram', 'Facebook', 'Telegram', 'WhatsApp', 'TikTok', …) или null;
 *     версияIOS — [старшая, младшая] или null;
 *     установлено — открыто как приложение: display-mode standalone / navigator.standalone (iOS) / TWA
 *       (реферер android-app://) / запуск со start_url (?source=pwa|twa);
 *     хост — видХоста(хост).
 *   сценарий(среда, естьПредложение) → какой блок показать:
 *     'установлено' → 'batr' (ставить с aiustaz.pro) → 'встроенный' → Android: 'кнопка' (пришло beforeinstallprompt)
 *     или 'android-меню'; iOS: 'ios-safari' | 'ios-поделиться' (другие браузеры iOS ≥ 16.4) | 'ios-только-safari';
 *     прочее — 'компьютер'.
 *   этоТелефон(среда) — Android или iOS.
 *   АДРЕС_САЙТА, АДРЕС_УСТАНОВКИ — свой домен (ставить — только оттуда: там проверка голосом, QML).
 * Решение владельца 19.11.2026: «Сразу нужно сделать ещё TWA приложение для загрузки из сайта и объяснение в APPLE,
 * чтобы добавить на рабочий стол». Ничего не отправляет и не сохраняет; userAgent читается только на устройстве.
 */

export const АДРЕС_САЙТА = 'https://aiustaz.pro/';
export const АДРЕС_УСТАНОВКИ = 'https://aiustaz.pro/aiustaz/#/install';

export type ВидХоста = 'свой' | 'batr' | 'другой';
export type ОС = 'android' | 'ios' | 'другая';
export type Браузер =
  | 'chrome'
  | 'edge'
  | 'samsung'
  | 'firefox'
  | 'yandex'
  | 'opera'
  | 'safari'
  | 'chrome-ios'
  | 'firefox-ios'
  | 'edge-ios'
  | 'другой';

export type ВходСреды = {
  ua: string;
  /** navigator.maxTouchPoints (iPad в «режиме компьютера» выдаёт себя за Mac). */
  касаний?: number;
  /** matchMedia('(display-mode: standalone|fullscreen|minimal-ui)') или navigator.standalone. */
  автономно?: boolean;
  /** Параметр ?source= адреса (start_url манифеста — pwa, TWA — twa). */
  источник?: string | null;
  /** document.referrer (TWA открывает страницу с android-app://<пакет>). */
  реферер?: string;
  хост?: string;
};

export type Среда = {
  ос: ОС;
  браузер: Браузер;
  встроенный: string | null;
  версияIOS: [number, number] | null;
  установлено: boolean;
  хост: ВидХоста;
};

export type Сценарий =
  | 'установлено'
  | 'batr'
  | 'встроенный'
  | 'кнопка'
  | 'android-меню'
  | 'ios-safari'
  | 'ios-поделиться'
  | 'ios-только-safari'
  | 'компьютер';

const СВОИ = ['aiustaz.pro', 'www.aiustaz.pro'];

export function видХоста(хост: string | undefined | null): ВидХоста {
  const х = String(хост ?? '').trim().toLowerCase().replace(/\.+$/, '');
  if (х === 'batr.kz' || х.endsWith('.batr.kz')) return 'batr';
  if (СВОИ.includes(х)) return 'свой';
  return 'другой';
}

/** Встроенные браузеры приложений: [образец в userAgent, имя для текста]. Порядок важен (Facebook раньше общего wv). */
const ВСТРОЕННЫЕ: [RegExp, string][] = [
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB|FBIOS|\[FB/i, 'Facebook'],
  [/Telegram/i, 'Telegram'],
  [/WhatsApp/i, 'WhatsApp'],
  [/musical_ly|TikTok|BytedanceWebview|trill_/i, 'TikTok'],
  [/\bLine\//i, 'LINE'],
  [/Snapchat/i, 'Snapchat'],
  [/VKAndroidApp|vkclient|com\.vkontakte/i, 'VK'],
  [/Threads/i, 'Threads'],
];

function версияIOSИз(ua: string): [number, number] | null {
  const м = ua.match(/OS (\d+)[_.](\d+)/) ?? ua.match(/Version\/(\d+)\.(\d+)/);
  return м ? [Number(м[1]), Number(м[2])] : null;
}

export function определитьСреду(вход: ВходСреды): Среда {
  const ua = String(вход.ua ?? '');
  const касаний = вход.касаний ?? 0;
  const android = /Android/i.test(ua);
  const ios = !android && (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && касаний > 1));
  const ос: ОС = android ? 'android' : ios ? 'ios' : 'другая';

  let встроенный: string | null = ВСТРОЕННЫЕ.find(([образец]) => образец.test(ua))?.[1] ?? null;
  // Обычный Android WebView (чужое приложение без своего имени в userAgent): «; wv)».
  if (!встроенный && android && /;\s*wv\)/.test(ua)) встроенный = 'WebView';

  let браузер: Браузер = 'другой';
  if (ios) {
    if (/CriOS/i.test(ua)) браузер = 'chrome-ios';
    else if (/FxiOS/i.test(ua)) браузер = 'firefox-ios';
    else if (/EdgiOS/i.test(ua)) браузер = 'edge-ios';
    else if (/OPiOS|YaBrowser|GSA\/|DuckDuckGo|Mercury|Brave/i.test(ua)) браузер = 'другой';
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) браузер = 'safari';
  } else if (android) {
    if (/SamsungBrowser/i.test(ua)) браузер = 'samsung';
    else if (/EdgA\//i.test(ua)) браузер = 'edge';
    else if (/Firefox\//i.test(ua)) браузер = 'firefox';
    else if (/YaBrowser|YaApp_Android/i.test(ua)) браузер = 'yandex';
    else if (/OPR\/|Opera/i.test(ua)) браузер = 'opera';
    else if (/MiuiBrowser|HuaweiBrowser|HeyTapBrowser|UCBrowser|VivoBrowser/i.test(ua)) браузер = 'другой';
    else if (/Chrome\//.test(ua)) браузер = 'chrome';
  } else {
    if (/Edg\//.test(ua)) браузер = 'edge';
    else if (/Firefox\//.test(ua)) браузер = 'firefox';
    else if (/OPR\//.test(ua)) браузер = 'opera';
    else if (/YaBrowser/.test(ua)) браузер = 'yandex';
    else if (/Chrome\//.test(ua)) браузер = 'chrome';
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) браузер = 'safari';
  }

  const источник = String(вход.источник ?? '').toLowerCase();
  const установлено =
    вход.автономно === true || источник === 'pwa' || источник === 'twa' || String(вход.реферер ?? '').startsWith('android-app://');

  return { ос, браузер, встроенный, версияIOS: ios ? версияIOSИз(ua) : null, установлено, хост: видХоста(вход.хост) };
}

export function этоТелефон(среда: Среда): boolean {
  return среда.ос === 'android' || среда.ос === 'ios';
}

/** «На экран „Домой“» из меню «Поделиться» в Chrome, Firefox, Edge на iOS — с iOS 16.4. */
function поделитьсяВДругихIOS(среда: Среда): boolean {
  const в = среда.версияIOS;
  return !!в && (в[0] > 16 || (в[0] === 16 && в[1] >= 4)) && среда.браузер !== 'другой';
}

export function сценарий(среда: Среда, естьПредложение: boolean): Сценарий {
  if (среда.установлено) return 'установлено';
  if (среда.хост === 'batr') return 'batr';
  if (среда.встроенный) return 'встроенный';
  if (среда.ос === 'android') return естьПредложение ? 'кнопка' : 'android-меню';
  if (среда.ос === 'ios') {
    if (среда.браузер === 'safari') return 'ios-safari';
    return поделитьсяВДругихIOS(среда) ? 'ios-поделиться' : 'ios-только-safari';
  }
  return 'компьютер';
}
