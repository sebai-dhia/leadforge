-- A deleted lead leaves only the keys used to recognise the business, so the next search does not bring it back.
CREATE TABLE lead_blocklist (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place_id     VARCHAR(120),
    phone_key    VARCHAR(12),
    website_host VARCHAR(255),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_blocklist_place ON lead_blocklist(user_id, place_id);
CREATE INDEX idx_blocklist_phone ON lead_blocklist(user_id, phone_key);
CREATE INDEX idx_blocklist_host  ON lead_blocklist(user_id, website_host);
