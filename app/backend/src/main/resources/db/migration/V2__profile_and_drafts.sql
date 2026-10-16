-- Saved sender profile, reused by every search and draft
ALTER TABLE users ADD COLUMN offer        TEXT         NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN display_name VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN language     VARCHAR(5)   NOT NULL DEFAULT 'en';

-- Drafts are written on demand, so remember which language and channel was used
ALTER TABLE leads ADD COLUMN draft_language VARCHAR(5);
ALTER TABLE leads ADD COLUMN draft_channel  VARCHAR(10);
