-- Which version of the prompt files wrote a lead's message (for example "draft-749c61ca"), so a message that reads badly
-- can be traced to the exact prompt, and two prompt versions can be compared.
ALTER TABLE leads ADD COLUMN draft_prompt_version VARCHAR(40);
