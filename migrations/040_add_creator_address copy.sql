-- Add missing columns to token_mints
-- Migration 013 created the table without these columns before they were added

ALTER TABLE token_mints ADD COLUMN creator_address TEXT;
ALTER TABLE token_mints ADD COLUMN platform TEXT;
