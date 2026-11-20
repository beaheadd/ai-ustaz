-- 001: уведомления о времени намаза (владелец 20.11.2026). Только добавляющие миграции (CLAUDE.md).
-- Что храним (docs/дизайн/07-уведомления.md, «Приватность»): подписку push (адрес и ключи шифрования браузера), язык,
-- название города строкой и расписание на 30 дней (моменты UTC, ключ намаза, местное время строкой). Координат,
-- имени, телефона, почты, IP — нет. Отписка удаляет подписку и расписание сразу (ON DELETE CASCADE).

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id             BIGSERIAL PRIMARY KEY,
    endpoint       TEXT NOT NULL,
    endpoint_hash  TEXT NOT NULL UNIQUE,          -- sha256 адреса (32 hex): журнал и лимиты — только по хэшу
    p256dh         TEXT NOT NULL,
    auth           TEXT NOT NULL,
    lang           TEXT NOT NULL CHECK (lang IN ('ru', 'kk')),
    city           TEXT NOT NULL CHECK (char_length(city) BETWEEN 1 AND 60),
    schedule_end   TIMESTAMPTZ NOT NULL,          -- последний момент расписания
    refresh_sent   BOOLEAN NOT NULL DEFAULT FALSE,-- «Откройте AI Ustaz, чтобы обновить» уже отправлено
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_items (
    subscription_id BIGINT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
    at              TIMESTAMPTZ NOT NULL,          -- когда показать (время намаза или за N мин до него)
    prayer          TEXT NOT NULL CHECK (prayer IN ('fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha')),
    local_time      TEXT NOT NULL CHECK (local_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
    before_min      SMALLINT NOT NULL DEFAULT 0 CHECK (before_min IN (0, 5, 10, 15, 30)),
    next_prayer     TEXT CHECK (next_prayer IN ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
    next_time       TEXT CHECK (next_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
    sent_at         TIMESTAMPTZ,                   -- взято в отправку (не отправляем дважды)
    PRIMARY KEY (subscription_id, at, prayer, before_min)
);
CREATE INDEX IF NOT EXISTS push_items_due ON push_items (at) WHERE sent_at IS NULL;

-- Лимиты запросов: ключ — хэш (IP или адреса подписки), окно — начало минуты/10 минут. Чистится через час.
CREATE TABLE IF NOT EXISTS push_limits (
    key          TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    hits         INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, window_start)
);

-- Журнал: только хэш адреса, событие и код ответа push-сервиса. Хранится 90 дней.
CREATE TABLE IF NOT EXISTS push_log (
    id            BIGSERIAL PRIMARY KEY,
    at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    endpoint_hash TEXT NOT NULL,
    event         TEXT NOT NULL,
    status        INTEGER
);
CREATE INDEX IF NOT EXISTS push_log_at ON push_log (at);
