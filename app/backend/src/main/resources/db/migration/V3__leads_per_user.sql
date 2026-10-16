-- Leads now belong to a user, so the same business found by several searches is one lead
-- that keeps its status and message. A link table records which searches found it.

ALTER TABLE leads ADD COLUMN user_id       BIGINT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN niche         VARCHAR(255);
ALTER TABLE leads ADD COLUMN city          VARCHAR(255);
ALTER TABLE leads ADD COLUMN place_id      VARCHAR(120);
ALTER TABLE leads ADD COLUMN phone_key     VARCHAR(12);
ALTER TABLE leads ADD COLUMN website_host  VARCHAR(255);
ALTER TABLE leads ADD COLUMN first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE leads ADD COLUMN last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE leads l
   SET user_id = j.user_id, niche = j.niche, city = j.city,
       first_seen_at = j.created_at, last_seen_at = j.created_at
  FROM search_jobs j
 WHERE j.id = l.job_id;

ALTER TABLE leads ALTER COLUMN user_id SET NOT NULL;

-- Matching keys: the last 8 digits of a phone number, and the website host (never a social site)
UPDATE leads
   SET phone_key = right(regexp_replace(phone, '\D', '', 'g'), 8)
 WHERE phone IS NOT NULL AND length(regexp_replace(phone, '\D', '', 'g')) >= 6;

UPDATE leads
   SET website_host = lower(split_part(regexp_replace(website, '^https?://(www\.)?', ''), '/', 1))
 WHERE website IS NOT NULL
   AND website !~* '(facebook|instagram|linkedin|twitter|tiktok|youtube)\.';

CREATE TABLE search_leads (
    job_id  BIGINT NOT NULL REFERENCES search_jobs(id) ON DELETE CASCADE,
    lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    PRIMARY KEY (job_id, lead_id)
);
CREATE INDEX idx_search_leads_lead ON search_leads(lead_id);

INSERT INTO search_leads (job_id, lead_id) SELECT job_id, id FROM leads;

-- Merge duplicates that already exist: same user and same phone (or same name and address).
-- Keep the one that has progressed furthest, so no status or message is lost.
CREATE TEMP TABLE dupe_map AS
SELECT id, keep_id
  FROM (SELECT id,
               first_value(id) OVER w AS keep_id,
               row_number()    OVER w AS rn
          FROM leads
        WINDOW w AS (PARTITION BY user_id,
                                  COALESCE(phone_key, lower(name) || '|' || COALESCE(address, ''))
                     ORDER BY (status <> 'NEW') DESC, (email_body IS NOT NULL) DESC, id)) ranked
 WHERE rn > 1;

INSERT INTO search_leads (job_id, lead_id)
SELECT sl.job_id, m.keep_id
  FROM search_leads sl JOIN dupe_map m ON m.id = sl.lead_id
ON CONFLICT DO NOTHING;

DELETE FROM leads WHERE id IN (SELECT id FROM dupe_map);

DROP INDEX IF EXISTS idx_leads_job;
ALTER TABLE leads DROP COLUMN job_id;

CREATE UNIQUE INDEX uq_leads_user_place ON leads(user_id, place_id) WHERE place_id IS NOT NULL;
CREATE INDEX idx_leads_user_status ON leads(user_id, status);
CREATE INDEX idx_leads_user_phone  ON leads(user_id, phone_key);
CREATE INDEX idx_leads_user_host   ON leads(user_id, website_host);

-- How many businesses a search found, and how many were new to this user
ALTER TABLE search_jobs ADD COLUMN found_count INTEGER;
ALTER TABLE search_jobs ADD COLUMN new_count   INTEGER;
UPDATE search_jobs j
   SET found_count = (SELECT count(*) FROM search_leads sl WHERE sl.job_id = j.id),
       new_count   = (SELECT count(*) FROM search_leads sl WHERE sl.job_id = j.id)
 WHERE j.status = 'DONE';
