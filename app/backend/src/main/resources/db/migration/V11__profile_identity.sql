-- A profile is more than one text box: a headline, a city, a short bio, chosen services and target industries,
-- and links. Lists are stored as JSON text. "onboarded" records that the first-run picker was done or skipped.
ALTER TABLE users ADD COLUMN headline  VARCHAR(160)  NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN city      VARCHAR(120)  NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN about     VARCHAR(500)  NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN services  VARCHAR(600)  NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN targets   VARCHAR(900)  NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN links     VARCHAR(2000) NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN onboarded BOOLEAN       NOT NULL DEFAULT FALSE;

-- People who already wrote an offer have a profile; do not send them through the picker.
UPDATE users SET onboarded = TRUE WHERE offer <> '' OR role IN ('ADMIN', 'GUEST');
