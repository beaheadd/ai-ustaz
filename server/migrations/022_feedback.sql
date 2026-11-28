-- 022: «Сообщить об ошибке» (владелец 28.11.2026: «клиент мог выделить и нажать на кнопку „Ошибка“. И написать, какая там
-- ошибка… он попадает к нам и обрабатывает»). server/feedback.py. Только добавляющая миграция (021 — у другой задачи).
-- Что храним: категорию, выделенный текст, экран (hash-адрес приложения) и место (2:255, hadith:1751), что не так,
-- версию сборки, язык, тему и класс устройства. Контакт — только если человек сам оставил; удаляется через 90 дней после
-- закрытия (jobs.py). Ни IP, ни строки браузера, ни анонимного id статистики. Разбор — статус, заметка, кто и когда.

CREATE TABLE IF NOT EXISTS feedback (
    id          BIGSERIAL PRIMARY KEY,
    created     TIMESTAMPTZ NOT NULL DEFAULT now(),
    status      TEXT NOT NULL DEFAULT 'новое' CHECK (status IN ('новое', 'в работе', 'исправлено', 'не ошибка', 'дубль')),
    category    TEXT NOT NULL CHECK (category IN ('quran', 'hadith', 'translation', 'dhikr', 'prayer', 'ui', 'other')),
    quote       TEXT CHECK (quote IS NULL OR char_length(quote) <= 600),
    route       TEXT NOT NULL CHECK (char_length(route) <= 120),
    ref         TEXT CHECK (ref IS NULL OR char_length(ref) <= 40),
    text        TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 1200),
    contact     TEXT CHECK (contact IS NULL OR char_length(contact) <= 200),
    app_version TEXT NOT NULL DEFAULT '' CHECK (char_length(app_version) <= 40),
    lang        TEXT NOT NULL DEFAULT '-' CHECK (char_length(lang) <= 8),
    theme       TEXT NOT NULL DEFAULT '-' CHECK (theme IN ('light', 'dark', '-')),
    device      TEXT NOT NULL DEFAULT '-' CHECK (device IN ('phone', 'tablet', 'desktop', '-')),
    admin_note  TEXT NOT NULL DEFAULT '' CHECK (char_length(admin_note) <= 2000),
    handled_by  TEXT,
    handled_at  TIMESTAMPTZ,
    closed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS feedback_status ON feedback (status, id DESC);
CREATE INDEX IF NOT EXISTS feedback_created ON feedback (created);

-- Письмо админам раз в сутки (по Алматы): отметка «за этот день отправлено» — в БД, не в памяти службы.
CREATE TABLE IF NOT EXISTS feedback_digest (
    day     DATE PRIMARY KEY,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reports INTEGER NOT NULL DEFAULT 0
);
