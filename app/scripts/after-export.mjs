#!/usr/bin/env node
/**
 * Доводка веб-экспорта (запускается из `npm run export:web` после `expo export`).
 *
 * Делает две вещи:
 * 1) вставляет в dist/index.html Content-Security-Policy (meta), которая
 * запрещает браузеру ЛЮБЫЕ внешние запросы — скрипты, стили, шрифты, картинки, звук,
 * fetch/XHR/WebSocket только с того же сайта. Это страховка правила «без аналитики,
 * трекеров и внешних запросов»: даже если зависимость попробует сходить в сеть, браузер не даст.
 * В шаблон public/index.html политика не вшита, чтобы не мешать дев-серверу (HMR, eval).
 * connect-src 'self' пропускает только свой адрес — в том числе /api/speech/… своего домена (проверка голосом).
 * 2) ставит метку сборки <meta name="aiustaz-speech-check" content="on|off"> — была ли сборка с флагом
 *    проверки голосом (EXPO_PUBLIC_SPEECH_CHECK=1 в том же окружении, что и `expo export`). check-dist не
 *    пропустит сборку «on» для batr.kz (проверка голосом — только на своём домене, QML).
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

export const МЕТКА_ПРОВЕРКИ = 'aiustaz-speech-check';
const проверка = process.env.EXPO_PUBLIC_SPEECH_CHECK === '1' ? 'on' : 'off';
{
  const текущий = fs.readFileSync(файл, 'utf8');
  const мета = `<meta name="${МЕТКА_ПРОВЕРКИ}" content="${проверка}" />`;
  const образец = new RegExp(`<meta name="${МЕТКА_ПРОВЕРКИ}"[^>]*>`);
  const новый = образец.test(текущий) ? текущий.replace(образец, мета) : текущий.replace(/(<meta http-equiv="Content-Security-Policy"[^>]*>)/i, `$1\n    ${мета}`);
  if (!новый.includes(мета)) throw new Error('не удалось поставить метку проверки голосом в index.html');
  fs.writeFileSync(файл, новый);
  console.log(`Проверка голосом в сборке: ${проверка === 'on' ? 'ВКЛЮЧЕНА (только для своего домена, не batr.kz)' : 'выключена'}`);
}
