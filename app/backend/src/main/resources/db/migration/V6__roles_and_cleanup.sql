-- 1. Delete legacy leads with no place_id (IDs 1-51) that corrupt deduplication
DELETE FROM leads WHERE place_id IS NULL;

-- 2. Recalculate job counts after removing legacy leads
UPDATE search_jobs j
   SET found_count = (SELECT count(*) FROM search_leads sl WHERE sl.job_id = j.id),
       new_count   = (SELECT count(*) FROM search_leads sl WHERE sl.job_id = j.id)
 WHERE j.status = 'DONE';

-- 3. Add roles and demo indicator to users
ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'DEMO_USER';
ALTER TABLE users ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
