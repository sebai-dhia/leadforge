-- A refunded use is kept (and not counted against any limit), so the admin still sees the attempts that failed.
ALTER TABLE usage_events ADD COLUMN refunded BOOLEAN NOT NULL DEFAULT FALSE;

-- When the person last made a request, for the admin's users table.
ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ;

-- Deleting an idle guest now keeps its usage and its searches, without the account: the daily caps for all users
-- and the admin's numbers stay right, and a guest's failed search can still be looked at.
ALTER TABLE usage_events ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE usage_events DROP CONSTRAINT usage_events_user_id_fkey;
ALTER TABLE usage_events ADD CONSTRAINT usage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE search_jobs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE search_jobs DROP CONSTRAINT search_jobs_user_id_fkey;
ALTER TABLE search_jobs ADD CONSTRAINT search_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_usage_kind_time ON usage_events(kind, created_at DESC);
CREATE INDEX idx_search_jobs_status_time ON search_jobs(status, created_at DESC);
