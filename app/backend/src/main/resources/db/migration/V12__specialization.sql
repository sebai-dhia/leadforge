-- A guest cannot edit their profile but picks one of three fixed specializations. It sets their services,
-- target industries and offer text, so suggestions and drafts fit them without any free text.
ALTER TABLE users ADD COLUMN specialization VARCHAR(20);
