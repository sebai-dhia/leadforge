-- A hidden lead is out of the user's lists but stays known, so finding the same business again does not bring it back as new.
ALTER TABLE leads ADD COLUMN hidden_at TIMESTAMPTZ;
