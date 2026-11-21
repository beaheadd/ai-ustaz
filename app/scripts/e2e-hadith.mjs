#!/usr/bin/env node
/**
 * Сквозной тест раздела «Хадисы» (Playwright, Chromium): хадисы «Сахиха» аль-Бухари с переводом из HadeethEnc.com.
 * Решение владельца 21.11.2026: «Добавь хадисы Аль-Бухари ещё перевод!». Экраны — screens/HadithScreen.tsx,
 * HadithCategoryScreen.tsx, HadithItemScreen.tsx; данные — dist/hadith (tools/hadith/build_hadith.py); правила —
 * docs/дизайн/09-хадисы.md.
 *
 * Сценарии (прогресс: язык выбран, ИИ-предупреждение показано):
 *   1. ru, 412×800: #/hadith — вступление, «ИИ хадисы не пишет…», плашка «Черновик», разделы HadeethEnc верхнего уровня =
 *      индексу (без «акыды»), «Источник: HadeethEnc.com»; раздел → подраздел → хадис (#/hadith/item?n=<id>, стек);
 *   2. экран хадиса: заголовок, арабский текст и перевод ПОБАЙТНО = выгрузке (dist/hadith), арабский — lang="ar",
 *      dir="rtl", не шрифт Корана; «Степень: … · По данным HadeethEnc.com», такхридж, разъяснение целиком (по нажатию),
 *      польза — все пункты, ссылки (ar); «Источник: HadeethEnc.com» — <a href=страница хадиса target=_blank> (запроса
 *      на hadeethenc.com нет); плашка «Черновик — проверяет устаз»; title без арабского;
 *   3. поиск: по номеру по порядку, по номеру HadeethEnc, по слову заголовка; номер хадиса, ждущего устаза, — ничего;
 *   4. хадисы акыды и прочие ждущие устаза (content/hadith/на-проверку-устаза.json): глубокая ссылка — «Такого хадиса
 *      в разделе нет», раздела «акыда» (#/hadith/list?n=3) нет;
 *   5. kk: русский перевод и строка «Қазақ тіліндегі аударма әзірге жоқ — орысша аудармасы»; en — английский перевод;
 *      uz — свой (кириллица, пометка) или русский с пометкой;
 *   6. 360×640: нет горизонтальной прокрутки (раздел, список, хадис с раскрытым разъяснением);
 * и всё время: нет ошибок в консоли, исключений, запросов на другие адреса, нарушений CSP, чужих ключей localStorage.
 *
 * Запуск (из app/, после npm run build:web): node scripts/e2e-hadith.mjs (сервер поднимается сам; DIST=папка — другая
 * сборка; HADITH_SHOTS=папка — снимки). Из e2e.mjs: import { хадисыСквозной }.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { запуститьСервер } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const репозиторий = path.resolve(корень, '..');
const ВРЕМЯ = '2026-11-21T15:13:00+05:00';
const АРАБСКИЙ = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const ПРОГРЕСС = (язык) => ({
  версия: 1,
  язык,
  предупреждениеПоказано: true,
  пояснениеМикрофонаПоказано: true,
  согласиеПроверкиГолосом: false,
  уроки: { 0: { пройден: true, лучший: 1, попыток: 1, последний: '2026-11-20' } },
  дниЗанятий: ['2026-11-20'],
});
const ТЕЛЕФОН = (ширина, высота) => ({
  viewport: { width: ширина, height: высота },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
});

/** Данные из сборки: индекс, порции по языкам, заголовки. */
export function данныеХадисов(папка) {
  const манифест = fs.readFileSync(path.join(корень, 'src', 'hadith', 'manifest.generated.ts'), 'utf8');
  const индексФайл = манифест.match(/индекс: '([^']+)'/)[1];
  const индекс = JSON.parse(fs.readFileSync(path.join(папка, индексФайл), 'utf8'));
  const записи = new Map();
  for (const [язык, список] of Object.entries(индекс.порции)) {
    for (const ф of список) {
      if (!ф) continue;
      for (const з of JSON.parse(fs.readFileSync(path.join(папка, ф.файл), 'utf8')).хадисы) записи.set(язык + ':' + з.id, з);
    }
  }
  const запись = (язык, id) => записи.get(язык + ':' + id) ?? null;
  const арабский = (язык, id) => запись(язык, id)?.hadeeth_ar ?? запись('ar', id).hadeeth;
  return { индекс, запись, арабский };
}

let проверок = 0;

async function новаяСтраница(браузер, база, { ширина = 412, высота = 800, язык = 'ru' } = {}) {
  const контекст = await браузер.newContext({ ...ТЕЛЕФОН(ширина, высота), locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
  await контекст.addInitScript(
    ({ прогресс }) => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (е) => window.__csp.push(е.blockedURI + ' ' + е.violatedDirective));
      if (!localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(прогресс));
    },
    { прогресс: ПРОГРЕСС(язык) },
  );
  const стр = await контекст.newPage();
  await стр.clock.setFixedTime(new Date(ВРЕМЯ));
  const проблемы = [];
  стр.on('request', (з) => {
    const u = з.url();
    if (!u.startsWith(база + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) проблемы.push('запрос на другой адрес: ' + u);
  });
  стр.on('console', (с) => {
    if (с.type() === 'error') проблемы.push('ошибка в консоли: ' + с.text());
  });
  стр.on('pageerror', (о) => проблемы.push('исключение на странице: ' + о.message));
  return { контекст, стр, проблемы };
}

function помощники(стр, проблемы, имя, папкаСнимков) {
  const э = (id) => стр.getByTestId(id).first();
  const есть = async (id) => (await стр.getByTestId(id).count()) > 0;
  const текстЭ = async (id) => (await э(id).innerText()).trim();
  const сырой = (id) => стр.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null, id);
  const хэш = () => стр.evaluate(() => location.hash);
  const стек = () => стр.evaluate(() => history.state?.aiustaz?.стек ?? null);
  const проверить = (условие, что) => {
    проверок += 1;
    if (!условие) throw new Error(`[хадисы: ${имя}] НЕ ВЫПОЛНЕНО: ${что}`);
    console.log(`  ✓ ${что}`);
  };
  const экран = async (id, адрес) => {
    await э(id).waitFor({ timeout: 15000 });
    if (адрес) await стр.waitForFunction((а) => location.hash === а, адрес, { timeout: 5000 });
  };
  const безПроблем = async (что) => {
    const csp = await стр.evaluate(() => window.__csp ?? []);
    for (const н of csp) проблемы.push('нарушение CSP: ' + н);
    const ключи = await стр.evaluate(() => Object.keys(localStorage));
    for (const к of ключи) if (!к.startsWith('aiustaz:')) проблемы.push('чужой ключ в localStorage: ' + к);
    проверить(проблемы.length === 0, что + (проблемы.length ? ':\n      ' + проблемы.join('\n      ') : ''));
  };
  const безГоризонтальнойПрокрутки = async (где) => {
    const лишнее = await стр.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    проверить(лишнее <= 1, `${где}: нет горизонтальной прокрутки (лишние ${лишнее} px)`);
  };
  const снимок = async (файл) => {
    if (!папкаСнимков) return;
    await стр.waitForTimeout(300);
    await стр.screenshot({ path: path.join(папкаСнимков, файл + '.png'), fullPage: true });
  };
  return { э, есть, текстЭ, сырой, хэш, стек, проверить, экран, безПроблем, безГоризонтальнойПрокрутки, снимок };
}

/** Экран хадиса: тексты побайтно = выгрузке на языке перевода язык. */
async function сверитьХадис(п, стр, данные, id, язык, где) {
  const пер = данные.запись(язык, id);
  const ar = данные.запись('ar', id);
  await п.э('хадис-арабский').waitFor({ timeout: 15000 });
  п.проверить((await п.сырой('хадис-заголовок')) === пер.title, `${где}: заголовок = title выгрузки ${язык} побайтно`);
  п.проверить((await п.сырой('хадис-арабский')) === данные.арабский(язык, id), `${где}: арабский текст = выгрузке побайтно`);
  п.проверить((await п.сырой('хадис-перевод')) === пер.hadeeth, `${где}: перевод = hadeeth выгрузки ${язык} побайтно`);
  п.проверить((await п.сырой('хадис-такхридж')) === пер.attribution, `${где}: кто передал (attribution) = выгрузке`);
  const степень = await п.сырой('хадис-степень');
  п.проверить(степень.includes(пер.grade) && /HadeethEnc\.com/.test(степень), `${где}: «${степень}»`);
  const ссылка = await стр.evaluate(() => {
    const а = document.querySelector('[data-testid="хадис-источник"]');
    return а ? { тег: а.tagName, href: а.getAttribute('href'), target: а.getAttribute('target'), rel: а.getAttribute('rel'), текст: а.textContent } : null;
  });
  п.проверить(
    ссылка && ссылка.тег === 'A' && ссылка.href === пер.link && ссылка.target === '_blank' && /noopener/.test(ссылка.rel ?? ''),
    `${где}: «${ссылка?.текст}» — ссылка ${ссылка?.href} (новая вкладка)`,
  );
  return { пер, ar };
}

export async function хадисыСквозной(браузер, база, { папка = process.env.DIST ? path.resolve(process.env.DIST) : path.join(корень, 'dist'), папкаСнимков = process.env.HADITH_SHOTS } = {}) {
  проверок = 0;
  if (папкаСнимков) fs.mkdirSync(папкаСнимков, { recursive: true });
  const данные = данныеХадисов(папка);
  const { индекс } = данные;
  const адрес = (х) => база + '/aiustaz/index.html' + х;
  const наПроверку = JSON.parse(fs.readFileSync(path.join(репозиторий, 'content', 'hadith', 'на-проверку-устаза.json'), 'utf8'));
  const опубликованы = new Set(индекс.хадисы.map((х) => х.id));
  const ждут = наПроверку.хадисы.map((з) => з.id).filter((id) => !опубликованы.has(id));
  const ждутАкыда = наПроверку.хадисы.filter((з) => з.причины.some((п) => /акыда/.test(п)) && !опубликованы.has(з.id));
  const корни = индекс.категории.filter((к) => к.родитель === 0);

  // ── 1–2. ru: раздел → подраздел → хадис ──
  console.log('\n══ «Хадисы»: разделы, хадис, текст = выгрузке (ru, 412×800) ══');
  let idХадиса;
  {
    const { контекст, стр, проблемы } = await новаяСтраница(браузер, база);
    const п = помощники(стр, проблемы, 'ru', папкаСнимков);
    await стр.goto(адрес('#/hadith'));
    await п.экран('экран-хадисы', '#/hadith');
    await п.э('хадисы-разделы').waitFor({ timeout: 15000 });
    const текст = await п.текстЭ('экран-хадисы');
    п.проверить(/ИИ хадисы не пишет, не переводит и не пересказывает/.test(текст) && /уточните источник у имама/.test(текст), '«ИИ хадисы не пишет, не переводит и не пересказывает», «уточните источник у имама»');
    п.проверить(/HadeethEnc\.com/.test(await п.текстЭ('хадисы-вступление')) && (await п.есть('хадисы-черновик')), 'вступление: HadeethEnc.com; плашка «Черновик — проверяет устаз»');
    п.проверить(/Источник: HadeethEnc\.com/.test(await п.текстЭ('хадисы-источник')), 'строка «Источник: HadeethEnc.com»');
    const разделы = await стр.evaluate(() => [...document.querySelectorAll('[data-testid^="хадисы-раздел-"]')].map((е) => Number(е.getAttribute('data-testid').split('-').pop())));
    п.проверить(разделы.join(',') === корни.map((к) => к.id).join(','), `разделы верхнего уровня = индексу (${разделы.length}): ${корни.map((к) => к.название.ru).join(' · ')}`);
    п.проверить(!разделы.includes(3) && !/Вероубеждение/.test(текст), 'раздела «Вероубеждение» (акыда) нет — ждёт устаза');
    п.проверить(!АРАБСКИЙ.test(await стр.title()), 'title без арабского');
    await п.снимок('хадисы-ru');

    // Раздел «Достоинства и этикет» (5) → первый подраздел с хадисами.
    const корень = корни.find((к) => к.id === 5) ?? корни[0];
    await п.э('хадисы-раздел-' + корень.id).click();
    await п.экран('экран-раздел-хадисов', `#/hadith/list?n=${корень.id}`);
    let раздел = корень;
    for (let шаг = 0; шаг < 4 && !(await п.есть('раздел-хадисы')); шаг++) {
      const дети = индекс.категории.filter((к) => к.родитель === раздел.id);
      раздел = дети[0];
      await п.э('раздел-подраздел-' + раздел.id).click();
      await п.экран('экран-раздел-хадисов', `#/hadith/list?n=${раздел.id}`);
    }
    await п.э('раздел-хадисы').waitFor({ timeout: 15000 });
    const вРазделе = индекс.хадисы.filter((х) => х.категории.includes(раздел.id));
    const строки = await стр.evaluate(() => [...document.querySelectorAll('[data-testid^="хадис-строка-"][data-testid$="-заголовок"]')].map((е) => ({ id: Number(е.getAttribute('data-testid').split('-')[2]), текст: е.textContent })));
    п.проверить(
      строки.map((с) => с.id).join(',') === вРазделе.map((х) => х.id).join(','),
      `раздел «${раздел.название.ru}»: ${строки.length} хадисов = индексу, по порядку номеров`,
    );
    п.проверить(строки.every((с) => с.текст === данные.запись('ru', с.id).title), 'заголовки строк = title выгрузки ru побайтно');
    п.проверить(/аль-Бухари · /.test(await п.текстЭ('хадис-строка-' + строки[0].id)), 'строка: номер, заголовок, «аль-Бухари · степень»');
    п.проверить(await п.есть('раздел-черновик'), 'раздел: плашка «Черновик»');
    await п.снимок('раздел-ru');

    idХадиса = строки[0].id;
    await п.э('хадис-строка-' + idХадиса).click();
    await п.экран('экран-хадис', `#/hadith/item?n=${idХадиса}`);
    const { пер, ar } = await сверитьХадис(п, стр, данные, idХадиса, 'ru', `хадис #${idХадиса}`);
    п.проверить((await п.текстЭ('хадис-номер')) === `HadeethEnc № ${idХадиса}`, '«HadeethEnc № id»');
    п.проверить(await п.есть('хадис-черновик'), 'плашка «Черновик — проверяет устаз» у хадиса');
    п.проверить(!(await п.есть('хадис-нет-перевода')), 'ru: строки «перевода нет» нет');
    const стиль = await стр.evaluate(() => {
      const е = document.querySelector('[data-testid="хадис-арабский"]');
      return { lang: е.getAttribute('lang'), dir: е.getAttribute('dir'), шрифт: getComputedStyle(е).fontFamily };
    });
    п.проверить(стиль.lang === 'ar' && стиль.dir === 'rtl' && !/Amiri/i.test(стиль.шрифт), `арабский: lang="ar", dir="rtl", шрифт не Коран (${стиль.шрифт.slice(0, 40)}…)`);
    п.проверить(!АРАБСКИЙ.test(await стр.title()) && (await стр.title()).startsWith('Хадис №'), `title «${await стр.title()}» — без арабского`);
    // Разъяснение — целиком по нажатию.
    п.проверить(!(await п.есть('хадис-разъяснение-текст')), 'разъяснение свёрнуто');
    await п.э('хадис-разъяснение').click();
    await п.э('хадис-разъяснение-текст').waitFor();
    п.проверить((await п.сырой('хадис-разъяснение-текст')) === пер.explanation, 'разъяснение раскрыто — весь текст = explanation побайтно');
    if (пер.hints.length) {
      await п.э('хадис-польза').click();
      const польза = await п.сырой('хадис-польза-текст');
      п.проверить(пер.hints.every((х) => польза.includes(х)), `польза: все ${пер.hints.length} пунктов`);
    }
    if (ar.reference) {
      await п.э('хадис-ссылки').click();
      п.проверить((await п.сырой('хадис-ссылки-текст')) === ar.reference, 'ссылки на источники (ar) = reference побайтно');
    }
    п.проверить(/ДУМК/.test(await п.текстЭ('хадис-фикх')), '«Личные вопросы фикха — к имаму или в ДУМК»');
    const стек = await п.стек();
    п.проверить(Array.isArray(стек) && стек.length >= 4, `стек: ${стек?.length} экранов (главная → хадисы → разделы → хадис)`);
    await п.снимок('хадис-ru');
    await п.безПроблем('ru: нет ошибок, чужих запросов (hadeethenc.com не запрашивается), нарушений CSP');
    await контекст.close();
  }

  // ── 3–4. поиск, ждущие устаза ──
  console.log('\n══ «Хадисы»: поиск, хадисы акыды и ждущие устаза не показываются ══');
  {
    const { контекст, стр, проблемы } = await новаяСтраница(браузер, база);
    const п = помощники(стр, проблемы, 'поиск', null);
    await стр.goto(адрес('#/hadith'));
    await п.экран('экран-хадисы', '#/hadith');
    await п.э('хадисы-поиск').waitFor({ timeout: 15000 });
    const поиск = п.э('хадисы-поиск');
    const десятый = индекс.хадисы[9];
    await поиск.fill('10');
    await п.э('хадисы-результаты').waitFor({ timeout: 15000 });
    п.проверить(await п.есть('хадис-строка-' + десятый.id), 'поиск «10» — хадис № 10 по порядку');
    await поиск.fill(String(десятый.id));
    await п.э('хадис-строка-' + десятый.id).waitFor();
    п.проверить(true, `поиск «${десятый.id}» — номер HadeethEnc`);
    const заголовок = данные.запись('ru', десятый.id).title;
    const слово = заголовок.split(/[\s«»,.!?:;"()—-]+/).filter((с) => с.length >= 7)[0];
    await поиск.fill(слово.toLowerCase());
    await п.э('хадис-строка-' + десятый.id).waitFor();
    п.проверить(/Найдено хадисов: \d+/.test((await п.сырой('хадисы-найдено')) ?? ''), `поиск «${слово.toLowerCase()}» — хадис найден, диктору «Найдено хадисов: N»`);
    await поиск.fill(String(ждутАкыда[0].id));
    await п.э('хадисы-ничего').waitFor();
    п.проверить(true, `поиск номера хадиса акыды #${ждутАкыда[0].id} — «Ничего не нашли»`);
    await поиск.fill('');
    for (const id of [ждутАкыда[0].id, ждутАкыда[ждутАкыда.length - 1].id, ждут[Math.floor(ждут.length / 2)]]) {
      await стр.goto(адрес(`#/hadith/item?n=${id}`));
      await п.экран('экран-хадис', `#/hadith/item?n=${id}`);
      await п.э('хадис-нет').waitFor({ timeout: 15000 });
      п.проверить(!(await п.есть('хадис-арабский')) && !АРАБСКИЙ.test(await п.текстЭ('экран-хадис')), `#/hadith/item?n=${id} (ждёт устаза) — «Такого хадиса в разделе нет», текста нет`);
    }
    await стр.goto(адрес('#/hadith/list?n=3'));
    await п.экран('экран-раздел-хадисов', '#/hadith/list?n=3');
    await п.э('раздел-нет').waitFor({ timeout: 15000 });
    п.проверить(true, '#/hadith/list?n=3 (акыда) — «Такого раздела нет»');
    п.проверить(ждутАкыда.length > 0 && ждутАкыда.every((з) => !опубликованы.has(з.id)), `${ждутАкыда.length} хадисов акыды нет в индексе сборки`);
    await п.безПроблем('поиск: нет ошибок, чужих запросов и нарушений CSP');
    await контекст.close();
  }

  // ── 5. kk, en, uz ──
  console.log('\n══ «Хадисы»: kk — русский перевод с пометкой; en, uz ══');
  {
    const { контекст, стр, проблемы } = await новаяСтраница(браузер, база, { язык: 'kk' });
    const п = помощники(стр, проблемы, 'kk', папкаСнимков);
    await стр.goto(адрес('#/hadith'));
    await п.экран('экран-хадисы', '#/hadith');
    п.проверить((await п.текстЭ('хадисы-нет-перевода')) === 'Қазақ тіліндегі аударма әзірге жоқ — орысша аудармасы', 'kk: раздел — «Қазақ тіліндегі аударма әзірге жоқ — орысша аудармасы»');
    await стр.goto(адрес(`#/hadith/item?n=${idХадиса}`));
    await п.экран('экран-хадис', `#/hadith/item?n=${idХадиса}`);
    await сверитьХадис(п, стр, данные, idХадиса, 'ru', 'kk');
    п.проверить((await п.текстЭ('хадис-нет-перевода')) === 'Қазақ тіліндегі аударма әзірге жоқ — орысша аудармасы', 'kk: хадис — русский перевод и пометка');
    п.проверить(/HadeethEnc\.com деректері бойынша/.test(await п.текстЭ('хадис-степень')), 'kk: «Дәрежесі: … · HadeethEnc.com деректері бойынша»');
    await п.снимок('хадис-kk');
    await п.безПроблем('kk: нет ошибок, чужих запросов и нарушений CSP');
    await контекст.close();
  }
  {
    const сEn = индекс.хадисы.find((х) => х.языки.includes('en'));
    const { контекст, стр, проблемы } = await новаяСтраница(браузер, база, { язык: 'en' });
    const п = помощники(стр, проблемы, 'en', null);
    await стр.goto(адрес(`#/hadith/item?n=${сEn.id}`));
    await п.экран('экран-хадис', `#/hadith/item?n=${сEn.id}`);
    await сверитьХадис(п, стр, данные, сEn.id, 'en', 'en');
    п.проверить(!(await п.есть('хадис-нет-перевода')), 'en: свой перевод, без пометки');
    await п.безПроблем('en: нет ошибок, чужих запросов и нарушений CSP');
    await контекст.close();
  }
  {
    const сUz = индекс.хадисы.find((х) => х.языки.includes('uz'));
    const безUz = индекс.хадисы.find((х) => !х.языки.includes('uz'));
    const { контекст, стр, проблемы } = await новаяСтраница(браузер, база, { язык: 'uz' });
    const п = помощники(стр, проблемы, 'uz', null);
    await стр.goto(адрес(`#/hadith/item?n=${сUz.id}`));
    await п.экран('экран-хадис', `#/hadith/item?n=${сUz.id}`);
    await сверитьХадис(п, стр, данные, сUz.id, 'uz', 'uz (свой перевод)');
    п.проверить((await п.есть('хадис-кириллица')) && !(await п.есть('хадис-нет-перевода')), 'uz: перевод HadeethEnc кириллицей — пометка, без «перевода нет»');
    await стр.goto(адрес(`#/hadith/item?n=${безUz.id}`));
    await п.экран('экран-хадис', `#/hadith/item?n=${безUz.id}`);
    await сверитьХадис(п, стр, данные, безUz.id, 'ru', 'uz (без узбекского — русский)');
    п.проверить((await п.текстЭ('хадис-нет-перевода')) === 'Oʻzbekcha tarjimasi hozircha yoʻq — ruscha tarjimasi', 'uz: «Oʻzbekcha tarjimasi hozircha yoʻq — ruscha tarjimasi»');
    await п.безПроблем('uz: нет ошибок, чужих запросов и нарушений CSP');
    await контекст.close();
  }

  // ── 6. 360×640 ──
  console.log('\n══ «Хадисы»: 360×640 — без горизонтальной прокрутки ══');
  {
    const { контекст, стр, проблемы } = await новаяСтраница(браузер, база, { ширина: 360, высота: 640 });
    const п = помощники(стр, проблемы, '360', null);
    await стр.goto(адрес('#/hadith'));
    await п.экран('экран-хадисы', '#/hadith');
    await п.э('хадисы-разделы').waitFor({ timeout: 15000 });
    await п.безГоризонтальнойПрокрутки('#/hadith');
    const самыйДлинный = корни.reduce((а, б) => ((б.название.ru ?? '').length > (а.название.ru ?? '').length ? б : а));
    await стр.goto(адрес(`#/hadith/list?n=${самыйДлинный.id}`));
    await п.экран('экран-раздел-хадисов', `#/hadith/list?n=${самыйДлинный.id}`);
    await стр.waitForTimeout(300);
    await п.безГоризонтальнойПрокрутки(`раздел «${самыйДлинный.название.ru}»`);
    // Хадис с самым длинным арабским текстом и разъяснением.
    const длинный = индекс.хадисы.reduce((а, б) => (данные.арабский('ru', б.id).length > данные.арабский('ru', а.id).length ? б : а));
    await стр.goto(адрес(`#/hadith/item?n=${длинный.id}`));
    await п.экран('экран-хадис', `#/hadith/item?n=${длинный.id}`);
    await п.э('хадис-арабский').waitFor({ timeout: 15000 });
    await п.э('хадис-разъяснение').click();
    if (await п.есть('хадис-ссылки')) await п.э('хадис-ссылки').click();
    await стр.waitForTimeout(200);
    await п.безГоризонтальнойПрокрутки(`хадис #${длинный.id} (самый длинный арабский текст), разъяснение раскрыто`);
    await п.безПроблем('360: нет ошибок, чужих запросов и нарушений CSP');
    await контекст.close();
  }
  return проверок;
}

// Запуск напрямую.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = require('playwright');
  const сервер = await запуститьСервер({ порт: 0 });
  const браузер = await chromium.launch();
  try {
    const н = await хадисыСквозной(браузер, сервер.адрес);
    console.log(`\nOK: «Хадисы» — ${н} проверок`);
  } catch (е) {
    console.error('\n' + (е?.stack ?? е));
    process.exitCode = 1;
  } finally {
    await браузер.close();
    await сервер.закрыть();
  }
}
