-- Why a search failed, for the admin and the logs.
ALTER TABLE search_jobs ADD COLUMN failure_reason VARCHAR(200);
