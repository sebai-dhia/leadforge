-- What the draft workflow read on the person's own links (portfolio, GitHub...), kept so it is not fetched for every message.
-- The hash says which links the text belongs to: when the links change, the text is read again.
ALTER TABLE users ADD COLUMN links_knowledge TEXT;
ALTER TABLE users ADD COLUMN links_knowledge_hash VARCHAR(64);
ALTER TABLE users ADD COLUMN links_knowledge_at TIMESTAMPTZ;
