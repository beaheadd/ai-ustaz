-- 007: админка AI Ustaz — статистика посещений (своя, без сторонних счётчиков), вход админов по коду из письма, роли,
-- журнал действий и настройки содержимого (чтецы, хадисы). Владелец 27.11.2026: «Создай админ панель… первая страница —
-- статистика… Коран… хадисы… добавляли, убирали, отключали». docs/дизайн/12-админка-и-статистика.md.
-- Приватность статистики (CLAUDE.md: без рекламы, рекламного трекинга и сторонней аналитики; данные в РК):
-- анонимный случайный id устройства (не связан с человеком), без cookie, без IP, без координат и города, без строки
-- User-Agent (только класс устройства). Сырые события живут 90 дней, дальше — только суточные итоги (stats_daily).
-- Только добавляющая миграция.

-- ───────────── статистика ─────────────
-- Сеанс: открытие приложения на устройстве; новый — после 30 минут тишины (решает клиент, сервер проверяет формат).
CREATE TABLE IF NOT EXISTS stats_sessions (
    id          TEXT PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{16,32}$'),
    sid         TEXT NOT NULL CHECK (sid ~ '^[A-Za-z0-9_-]{16,32}$'),   -- анонимный id устройства
    day         DATE NOT NULL,                                          -- день начала по Алматы (UTC+5)
    started_at  TIMESTAMPTZ NOT NULL,
    last_at     TIMESTAMPTZ NOT NULL,
    seconds     INTEGER NOT NULL DEFAULT 0 CHECK (seconds >= 0),        -- видимое время (пульс раз в 30 с)
    views       INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    lang        TEXT NOT NULL CHECK (lang IN ('ru', 'kk', 'uz', 'en', '-')),
    device      TEXT NOT NULL CHECK (device IN ('phone', 'tablet', 'desktop', '-')),
    os          TEXT NOT NULL CHECK (os IN ('android', 'ios', 'windows', 'mac', 'linux', 'other')),
    standalone  BOOLEAN NOT NULL DEFAULT FALSE,                         -- открыто как установленное приложение
    ref         TEXT NOT NULL DEFAULT '' CHECK (ref ~ '^[a-z0-9.-]{0,40}$'),  -- откуда пришли: домен-метка, '' — напрямую
    ver         TEXT NOT NULL DEFAULT '' CHECK (ver ~ '^[A-Za-z0-9._-]{0,20}$')
);
CREATE INDEX IF NOT EXISTS stats_sessions_day ON stats_sessions (day);
CREATE INDEX IF NOT EXISTS stats_sessions_sid ON stats_sessions (sid);

-- Устройство: первый и последний день — «новые/вернувшиеся» и удержание.
CREATE TABLE IF NOT EXISTS stats_devices (
    sid        TEXT PRIMARY KEY CHECK (sid ~ '^[A-Za-z0-9_-]{16,32}$'),
    first_day  DATE NOT NULL,
    last_day   DATE NOT NULL
);
-- Активные дни устройства (90 дней): уникальные за 7/30 дней, удержание D1/D7.
CREATE TABLE IF NOT EXISTS stats_active (
    day  DATE NOT NULL,
    sid  TEXT NOT NULL,
    PRIMARY KEY (day, sid)
);

-- Просмотры экранов: путь экрана латиницей из routes.ts (quran/sura) и номер (сура, хадис), без остального адреса.
CREATE TABLE IF NOT EXISTS stats_views (
    id      BIGSERIAL PRIMARY KEY,
    at      TIMESTAMPTZ NOT NULL,
    day     DATE NOT NULL,
    sid     TEXT NOT NULL,
    sess    TEXT NOT NULL,
    screen  TEXT NOT NULL CHECK (screen ~ '^[a-z0-9/-]{0,40}$'),
    num     INTEGER CHECK (num BETWEEN 0 AND 100000)
);
CREATE INDEX IF NOT EXISTS stats_views_day ON stats_views (day);

-- Время на экранах: пульс прибавляет секунды экрану, который был открыт.
CREATE TABLE IF NOT EXISTS stats_screen_time (
    day      DATE NOT NULL,
    screen   TEXT NOT NULL,
    seconds  BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (day, screen)
);

-- Суточные итоги (храним без срока): metric — что считаем, key — разрез ('' — всего).
CREATE TABLE IF NOT EXISTS stats_daily (
    day     DATE NOT NULL,
    metric  TEXT NOT NULL,
    key     TEXT NOT NULL DEFAULT '',
    value   BIGINT NOT NULL,
    PRIMARY KEY (day, metric, key)
);

-- ───────────── админы ─────────────
CREATE TABLE IF NOT EXISTS admin_users (
    id          SERIAL PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
    role        TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
    name        TEXT NOT NULL DEFAULT '' CHECK (length(name) <= 80),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  INTEGER,
    disabled    BOOLEAN NOT NULL DEFAULT FALSE
);

-- Коды входа: только HMAC кода (сам код не храним), 10 минут, не больше 5 попыток.
CREATE TABLE IF NOT EXISTS admin_codes (
    id          BIGSERIAL PRIMARY KEY,
    email       TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    SMALLINT NOT NULL DEFAULT 0,
    used        BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS admin_codes_email ON admin_codes (email, created_at);

-- Сеансы админов: id — sha256 токена из cookie (сам токен не храним).
CREATE TABLE IF NOT EXISTS admin_sessions (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL,
    last_at     TIMESTAMPTZ NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    device      TEXT NOT NULL DEFAULT '',
    revoked     BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS admin_sessions_user ON admin_sessions (user_id);

-- Журнал действий админов (кто, что, когда) — храним без срока.
CREATE TABLE IF NOT EXISTS admin_audit (
    id       BIGSERIAL PRIMARY KEY,
    at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id  INTEGER,
    email    TEXT NOT NULL DEFAULT '',
    action   TEXT NOT NULL,
    target   TEXT NOT NULL DEFAULT '',
    details  JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS admin_audit_at ON admin_audit (at DESC);

-- ───────────── содержимое ─────────────
-- Настройки, которые читает приложение (GET /api/content/config): 'reciters' → {включены: [...] | null, поУмолчанию}.
CREATE TABLE IF NOT EXISTS content_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  TEXT NOT NULL DEFAULT ''
);

-- Хадисы HadeethEnc (id — номер на HadeethEnc.com): скрыть в приложении; «проверено устазом» (кто, когда).
-- Текст хадиса здесь не хранится и не правится: только отметки к записям проверенной базы (правило 2 CLAUDE.md).
CREATE TABLE IF NOT EXISTS content_hadith (
    id           INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 10000000),
    hidden       BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by  TEXT NOT NULL DEFAULT '' CHECK (length(approved_by) <= 80),
    approved_at  DATE,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   TEXT NOT NULL DEFAULT ''
);

-- Публикации настроек: версия и sha256 того, что отдаёт /api/content/config (правило 11: публикация — с версией и хешем).
CREATE TABLE IF NOT EXISTS content_versions (
    version     SERIAL PRIMARY KEY,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    sha256      TEXT NOT NULL,
    by_email    TEXT NOT NULL DEFAULT '',
    what        TEXT NOT NULL DEFAULT ''
);
