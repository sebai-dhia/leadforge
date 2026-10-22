-- The hour (0-23, in the person's own time zone) the follow-up reminder is sent from. The person chooses it on the profile.
ALTER TABLE users ADD COLUMN telegram_reminder_hour INTEGER NOT NULL DEFAULT 9;
