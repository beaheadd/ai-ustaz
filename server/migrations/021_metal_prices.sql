-- 021: цены золота и серебра за 1 г в тенге для калькулятора закята (владелец 28.11.2026: «Данные серебра и золота
-- подтягивай сам из официальных источников. Не нужно, чтобы человек это делал.»). server/metals.py.
-- Только добавляющая миграция. Ни людей, ни IP — только цены по дням и откуда они.
--   metal_prices — по дню цены (Алматы): золото — Национальный банк РК (тенге за 1 г), серебро — учётная цена Банка
--     России (рубли за 1 г) ÷ курс доллара Банка России × официальный курс доллара НБ РК (та же формула, что у НБ РК для
--     золота: LBMA × курс ÷ 31,1034768). details — исходные числа для проверки.
--   metal_log — журнал попыток (итог, коротко), год.

CREATE TABLE IF NOT EXISTS metal_prices (
    day           DATE PRIMARY KEY,
    gold_per_g    NUMERIC(12, 2) NOT NULL CHECK (gold_per_g > 0),
    silver_per_g  NUMERIC(12, 2) NOT NULL CHECK (silver_per_g > 0),
    gold_source   TEXT NOT NULL,
    silver_source TEXT NOT NULL,
    details       JSONB NOT NULL DEFAULT '{}',
    fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS metal_log (
    id     BIGSERIAL PRIMARY KEY,
    at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    result TEXT NOT NULL CHECK (char_length(result) <= 40),
    detail TEXT CHECK (detail IS NULL OR char_length(detail) <= 300)
);
CREATE INDEX IF NOT EXISTS metal_log_at ON metal_log (at);
