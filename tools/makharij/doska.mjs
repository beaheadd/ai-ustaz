/**
 * Доска махраджей для владельца и устаза: сетка всех схем (по махраджу — файл, где он выделен, плюс виды сверху и
 * вариант губ для و) с номером, названием по-арабски, буквами шрифтом Amiri Quran, подписью ru и «что → куда».
 *
 * Запуск (из корня репозитория, после python3 -I -B tools/makharij/build_makharij.py):
 *   node tools/makharij/doska.mjs <out.png> [light|dark]
 * Читает content/makharij.json, content/letters.json, app/public/makharij/*.svg; шрифт — app/node_modules/
 * @expo-google-fonts/amiri-quran. Пишет PNG шириной 1200 px (и рядом .html). В репозиторий результат не кладём.
 * Playwright — предустановленный (require('playwright'), как в app/scripts/e2e.mjs).
 * Решение владельца 19.11.2026: «картинку произношения каждой буквы…»; «рисуй как реальный рот человека» — схемы свои,
 * реалистичный разрез (docs/дизайн/06); черновик — правило 11 CLAUDE.md, плашка «черновик» на доске. Сетка — 3 колонки.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [выход, тема = 'light'] = process.argv.slice(2);
if (!выход) {
  console.error('node tools/makharij/doska.mjs <out.png> [light|dark]');
  process.exit(2);
}
const данные = JSON.parse(fs.readFileSync(path.join(корень, 'content', 'makharij.json'), 'utf8'));
const буквы = JSON.parse(fs.readFileSync(path.join(корень, 'content', 'letters.json'), 'utf8'));
const знак = Object.fromEntries(буквы.map((б) => [б.id, б.знак]));
const папка = path.join(корень, 'app', 'public', 'makharij');
const шрифт = path.join(корень, 'app', 'node_modules', '@expo-google-fonts', 'amiri-quran', '400Regular', 'AmiriQuran_400Regular.ttf');
const экр = (т) => String(т).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const подпись = Object.fromEntries(данные.схемы.map((с) => [с.файл, с.подпись.ru]));
for (const с of данные.схемы) for (const в of Object.values(с.варианты ?? {})) подпись[в.файл] = с.подпись.ru;

const карточки = [];
for (const м of данные.махраджи) {
  const п = м.подсветка;
  // у губ و — своей карточкой (свой вариант схемы), у хайшума — носители гунны с шаддой
  const своих = м.подсветка.якорьВав ? м.буквы.filter((б) => б !== 'waw') : м.буквы;
  const текстБукв = м.id === 'khayshum' ? 'نّ مّ' : своих.map((б) => знак[б]).join(' ');
  const что = п.что.ru + (п.куда ? ` → ${п.куда.ru}` : '');
  карточки.push({ n: м.номер, ар: м.арабский.название, буквы: текстБукв, имя: м.название.ru, файл: м.схема, что });
  if (м.схемаСверху) {
    карточки.push({ n: м.номер, ар: м.арабский.название, буквы: текстБукв, имя: `${м.название.ru} — вид сверху`, файл: м.схемаСверху, что });
  }
  if (м.подсветка.якорьВав) {
    const вав = данные.буквы.waw;
    карточки.push({ n: м.номер, ар: м.арабский.название, буквы: 'وَّ', имя: 'و-согласная: губы округлены, не сомкнуты', файл: вав.схема, что: 'губы округлены и вытянуты, отверстие открыто' });
  }
}

const тёмная = тема === 'dark';
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Махраджи — доска</title><style>
@font-face{font-family:AmiriQuran;src:url(${pathToFileURL(шрифт).href})}
:root{color-scheme:${тёмная ? 'dark' : 'light'};--фон:${тёмная ? '#0C1715' : '#F7F2E8'};--карта:${тёмная ? '#13221F' : '#FFFDF8'};--текст:${тёмная ? '#EDE6D6' : '#1B2623'};--второй:${тёмная ? '#A7B4AF' : '#55625E'};--акцент:${тёмная ? '#7CC4B6' : '#0F4C45'};--акцентТекст:${тёмная ? '#0C1715' : '#FFFDF8'};--граница:${тёмная ? '#2E423D' : '#E2D9C8'};--плашка:${тёмная ? '#3A3120' : '#F3E6C9'};--плашкаТекст:${тёмная ? '#F1DDB0' : '#5A4316'}}
*{box-sizing:border-box}body{margin:0;width:1200px;padding:24px;background:var(--фон);color:var(--текст);font:14px/1.35 system-ui,sans-serif}
header{display:flex;align-items:baseline;gap:16px;margin-bottom:6px}h1{font-size:24px;margin:0}
.плашка{background:var(--плашка);color:var(--плашкаТекст);border-radius:8px;padding:3px 10px;font-weight:600;font-size:13px}
.легенда{color:var(--второй);margin:0 0 16px;font-size:13px}
.сетка{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.к{background:var(--карта);border:1px solid var(--граница);border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:6px}
.в{display:flex;align-items:center;gap:10px}.н{flex:none;width:32px;height:32px;border-radius:50%;background:var(--акцент);color:var(--акцентТекст);display:grid;place-items:center;font-weight:700;font-size:16px}
.б{font-family:AmiriQuran,serif;font-size:44px;line-height:1.25;margin-inline-start:auto;direction:rtl;white-space:nowrap}
.ар{font-family:AmiriQuran,serif;font-size:20px;direction:rtl;text-align:right;color:var(--второй)}
.имя{font-weight:700;font-size:19px;line-height:1.2}img{width:100%;height:auto;display:block}.п{color:var(--второй);font-size:13px}
</style><body>
<header><h1>Махраджи букв: реалистичные схемы (версия 2)</h1><span class="плашка">Черновик — проверяет устаз</span></header>
<p class="легенда">17 махраджей по Ибн аль-Джазари. Разрез головы от носа и ниже (без глаз, лба, ушей). Оранжевая линия — что работает (язык, губа), жёлтая — куда касается, золотое свечение — место; пунктир со стрелкой — воздух; круг — то же место крупно. Вид сверху: синие бусины — опора с давлением, жёлтые — касание без давления. Рисунки свои, с нуля. Буквы — шрифтом Amiri Quran.</p>
<div class="сетка">${карточки.map((к) => `<div class="к"><div class="в"><span class="н">${к.n}</span><span class="имя">${экр(к.имя)}</span><span class="б">${экр(к.буквы)}</span></div>
<div class="ар">${экр(к.ар)}</div><img src="${pathToFileURL(path.join(папка, к.файл)).href}" alt="${экр(подпись[к.файл] ?? '')}">
<div class="п">${экр(подпись[к.файл] ?? '')}</div><div class="п">Выделено: ${экр(к.что)}</div></div>`).join('')}</div></body></html>`;

const htmlПуть = выход.replace(/\.png$/i, '') + '.html';
fs.mkdirSync(path.dirname(path.resolve(выход)), { recursive: true });
fs.writeFileSync(htmlПуть, html);
const браузер = await chromium.launch();
const стр = await браузер.newPage({ viewport: { width: 1200, height: 900 }, colorScheme: тёмная ? 'dark' : 'light' });
await стр.goto(pathToFileURL(path.resolve(htmlПуть)).href);
await стр.evaluate(() => document.fonts.ready);
await стр.waitForTimeout(300);
await стр.screenshot({ path: выход, fullPage: true });
await браузер.close();
console.log(`Доска: ${выход} (${карточки.length} карточек)`);
