-- Signed-out sessions and removed accounts whose tokens must be refused, so a restart does not make them valid again.
-- kind is SESSION (key = the token's sid) or USER (key = the user id). A row is useless once the token would have expired.
CREATE TABLE revoked_tokens (
    kind       VARCHAR(8)  NOT NULL,
    key        VARCHAR(64) NOT NULL,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, key)
);
