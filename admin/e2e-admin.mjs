#!/usr/bin/env node
/**
 * Сквозной тест админки (Playwright): admin/test_server.py — настоящий API на временной базе с выдуманными данными.
 * Проверяет: вход по коду; статистика (плитки, график, страницы, языки, удержание, часы); Коран (114 сур, аль-Фатиха с
 * цветами таджвида, текст = файлу сборки, легенда, «▶» у аята); чтецы (включить/выключить, по умолчанию — версия
 * растёт); хадисы (скрыть, проверено устазом, «ждут устаза»); «Ошибки» (значок новых на пункте меню, плитка недели на
 * статистике, список новыми сверху, фильтры, сообщение со ссылкой в приложение, статус и заметка → журнал; просмотр —
 * только читает и не видит контакт); админы (добавить, роль); журнал; мои входы; выход.
 * Снимки «Ошибок» 360×780 — SHOTS_FEEDBACK=папка (feedback-admin-list.png, feedback-admin-report.png).
 * И всё время: ни исключений, ни нарушений CSP, ни горизонтальной прокрутки на 390 px.
 * Снимки 390×844 — SHOTS_ADMIN=папка. Запуск (из корня mugalim, после node admin/build.mjs и сборки app/dist):
 *   MUGALIM_TEST_PG=postgresql://postgres@127.0.0.1:55432/postgres node admin/e2e-admin.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(корень, 'app', 'package.json'));
const { chromium } = require('playwright');
const ПОРТ = 8000 + Math.floor(Math.random() * 900);
const АДРЕС = `http://127.0.0.1:${ПОРТ}`;
const снимки = process.env.SHOTS_ADMIN ?? null;
if (снимки) fs.mkdirSync(снимки, { recursive: true });
const снимкиОшибок = process.env.SHOTS_FEEDBACK ?? null;
if (снимкиОшибок) fs.mkdirSync(снимкиОшибок, { recursive: true });

let проверок = 0;
const проверить = (условие, что) => {
  проверок += 1;
  if (!условие) throw new Error('[админка] НЕ ВЫПОЛНЕНО: ' + что);
  console.log('  ✓ ' + что);
};

const сервер = spawn('python3', [path.join(корень, 'admin', 'test_server.py'), String(ПОРТ)], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
const стоп = () => сервер.kill('SIGINT');
process.on('exit', стоп);
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(АДРЕС + '/api/content/config')).ok) break;
  } catch {}
  await new Promise((р) => setTimeout(р, 500));
}

const браузер = await chromium.launch();
try {
  const контекст = await браузер.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU', colorScheme: 'light' });
  const стр = await контекст.newPage();
  const проблемы = [];
  стр.on('pageerror', (о) => проблемы.push('исключение: ' + о.message));
  стр.on('console', (с) => {
    if (с.type() === 'error' && !/Failed to load resource|editions\.json/.test(с.text())) проблемы.push('консоль: ' + с.text());
  });
  await стр.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (е) => window.__csp.push(е.blockedURI + ' ' + е.violatedDirective));
  });
  const снимок = async (имя) => {
    if (!снимки) return;
    await стр.waitForTimeout(300);
    await стр.screenshot({ path: path.join(снимки, `admin-${имя}.png`), fullPage: false });
  };
  const безПроблем = async (где) => {
    for (const н of await стр.evaluate(() => window.__csp ?? [])) проблемы.push('CSP: ' + н);
    const лишнее = await стр.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (лишнее > 1) проблемы.push(`горизонтальная прокрутка ${лишнее} px`);
    проверить(проблемы.length === 0, где + ': без исключений, CSP и горизонтальной прокрутки' + (проблемы.length ? ':\n      ' + проблемы.join('\n      ') : ''));
  };

  // Вход.
  await стр.goto(АДРЕС + '/admin/');
  await стр.locator('#почта').waitFor();
  await снимок('вход');
  await стр.fill('#почта', 'owner@example.org');
  await стр.click('button[type=submit]');
  await стр.locator('#код').waitFor({ state: 'visible' });
  await стр.getByText(/ушёл код/).waitFor();
  const код = (await (await fetch(АДРЕС + '/__test/code')).json()).code;
  await стр.fill('#код', '000000' === код ? '111111' : '000000');
  await стр.click('button[type=submit]');
  проверить(await стр.getByText(/Код неверный или устарел/).waitFor({ timeout: 5000 }).then(() => true, () => false), 'неверный код — понятная ошибка');
  await стр.fill('#код', код);
  await стр.click('button[type=submit]');
  await стр.locator('.плитка').first().waitFor({ timeout: 20000 });
  проверить(true, 'вход по коду из письма');

  // Статистика.
  await стр.locator('.график .линия').waitFor();
  const плитки = await стр.locator('.плитка .значение').allInnerTexts();
  проверить(плитки.length >= 8 && Number(плитки[2].replace(/\s/g, '')) > 0, `плитки статистики: ${плитки.slice(0, 4).join(' / ')}`);
  проверить((await стр.locator('.полосы li').count()) > 10, 'страницы, языки, устройства, источники — полосами');
  проверить(await стр.getByText('Коран: сура').first().isVisible(), 'понятные имена страниц («Коран: сура»)');
  await снимок('статистика');
  проверить(await стр.getByTestId('плитка-ошибок').waitFor({ timeout: 5000 }).then(() => true, () => false), 'статистика: плитка «Сообщений об ошибках за 7 дней»');
  проверить(/^4$/.test((await стр.getByTestId('плитка-ошибок').locator('.значение').innerText()).trim()), 'плитка ошибок: 4 за неделю');
  проверить((await стр.locator('a.пункт[href="#/feedback"] .число-новых').innerText()) === '4', 'пункт «Ошибки»: значок 4 новых');
  await стр.locator('.график').hover({ position: { x: 200, y: 80 } });
  проверить(await стр.locator('.подсказка-графика').isVisible(), 'наведение на график — подсказка с числами');
  await стр.getByRole('button', { name: '7 дней' }).click();
  await стр.waitForTimeout(500);
  проверить((await стр.getByRole('button', { name: '7 дней' }).getAttribute('aria-pressed')) === 'true', 'период 7 дней');
  await стр.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await стр.waitForTimeout(200);
  if (снимки) await стр.screenshot({ path: path.join(снимки, 'admin-статистика-низ.png') });
  await безПроблем('статистика');

  // Коран.
  await стр.click('a.пункт[href="#/quran"]');
  await стр.locator('.сура-строка').first().waitFor();
  проверить((await стр.locator('.сура-строка').count()) === 114, '114 сур');
  проверить(await стр.getByText('совпадает').isVisible(), 'сверка sha256 Tanzil — совпадает');
  await снимок('коран');
  await стр.click('a[href="#/quran/1"]');
  await стр.locator('.аят').first().waitFor();
  const индексКорана = JSON.parse(fs.readFileSync(path.join(корень, 'app', 'dist', 'quran', fs.readdirSync(path.join(корень, 'app', 'dist', 'quran')).find((ф) => /^index\./.test(ф))), 'utf8'));
  const фатиха = JSON.parse(fs.readFileSync(path.join(корень, 'app', 'dist', индексКорана.суры[0].файл), 'utf8'));
  const тексты = await стр.locator('.аят').evaluateAll((э) => э.map((а) => а.firstChild && [...а.childNodes].filter((у) => !(у instanceof HTMLElement && у.classList.contains('номер-аята'))).map((у) => у.textContent).join('')));
  const аяты = (фатиха.аяты ?? фатиха.ayahs ?? []).map((а) => (typeof а === 'string' ? а : а.текст ?? а.text));
  проверить(тексты.length === 7 && тексты.every((т, i) => т === аяты[i]), 'аль-Фатиха: текст на странице = файлу сборки (побайтно)');
  проверить((await стр.locator('.аят [class^="т-"]').count()) > 5, 'цвета таджвида в аятах');
  await стр.locator('.легенда summary').click();
  проверить((await стр.locator('.легенда li').count()) === 11, 'легенда: 11 правил таджвида');
  проверить((await стр.locator('button.играть').count()) === 7, '«▶» у каждого аята');
  await стр.locator('.легенда summary').click();
  await снимок('коран-сура');
  await безПроблем('Коран');

  // Чтецы.
  await стр.click('a.пункт[href="#/reciters"]');
  await стр.locator('article.чтец').first().waitFor();
  проверить((await стр.locator('article.чтец').count()) >= 5, 'все чтецы из audio-sources.json');
  await снимок('чтецы');
  const версияДо = Number((await стр.locator('p.тихо').first().innerText()).match(/версия (\d+)/)[1]);
  await стр.locator('#вкл-suwayd').uncheck();
  await стр.getByText(/Сохранено\. Версия настроек/).waitFor();
  const конфиг = await (await fetch(АДРЕС + '/api/content/config')).json();
  проверить(!конфиг.чтецы.включены.includes('suwayd') && конфиг.версия === версияДо + 1, 'выключить чтеца — в настройках приложения, версия выросла');
  await безПроблем('чтецы');

  // Хадисы.
  await стр.click('a.пункт[href="#/hadith"]');
  await стр.locator('li.хадис').first().waitFor({ timeout: 20000 });
  await снимок('хадисы');
  const первый = стр.locator('li.хадис').first();
  const номер = Number((await первый.locator('.хадис-шапка .тихо').innerText()).match(/\d+/)[0]);
  await первый.getByRole('button', { name: 'Скрыть' }).click();
  await стр.getByText(`Сохранено (№ ${номер})`).waitFor();
  проверить((await (await fetch(АДРЕС + '/api/content/config')).json()).хадисы.скрыты.includes(номер), `скрыть хадис ${номер} — в настройках приложения`);
  await стр.getByRole('tab', { name: /Ждут устаза/ }).click();
  await стр.locator('li.хадис').first().waitFor();
  стр.once('dialog', (д) => д.accept('Устаз Мурат'));
  await стр.locator('li.хадис').first().getByRole('button', { name: /Добавить/ }).click();
  await стр.getByText(/войдёт в следующую сборку/).first().waitFor();
  проверить(true, '«ждут устаза» → «Добавить: проверено устазом» — отметка для следующей сборки');
  await снимок('хадисы-ждут');
  await безПроблем('хадисы');

  // Ошибки (владелец 28.11.2026: «Любой человек увидел ошибку, нажал, он попадает к нам и обрабатывает»).
  await стр.click('a.пункт[href="#/feedback"]');
  await стр.locator('li.сообщение-ошибки').first().waitFor();
  const номераОшибок = await стр.locator('li.сообщение-ошибки .хадис-шапка strong').allInnerTexts();
  проверить(номераОшибок.length === 4 && номераОшибок[0] === '№ 4' && номераОшибок[3] === '№ 1', 'список ошибок: 4, новые сверху');
  await стр.selectOption('#категория-ошибок', 'translation');
  await стр.waitForFunction(() => document.querySelectorAll('li.сообщение-ошибки').length === 1);
  проверить((await стр.locator('li.сообщение-ошибки').innerText()).includes('пропущено слово'), 'фильтр «Перевод» — одно сообщение');
  await стр.selectOption('#категория-ошибок', '');
  await стр.getByRole('button', { name: 'исправлено' }).click();
  await стр.getByText('Сообщений нет.').waitFor();
  await стр.getByRole('button', { name: 'Все', exact: true }).click();
  await стр.waitForFunction(() => document.querySelectorAll('li.сообщение-ошибки').length === 4);
  проверить(true, 'фильтр по статусу «исправлено» — пусто, «Все» — снова 4');
  if (снимкиОшибок) {
    await стр.setViewportSize({ width: 360, height: 780 });
    await стр.evaluate(() => document.querySelector('#категория-ошибок').scrollIntoView({ block: 'start' }));
    await стр.evaluate(() => window.scrollBy(0, -130)); // под липкой шапкой и меню
    await стр.waitForTimeout(300);
    await стр.screenshot({ path: path.join(снимкиОшибок, 'feedback-admin-list.png') });
  }
  await безПроблем('ошибки: список');
  await стр.locator('li.сообщение-ошибки', { hasText: 'муттасыль' }).locator('a').click();
  await стр.getByTestId('ошибка-текст').waitFor();
  проверить((await стр.getByTestId('ошибка-цитата').innerText()).includes('2 счёта'), 'сообщение: выделенный текст');
  проверить((await стр.getByTestId('ошибка-открыть').getAttribute('href')) === '/aiustaz/#/quran/sura?n=2&a=255', 'ссылка «Открыть это место в приложении» — /aiustaz/#/quran/sura?n=2&a=255');
  проверить((await стр.getByTestId('ошибка-контакт').innerText()).includes('@kari_test'), 'владелец видит контакт');
  проверить(await стр.getByText('сура 2, аят 255').first().isVisible(), 'место: «сура 2, аят 255»');
  if (снимкиОшибок) await стр.screenshot({ path: path.join(снимкиОшибок, 'feedback-admin-report.png'), fullPage: true });
  await стр.selectOption('#статус-ошибки', 'исправлено');
  await стр.fill('#заметка-ошибки', 'Исправили в таджвиде 2:255, проверил кари.');
  await стр.getByRole('button', { name: 'Сохранить' }).click();
  await стр.getByText('Сохранено. Изменение записано в журнал.').waitFor();
  await стр.waitForFunction(() => document.querySelector('a.пункт[href="#/feedback"] .число-новых')?.textContent === '3');
  проверить(true, 'статус «исправлено» и заметка сохранены, значок новых — 3');
  if (снимкиОшибок) await стр.setViewportSize({ width: 390, height: 844 });
  await безПроблем('ошибки: сообщение');

  // Админы.
  await стр.click('a.пункт[href="#/admins"]');
  await стр.locator('article.админ').first().waitFor();
  проверить((await стр.locator('article.админ').count()) === 3, 'список админов');
  await стр.fill('#новая-почта', 'novyi@example.org');
  await стр.selectOption('#новая-роль', 'viewer');
  await стр.getByRole('button', { name: 'Добавить' }).click();
  await стр.getByText(/Добавлен novyi@example.org/).waitFor();
  проверить(await стр.waitForFunction(() => document.querySelectorAll('article.админ').length === 4, null, { timeout: 5000 }).then(() => true, () => false), 'добавить админа по почте');
  await снимок('админы');
  await безПроблем('админы');

  // Журнал и входы.
  await стр.click('a.пункт[href="#/audit"]');
  await стр.locator('.таблица tbody tr').first().waitFor();
  проверить(await стр.getByText('админ добавлен').first().isVisible(), 'журнал: «админ добавлен»');
  проверить(await стр.getByText('ошибка: статус').first().isVisible() && await стр.getByText('ошибка: заметка').first().isVisible(), 'журнал: «ошибка: статус», «ошибка: заметка»');
  await снимок('журнал');
  await стр.click('a.пункт[href="#/sessions"]');
  await стр.getByText('Этот вход').waitFor();
  проверить(true, 'мои входы: этот вход');
  await безПроблем('журнал и входы');

  // Тёмная тема — снимок статистики.
  if (снимки) {
    await стр.emulateMedia({ colorScheme: 'dark' });
    await стр.click('a.пункт[href="#/"]');
    await стр.locator('.график .линия').waitFor();
    await снимок('статистика-тёмная');
    await стр.emulateMedia({ colorScheme: 'light' });
  }

  // Выход.
  await стр.getByRole('button', { name: 'Выйти' }).click();
  await стр.locator('#почта').waitFor();
  проверить((await (await стр.request.get(АДРЕС + '/api/admin/me')).status()) === 401, 'выход — сеанс закрыт');

  // Просмотр (устаз): «Ошибки» читает, контакта не видит, менять не может.
  await стр.fill('#почта', 'ustaz@example.org');
  await стр.click('button[type=submit]');
  await стр.locator('#код').waitFor({ state: 'visible' });
  await стр.getByText(/ушёл код/).waitFor();
  await стр.fill('#код', (await (await fetch(АДРЕС + '/__test/code')).json()).code);
  await стр.click('button[type=submit]');
  await стр.getByText('просмотр', { exact: true }).waitFor({ timeout: 20000 });
  await стр.evaluate(() => { location.hash = '#/feedback/1'; });
  await стр.getByTestId('ошибка-контакт').waitFor();
  проверить((await стр.getByTestId('ошибка-контакт').innerText()).includes('видят админы') && !(await стр.getByTestId('ошибка-контакт').innerText()).includes('@kari'), 'просмотр: контакт скрыт');
  проверить(await стр.locator('#статус-ошибки').isDisabled() && await стр.getByRole('button', { name: 'Сохранить' }).isDisabled(), 'просмотр: статус и заметку менять нельзя');
  await безПроблем('ошибки: просмотр');
  console.log(`OK: админка — ${проверок} проверок`);
} finally {
  await браузер.close();
  стоп();
}
