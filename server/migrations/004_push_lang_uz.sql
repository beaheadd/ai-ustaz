-- 004: язык уведомлений uz (узбекский, латиница; владелец 20.11.2026: «Потом нужно добавить узбекский язык»).
-- Только добавляющая миграция: прежнее ограничение lang IN ('ru', 'kk') (001) не трогаем — для uz в lang пишется
-- запасной 'ru', а язык текста уведомления — в новом столбце lang_ui (NULL у подписок до 20.11.2026 — тогда lang).
-- db.py читает COALESCE(lang_ui, lang).

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS lang_ui TEXT
    CHECK (lang_ui IS NULL OR lang_ui IN ('ru', 'kk', 'uz'));
