-- Cache for AI-mapped service to niche suggestions to preserve $0 budget
CREATE TABLE service_niche_cache (
    service_hash VARCHAR(64) PRIMARY KEY,
    service_text TEXT NOT NULL,
    niches_csv   TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
