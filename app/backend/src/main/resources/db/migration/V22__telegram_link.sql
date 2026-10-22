-- Each person can connect their own Telegram chat to hear when a search finishes.
ALTER TABLE users ADD COLUMN telegram_chat_id BIGINT;
ALTER TABLE users ADD COLUMN telegram_notify BOOLEAN NOT NULL DEFAULT TRUE;
-- The interface language when the chat was connected: the bot writes in it (en or fr).
ALTER TABLE users ADD COLUMN telegram_language VARCHAR(2) NOT NULL DEFAULT 'en';
-- The one-time code inside the t.me link, cleared once used.
ALTER TABLE users ADD COLUMN telegram_link_code VARCHAR(64);
ALTER TABLE users ADD COLUMN telegram_link_expires_at TIMESTAMPTZ;

-- One chat belongs to one account at a time.
CREATE UNIQUE INDEX idx_users_telegram_chat ON users(telegram_chat_id);
CREATE UNIQUE INDEX idx_users_telegram_link_code ON users(telegram_link_code);
