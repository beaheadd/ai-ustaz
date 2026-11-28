-- 025: языки интерфейса ar, tr, id, ur (владелец 28.11.2026: «Нужно добавить языки наиболее мусульманских стран
-- сначала. Арабский…» → «Арабский + Турецкий + Индонезийский + Урду»).
-- Только добавляющая миграция: прежние ограничения не трогаем — lang IN ('ru', 'kk') (001), lang_ui IN ('ru', 'kk', 'uz')
-- (005), lang_code IN ('ru', 'kk', 'uz', 'en') (006).
--
-- Уведомления: язык текста — в новом столбце lang_tag (8 языков; NULL у подписок до 28.11.2026 — тогда lang_code,
-- lang_ui, lang). db.py читает COALESCE(lang_tag, lang_code, lang_ui, lang) и пишет запасные значения в старые столбцы:
-- lang_code — язык, если он ru/kk/uz/en, иначе 'en'. Старый сервер (до 025) с такой строкой прочитает lang_code —
-- уведомление придёт по-английски, без сбоя.
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS lang_tag TEXT
    CHECK (lang_tag IS NULL OR lang_tag IN ('ru', 'kk', 'uz', 'en', 'ar', 'tr', 'id', 'ur'));
