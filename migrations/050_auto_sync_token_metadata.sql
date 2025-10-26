-- Migration: Auto-sync token metadata from gecko_token_data to token_registry
-- When gecko_token_data gets updated, automatically update token_registry with relevant metadata

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS sync_token_metadata_on_insert;

DROP TRIGGER IF EXISTS sync_token_metadata_on_update;

-- One-time sync of existing data from gecko_token_data to token_registry
UPDATE token_registry
SET 
  token_symbol = (
    SELECT symbol FROM gecko_token_data 
    WHERE gecko_token_data.mint_address = token_registry.token_mint 
    LIMIT 1
  ),
  token_name = (
    SELECT name FROM gecko_token_data 
    WHERE gecko_token_data.mint_address = token_registry.token_mint 
    LIMIT 1
  ),
  token_decimals = COALESCE(
    (SELECT decimals FROM gecko_token_data 
     WHERE gecko_token_data.mint_address = token_registry.token_mint 
     LIMIT 1),
    token_decimals
  ),
  platform = COALESCE(
    platform,
    (SELECT CASE 
       WHEN launchpad_migrated_pool_address IS NOT NULL THEN 'pump.fun'
       ELSE NULL
     END FROM gecko_token_data 
     WHERE gecko_token_data.mint_address = token_registry.token_mint 
     LIMIT 1)
  ),
  migrated_pool_address = COALESCE(
    migrated_pool_address,
    (SELECT launchpad_migrated_pool_address FROM gecko_token_data 
     WHERE gecko_token_data.mint_address = token_registry.token_mint 
     LIMIT 1)
  ),
  is_graduated = COALESCE(
    is_graduated,
    (SELECT launchpad_completed FROM gecko_token_data 
     WHERE gecko_token_data.mint_address = token_registry.token_mint 
     LIMIT 1)
  ),
  graduated_at = COALESCE(
    graduated_at,
    (SELECT launchpad_completed_at FROM gecko_token_data 
     WHERE gecko_token_data.mint_address = token_registry.token_mint 
     AND launchpad_completed = 1
     LIMIT 1)
  )
WHERE EXISTS (
  SELECT 1 FROM gecko_token_data 
  WHERE gecko_token_data.mint_address = token_registry.token_mint
);
