-- Per-user usage, so daily limits can be enforced
CREATE TABLE usage_events (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_user_kind_time ON usage_events(user_id, kind, created_at DESC);

-- Social pages found on a business's website or by the on-demand contact search
ALTER TABLE leads ADD COLUMN social VARCHAR(1000);
-- When the on-demand contact search last ran for this lead
ALTER TABLE leads ADD COLUMN contact_checked_at TIMESTAMPTZ;
