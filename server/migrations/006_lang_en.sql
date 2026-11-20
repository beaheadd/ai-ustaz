-- 006: английский язык (владелец 20.11.2026: «Казахский, русский, узбекский, английский. 4 языка должно быть для старта»).
-- Только добавляющая миграция: прежние ограничения не трогаем — lang IN ('ru', 'kk') (001), lang_ui IN ('ru', 'kk', 'uz')
-- (005), kb_texts.lang IN ('ru', 'kk', 'uz') (004).
--
-- Уведомления: язык текста — в новом столбце lang_code (ru, kk, uz, en; NULL у подписок до 20.11.2026 — тогда lang_ui,
-- затем lang). db.py читает COALESCE(lang_code, lang_ui, lang) и пишет запасные значения в старые столбцы: lang — язык,
-- если он ru/kk, иначе 'ru'; lang_ui — язык, если он ru/kk/uz, иначе 'ru'. Старый сервер (до 006) с такой строкой
-- прочитает 'ru' — уведомление придёт по-русски, без сбоя.
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS lang_code TEXT
    CHECK (lang_code IS NULL OR lang_code IN ('ru', 'kk', 'uz', 'en'));

-- База знаний «Спросить AI Ustaz»: английские тексты записей — отдельная таблица (в kb_texts язык en не пройдёт
-- ограничение 004). Тот же формат, что у kb_texts; полнотекстовый словарь — 'english'. Поиск (db.py) объединяет
-- kb_texts и kb_texts_en (UNION ALL); текст на языке вопроса, если его нет — ru.
CREATE TABLE IF NOT EXISTS kb_texts_en (
    entry_id TEXT NOT NULL REFERENCES kb_entries(id) ON DELETE CASCADE,
    lang     TEXT NOT NULL DEFAULT 'en' CHECK (lang = 'en'),
    title    TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    body     TEXT NOT NULL CHECK (char_length(body) <= 8000),
    tsv      tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english'::regconfig, translate(lower(title), 'ё''ʻʼ’‘`', 'е')), 'A')
        || setweight(to_tsvector('english'::regconfig, translate(lower(body), 'ё''ʻʼ’‘`', 'е')), 'B')
    ) STORED,
    tsv_simple tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple'::regconfig, translate(lower(title), 'ё''ʻʼ’‘`', 'е')), 'A')
        || setweight(to_tsvector('simple'::regconfig, translate(lower(body), 'ё''ʻʼ’‘`', 'е')), 'B')
    ) STORED,
    PRIMARY KEY (entry_id)
);
CREATE INDEX IF NOT EXISTS kb_texts_en_tsv ON kb_texts_en USING GIN (tsv);
CREATE INDEX IF NOT EXISTS kb_texts_en_tsv_simple ON kb_texts_en USING GIN (tsv_simple);
