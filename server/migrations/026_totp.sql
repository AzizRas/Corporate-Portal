-- Двухфакторная аутентификация (TOTP, приложения Google Authenticator / Authy / 1Password).
-- Секрет хранится зашифрованным (AES-256-GCM, ключ TOTP_KEY); пока totp_enabled=false, секрет — «ожидающий подтверждения».
ALTER TABLE users
  ADD COLUMN totp_secret text,
  ADD COLUMN totp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN totp_last_step bigint NOT NULL DEFAULT 0,     -- последний принятый шаг времени: тот же код второй раз не проходит
  ADD COLUMN totp_recovery text[] NOT NULL DEFAULT '{}';   -- хэши одноразовых резервных кодов
