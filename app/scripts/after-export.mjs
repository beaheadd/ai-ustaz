#!/usr/bin/env node
/**
 * Доводка веб-экспорта (запускается из `npm run export:web` после `expo export`).
 *
 * Делает одно: вставляет в dist/index.html Content-Security-Policy (meta), которая
 * запрещает браузеру ЛЮБЫЕ внешние запросы — скрипты, стили, шрифты, картинки, звук,
 * fetch/XHR/WebSocket только с того же сайта. Это страховка правила «без аналитики,
 * трекеров и внешних запросов»: даже если зависимость попробует сходить в сеть, браузер не даст.
 * В шаблон public/index.html политика не вшита, чтобы не мешать дев-серверу (HMR, eval).
 *
 * Контракт: node scripts/after-export.mjs [папка-сборки=dist]; повторный запуск ничего не меняет.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const папка = path.resolve(корень, process.argv[2] ?? 'dist');
const файл = path.join(папка, 'index.html');

export const ПОЛИТИКА = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // react-native-web вставляет стили через <style>
  "img-src 'self' data: blob:", // значок — встроенный SVG (data:)
  "font-src 'self' data:",
  "media-src 'self' blob:", // прослушивание своей записи (object URL)
  "connect-src 'self'",
  "worker-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const html = fs.readFileSync(файл, 'utf8');
if (html.includes('http-equiv="Content-Security-Policy"')) {
  console.log('CSP уже есть в', path.relative(корень, файл));
} else {
  const мета = `<meta http-equiv="Content-Security-Policy" content="${ПОЛИТИКА}" />`;
  if (!/<meta charset="utf-8"\s*\/?>/i.test(html)) throw new Error('В index.html нет <meta charset="utf-8"> — шаблон public/index.html изменён?');
  const новый = html.replace(/(<meta charset="utf-8"\s*\/?>)/i, `$1\n    ${мета}`);
  fs.writeFileSync(файл, новый);
  console.log('CSP добавлена в', path.relative(корень, файл));
}
