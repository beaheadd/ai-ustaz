#!/usr/bin/env node
/**
 * Тест дизайн-системы (без браузера): node scripts/test-theme.mjs  (npm run test:theme)
 *   theme/tokens.ts  — контраст WCAG 2.1 всех пар ПАРЫ_КОНТРАСТА в светлой и тёмной теме
 *                      (текст ≥ 4,5:1, время намаза и основной текст ≥ 7:1, значки и рамки ≥ 3:1);
 *                      и APCA 0.0.98G-4g (|Lc| — где у пары задан 4-й порог; дизайн A, 28.11.2026);
 *                      у тем одинаковые ключи; цвета — #RRGGBB (кроме наложения);
 *   design/icons.ts  — у каждого значка есть фигуры, пути только из команд SVG, координаты в сетке 24;
 *   design/illustrations.ts — 10 иллюстраций A (28.11.2026): фигуры с ролями палитры, координаты в сетке 64, пути — только
 *                      команды SVG; ПАЛИТРА_ИЛЛЮСТРАЦИЙ — те же роли в светлой и тёмной теме;
 *   design/emblem.ts — у эмблемы оба варианта (полный и значок), роли цветов известны;
 *   design/geometry.ts — путьАрки замкнут и не выходит за ширину/высоту.
 * Модули — TypeScript без импортов (кроме `import type`): node ≥ 22.18 снимает типы сам.
 * Печатает таблицу контраста (её же берёт docs/дизайн/03-дизайн-система.md §2).
 */
import assert from 'node:assert/strict';

const { светлая, тёмная, ПАРЫ_КОНТРАСТА, ПАРЫ_КОНТРАСТА_СВЕТЛОЙ } = await import('../src/theme/tokens.ts');
const { ЗНАЧКИ } = await import('../src/design/icons.ts');
const { ИЛЛЮСТРАЦИИ, РОЛИ_ИЛЛЮСТРАЦИЙ } = await import('../src/design/illustrations.ts');
const { ПАЛИТРА_ИЛЛЮСТРАЦИЙ } = await import('../src/theme/tokens.ts');
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

/** APCA 0.0.98G-4g (W3 Silver): Lc текста на фоне; + тёмный на светлом, − светлый на тёмном. */
export function apca(текст, фон) {
  const y = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const v = 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
    return v < 0.022 ? v + (0.022 - v) ** 1.414 : v;
  };
  const т = y(текст);
  const ф = y(фон);
  if (Math.abs(ф - т) < 0.0005) return 0;
  if (ф > т) {
    const с = (ф ** 0.56 - т ** 0.57) * 1.14;
    return с < 0.1 ? 0 : (с - 0.027) * 100;
  }
  const с = (ф ** 0.65 - т ** 0.62) * 1.14;
  return с > -0.1 ? 0 : (с + 0.027) * 100;
}
тест('APCA сверен с эталоном (#1B2520 на #F5EFE2 = 93,4; #E6E1D6 на #121715 = −87,8)', () => {
  assert.equal(Math.round(apca('#1B2520', '#F5EFE2') * 10) / 10, 93.4);
  assert.equal(Math.round(apca('#E6E1D6', '#121715') * 10) / 10, -87.8);
});

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
  const пары = имяТемы === 'светлая' ? [...ПАРЫ_КОНТРАСТА, ...ПАРЫ_КОНТРАСТА_СВЕТЛОЙ] : ПАРЫ_КОНТРАСТА;
  for (const [текст, фон, порог, порогLc] of пары) {
    const к = контраст(тема[текст], тема[фон]);
    const lc = apca(тема[текст], тема[фон]);
    строки.push(`${имяТемы.padEnd(8)} ${текст.padEnd(18)} на ${фон.padEnd(18)} ${к.toFixed(2).padStart(6)} (≥ ${порог})  Lc ${lc.toFixed(1).padStart(6)}${порогLc ? ` (|Lc| ≥ ${порогLc})` : ''}`);
    if (к < порог) провалы.push(`${имяТемы}: ${текст} ${тема[текст]} на ${фон} ${тема[фон]} = ${к.toFixed(2)} < ${порог}`);
    if (порогLc && Math.abs(lc) < порогLc) провалы.push(`${имяТемы}: ${текст} на ${фон}: APCA |Lc| ${Math.abs(lc).toFixed(1)} < ${порогLc}`);
  }
}
тест(`контраст ${ПАРЫ_КОНТРАСТА.length * 2 + ПАРЫ_КОНТРАСТА_СВЕТЛОЙ.length} пар не ниже порога (WCAG и APCA)`, () => assert.deepEqual(провалы, []));

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

console.log('illustrations');
тест('иллюстраций 10 (дизайн A): зикры, дуа, коран, хадисы, намаз, таджвид, закят, кибла, время намаза, устаз', () => {
  assert.deepEqual(Object.keys(ИЛЛЮСТРАЦИИ).sort(), ['времяНамаза', 'дуа', 'закят', 'зикры', 'кибла', 'коран', 'намаз', 'таджвид', 'устаз', 'хадисы'].sort());
});
тест('у каждой фигуры — известная роль цвета; координаты в сетке 0…64; пути — команды SVG', () => {
  const роли = new Set(Object.values(РОЛИ_ИЛЛЮСТРАЦИЙ));
  for (const тема of ['светлая', 'тёмная']) assert.deepEqual(Object.keys(ПАЛИТРА_ИЛЛЮСТРАЦИЙ[тема]).sort(), [...роли].sort(), тема);
  for (const [имя, фигуры] of Object.entries(ИЛЛЮСТРАЦИИ)) {
    assert.ok(фигуры.length > 3, имя);
    for (const ф of фигуры) {
      const р = ф.з ?? ф.об;
      assert.ok(р && РОЛИ_ИЛЛЮСТРАЦИЙ[р], `${имя}: роль ${р}`);
      if (ф.d) {
        assert.match(ф.d, КОМАНДЫ, имя);
        const числа = ф.d.match(/-?\d*\.?\d+/g).map(Number);
        assert.ok(числа.every((ч) => ч >= -64 && ч <= 64), `${имя}: путь за сеткой`);
      }
      for (const к of ['cx', 'cy', 'x', 'y']) if (ф[к] !== undefined) assert.ok(ф[к] >= 0 && ф[к] <= 64, `${имя}: ${к}`);
    }
  }
  for (const тема of ['светлая', 'тёмная']) for (const [к, ц] of Object.entries(ПАЛИТРА_ИЛЛЮСТРАЦИЙ[тема])) assert.match(ц, /^#[0-9A-F]{6}$/, `${тема}.${к}`);
});
тест('иллюстрации легче 6 КБ каждая (данные), арка — одна на всех (не повторяется в данных)', () => {
  for (const [имя, фигуры] of Object.entries(ИЛЛЮСТРАЦИИ)) assert.ok(JSON.stringify(фигуры).length < 6000, имя);
  assert.ok(!Object.values(ИЛЛЮСТРАЦИИ).flat().some((ф) => ф.з === 'a' || ф.об === 'a'));
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

console.log('\nКонтраст (WCAG 2.1 и APCA Lc):');
for (const с of строки) console.log('  ' + с);
console.log(`\nВсего проверок: ${проверок} — всё прошло.`);
