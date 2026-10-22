-- What each search, message and contact lookup cost on the outside services, as the n8n workflows report it:
-- calls to Gemini (with tokens), Serper and Geoapify. One row per provider per request.
CREATE TABLE api_usage (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action        VARCHAR(10) NOT NULL,
    provider      VARCHAR(10) NOT NULL,
    calls         INTEGER     NOT NULL,
    input_tokens  BIGINT      NOT NULL DEFAULT 0,
    output_tokens BIGINT      NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_usage_time ON api_usage(created_at DESC);
CREATE INDEX idx_api_usage_provider_time ON api_usage(provider, created_at DESC);
