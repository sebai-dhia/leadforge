-- "DEMO_USER" was only the column default from when roles were added; no account was ever a real shared demo account.
-- Everyone who has it is an ordinary user, and new accounts without a role are ordinary users too.
UPDATE users SET role = 'USER' WHERE role = 'DEMO_USER';
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'USER';
