-- The two shared demo accounts are replaced by one-click guest accounts (temporary, private per visitor).
-- Their known password made them unsafe to keep. Leads and searches go with them (ON DELETE CASCADE).
DELETE FROM users WHERE email IN ('demo1@leadforge.dev', 'demo2@leadforge.dev');
