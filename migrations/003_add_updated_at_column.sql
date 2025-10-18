-- Migration: Add missing updated_at column to users table
-- Date: 2025-10-18
-- Purpose: Fix "no such column: updated_at" error in SecureAuth

-- Add updated_at column if it doesn't exist
-- SQLite doesn't support IF NOT EXISTS for ALTER COLUMN, so we use a workaround

-- First check if column exists by attempting to select it
-- If it fails, add the column
BEGIN;

-- Try to add the column (will fail if it already exists, which is fine)
ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP;

-- Update existing rows to have the current timestamp
UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;

COMMIT;
