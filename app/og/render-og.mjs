// Рендер баннера превью AI Ustaz: og-banner.html → JPEG 1200×630 (Playwright предустановлен).
// Запуск: node app/og/render-og.mjs <выход.jpg>
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
const здесь = dirname(fileURLToPath(import.meta.url))
const шрифт = pathToFileURL(join(здесь, '..', 'node_modules/@expo-google-fonts/amiri-quran/400Regular/AmiriQuran_400Regular.ttf')).href
const html = readFileSync(join(здесь, 'og-banner.html'), 'utf8').replace('AMIRI_URL', шрифт)
const браузер = await chromium.launch()
const стр = await браузер.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
const врем = join(здесь, '.og-tmp.html'); writeFileSync(врем, html)
await стр.goto(pathToFileURL(врем).href); await стр.evaluate(() => document.fonts.ready)
await стр.screenshot({ path: process.argv[2] || join(здесь, 'og-aiustaz.jpg'), type: 'jpeg', quality: 86 })
await браузер.close()
import('node:fs').then((fs) => fs.unlinkSync(врем))
