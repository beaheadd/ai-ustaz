# Лицензии AI Ustaz — сводка

Правило проекта (CLAUDE.md): каждая зависимость — на экране «Лицензии» в приложении и здесь, в `licenses/`.
Эта страница — краткая сводка. Полные тексты:

- `app-web-bundle.txt` — каждый пакет, попавший в веб-бандл, с версией и полным текстом лицензии.
  Создаёт `app/scripts/gen-licenses.mjs` (`npm run licenses` в `app/`), руками не править.
- `upstream/` — тексты MIT для пакетов, у которых в npm нет файла LICENSE (источник с тегом — в шапке файла):
  - `react-native-LICENSE.txt` — facebook/react-native@v0.88.1, для `@react-native/js-polyfills`, `@react-native/normalize-colors`;
  - `metro-LICENSE.txt` — facebook/metro@v0.87.1, для `metro-runtime`.
  Если в бандл попадёт пакет без текста лицензии, генератор завершится с ошибкой.

Состояние на 18.11.2026 (прототип v0, веб-сборка для batr.kz/aiustaz).

## Пакеты в веб-бандле (24)

| Лицензия | Пакеты |
|---|---|
| MIT (22) | react, react-dom, scheduler, react-native-web, @react-native/js-polyfills, @react-native/normalize-colors, metro-runtime, expo, expo-asset, expo-font, expo-modules-core, @expo/cli (шаблон страницы и рантайм), @react-native-async-storage/async-storage, @babel/runtime, fbjs, invariant, inline-style-prefixer, css-in-js-utils, postcss-value-parser, styleq, merge-options, is-plain-obj |
| BSD-3-Clause (1) | hyphenate-style-name |
| MIT (пакет) + SIL OFL 1.1 (шрифт) (1) | @expo-google-fonts/amiri-quran — шрифт Amiri Quran идёт в сборку файлом `.ttf` |

Только для сборки (в бандл не попадают): TypeScript (Apache-2.0), @types/react (MIT), сборщик Metro (MIT).

Копилефта (GPL, AGPL, LGPL, SSPL), некоммерческих лицензий и NPL в бандле нет — генератор это проверяет.
Аналитики, рекламы и трекеров в зависимостях нет.

## Контент

| Что | Источник | Лицензия и условия |
|---|---|---|
| Текст Корана (аль-Фатиха 1:1–7, слова в примерах объяснений) | Tanzil Quran Text (Uthmani, Version 1.1), tanzil.net | CC BY 3.0 (creativecommons.org/licenses/by/3.0/). Только дословные копии, текст менять нельзя; указан источник и ссылка на tanzil.net; блок копирайта воспроизводится на экране «Лицензии». Имя файла и sha256 — `content/sources.json`. |
| ИИ-предупреждение (урок 0 и «О проекте») | файл NOTICE пакета quran-muaalem (github.com/obadx/quran-muaalem) | QML-1.0. Тексты ar и ru — официальные, kk — наш перевод (черновик). Модель quran-muaalem в прототипе не используется. |
| Шрифт Amiri Quran | @expo-google-fonts/amiri-quran 0.4.1 | SIL Open Font License 1.1 |
| Методика и порядок уроков | «Муаллим сани», Ахмадхади Максуди (1868–1941) | Берём метод и структуру, не тексты и не вёрстку изданий. Название в интерфейсе — нейтральное («по методике Ахмадхади Максуди»), пока не проверены товарные знаки (программа курса §16, вопрос 1). |
| Уроки, подсказки, примеры объяснений | `docs/программа-курса.md`, `docs/каталог-ошибок.md` (свои документы) | Свой контент проекта, статус — черновик (проверка устаза и подпись совета ещё впереди). |

Голоса кари в прототипе нет; синтез арабской речи и чужие записи не используются.

## Как обновлять

1. Новая зависимость в `app/` — только по необходимости, затем `npm run licenses` (обновит экран и `app-web-bundle.txt`).
2. Новый источник контента — запись в `content/sources.json` через `tools/build_content.py` и строка в таблице выше.
3. Скопированный чужой код — запись в `docs/источники-кода.md` (файл → репозиторий@коммит:путь → что изменено).
