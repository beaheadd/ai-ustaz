-- 026: курсы валют мира к тенге для калькулятора закята (владелец 28.11.2026: «Должен быть выбор валюты всего мира»).
-- server/rates.py. Только добавляющая миграция. Ни людей, ни IP — только курсы по дням и откуда они.
--   zakat_rates — по дню курсов НБ РК: rates {КОД: [тенге за 1 единицу, источник nbk|cbr|ecb|fx]}, sources {источник:
--     {date, url}}, sha (одинаковая таблица — только отметка проверки). Хранится 90 дней.
--   zakat_rates_log — журнал попыток (итог, коротко, замечания по источникам), год.

CREATE TABLE IF NOT EXISTS zakat_rates (
    day        DATE PRIMARY KEY,
    rates      JSONB NOT NULL,
    sources    JSONB NOT NULL,
    sha        TEXT NOT NULL CHECK (sha ~ '^[0-9a-f]{64}$'),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zakat_rates_log (
    id     BIGSERIAL PRIMARY KEY,
    at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    result TEXT NOT NULL CHECK (char_length(result) <= 40),
    detail TEXT CHECK (detail IS NULL OR char_length(detail) <= 600)
);
CREATE INDEX IF NOT EXISTS zakat_rates_log_at ON zakat_rates_log (at);
