#!/usr/bin/env node
/**
 * Тест установки AI Ustaz (без браузера): node scripts/test-install.mjs  (npm run test:install)
 *   install/platform.ts — среда по userAgent (Android Chrome/Samsung/Firefox/Edge, iPhone Safari/Chrome, iPad
 *     «как Mac», Instagram, Facebook, Telegram, WhatsApp, TikTok, Android WebView, компьютер), установлено
 *     (standalone, ?source=pwa|twa, android-app://), хост (aiustaz.pro, batr.kz, localhost) и сценарий экрана;
 *   scripts/pwa.mjs — манифест: scope/id/start_url в /aiustaz/, standalone, цвета токенов, значки всех видов;
 *   app/public/pwa — значки PNG нужных размеров (заголовок PNG), md5 в имени;
 *   twa/twa-manifest.json — пакет pro.aiustaz.app, host aiustaz.pro, startUrl /aiustaz/?source=twa, значки и
 *     манифест — те же имена, что даст сборка; Play Billing и уведомления выключены; ярлыков ≤ 2, без #/quran;
 *   twa/assetlinks.template.json — валидный JSON с пакетом pro.aiustaz.app.
 * Решение владельца 19.11.2026: TWA и установка на экран «Домой».
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ИМЯ_ЗНАЧКА, ЗНАЧКИ_PWA, найтиЗначки, построитьМанифест } from './pwa.mjs';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { определитьСреду, сценарий, видХоста, этоТелефон, АДРЕС_УСТАНОВКИ } = await import('../src/install/platform.ts');

let проверок = 0;
function тест(имя, ф) {
  ф();
  проверок += 1;
  console.log('  ✓ ' + имя);
}

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
  androidEdge: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 EdgA/131.0.0.0',
  androidYandex: 'Mozilla/5.0 (Linux; Android 13; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 YaBrowser/24.10.1.98.00 SA/3 Mobile Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  iphoneChromeСтарый: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/109.0.5414.83 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  ipadКакMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  instagramAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36 Instagram 356.0.0.41.101 Android (34/14; 450dpi; 1080x2340; samsung; SM-A546B; a54x; s5e8835; ru_RU; 659203856)',
  instagramIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 356.0.0.21.107 (iPhone14,5; iOS 17_6; ru_RU; ru; scale=3.00; 1170x2532; 653979216)',
  facebookIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.39.107;FBBV/655409574;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/ru_RU;FBOP/5]',
  facebookAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-G991B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.107 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/489.0.0.66.81;]',
  telegramAndroid: 'Mozilla/5.0 (Linux; Android 14; 23021RAA2Y Build/UKQ1.230917.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36 Telegram-Android/11.4.2 (Xiaomi 23021RAA2Y; Android 14; SDK 34; AVERAGE)',
  whatsappAndroid: 'Mozilla/5.0 (Linux; Android 12; SM-A125F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.22.79',
  tiktokAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 trill_370103 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/37.1.3 ByteLocale/ru',
  androidWebView: 'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36',
};

const среда = (ua, доп = {}) => определитьСреду({ ua, хост: 'aiustaz.pro', ...доп });

console.log('установка: хост');
тест('видХоста: aiustaz.pro и www — «свой»; batr.kz и поддомены — «batr»; localhost и прочее — «другой»', () => {
  assert.equal(видХоста('aiustaz.pro'), 'свой');
  assert.equal(видХоста('WWW.AIUSTAZ.PRO.'), 'свой');
  assert.equal(видХоста('batr.kz'), 'batr');
  assert.equal(видХоста('www.batr.kz'), 'batr');
  assert.equal(видХоста('analytics.batr.kz'), 'batr');
  assert.equal(видХоста('notbatr.kz'), 'другой');
  assert.equal(видХоста('aiustaz.pro.evil.com'), 'другой');
  assert.equal(видХоста('127.0.0.1'), 'другой');
  assert.equal(видХоста(undefined), 'другой');
  assert.equal(АДРЕС_УСТАНОВКИ, 'https://aiustaz.pro/aiustaz/#/install');
});

console.log('установка: среда по userAgent');
тест('Android Chrome: событие пришло → «кнопка», нет → «android-меню»', () => {
  const с = среда(UA.androidChrome);
  assert.deepEqual([с.ос, с.браузер, с.встроенный, с.установлено], ['android', 'chrome', null, false]);
  assert.equal(сценарий(с, true), 'кнопка');
  assert.equal(сценарий(с, false), 'android-меню');
  assert.ok(этоТелефон(с));
});
тест('Android: Samsung Internet, Firefox, Edge, Яндекс — свои браузеры (не Chrome), сценарий по событию', () => {
  assert.equal(среда(UA.samsung).браузер, 'samsung');
  assert.equal(среда(UA.androidFirefox).браузер, 'firefox');
  assert.equal(среда(UA.androidEdge).браузер, 'edge');
  assert.equal(среда(UA.androidYandex).браузер, 'yandex');
  assert.equal(сценарий(среда(UA.samsung), false), 'android-меню');
  assert.equal(сценарий(среда(UA.androidEdge), true), 'кнопка');
});
тест('iPhone Safari → «ios-safari» (версия iOS 18.1)', () => {
  const с = среда(UA.iphoneSafari);
  assert.deepEqual([с.ос, с.браузер, с.встроенный], ['ios', 'safari', null]);
  assert.deepEqual(с.версияIOS, [18, 1]);
  assert.equal(сценарий(с, false), 'ios-safari');
});
тест('iPhone Chrome/Firefox на iOS 17 → «ios-поделиться»; Chrome на iOS 15.7 → «ios-только-safari»', () => {
  assert.equal(среда(UA.iphoneChrome).браузер, 'chrome-ios');
  assert.equal(сценарий(среда(UA.iphoneChrome), false), 'ios-поделиться');
  assert.equal(сценарий(среда(UA.iphoneFirefox), false), 'ios-поделиться');
  assert.equal(сценарий(среда(UA.iphoneChromeСтарый), false), 'ios-только-safari');
  assert.equal(сценарий(определитьСреду({ ua: UA.iphoneChrome.replace('17_5', '16_3'), хост: 'aiustaz.pro' }), false), 'ios-только-safari');
  assert.equal(сценарий(определитьСреду({ ua: UA.iphoneChrome.replace('17_5', '16_4'), хост: 'aiustaz.pro' }), false), 'ios-поделиться');
});
тест('iPad в «режиме компьютера» (Mac + касания) → iOS Safari; Mac без касаний → компьютер', () => {
  assert.equal(сценарий(среда(UA.ipadКакMac, { касаний: 5 }), false), 'ios-safari');
  assert.equal(сценарий(среда(UA.macSafari, { касаний: 0 }), false), 'компьютер');
});
тест('встроенные браузеры: Instagram (Android, iPhone), Facebook, Telegram, WhatsApp, TikTok, Android WebView → «встроенный»', () => {
  const ожидание = [
    [UA.instagramAndroid, 'Instagram', 'android'],
    [UA.instagramIOS, 'Instagram', 'ios'],
    [UA.facebookIOS, 'Facebook', 'ios'],
    [UA.facebookAndroid, 'Facebook', 'android'],
    [UA.telegramAndroid, 'Telegram', 'android'],
    [UA.whatsappAndroid, 'WhatsApp', 'android'],
    [UA.tiktokAndroid, 'TikTok', 'android'],
    [UA.androidWebView, 'WebView', 'android'],
  ];
  for (const [ua, имя, ос] of ожидание) {
    const с = среда(ua);
    assert.equal(с.встроенный, имя, ua);
    assert.equal(с.ос, ос, ua);
    // Даже если встроенный браузер прислал beforeinstallprompt — сначала «откройте в браузере».
    assert.equal(сценарий(с, true), 'встроенный', ua);
  }
  assert.equal(среда(UA.androidChrome).встроенный, null);
  assert.equal(среда(UA.iphoneSafari).встроенный, null);
});
тест('компьютер: Windows Chrome/Edge, Mac Safari → «компьютер» (и при событии beforeinstallprompt)', () => {
  for (const ua of [UA.windowsChrome, UA.windowsEdge, UA.macSafari]) {
    const с = среда(ua);
    assert.equal(с.ос, 'другая');
    assert.equal(этоТелефон(с), false);
    assert.equal(сценарий(с, true), 'компьютер');
  }
  assert.equal(среда(UA.windowsEdge).браузер, 'edge');
  assert.equal(среда(UA.windowsChrome).браузер, 'chrome');
});
тест('установлено: standalone, ?source=pwa|twa, реферер android-app:// → «установлено» раньше всего', () => {
  assert.equal(сценарий(среда(UA.androidChrome, { автономно: true }), true), 'установлено');
  assert.equal(сценарий(среда(UA.iphoneSafari, { автономно: true }), false), 'установлено');
  assert.equal(сценарий(среда(UA.androidChrome, { источник: 'twa' }), false), 'установлено');
  assert.equal(сценарий(среда(UA.androidChrome, { источник: 'PWA' }), false), 'установлено');
  assert.equal(сценарий(среда(UA.androidChrome, { реферер: 'android-app://pro.aiustaz.app/' }), false), 'установлено');
  assert.equal(сценарий(среда(UA.androidChrome, { источник: 'menu' }), false), 'android-меню');
  assert.equal(сценарий(определитьСреду({ ua: UA.androidChrome, хост: 'batr.kz', автономно: true }), false), 'установлено');
});
тест('batr.kz: на любом телефоне и компьютере — «batr» (ставить с aiustaz.pro), даже во встроенном браузере', () => {
  for (const ua of [UA.androidChrome, UA.iphoneSafari, UA.instagramAndroid, UA.windowsChrome]) {
    assert.equal(сценарий(определитьСреду({ ua, хост: 'www.batr.kz' }), true), 'batr', ua);
  }
});
тест('пустой userAgent → компьютер, без исключений', () => {
  assert.equal(сценарий(определитьСреду({ ua: '' }), false), 'компьютер');
});

console.log('установка: манифест и значки');
const папкаЗначков = path.join(корень, 'public', 'pwa');
const значки = найтиЗначки(fs.readdirSync(папкаЗначков));
const манифест = построитьМанифест(значки);
const jsonМанифеста = JSON.stringify(манифест, null, 2) + '\n';
const имяМанифеста = `manifest.${crypto.createHash('md5').update(jsonМанифеста).digest('hex')}.json`;
тест('манифест: id, scope, start_url (?source=pwa) — в /aiustaz/; standalone; ru; цвета токенов; 4 значка', () => {
  assert.equal(манифест.id, '/aiustaz/');
  assert.equal(манифест.scope, '/aiustaz/');
  assert.equal(манифест.start_url, '/aiustaz/?source=pwa');
  assert.equal(манифест.display, 'standalone');
  assert.equal(манифест.lang, 'ru');
  assert.equal(манифест.name, 'AI Ustaz');
  assert.equal(манифест.short_name, 'AI Ustaz');
  const токены = fs.readFileSync(path.join(корень, 'src', 'theme', 'tokens.ts'), 'utf8');
  assert.ok(токены.includes(`фон: '${манифест.background_color}'`), 'background_color = токен «фон» светлой темы');
  assert.ok(токены.includes(`акцент: '${манифест.theme_color}'`), 'theme_color = токен «акцент» (изумруд)');
  assert.deepEqual(
    манифест.icons.map((и) => [и.sizes, и.purpose]),
    [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable'], ['512x512', 'monochrome']],
  );
  assert.ok(!/https?:/.test(jsonМанифеста), 'в манифесте нет внешних адресов');
});
тест('значки app/public/pwa: PNG нужного размера, md5 в имени, ≤ 128 КБ; лишних файлов нет', () => {
  const файлы = fs.readdirSync(папкаЗначков);
  assert.equal(файлы.length, ЗНАЧКИ_PWA.length, 'в app/public/pwa только значки: ' + файлы.join(', '));
  for (const з of ЗНАЧКИ_PWA) {
    const имя = значки[з.вид];
    const байты = fs.readFileSync(path.join(папкаЗначков, имя));
    assert.equal(байты.readUInt32BE(16), з.размер, имя);
    assert.equal(байты.readUInt32BE(20), з.размер, имя);
    assert.equal(crypto.createHash('md5').update(байты).digest('hex'), имя.match(ИМЯ_ЗНАЧКА)[2], имя);
    assert.ok(байты.length <= 128 * 1024, имя);
  }
});

console.log('установка: пакет TWA (twa/)');
const twa = JSON.parse(fs.readFileSync(path.join(корень, '..', 'twa', 'twa-manifest.json'), 'utf8'));
тест('twa-manifest: pro.aiustaz.app, aiustaz.pro, /aiustaz/?source=twa, Play Billing и уведомления выключены, customtabs', () => {
  assert.equal(twa.packageId, 'pro.aiustaz.app');
  assert.equal(twa.host, 'aiustaz.pro');
  assert.equal(twa.startUrl, '/aiustaz/?source=twa');
  assert.equal(twa.features.playBilling.enabled, false);
  assert.equal(twa.enableNotifications, false);
  assert.equal(twa.fallbackType, 'customtabs');
  assert.equal(twa.display, 'standalone');
  assert.ok(!String(twa.signingKey.path).includes('mugalim'), 'ключ — вне репозитория');
  assert.ok((twa.shortcuts ?? []).length <= 2);
  for (const я of twa.shortcuts ?? []) assert.ok(!я.url.includes('#/quran'), 'ярлыка «Коран» нет');
});
тест('twa-manifest: адреса значков и манифеста = имена из сборки (https://aiustaz.pro/aiustaz/pwa/…)', () => {
  const база = 'https://aiustaz.pro/aiustaz/pwa/';
  assert.equal(twa.iconUrl, база + значки['icon-512']);
  assert.equal(twa.maskableIconUrl, база + значки['icon-maskable-512']);
  assert.equal(twa.monochromeIconUrl, база + значки['icon-mono-512']);
  assert.equal(twa.webManifestUrl, база + имяМанифеста);
  for (const я of twa.shortcuts ?? []) assert.equal(я.chosenIconUrl, база + значки['icon-192']);
});
тест('assetlinks.template.json: JSON, пакет pro.aiustaz.app, связь handle_all_urls', () => {
  const а = JSON.parse(fs.readFileSync(path.join(корень, '..', 'twa', 'assetlinks.template.json'), 'utf8'));
  assert.equal(а[0].target.package_name, 'pro.aiustaz.app');
  assert.deepEqual(а[0].relation, ['delegate_permission/common.handle_all_urls']);
});

console.log(`OK: установка — ${проверок} проверок`);
