-- 003: официальное время намаза КЗ (ДУМК) и УЗ (УМУз) — годовые таблицы по пунктам наших списков (владелец 20.11.2026:
-- «Время намаза Казахстан, Узбекистан бери из официальных источников… чтобы с местными один в один»). server/prayer.py.
-- Что храним: таблицы ведомств (данные о пунктах, не о людях), очередь «попросили таблицу», журнал скачиваний и список
-- регионов УМУз. Ни IP, ни координат пользователей. Только добавляющая миграция.

CREATE TABLE IF NOT EXISTS prayer_official (
    src         TEXT NOT NULL CHECK (src IN ('dumk', 'umuz')),
    place       TEXT NOT NULL CHECK (place ~ '^[a-z0-9][a-z0-9-]{0,39}$'),   -- id места из списка приложения
    year        SMALLINT NOT NULL CHECK (year BETWEEN 2024 AND 2100),
    days        JSONB NOT NULL,          -- [[фаджр, восход, зухр, аср, магриб, иша] 'ЧЧ:ММ' местного времени] × 365/366
    point       JSONB NOT NULL,          -- {id, name} пункта ведомства
    method      TEXT NOT NULL CHECK (method IN ('table', 'rule')),
    sha         TEXT NOT NULL,           -- sha256 days: ETag ответа
    max_diff    SMALLINT NOT NULL,       -- наибольшее расхождение со своим расчётом, мин
    fetched_at  TIMESTAMPTZ NOT NULL,    -- когда таблица последний раз изменилась (первое принятие или новая версия)
    checked_at  TIMESTAMPTZ NOT NULL,    -- когда последний раз скачали и сверили (без изменений тоже)
    PRIMARY KEY (src, place, year)
);
CREATE INDEX IF NOT EXISTS prayer_official_checked ON prayer_official (checked_at);

-- Таблицы, которые попросил клиент, а их ещё нет: jobs скачивает их первыми. Чистится через неделю.
CREATE TABLE IF NOT EXISTS prayer_wanted (
    src      TEXT NOT NULL,
    place    TEXT NOT NULL,
    year     SMALLINT NOT NULL,
    asked_at TIMESTAMPTZ NOT NULL,
    tried_at TIMESTAMPTZ,
    PRIMARY KEY (src, place, year)
);

-- Журнал скачиваний и проверок (без IP): итог (new, changed, diff, order, net…) и коротко подробности. Хранится год.
CREATE TABLE IF NOT EXISTS prayer_log (
    id      BIGSERIAL PRIMARY KEY,
    at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    src     TEXT NOT NULL,
    place   TEXT NOT NULL,
    year    SMALLINT NOT NULL,
    result  TEXT NOT NULL,
    detail  TEXT
);
CREATE INDEX IF NOT EXISTS prayer_log_at ON prayer_log (at);

-- Служебное: последний принятый список регионов УМУз (ключ umuz_regions) и т. п.
CREATE TABLE IF NOT EXISTS prayer_meta (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
