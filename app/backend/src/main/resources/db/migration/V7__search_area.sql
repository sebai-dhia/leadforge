-- Support geographic bounding box for map-based lead discovery
ALTER TABLE search_jobs ADD COLUMN bbox VARCHAR(100);
