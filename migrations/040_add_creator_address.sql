-- Add missing creator_address column to token_mints
-- Migration 013 created the table without this column before it was added

ALTER TABLE token_mints ADD COLUMN creator_address TEXT;
