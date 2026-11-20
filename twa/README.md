# AI Ustaz → Android-приложение (TWA) и установка с сайта

> Решение владельца 19.11.2026: «Сразу нужно сделать ещё TWA приложение для загрузки из сайта и объяснение в APPLE,
> чтобы добавить на рабочий стол». Образец — AiAlem (`batr-world/android-aialem/README-GOOGLE-PLAY.md`), но это
> **отдельное приложение** со своим пакетом, ключом и карточкой в Play.

**Самый лёгкий путь — без Play, прямо с сайта.** Откройте на телефоне `https://aiustaz.pro` → «Ещё» →
«Установить приложение» (`#/install`):
- Android, Chrome — кнопка «Установить» (или ⋮ → «Установить приложение»): значок на экране, полный экран без
  адресной строки (WebAPK по манифесту `aiustaz/pwa/manifest.<md5>.json`);
- iPhone, Safari — «Поделиться» (квадрат со стрелкой) → «На экран „Домой“» → «Добавить»;
- из Instagram, Telegram, WhatsApp, Facebook, TikTok страница подскажет открыть ссылку в Chrome/Safari.
Ссылку для рассылки: `https://aiustaz.pro/aiustaz/#/install`. Код — `app/src/install/`, `app/src/screens/InstallScreen.tsx`.

Ниже — Android-приложение для Google Play (TWA): Chrome открывает сайт `aiustaz.pro` во весь экран. Любая правка
сайта сразу видна в приложении — переиздавать в Play нужно, только если поменялись значки, название или цвета.
Пакет для Play Console (тексты, анкеты, графика) — `twa/play/`.

| Что | Значение |
|---|---|
| Пакет (packageId) | **`pro.aiustaz.app`** — навсегда, сменить после публикации нельзя (домен `aiustaz.pro` задом наперёд) |
| Сайт | `https://aiustaz.pro/` → `/aiustaz/`; старт приложения — `/aiustaz/?source=twa` |
| Ярлык (долгое нажатие на значок) | «Таджвид» → `#/course` |
| Ключ подписи | `C:\aiustaz-build\twa\signing.keystore`, alias **`aiustaz`** — только у вас, **НЕ в git**, не в чат |
| Оплата Google Play | выключена (`playBilling: false`) — приложение бесплатное |
| Уведомления | **включены** (`enableNotifications: true`, владелец 20.11.2026: уведомления о времени намаза) — Chrome передаёт уведомления сайта aiustaz.pro приложению (раздел «Уведомления о времени намаза» ниже) |
| Значки | `https://aiustaz.pro/aiustaz/pwa/…png` (рисует `tools/icons/make-icons.mjs`, имена — с md5) |
| Микрофон | разрешение **сайта** aiustaz.pro в Chrome: при первой записи Chrome спросит сам. Отозвать — долгое нажатие на значок → «Настройки сайта» (`enableSiteSettingsShortcut`) |

---

## Шаг 0. Один раз
- Должна быть выкачена сборка AI Ustaz со значками: откройте в телефоне
  `https://aiustaz.pro/aiustaz/pwa/icon-512.8b67da689b0df8a059a6562f5be4518f.png` — картинка открывается.
  (Для batr-world нужно исключение в `.gitignore`: `!web/public/aiustaz/pwa/*.png` — иначе выкатка из GitHub
  потеряет значки.)
- Node.js на компьютере. Java (JDK 17) и Android SDK Bubblewrap скачает сам.

## Шаг 1. Bubblewrap и папка сборки (Windows, cmd)
```bat
npm install -g @bubblewrap/cli@latest
mkdir C:\aiustaz-build\twa
copy "<папка mugalim>\twa\twa-manifest.json" C:\aiustaz-build\twa\
cd C:\aiustaz-build\twa
bubblewrap doctor
```
`bubblewrap doctor` при первом запуске спросит, скачать ли JDK 17 и Android SDK, — **Yes** (Enter).
Нужна версия Bubblewrap **1.27 или новее** (`bubblewrap --version`) — она собирает под Android 16 (API 36),
которого Play требует от новых приложений.

## Шаг 2. Ключ подписи (один раз в жизни приложения)
Найдите `keytool` из Java Bubblewrap:
```bat
dir /s /b "%USERPROFILE%\.bubblewrap\keytool.exe"
```
и вместо `keytool` пишите полный путь в кавычках:
```bat
"<путь к keytool.exe>" -genkeypair -v -keystore C:\aiustaz-build\twa\signing.keystore -alias aiustaz -keyalg RSA -keysize 2048 -validity 10000
```
- Пароль придумайте и **запишите вместе с alias `aiustaz`** в менеджер паролей. На вопросы «имя, организация,
  город» — например `AI Ustaz`, `BATR.KZ`, `Almaty`, `KZ`.
- `signing.keystore` сохраните ещё в двух местах (флешка + облако). Никому не отправляйте, не кладите в git, в чат и почту.
- В Play будет включено «Подписание приложений Google Play»: ваш ключ — только «ключ загрузки». Потеряете — ключ
  загрузки сбрасывается через поддержку Play, приложение не пропадёт.

## Шаг 3. Собрать
```bat
cd C:\aiustaz-build\twa
bubblewrap update --skipVersionUpgrade
bubblewrap build
```
`update` создаёт Android-проект из `twa-manifest.json` (скачает значки с aiustaz.pro), `build` спросит пароль
(дважды — хранилища и ключа; если отдельный не задавали — один и тот же). На выходе:
- `app-release-bundle.aab` — **это загружаете в Google Play**;
- `app-release-signed.apk` — поставить на свой телефон для проверки.

## Шаг 4. Проверить, что нет рекламного ID (AD_ID) — обязательно
По правилам проекта и лицензии модели (QML) в приложении не должно быть рекламного идентификатора.
Найдите `aapt2`:
```bat
dir /s /b "%USERPROFILE%\.bubblewrap\android_sdk\build-tools\aapt2.exe"
```
и проверьте разрешения готового APK:
```bat
"<путь к aapt2.exe>" dump permissions C:\aiustaz-build\twa\app-release-signed.apk
"<путь к aapt2.exe>" dump permissions C:\aiustaz-build\twa\app-release-signed.apk | findstr /i "AD_ID"
```
Вторая команда **ничего не должна вывести**. В списке — только `INTERNET`, `POST_NOTIFICATIONS` (уведомления о времени
намаза, Android 13+) и служебные разрешения TWA.
Если `com.google.android.gms.permission.AD_ID` появился (его может принести библиотека), откройте
`C:\aiustaz-build\twa\app\src\main\AndroidManifest.xml`, добавьте в тег `<manifest …>` атрибут
`xmlns:tools="http://schemas.android.com/tools"`, а внутрь — строку
```xml
<uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" />
```
затем снова `bubblewrap build` (без `update` — он перезаписывает проект) и проверку. После каждого
`bubblewrap update` эту правку повторить. В Play Console в «Рекламный идентификатор» отвечать «Нет».

## Уведомления о времени намаза (владелец 20.11.2026)
- **Как работает в приложении.** Уведомления присылает сам сайт aiustaz.pro (Web Push, свой сервер AI Ustaz в РК —
  `server/`). С `enableNotifications: true` Bubblewrap добавляет в APK службу делегирования уведомлений
  (`DelegationService` из androidbrowserhelper) и разрешение `POST_NOTIFICATIONS`. Chrome **делегирует** уведомления
  сайта приложению: они приходят от «AI Ustaz» (значок приложения в шторке, свои настройки в «Настройки → Приложения →
  AI Ustaz → Уведомления»), а не от Chrome. Firebase SDK, аналитики и рекламы в APK это не добавляет.
- **Разрешение.** На Android 13+ при «Разрешить уведомления» на экране «Ещё → Уведомления о намазе» система спросит
  разрешение для приложения AI Ustaz (до этого приложение объясняет, что придёт и что координаты не уходят). Отказ —
  экран покажет, где включить в настройках телефона.
- **После включения** (уже есть в этом манифесте): `bubblewrap update` → `bubblewrap build` → шаг 4 (в списке
  разрешений появится `android.permission.POST_NOTIFICATIONS` — это ожидаемо) → в Play Console обновить анкету
  «Безопасность данных» (`twa/play/data-safety.md`: идентификатор подписки и город для расписания). Если приложение уже
  загружено в Play — поднять `appVersionCode`.
- **Проверка на телефоне.** Установить AAB/APK → открыть → «Ещё» → «Уведомления о намазе» → включить → «Проверить
  уведомление»: в шторке «Проверка уведомлений · AI Ustaz» со значком приложения; нажатие открывает «Время намаза».
- Своего звука (азана) нет: системный звук уведомлений. Запись азана кари — только по договору, будущая опция.

## Шаг 5. Отпечаток ключа → прислать агенту (для assetlinks)
```bat
"<путь к keytool.exe>" -list -v -keystore C:\aiustaz-build\twa\signing.keystore -alias aiustaz
```
Строка `SHA256: AB:CD:…:EF` (32 пары знаков) — отпечаток вашего ключа загрузки. После первой загрузки AAB в Play
(Play Console → AI Ustaz → **Тестирование и выпуск → Целостность приложения → Подписание приложений**) там же
будет второй отпечаток — «Сертификат ключа подписи приложения» (ключ Google). **Пришлите агенту оба SHA-256**
(отпечатки — не секрет). Агент впишет их в `https://aiustaz.pro/.well-known/assetlinks.json` (шаблон —
`twa/assetlinks.template.json`; отдаёт nginx aiustaz.pro, правка — в batr-world `deploy/aiustaz-app.nginx.conf`).
Пока файла нет, приложение работает, но сверху видна адресная строка (режим Custom Tabs, `fallbackType`).

Проверка: `https://aiustaz.pro/.well-known/assetlinks.json` открывается и содержит `pro.aiustaz.app` и оба
отпечатка; поставьте APK — адресной строки сверху нет.

## Шаг 6. Google Play Console
Пошагово — `twa/play/checklist.md` (создать приложение, внутреннее/закрытое тестирование, анкеты «Безопасность
данных», возрастной рейтинг, целевая аудитория, реклама — «Нет»).

## APK для установки «из сайта» (позже, по желанию)
Можно раздавать `app-release-signed.apk` напрямую (тем, у кого нет Play). Порядок, когда решите:
1. Подписанный APK (тот же ключ, что в Play) кладётся **вне git** (в batr-world `.gitignore` отбрасывает `*.apk`) на
   сервер, например в `/opt/aiustaz-files/aiustaz-1.0.0.apk`.
2. В nginx aiustaz.pro — отдельный путь:
   ```nginx
   location /download/ { alias /opt/aiustaz-files/; types { application/vnd.android.package-archive apk; } add_header Cache-Control "no-cache" always; }
   ```
3. На экране установки появится строка «Скачать APK» с размером и SHA-256 файла (добавить в `InstallScreen.tsx`).
Минусы: Android попросит разрешить «установку из неизвестных источников», обновления не приходят сами — поэтому
основной путь — сайт (PWA) и Google Play.

## Как выпускать обновления
Сайт обновляется сам. Переиздавать — только если поменялись значки, название, ярлыки, цвета или Bubblewrap/Android:
в `C:\aiustaz-build\twa` поднимите `appVersionCode` (+1) и `appVersionName`, `bubblewrap update`, проверка AD_ID (шаг 4),
`bubblewrap build`, новый AAB — в Play.
Перерисовали значки (`node tools/icons/make-icons.mjs`) — у них новые имена: обновите `iconUrl`, `maskableIconUrl`,
`monochromeIconUrl`, `chosenIconUrl`, `webManifestUrl` здесь (`npm run test:install` в `app/` покажет расхождение) и
сначала выкатите сайт.

## Частые проблемы
- **Сверху адресная строка** — `assetlinks.json` нет или в нём не те отпечатки (нужны оба: Google и ваш).
- **`bubblewrap update` не скачал значки** — сайт ещё без значков (404 на `…/pwa/icon-512.<md5>.png`).
- **Play: «целевой уровень API устарел»** — `npm install -g @bubblewrap/cli@latest`, затем `update` и `build`.
- **Микрофон не работает** — разрешение сайта: долгое нажатие на значок → «Настройки сайта» → Микрофон → Разрешить.

`signing.keystore` и пароль — **храните вечно**.
