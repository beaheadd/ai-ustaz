#!/usr/bin/env node
/**
 * Локальный сервер, повторяющий batr.kz для проверки сборки (только для тестов, не прод).
 *
 * Как на batr.kz (nginx: root /opt/world/web/dist; location / { try_files $uri /index.html; }):
 *   /aiustaz/<файл>  → app/dist/<файл>, если такой ФАЙЛ есть (каталоги не отдаются: нет $uri/);
 *   всё остальное    → «index.html сайта BATR» — здесь заглушка со встроенным скриптом:
 *                      адреса /aiustaz… перенаправляются на /aiustaz/index.html с тем же ?query и #hash
 *                      (так должен сделать скрипт в index.html batr-world — отдельный этап).
 * Заголовки кэша как у SW batr: index.html — из сети (no-cache), файлы с хэшем — immutable.
 *
 * Запуск: npm run serve:test  (PORT=5390 по умолчанию; папка сборки — DIST или app/dist).
 * Из кода: import { запуститьСервер } from './serve-test.mjs'; const с = await запуститьСервер({ порт: 0 });
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ТИПЫ = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', // значки PWA (pwa/, исключение 19.11.2026)
};

export const ЗАГЛУШКА_BATR = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>batr.kz (тестовая заглушка)</title>
<script>
  // То, что должен делать index.html сайта BATR для адресов /aiustaz… (nginx не меняем).
  (function () {
    var p = location.pathname;
    if (p === '/aiustaz' || p.indexOf('/aiustaz/') === 0) {
      location.replace('/aiustaz/index.html' + location.search + location.hash);
    }
  })();
</script></head>
<body><h1>batr.kz — тестовая заглушка</h1><nav><a href="/aiustaz">AI Ustaz</a></nav></body></html>`;

/**
 * аудио(путь) → { тип, тело: Buffer } | null — необязательная подделка своего зеркала аудио /aiustaz-audio/… (как nginx
 * aiustaz.pro: файл целиком или кусок по Range — 206). Только тесты (e2e-download.mjs: тоны, НЕ Коран).
 */
export function запуститьСервер({ порт = Number(process.env.PORT ?? 5390), папка = process.env.DIST ?? path.join(корень, 'dist'), хост = '127.0.0.1', аудио = null } = {}) {
  const база = path.resolve(папка);
  const сервер = http.createServer((запрос, ответ) => {
    let путь;
    try {
      путь = decodeURIComponent(new URL(запрос.url ?? '/', 'http://локально').pathname);
    } catch {
      ответ.writeHead(400).end();
      return;
    }
    if (аудио && путь.startsWith('/aiustaz-audio/')) {
      const ф = аудио(путь);
      if (!ф) {
        ответ.writeHead(404, { 'Content-Type': 'text/plain' }).end('нет');
        return;
      }
      const р = /^bytes=(\d+)-(\d*)$/.exec(запрос.headers.range ?? '');
      if (р && Number(р[1]) < ф.тело.length) {
        const н = Number(р[1]);
        const к = р[2] === '' ? ф.тело.length - 1 : Math.min(Number(р[2]), ф.тело.length - 1);
        ответ.writeHead(206, { 'Content-Type': ф.тип, 'Content-Range': `bytes ${н}-${к}/${ф.тело.length}`, 'Content-Length': к - н + 1, 'Accept-Ranges': 'bytes' });
        ответ.end(ф.тело.subarray(н, к + 1));
        return;
      }
      ответ.writeHead(200, { 'Content-Type': ф.тип, 'Content-Length': ф.тело.length, 'Accept-Ranges': 'bytes', 'Cache-Control': путь.endsWith('.json') ? 'no-cache' : 'public, max-age=31536000, immutable' });
      ответ.end(ф.тело);
      return;
    }
    if (путь.startsWith('/aiustaz/')) {
      const файл = path.resolve(база, '.' + путь.slice('/aiustaz'.length));
      if (файл.startsWith(база + path.sep) && fs.existsSync(файл) && fs.statSync(файл).isFile()) {
        const это_index = path.basename(файл) === 'index.html';
        ответ.writeHead(200, {
          'Content-Type': ТИПЫ[path.extname(файл).toLowerCase()] ?? 'application/octet-stream',
          'Cache-Control': это_index ? 'no-cache' : 'public, max-age=31536000, immutable',
        });
        fs.createReadStream(файл).pipe(ответ);
        return;
      }
    }
    ответ.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    ответ.end(ЗАГЛУШКА_BATR);
  });
  return new Promise((готово, ошибка) => {
    сервер.once('error', ошибка);
    сервер.listen(порт, хост, () => {
      const адрес = сервер.address();
      готово({ сервер, порт: адрес.port, адрес: `http://${хост}:${адрес.port}`, закрыть: () => new Promise((з) => сервер.close(() => з())) });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { адрес } = await запуститьСервер();
  console.log(`Тестовый сервер: ${адрес}/aiustaz  (сборка: ${process.env.DIST ?? 'app/dist'}; Ctrl+C — стоп)`);
}
