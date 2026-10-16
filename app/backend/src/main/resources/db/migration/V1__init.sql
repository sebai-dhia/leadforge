CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE search_jobs (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    niche      VARCHAR(255) NOT NULL,
    city       VARCHAR(255) NOT NULL,
    service    TEXT NOT NULL,
    sender     VARCHAR(255) NOT NULL,
    status     VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_search_jobs_user ON search_jobs(user_id, created_at DESC);

CREATE TABLE leads (
    id         BIGSERIAL PRIMARY KEY,
    job_id     BIGINT NOT NULL REFERENCES search_jobs(id) ON DELETE CASCADE,
    name       VARCHAR(255),
    address    VARCHAR(500),
    phone      VARCHAR(100),
    rating     DOUBLE PRECISION,
    reviews    INTEGER,
    website    VARCHAR(500),
    emails     VARCHAR(1000),
    score      INTEGER,
    reason     TEXT,
    subject    VARCHAR(500),
    email_body TEXT,
    status     VARCHAR(20) NOT NULL DEFAULT 'NEW'
);
CREATE INDEX idx_leads_job ON leads(job_id);
