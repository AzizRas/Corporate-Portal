-- ТЗ №3, этап 6: стикерпаки из Telegram (F), привязка Telegram для уведомлений (I8).
CREATE TABLE sticker_packs (
  id serial PRIMARY KEY,
  source text NOT NULL DEFAULT 'telegram' CHECK (source IN ('telegram','upload')),
  tg_name text UNIQUE,
  title text NOT NULL,
  author_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'importing' CHECK (status IN ('importing','ready','failed')),
  error text,
  active boolean NOT NULL DEFAULT true,
  added_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pack_stickers (
  id serial PRIMARY KEY,
  pack_id int NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
  emoji text NOT NULL DEFAULT '',
  format text NOT NULL CHECK (format IN ('webp','webm','png')),
  storage_key text NOT NULL,
  sort int NOT NULL DEFAULT 0
);
CREATE INDEX pack_stickers_pack ON pack_stickers (pack_id, sort);

-- Telegram-бот для уведомлений: сотрудник привязывает аккаунт одноразовым кодом
ALTER TABLE users ADD COLUMN tg_chat_id bigint, ADD COLUMN tg_link_code text;
