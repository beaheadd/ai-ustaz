#!/usr/bin/env node
/**
 * Проверка текстов витрины Google Play (twa/play/listing-*.md): длины по пределам Play и запретные слова.
 *
 * Контракт: node twa/play/check-listing.mjs → код 0, если в каждом файле у каждого раздела «## … (≤ N)» текст в блоке
 * ``` … ``` не длиннее N знаков; нет «лучший», «№1», «#1», «топ», «best», «рейтинг» (правила Play о метаданных и
 * CLAUDE.md, правило 9); нет обещаний хадисов (в приложении их пока нет). Печатает длины.
 * Решение владельца 19.11.2026: «Сразу нужно подготовить файлы, чтобы загрузить на Play Market».
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const здесь = path.dirname(fileURLToPath(import.meta.url));
const ЗАПРЕТ = /лучш|№\s?1|#1\b|\bтоп\b|\bbest\b|\btop\b|рейтинг|үздік|хадис|hadith/i;
let ошибок = 0;
for (const файл of fs.readdirSync(здесь).filter((ф) => /^listing-[a-z]{2}\.md$/.test(ф)).sort()) {
  const текст = fs.readFileSync(path.join(здесь, файл), 'utf8');
  for (const м of текст.matchAll(/^## (.+?)\(≤ (\d+)\)\s*\n```\n([\s\S]*?)\n```/gm)) {
    const [, раздел, предел, тело] = м;
    const длина = [...тело].length;
    const ок = длина <= Number(предел);
    if (!ок) ошибок += 1;
    console.log(`${ок ? '✓' : '✗'} ${файл} · ${раздел.trim()}: ${длина} из ${предел}`);
    const запрет = тело.match(ЗАПРЕТ);
    if (запрет) {
      ошибок += 1;
      console.log(`✗ ${файл} · ${раздел.trim()}: запретное слово «${запрет[0]}»`);
    }
  }
}
if (ошибок) {
  console.error(`ОШИБКИ: ${ошибок}`);
  process.exit(1);
}
console.log('OK: тексты витрины в пределах Play');
