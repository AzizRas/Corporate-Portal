-- Чат в стиле мессенджера: правка сообщений, реакции, пересылка, стикеры.
ALTER TABLE chat_messages
  ADD COLUMN edited_at timestamptz,
  ADD COLUMN fwd_from text,                 -- имя автора оригинала для пересланного
  ADD COLUMN sticker text,                  -- код встроенного стикера
  ADD COLUMN touched_at timestamptz;        -- правка или реакция: по нему клиент подтягивает изменения старых сообщений
CREATE INDEX chat_messages_touched ON chat_messages (channel, touched_at) WHERE touched_at IS NOT NULL;

CREATE TABLE chat_reactions (
  message_id bigint NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
