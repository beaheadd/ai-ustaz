/**
 * Магнитное склонение по модели WMM2025 — для сборки списков мест (tools/prayer/build_places_uz.py, build_world.py).
 *
 * Контракт (stdin → stdout, JSON):
 *   { "точки": [[широта, долгота], …] }                    → { "склонение": [°, …] } (к востоку — плюс, 0,1°)
 *   { "сетка": { "шаг": 5, "широта": [-60, 75] } }          → { "шаг", "широта": [от, до], "долгота": [-180, 180],
 *                                                              "строки": [[° по долготе от −180 до 180], …] } (по широте снизу вверх)
 * Дата модели — 01.01.2027 (как у places-kz.json; WMM2025 действует до 13.11.2029).
 * Зависимость — npm-пакет geomagnetism@0.2.0 (Apache-2.0; коэффициенты WMM2025 — NOAA NCEI / NGA, общественное
 * достояние). В приложение пакет не входит: только числа в данных. Путь к пакету — переменная GEOMAGNETISM
 * (каталог node_modules/geomagnetism), установка: npm i --prefix <временный каталог> geomagnetism@0.2.0.
 * Запуск: GEOMAGNETISM=… node tools/prayer/declination.mjs < вход.json > выход.json
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const путь = process.env.GEOMAGNETISM;
if (!путь) {
  console.error('нужна переменная GEOMAGNETISM — каталог npm-пакета geomagnetism@0.2.0');
  process.exit(2);
}
const geomagnetism = createRequire(import.meta.url)(путь);
const модель = geomagnetism.model(new Date('2027-01-01T00:00:00Z'));
const скл = (ш, д) => Math.round(модель.point([ш, д]).decl * 10) / 10;

const вход = JSON.parse(fs.readFileSync(0, 'utf8'));
let выход;
if (Array.isArray(вход.точки)) {
  выход = { склонение: вход.точки.map(([ш, д]) => скл(ш, д)) };
} else if (вход.сетка) {
  const шаг = вход.сетка.шаг;
  const [от, до] = вход.сетка.широта;
  const строки = [];
  for (let ш = от; ш <= до; ш += шаг) {
    const строка = [];
    for (let д = -180; д <= 180; д += шаг) строка.push(Math.round(скл(ш, д)));
    строки.push(строка);
  }
  выход = { шаг, широта: [от, до], долгота: [-180, 180], строки };
} else {
  console.error('вход: { точки } или { сетка }');
  process.exit(2);
}
process.stdout.write(JSON.stringify(выход));
