-- 004: «Спросить AI Ustaz» — своя база знаний и журнал без персональных данных (владелец 20.11.2026: «Только с нашей
-- базы данных, в интернете не будет искать»). server/ask.py, server/kb.py, загрузчик server/kb_load.py,
-- формат — docs/база-знаний.md. Только добавляющая миграция.
-- Что храним: записи базы (Коран — только ссылка «сура:аят» и перевод смыслов, без арабского текста; хадис — сборник,
-- номер, степень и кто её дал; статус «черновик»/«утверждено», кто проверил, версия и sha256); журнал ответов без текста
-- вопроса и без IP; счётчик «не нашли» по дням (Алматы). Текст вопроса не храним нигде.

CREATE TABLE IF NOT EXISTS kb_entries (
    id          TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
    kind        TEXT NOT NULL CHECK (kind IN ('коран', 'хадис', 'тафсир', 'статья', 'справка')),
    ref         TEXT CHECK (ref IS NULL OR char_length(ref) BETWEEN 1 AND 120),   -- «2:255», «Сахих аль-Бухари, 1»
    arabic      TEXT,                                -- только у хадиса: дословно из проверенной базы
    source      TEXT NOT NULL CHECK (char_length(source) BETWEEN 1 AND 300),     -- издание / сборник / раздел
    grade       TEXT,                                -- степень достоверности хадиса
    graded_by   TEXT,                                -- кто дал эту степень
    status      TEXT NOT NULL CHECK (status IN ('черновик', 'утверждено')),
    reviewed_by TEXT,                                -- устаз, проверивший запись (правило 11)
    reviewed_on DATE,
    version     INTEGER NOT NULL CHECK (version >= 1),
    sha         TEXT NOT NULL CHECK (sha ~ '^[0-9a-f]{64}$'),                     -- sha256 содержания (kb.хэш_записи)
    loaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (arabic IS NULL OR kind = 'хадис'),                                    -- арабский Корана в базе не храним
    CHECK (kind <> 'хадис' OR (ref IS NOT NULL AND grade IS NOT NULL AND graded_by IS NOT NULL)),
    CHECK (kind NOT IN ('коран', 'тафсир') OR ref ~ '^[0-9]{1,3}:[0-9]{1,3}(-[0-9]{1,3})?$'),
    CHECK (status <> 'утверждено' OR (reviewed_by IS NOT NULL AND reviewed_on IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS kb_entries_kind_ref ON kb_entries (kind, ref);

-- Тексты записи по языкам (ru обязателен; kk, uz — если есть, иначе выдаём ru). Поиск — полнотекстовый PostgreSQL:
-- tsv — 'russian' для ru, 'simple' для kk/uz; tsv_simple — 'simple' для всех (поиск по префиксу основы: стеммер 'russian'
-- режет заимствования непоследовательно: «закят» → «зак», «закята» → «закят»). Заголовок с весом A, текст — B.
-- Апострофы (узбекская латиница o', g') и «ё» выравниваются так же, как в запросе (ask.термы).
CREATE TABLE IF NOT EXISTS kb_texts (
    entry_id TEXT NOT NULL REFERENCES kb_entries(id) ON DELETE CASCADE,
    lang     TEXT NOT NULL CHECK (lang IN ('ru', 'kk', 'uz')),
    title    TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    body     TEXT NOT NULL CHECK (char_length(body) <= 8000),
    tsv      tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector(CASE lang WHEN 'ru' THEN 'russian'::regconfig ELSE 'simple'::regconfig END,
                              translate(lower(title), 'ё''ʻʼ’‘`', 'е')), 'A')
        || setweight(to_tsvector(CASE lang WHEN 'ru' THEN 'russian'::regconfig ELSE 'simple'::regconfig END,
                                 translate(lower(body), 'ё''ʻʼ’‘`', 'е')), 'B')
    ) STORED,
    tsv_simple tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple'::regconfig, translate(lower(title), 'ё''ʻʼ’‘`', 'е')), 'A')
        || setweight(to_tsvector('simple'::regconfig, translate(lower(body), 'ё''ʻʼ’‘`', 'е')), 'B')
    ) STORED,
    PRIMARY KEY (entry_id, lang)
);
CREATE INDEX IF NOT EXISTS kb_texts_tsv ON kb_texts USING GIN (tsv);
CREATE INDEX IF NOT EXISTS kb_texts_tsv_simple ON kb_texts USING GIN (tsv_simple);

-- Журнал ответов: дата, вид ответа, режим, причина отката ИИ (код), число источников. Ни вопроса, ни IP. 90 дней.
CREATE TABLE IF NOT EXISTS ask_log (
    id      BIGSERIAL PRIMARY KEY,
    at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind    TEXT NOT NULL,
    mode    TEXT NOT NULL,
    reason  TEXT,
    sources SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ask_log_at ON ask_log (at);

-- «Не нашли в базе» — только счётчик по дням (Алматы), без текста вопроса: сколько ответов не хватает.
CREATE TABLE IF NOT EXISTS ask_misses (
    day    DATE PRIMARY KEY,
    misses INTEGER NOT NULL DEFAULT 0
);
