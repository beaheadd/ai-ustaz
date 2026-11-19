#!/usr/bin/env node
/**
 * Тест дизайн-системы (без браузера): node scripts/test-theme.mjs  (npm run test:theme)
 *   theme/tokens.ts  — контраст WCAG 2.1 всех пар ПАРЫ_КОНТРАСТА в светлой и тёмной теме
 *                      (текст ≥ 4,5:1, время намаза и основной текст ≥ 7:1, значки и рамки ≥ 3:1);
 *                      у тем одинаковые ключи; цвета — #RRGGBB (кроме наложения);
 *   design/icons.ts  — у каждого значка есть фигуры, пути только из команд SVG, координаты в сетке 24;
 *   design/emblem.ts — у эмблемы оба варианта (полный и значок), роли цветов известны;
 *   design/geometry.ts — путьАрки замкнут и не выходит за ширину/высоту.
 * Модули — TypeScript без импортов (кроме `import type`): node ≥ 22.18 снимает типы сам.
 * Печатает таблицу контраста (её же берёт docs/дизайн/03-дизайн-система.md §2).
 */
import assert from 'node:assert/strict';

const { светлая, тёмная, ПАРЫ_КОНТРАСТА } = await import('../src/theme/tokens.ts');
const { ЗНАЧКИ } = await import('../src/design/icons.ts');
const { ЭМБЛЕМА, РОЛИ_ЭМБЛЕМЫ } = await import('../src/design/emblem.ts');
const { путьАрки } = await import('../src/design/geometry.ts');

let проверок = 0;
function тест(имя, ф) {
  ф();
  проверок += 1;
  console.log('  ✓ ' + имя);
}

/** Относительная яркость sRGB (WCAG 2.1). */
function яркость(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((к) => (к <= 0.04045 ? к / 12.92 : ((к + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function контраст(а, б) {
  const [x, y] = [яркость(а), яркость(б)].sort((п, в) => в - п);
  return (x + 0.05) / (y + 0.05);
}

console.log('tokens');
тест('у тем одинаковые ключи', () => assert.deepEqual(Object.keys(светлая).sort(), Object.keys(тёмная).sort()));
тест('цвета — #RRGGBB (кроме наложения)', () => {
  for (const тема of [светлая, тёмная]) {
    for (const [ключ, значение] of Object.entries(тема)) {
      if (ключ === 'наложение') continue;
      assert.match(значение, /^#[0-9A-F]{6}$/, `${ключ}: ${значение}`);
    }
  }
});
const провалы = [];
const строки = [];
for (const [имяТемы, тема] of [['светлая', светлая], ['тёмная', тёмная]]) {
  for (const [текст, фон, порог] of ПАРЫ_КОНТРАСТА) {
    const к = контраст(тема[текст], тема[фон]);
    строки.push(`${имяТемы.padEnd(8)} ${текст.padEnd(18)} на ${фон.padEnd(18)} ${к.toFixed(2).padStart(6)} (≥ ${порог})`);
    if (к < порог) провалы.push(`${имяТемы}: ${текст} ${тема[текст]} на ${фон} ${тема[фон]} = ${к.toFixed(2)} < ${порог}`);
  }
}
тест(`контраст ${ПАРЫ_КОНТРАСТА.length * 2} пар не ниже порога`, () => assert.deepEqual(провалы, []));

console.log('icons');
const КОМАНДЫ = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;
тест(`значков: ${Object.keys(ЗНАЧКИ).length}, у каждого есть фигуры`, () => {
  for (const [имя, фигуры] of Object.entries(ЗНАЧКИ)) {
    assert.ok(Array.isArray(фигуры) && фигуры.length > 0, имя);
    for (const ф of фигуры) {
      if (ф.d) assert.match(ф.d, КОМАНДЫ, `${имя}: ${ф.d}`);
      else assert.ok(ф.круг, `${имя}: фигура без d и круга`);
    }
  }
});
тест('координаты значков в сетке 0…24', () => {
  for (const [имя, фигуры] of Object.entries(ЗНАЧКИ)) {
    for (const ф of фигуры) {
      if (ф.круг) {
        const [cx, cy, r] = ф.круг;
        assert.ok(cx - r >= 0 && cx + r <= 24 && cy - r >= 0 && cy + r <= 24, `${имя}: круг за сеткой`);
      }
    }
  }
});

console.log('emblem');
тест('у эмблемы есть «полный» и «значок»', () => {
  assert.ok(ЭМБЛЕМА.полный.length > 5 && ЭМБЛЕМА.значок.length > 3);
});
тест('роли цветов эмблемы известны', () => {
  for (const ф of [...ЭМБЛЕМА.полный, ...ЭМБЛЕМА.значок]) {
    if (ф.заливка) assert.ok(РОЛИ_ЭМБЛЕМЫ.includes(ф.заливка) || ф.заливка.startsWith('url:'), ф.заливка);
    if (ф.обводка) assert.ok(РОЛИ_ЭМБЛЕМЫ.includes(ф.обводка), ф.обводка);
  }
});

console.log('geometry');
тест('путьАрки: замкнут, в пределах ширины и высоты', () => {
  for (const [ш, в, п] of [[360, 400, 40], [120, 160, 24], [48, 64, 12]]) {
    const d = путьАрки(ш, в, п, 18);
    assert.match(d, /Z$/);
    const числа = d.match(/-?\d+(\.\d+)?/g).map(Number);
    assert.ok(числа.every((ч) => ч >= -0.01 && ч <= Math.max(ш, в) + 0.01), d);
  }
});

console.log('\nКонтраст (WCAG 2.1):');
for (const с of строки) console.log('  ' + с);
console.log(`\nВсего проверок: ${проверок} — всё прошло.`);
