-- Geoapify place ids reach at least 136 characters
ALTER TABLE leads ALTER COLUMN place_id TYPE VARCHAR(500);
