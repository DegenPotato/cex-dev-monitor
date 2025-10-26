-- Add decimals column to gecko_token_data if not exists
-- This is critical for proper market cap calculations

-- Add decimals column to gecko_token_data
ALTER TABLE gecko_token_data ADD COLUMN decimals INTEGER DEFAULT 9;

-- Also ensure token_registry has decimals
ALTER TABLE token_registry ADD COLUMN token_decimals INTEGER DEFAULT 9;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_gecko_token_decimals ON gecko_token_data(mint_address, decimals);
