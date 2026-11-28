/**
 * «Войти через Google» — Google Identity Services, скрипт грузится ТОЛЬКО по нажатию (владелец 28.11.2026: «Google
 * авторизация»; решение по приватности: без нажатия Google не должен видеть посещение — ни скрипта, ни запросов).
 *
 * Как: нажали «Войти через Google» → <script src="https://accounts.google.com/gsi/client"> → initialize(client ID с
 * сервера, /api/account/config) → на месте нашей кнопки — кнопка Google (renderButton: её нажатие открывает окно Google;
 * браузеры не дают открыть окно не из нажатия, поэтому два нажатия) → credential (ID token) → server/account.py проверяет
 * подпись, aud, iss, exp, email_verified и берёт только почту и sub. CSP (scripts/after-export.mjs): script-src
 * …/gsi/client, frame-src и connect-src …/gsi/, style-src …/gsi/style — только эти адреса.
 *
 * Контракт: войтиЧерезGoogle({ clientId, контейнер (id узла), язык, тёмная, приВходе(credential) }) →
 *   Promise<'ок' | 'нет-сети' | 'ошибка'> — 'ок': кнопка Google показана (дальше — приВходе после выбора аккаунта).
 */
export const АДРЕС_GIS = 'https://accounts.google.com/gsi/client';

type GIS = {
  accounts: {
    id: {
      initialize: (н: Record<string, unknown>) => void;
      renderButton: (узел: HTMLElement, н: Record<string, unknown>) => void;
      prompt: () => void;
    };
  };
};

let загрузка: Promise<GIS> | null = null;

function загрузить(): Promise<GIS> {
  const г = (globalThis as { google?: GIS }).google;
  if (г?.accounts?.id) return Promise.resolve(г);
  if (!загрузка) {
    загрузка = new Promise<GIS>((готово, отказ) => {
      const с = document.createElement('script');
      с.src = АДРЕС_GIS;
      с.async = true;
      с.onload = () => {
        const g = (globalThis as { google?: GIS }).google;
        if (g?.accounts?.id) готово(g);
        else отказ(new Error('gis'));
      };
      с.onerror = () => {
        загрузка = null;
        с.remove();
        отказ(new Error('сеть'));
      };
      document.head.appendChild(с);
    });
  }
  return загрузка;
}

export async function войтиЧерезGoogle(н: {
  clientId: string;
  контейнер: string;
  язык: string;
  тёмная: boolean;
  приВходе: (credential: string) => void | Promise<void>;
}): Promise<'ок' | 'нет-сети' | 'ошибка'> {
  let g: GIS;
  try {
    g = await загрузить();
  } catch (е) {
    return (е as Error).message === 'сеть' ? 'нет-сети' : 'ошибка';
  }
  const узел = document.getElementById(н.контейнер);
  if (!узел) return 'ошибка';
  try {
    g.accounts.id.initialize({
      client_id: н.clientId,
      callback: (о: { credential?: string }) => {
        if (typeof о?.credential === 'string') void н.приВходе(о.credential);
      },
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
      itp_support: true,
    });
    g.accounts.id.renderButton(узел, {
      type: 'standard',
      theme: н.тёмная ? 'filled_black' : 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      locale: н.язык,
      width: Math.min(320, Math.max(200, узел.clientWidth || 320)),
    });
  } catch {
    return 'ошибка';
  }
  return 'ок';
}
