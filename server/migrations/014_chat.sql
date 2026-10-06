-- чат: личные переписки и группы (общий канал, каналы отделов и внешних подразделений остаются «виртуальными»: состав берётся из дерева)

CREATE TABLE chats (
  channel text PRIMARY KEY,                 -- 'dm:<меньший id>:<больший id>' | 'g:<номер>'
  kind text NOT NULL CHECK (kind IN ('dm','group')),
  name text NOT NULL DEFAULT '',
  owner_id int REFERENCES users(id) ON DELETE SET NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE chat_group_seq;

CREATE TABLE chat_members (
  channel text NOT NULL REFERENCES chats(channel) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY (channel, user_id)
);
CREATE INDEX chat_members_user ON chat_members (user_id) WHERE left_at IS NULL;

ALTER TABLE chat_messages
  ADD COLUMN pinned_at timestamptz,
  ADD COLUMN pinned_by int REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN system jsonb;                  -- служебное сообщение: {type, actor, names, name}

CREATE TABLE chat_files (
  id serial PRIMARY KEY,
  message_id bigint NOT NULL UNIQUE REFERENCES chat_messages(id) ON DELETE CASCADE,
  name text NOT NULL,
  mime text NOT NULL,
  size int NOT NULL,
  path text NOT NULL
);

-- настройки уведомлений сотрудника и тихие часы
CREATE TABLE notify_prefs (
  user_id int PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat boolean NOT NULL DEFAULT true,       -- считать новые сообщения чата
  mentions boolean NOT NULL DEFAULT true,   -- упоминания и ответы
  news boolean NOT NULL DEFAULT true,       -- объявления
  quiet_from time,
  quiet_to time,
  muted text[] NOT NULL DEFAULT '{}'        -- отключённые чаты
);
CREATE INDEX chat_messages_pins ON chat_messages (channel) WHERE pinned_at IS NOT NULL;
