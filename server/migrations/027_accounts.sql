-- 027: аккаунты приложения AI Ustaz — вход по желанию, прогресс на всех устройствах (server/account.py).
-- Владелец 28.11.2026: «создай вход, чтобы кто хочет, мог заходить входом, и у него прогресс сохраняется. И с другого
-- устройства он также может зайти с сохраненным прогрессом»; «Создай кнопку входа и привяжи вход через почту, отправляем
-- код. Google авторизация»; «Код четырёхзначный сделай». Вход не обязателен: без него приложение работает как раньше.
-- Приватность (CLAUDE.md): база в РК; храним почту, идентификатор Google/Apple (sub), отметку «16+» и согласие, сеансы
-- (sha256 токена, класс устройства) и документы синхронизации (прогресс, зикры, закладка, настройки; суммы закята —
-- только с отдельным выключателем). Не храним: имя, фото, IP (только хэш для лимитов), историю чата, голос, id статистики.
-- Удаление аккаунта удаляет всё сразу (ON DELETE CASCADE). Только добавляющая миграция.

CREATE TABLE IF NOT EXISTS account_users (
    id           BIGSERIAL PRIMARY KEY,
    email        TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
    google_sub   TEXT UNIQUE CHECK (google_sub IS NULL OR length(google_sub) BETWEEN 1 AND 255),
    apple_sub    TEXT UNIQUE CHECK (apple_sub IS NULL OR length(apple_sub) BETWEEN 1 AND 255),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    age16        BOOLEAN NOT NULL CHECK (age16),                -- «Мне 16 лет или больше» (v1 — для 16+)
    consent      TEXT NOT NULL CHECK (consent ~ '^[a-z0-9.-]{1,20}$'),  -- версия текста согласия
    zakat_sync   BOOLEAN NOT NULL DEFAULT FALSE                 -- «Сохранять суммы закята в аккаунте» (выкл. по умолчанию)
);

-- Коды входа: только HMAC кода; 10 минут, 5 попыток, новый код гасит прежние.
CREATE TABLE IF NOT EXISTS account_codes (
    id          BIGSERIAL PRIMARY KEY,
    email       TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    SMALLINT NOT NULL DEFAULT 0,
    used        BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS account_codes_email ON account_codes (email, created_at);

-- Сеансы: id — sha256 токена из cookie aiustaz_account (сам токен не храним).
CREATE TABLE IF NOT EXISTS account_sessions (
    id          TEXT PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES account_users (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL,
    last_at     TIMESTAMPTZ NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    device      TEXT NOT NULL DEFAULT '' CHECK (length(device) <= 40),
    method      TEXT NOT NULL DEFAULT 'email' CHECK (method IN ('email', 'google', 'apple')),
    revoked     BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS account_sessions_user ON account_sessions (user_id);

-- Документы синхронизации: по ключу, версия растёт на 1 при каждой записи (сравнение и запись — одним запросом).
CREATE TABLE IF NOT EXISTS account_docs (
    user_id     BIGINT NOT NULL REFERENCES account_users (id) ON DELETE CASCADE,
    key         TEXT NOT NULL CHECK (key IN ('progress', 'dhikr', 'quran', 'settings', 'zakat')),
    version     INTEGER NOT NULL CHECK (version >= 1),
    updated_at  TIMESTAMPTZ NOT NULL,
    data        JSONB NOT NULL,
    PRIMARY KEY (user_id, key)
);

-- Открытые ключи Google/Apple для проверки ID token — кэш (не личные данные), обновляется раз в 6 часов.
CREATE TABLE IF NOT EXISTS account_jwks (
    provider    TEXT PRIMARY KEY CHECK (provider IN ('google', 'apple')),
    keys        JSONB NOT NULL,
    fetched_at  TIMESTAMPTZ NOT NULL
);
