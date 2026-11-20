#!/usr/bin/env node
/**
 * Сквозной тест экрана «Кибла» (#/qibla) в веб-сборке (Playwright, Chromium). Ориентацию телефона
 * эмулирует сам тест: события deviceorientationabsolute (Android) и deviceorientation с webkitCompassHeading
 * (iOS, requestPermission подменён в addInitScript). Город — по умолчанию Астана (кибла 231,5°, склонение +10,1°).
 *   1. десктоп 1280×800 (без сенсорного экрана — кнопки нет): датчиков нет → через 3 с «Компаса на этом
 *      устройстве нет», схема «север вверху»
 *      (угол 231°, юго-запад, дуга), «встаньте лицом на юг — вправо на N°», полдень по солнцу; отметки «верх
 *      телефона» нет; без горизонтальной прокрутки;
 *   2. телефон (Android): курс приходит без нажатия (кнопка исчезает); магнитный 200° → истинный 210,1° →
 *      роза повёрнута на −210,1°, «Повернитесь
 *      правее на 21°»; курс 221,4° (+10,1° = кибла) → «Вы смотрите в сторону киблы» и золотая обводка;
 *      телефон стоит — «Положите телефон горизонтально»; скачущий курс — «Стрелка неустойчива»;
 *   3. телефон (iOS): кнопка «Включить компас» → requestPermission по нажатию → webkitCompassHeading
 *      с точностью 30° → поворот и «Компас не откалиброван» с «восьмёркой»; отказ → понятный текст;
 *   4. казахский интерфейс: «Құбыла», «оңтүстік-батыс»; тёмная тема; узкий телефон 360 px;
 *   5. ориентиры по солнцу на фиксированное время (Date подменён): солнце сейчас, в стороне киблы, «над Каабой»;
 *   6. город — общий с временем намаза: «Сменить» → #/prayer-city → Алматы → 247°, после перезагрузки сохранён;
 * и всё время: ни ошибок в консоли, ни запросов на другой адрес, ни нарушений CSP, ни звука (<audio>/<video> нет).
 *
 * Запуск (из app/, после сборки):
 *   node scripts/e2e-qibla.mjs                       — сервер serve-test.mjs на app/dist (или DIST=папка)
 *   SCREENSHOTS=/папка node scripts/e2e-qibla.mjs   — снимки для владельца (deviceScaleFactor 2): кибла-*.png
 * Из scripts/e2e.mjs вызывается как киблаСквозной(браузер, адрес) (E2E_QIBLA=0 — пропустить).
 * Решение владельца 19.11.2026: «Всё ставь — время намаза и выбор киблы».
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { запуститьСервер } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const КЛЮЧ = 'aiustaz:progress.v1';
const прогресс = (язык) => ({ версия: 1, язык, предупреждениеПоказано: true, пояснениеМикрофонаПоказано: false, согласиеПроверкиГолосом: false, уроки: {}, дниЗанятий: [] });

/**
 * @param браузер Chromium из Playwright
 * @param база адрес тестового сервера (http://127.0.0.1:порт)
 * @param снимки папка для снимков владельцу (deviceScaleFactor 2) или null
 * @returns число пройденных проверок; бросает Error при первой неудаче
 */
export async function киблаСквозной(браузер, база, { снимки = process.env.SCREENSHOTS ?? null } = {}) {
  let проверок = 0;
  const масштаб = снимки ? 2 : 1;
  if (снимки) fs.mkdirSync(снимки, { recursive: true });

  async function открыть(профиль, { язык = 'ru', тёмная = false, ios = null, время = null } = {}) {
    const контекст = await браузер.newContext({ ...профиль, deviceScaleFactor: масштаб, locale: 'ru-RU', colorScheme: тёмная ? 'dark' : 'light' });
    await контекст.addInitScript(
      ({ ключ, значение, ios }) => {
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (е) => window.__csp.push(е.blockedURI + ' ' + е.violatedDirective));
        try {
          if (!localStorage.getItem(ключ)) localStorage.setItem(ключ, JSON.stringify(значение));
        } catch {}
        if (ios) {
          window.__запросовРазрешения = 0;
          window.DeviceOrientationEvent.requestPermission = async () => {
            window.__запросовРазрешения += 1;
            return ios;
          };
        }
      },
      { ключ: КЛЮЧ, значение: прогресс(язык), ios },
    );
    const стр = await контекст.newPage();
    const проблемы = [];
    стр.on('request', (з) => {
      const u = з.url();
      if (!u.startsWith(база + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) проблемы.push('запрос на другой адрес: ' + u);
    });
    стр.on('console', (с) => {
      if (с.type() === 'error') проблемы.push('ошибка в консоли: ' + с.text());
    });
    стр.on('pageerror', (о) => проблемы.push('исключение на странице: ' + о.message));
    if (время) await стр.clock.setFixedTime(new Date(время)); // Date — фиксированный, таймеры идут
    await стр.goto(база + '/aiustaz/index.html#/qibla');
    await стр.getByTestId('экран-кибла').first().waitFor({ timeout: 15000 });
    return { контекст, стр, проблемы };
  }

  const проверить = (условие, что) => {
    проверок += 1;
    if (!условие) throw new Error('[кибла] НЕ ВЫПОЛНЕНО: ' + что);
    console.log('  ✓ ' + что);
  };
  const текстИд = (стр, id) => стр.getByTestId(id).first().innerText();
  const виден = async (стр, id) => (await стр.getByTestId(id).count()) > 0 && (await стр.getByTestId(id).first().isVisible());
  const ждать = (стр, id, мс = 5000) => стр.getByTestId(id).first().waitFor({ state: 'visible', timeout: мс });
  const поворотРозы = (стр) =>
    стр.evaluate(() => document.querySelector('[data-testid="кибла-циферблат"] svg > g')?.getAttribute('transform') ?? '');
  /** Снимок владельцу. весь — во всю высоту содержимого: экран прокручивает свой ScrollView, поэтому окно
   *  на время снимка вытягивается до высоты содержимого (fullPage страницы тут ничего не даёт). */
  const снимок = async (стр, имя, весь = true) => {
    if (!снимки) return;
    await стр.waitForTimeout(200);
    const окно = стр.viewportSize();
    if (весь && окно) {
      const высота = await стр.evaluate(() =>
        Math.max(window.innerHeight, ...[...document.querySelectorAll('*')].filter((э) => э.scrollHeight > э.clientHeight + 1 && getComputedStyle(э).overflowY !== 'visible').map((э) => э.scrollHeight + (window.innerHeight - э.clientHeight))),
      );
      await стр.setViewportSize({ width: окно.width, height: Math.min(высота, 4000) });
      await стр.waitForTimeout(200);
    }
    await стр.screenshot({ path: path.join(снимки, `кибла-${имя}.png`) });
    if (весь && окно) await стр.setViewportSize(окно);
  };
  const безПроблем = async (стр, проблемы, где) => {
    const csp = await стр.evaluate(() => window.__csp ?? []);
    for (const н of csp) проблемы.push('нарушение CSP: ' + н);
    const звук = await стр.evaluate(() => document.querySelectorAll('audio, video').length);
    if (звук) проблемы.push(`на экране киблы есть <audio>/<video>: ${звук}`);
    const лишнее = await стр.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (лишнее > 1) проблемы.push(`горизонтальная прокрутка: ${лишнее} px`);
    проверить(проблемы.length === 0, где + ': без ошибок, чужих запросов, CSP, звука и горизонтальной прокрутки' + (проблемы.length ? ':\n      ' + проблемы.join('\n      ') : ''));
  };
  /** Android: магнитный курс верха экрана (телефон лежит экраном вверх). */
  const android = (стр, курс, { beta = 0 } = {}) =>
    стр.evaluate(
      ({ курс, beta }) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: (360 - курс) % 360, beta, gamma: 0, absolute: true })),
      { курс, beta },
    );
  const кадр = (стр) => стр.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  // 1. Десктоп: датчиков нет → схема
  console.log('\n══ Кибла: десктоп — схема без компаса ══');
  {
    const { контекст, стр, проблемы } = await открыть({ viewport: { width: 1280, height: 800 } });
    проверить((await текстИд(стр, 'кибла-угол')).trim() === '231°', 'угол киблы для Астаны — 231°');
    проверить(/от севера · юго-запад/.test(await текстИд(стр, 'кибла-румб')), '«от севера · юго-запад»');
    проверить(/Астана/.test(await текстИд(стр, 'кибла-город')) && /До Каабы 4\s?2\d\d км/.test(await текстИд(стр, 'кибла-город')), 'город Астана и «До Каабы 4 2xx км»');
    проверить(await виден(стр, 'кибла-черновик'), 'плашка «Черновик — проверяет устаз»');
    проверить(!(await виден(стр, 'плашка-прототипа')), 'плашки прототипа нет (владелец 20.11.2026: только где проверка таджвида)');
    await ждать(стр, 'кибла-нет-компаса', 6000);
    проверить(true, 'через 3 с без событий ориентации — «Компаса на этом устройстве нет»');
    проверить((await поворотРозы(стр)) === 'rotate(0 100 100)', 'схема: роза не повёрнута (север вверху)');
    проверить(
      await стр.evaluate(() => document.querySelectorAll('[data-testid="кибла-циферблат"] svg > path').length === 0),
      'схема: отметки «верх телефона» нет',
    );
    проверить(/юг.+вправо на 5[12]°/.test(await текстИд(стр, 'кибла-опора')), '«Если знаете, где юг, … повернитесь вправо на 51°»');
    проверить(/солнце точно на юге/.test(await текстИд(стр, 'кибла-полдень')) && /вправо на 5[12]°/.test(await текстИд(стр, 'кибла-полдень')), 'ориентир по солнцу: истинный полдень и поворот');
    проверить(/михрабом/.test(await текстИд(стр, 'кибла-точность')) && /\+10,1°/.test(await текстИд(стр, 'кибла-точность')), 'честная пометка о точности и склонение +10,1°');
    проверить(!(await виден(стр, 'кибла-включить')), 'ноутбук без сенсорного экрана: кнопки «Включить компас» нет');
    await безПроблем(стр, проблемы, 'десктоп');
    await снимок(стр, 'десктоп');
    await контекст.close();
  }

  // 2. Телефон Android: deviceorientationabsolute
  console.log('\n══ Кибла: телефон (Android, deviceorientationabsolute) ══');
  {
    const { контекст, стр, проблемы } = await открыть(devices['Pixel 7'] ?? devices['iPhone 13']);
    await android(стр, 200);
    await кадр(стр);
    await ждать(стр, 'кибла-поворот');
    проверить((await поворотРозы(стр)) === 'rotate(-210 100 100)', 'курс 200° + склонение 10,1° = 210,1° → роза повёрнута на −210° (курс на экране — до 1°, без дрожи)');
    проверить(/Повернитесь правее на 21°/.test(await текстИд(стр, 'кибла-поворот')), '«Повернитесь правее на 21°»');
    проверить(!(await виден(стр, 'кибла-нет-компаса')) && !(await виден(стр, 'кибла-ищем')), 'режим компаса: нет «ищем» и «компаса нет»');
    проверить(!(await виден(стр, 'кибла-включить')), 'Android: курс пришёл без нажатия — кнопки «Включить компас» нет');
    await снимок(стр, 'телефон-поверните', false);
    await android(стр, 250);
    for (let i = 0; i < 40; i++) await android(стр, 250);
    await кадр(стр);
    проверить(/левее на 2[89]°/.test(await текстИд(стр, 'кибла-поворот')), 'курс 260,1° → «Повернитесь левее на 29°»');
    for (let i = 0; i < 40; i++) await android(стр, 221.4);
    await кадр(стр);
    await ждать(стр, 'кибла-совпало');
    проверить(/в сторону киблы/.test(await текстИд(стр, 'кибла-совпало')), 'магнитный 221,4° + 10,1° = 231,5° → «Вы смотрите в сторону киблы»');
    проверить(
      await стр.evaluate(() => {
        const круг = document.querySelector('[data-testid="кибла-циферблат"] svg > circle');
        return круг?.getAttribute('stroke-width') === '2.5';
      }),
      'совпадение: золотая обводка циферблата',
    );
    await снимок(стр, 'телефон-совпало', false);
    for (let i = 0; i < 25; i++) await android(стр, i % 2 ? 190 : 270);
    await кадр(стр);
    await ждать(стр, 'кибла-неустойчиво');
    проверить(true, 'скачущий курс → «Стрелка неустойчива … восьмёрку»');
    await android(стр, 231, { beta: 90 });
    await кадр(стр);
    await ждать(стр, 'кибла-вертикально');
    проверить(true, 'телефон стоит вертикально → «Положите телефон горизонтально»');
    await безПроблем(стр, проблемы, 'телефон Android');
    await контекст.close();
  }

  // 3. Телефон iOS: requestPermission по нажатию, webkitCompassHeading
  console.log('\n══ Кибла: телефон (iOS, «Включить компас») ══');
  {
    const { контекст, стр, проблемы } = await открыть(devices['iPhone 13'], { ios: 'granted' });
    await ждать(стр, 'кибла-включить');
    проверить((await стр.evaluate(() => window.__запросовРазрешения)) === 0, 'iOS: до нажатия разрешение не запрашивается');
    await снимок(стр, 'iphone-включить', false);
    await стр.getByTestId('кибла-включить').first().click();
    await стр.waitForFunction(() => window.__запросовРазрешения === 1);
    проверить(true, 'нажатие «Включить компас» → DeviceOrientationEvent.requestPermission()');
    await стр.evaluate(() => {
      const е = new Event('deviceorientation');
      Object.defineProperty(е, 'webkitCompassHeading', { value: 190 });
      Object.defineProperty(е, 'webkitCompassAccuracy', { value: 30 });
      window.dispatchEvent(е);
    });
    await кадр(стр);
    await ждать(стр, 'кибла-поворот');
    проверить(/правее на 31°/.test(await текстИд(стр, 'кибла-поворот')), 'webkitCompassHeading 190° + 10,1° → «правее на 31°»');
    проверить(/±30°/.test(await текстИд(стр, 'кибла-точность-датчика')), 'точность компаса ±30°');
    await ждать(стр, 'кибла-калибровка');
    проверить(/восьмёрку/.test(await текстИд(стр, 'кибла-калибровка')), 'точность хуже 20° → «опишите телефоном восьмёрку»');
    проверить(!(await виден(стр, 'кибла-включить')), 'после разрешения кнопки нет');
    await безПроблем(стр, проблемы, 'телефон iOS');
    await контекст.close();

    const отказ = await открыть(devices['iPhone 13'], { ios: 'denied' });
    await отказ.стр.getByTestId('кибла-включить').first().click();
    await ждать(отказ.стр, 'кибла-отказ');
    проверить(/перезагрузите страницу/.test(await текстИд(отказ.стр, 'кибла-отказ')), 'iOS: отказ → «перезагрузите страницу и снова нажмите»');
    await безПроблем(отказ.стр, отказ.проблемы, 'iOS отказ');
    await отказ.контекст.close();

    // Короткий экран (iPhone SE в Safari, 375×560): кнопка видна, после курса — прокрутка к циферблату.
    const се = await открыть({ viewport: { width: 375, height: 560 }, isMobile: true, hasTouch: true, userAgent: devices['iPhone SE']?.userAgent }, { ios: 'granted' });
    await ждать(се.стр, 'кибла-включить');
    const размер = await се.стр.evaluate(() => document.querySelector('[data-testid="кибла-циферблат"]').getBoundingClientRect().height);
    проверить(размер <= 0.42 * 560 + 1, `375×560: циферблат не выше 0,42 окна (${Math.round(размер)} px)`);
    проверить(
      await се.стр.evaluate(() => {
        const ц = document.querySelector('[data-testid="кибла-циферблат"] svg');
        return !!ц && [...ц.querySelectorAll('circle')].every((к) => Number(к.getAttribute('r')) > 5);
      }),
      'центр циферблата — звезда хатам без круга (не знак руб‘ аль-хизба)',
    );
    await се.стр.getByTestId('кибла-включить').first().click();
    await се.стр.waitForFunction(() => window.__запросовРазрешения === 1);
    await се.стр.evaluate(() => {
      const е = new Event('deviceorientation');
      Object.defineProperty(е, 'webkitCompassHeading', { value: 190 });
      Object.defineProperty(е, 'webkitCompassAccuracy', { value: 10 });
      window.dispatchEvent(е);
    });
    await кадр(се.стр);
    await ждать(се.стр, 'кибла-поворот');
    await се.стр.waitForTimeout(700);
    const верх = await се.стр.evaluate(() => {
      const к = document.querySelector('[data-testid="кибла-карточка"]').getBoundingClientRect();
      const ц = document.querySelector('[data-testid="кибла-циферблат"]').getBoundingClientRect();
      return { карточка: к.top, низЦиферблата: ц.bottom, окно: window.innerHeight };
    });
    проверить(верх.карточка >= 40 && верх.карточка <= 140 && верх.низЦиферблата <= верх.окно, `после курса экран прокручен к циферблату: верх карточки ${Math.round(верх.карточка)} px, циферблат целиком`);
    await безПроблем(се.стр, се.проблемы, 'iPhone SE');
    await се.контекст.close();
  }

  // 4. Казахский, тёмная тема, узкий телефон
  console.log('\n══ Кибла: казахский, тёмная тема, 360 px ══');
  {
    const { контекст, стр, проблемы } = await открыть({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true }, { язык: 'kk', тёмная: true });
    проверить(/оңтүстік-батыс/.test(await текстИд(стр, 'кибла-румб')), 'kk: «солтүстіктен · оңтүстік-батыс»');
    проверить((await стр.title()).startsWith('Құбыла'), 'kk: заголовок «Құбыла»');
    await android(стр, 205);
    await кадр(стр);
    await ждать(стр, 'кибла-поворот');
    проверить(/Оңға қарай 16°/.test(await текстИд(стр, 'кибла-поворот')), 'kk: «Оңға қарай 16° бұрылыңыз»');
    await снимок(стр, 'kk-тёмная', false);
    await безПроблем(стр, проблемы, '360 px, kk, тёмная');
    await контекст.close();
  }
  // 5. Ориентиры по солнцу на фиксированное время: 25.05.2026 15:00 по РК (Date подменён, таймеры идут)
  console.log('\n══ Кибла: ориентиры по солнцу (25.05.2026, 15:00 по РК) ══');
  {
    const { контекст, стр, проблемы } = await открыть({ viewport: { width: 1280, height: 800 } }, { время: '2026-05-25T10:00:00Z' });
    await ждать(стр, 'кибла-нет-компаса', 6000);
    проверить(/Сейчас солнце — 243° от севера/.test(await текстИд(стр, 'кибла-солнце-сейчас')), '«Сейчас солнце — 243° от севера»');
    проверить(/влево на 12°/.test(await текстИд(стр, 'кибла-солнце-сейчас')), '«…повернитесь влево на 12°» (243° → 231°)');
    проверить(/Около 14:19 солнце стоит точно в стороне киблы/.test(await текстИд(стр, 'кибла-солнце-кибла')), '«Около 14:19 солнце стоит точно в стороне киблы»');
    проверить(/28 мая в 14:18 солнце будет прямо над Каабой/.test(await текстИд(стр, 'кибла-над-каабой')), '«28 мая в 14:18 солнце будет прямо над Каабой» (за 3 дня)');
    проверить(/Сегодня в 12:\d\d солнце точно на юге/.test(await текстИд(стр, 'кибла-полдень')), 'истинный полдень сегодня в 12:xx');
    await безПроблем(стр, проблемы, 'ориентиры по солнцу');
    await снимок(стр, 'солнце-25-мая');
    await контекст.close();
  }
  // 6. Город: тот же, что у времени намаза; «Сменить» → выбор города → Алматы → 247°, склонение +5,2°
  console.log('\n══ Кибла: смена города ══');
  {
    const { контекст, стр, проблемы } = await открыть({ viewport: { width: 1280, height: 800 } });
    await стр.getByTestId('кибла-город').first().click();
    await стр.waitForFunction(() => location.hash === '#/prayer-city');
    await ждать(стр, 'город-almaty', 10000);
    await стр.getByTestId('город-almaty').first().click();
    await стр.waitForFunction(() => location.hash === '#/qibla');
    await ждать(стр, 'кибла-угол');
    проверить((await текстИд(стр, 'кибла-угол')).trim() === '247°' && /Алматы/.test(await текстИд(стр, 'кибла-город')), '«Сменить» → Алматы → кибла 247°');
    проверить(/запад-юго-запад/.test(await текстИд(стр, 'кибла-румб')) && /\+5,2°/.test(await текстИд(стр, 'кибла-точность')), 'Алматы: запад-юго-запад, склонение +5,2°');
    await стр.reload();
    await ждать(стр, 'кибла-угол');
    проверить((await текстИд(стр, 'кибла-угол')).trim() === '247°', 'после перезагрузки город сохранён (только на устройстве)');
    await безПроблем(стр, проблемы, 'смена города');
    await контекст.close();
  }
  if (снимки) {
    const { контекст, стр } = await открыть(devices['iPhone 13'], { тёмная: false });
    await ждать(стр, 'кибла-включить');
    await стр.waitForTimeout(3300);
    await снимок(стр, 'телефон-схема');
    await контекст.close();
  }
  return проверок;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const сервер = await запуститьСервер({ порт: 0, папка: process.env.DIST ?? path.join(корень, 'dist') });
  const браузер = await chromium.launch();
  try {
    const n = await киблаСквозной(браузер, сервер.адрес);
    console.log(`\nOK: экран киблы — ${n} проверок`);
  } catch (е) {
    console.error('\n' + (е?.stack ?? е));
    process.exitCode = 1;
  } finally {
    await браузер.close();
    await сервер.закрыть();
  }
}
