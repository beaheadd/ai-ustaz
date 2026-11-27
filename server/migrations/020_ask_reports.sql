-- 020: чат AI Ustaz — «Пожаловаться» на ответ (владелец 27.11.2026: чат «как у Айалема»). server/ask_media.py.
-- Только добавляющая миграция. Что храним: id ответа (клиентский, случайный), причину, обезличенный комментарий и id
-- записей базы, которые были в ответе (чтобы устаз поправил запись). Ни текста вопроса, ни IP, ни идентификатора человека.
-- 180 дней (уборка — jobs.py).

CREATE TABLE IF NOT EXISTS ask_reports (
    id        BIGSERIAL PRIMARY KEY,
    at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    answer_id TEXT NOT NULL CHECK (answer_id ~ '^[a-z0-9-]{8,40}$'),
    reason    TEXT NOT NULL CHECK (reason IN ('неверно', 'непонятно', 'другое')),
    note      TEXT CHECK (note IS NULL OR char_length(note) <= 500),
    sources   TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(sources) <= 8)
);
CREATE INDEX IF NOT EXISTS ask_reports_at ON ask_reports (at);
