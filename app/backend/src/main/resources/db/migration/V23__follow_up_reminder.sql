-- When the lead was last marked Contacted, for the morning follow-up reminder on Telegram.
-- The day of the leads already contacted is not known: they start counting from now.
ALTER TABLE leads ADD COLUMN contacted_at TIMESTAMPTZ;
UPDATE leads SET contacted_at = now() WHERE status = 'CONTACTED';
CREATE INDEX idx_leads_contacted ON leads(user_id, contacted_at) WHERE status = 'CONTACTED';

-- The person's time zone (from the browser when the chat was connected): the reminder goes out in their morning.
ALTER TABLE users ADD COLUMN telegram_timezone VARCHAR(64) NOT NULL DEFAULT 'UTC';
-- The day, in that time zone, the reminder was last looked at, so nobody gets two in one day.
ALTER TABLE users ADD COLUMN telegram_reminded_on DATE;
