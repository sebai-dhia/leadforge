-- Accounts created through Google sign-in have no password and are identified by Google's stable user id.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN google_sub VARCHAR(64);
CREATE UNIQUE INDEX uq_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;
