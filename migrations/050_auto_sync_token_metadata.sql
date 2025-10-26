-- Migration: Auto-sync token metadata from gecko_token_data to token_registry
-- When gecko_token_data gets updated, automatically update token_registry with relevant metadata

-- Create trigger to auto-update token_registry when gecko_token_data is inserted or updated
DROP TRIGGER IF EXISTS sync_token_metadata_on_insert;
CREATE TRIGGER sync_token_metadata_on_insert
AFTER INSERT ON gecko_token_data
FOR EACH ROW
BEGIN
  UPDATE token_registry
  SET 
    token_symbol = COALESCE(NEW.symbol, token_symbol),
    token_name = COALESCE(NEW.name, token_name),
    token_decimals = COALESCE(NEW.decimals, token_decimals),
    -- Infer platform from launchpad data or keep existing
    platform = COALESCE(
      platform,
      CASE 
        WHEN NEW.launchpad_migrated_pool_address IS NOT NULL THEN 'pump.fun'
        ELSE NULL
      END
    ),
    migrated_pool_address = COALESCE(NEW.launchpad_migrated_pool_address, migrated_pool_address),
    is_graduated = CASE WHEN NEW.launchpad_completed = 1 THEN 1 ELSE is_graduated END,
    graduated_at = CASE 
      WHEN NEW.launchpad_completed = 1 AND NEW.launchpad_completed_at IS NOT NULL 
      THEN NEW.launchpad_completed_at 
      ELSE graduated_at 
    END,
    updated_at = strftime('%s', 'now')
  WHERE token_mint = NEW.mint_address;
END;

-- Create trigger for updates as well
DROP TRIGGER IF EXISTS sync_token_metadata_on_update;
CREATE TRIGGER sync_token_metadata_on_update
AFTER UPDATE ON gecko_token_data
FOR EACH ROW
BEGIN
  UPDATE token_registry
  SET 
    token_symbol = COALESCE(NEW.symbol, token_symbol),
    token_name = COALESCE(NEW.name, token_name),
    token_decimals = COALESCE(NEW.decimals, token_decimals),
    -- Infer platform from launchpad data or keep existing
    platform = COALESCE(
      platform,
      CASE 
        WHEN NEW.launchpad_migrated_pool_address IS NOT NULL THEN 'pump.fun'
        ELSE NULL
      END
    ),
    migrated_pool_address = COALESCE(NEW.launchpad_migrated_pool_address, migrated_pool_address),
    is_graduated = CASE WHEN NEW.launchpad_completed = 1 THEN 1 ELSE is_graduated END,
    graduated_at = CASE 
      WHEN NEW.launchpad_completed = 1 AND NEW.launchpad_completed_at IS NOT NULL 
      THEN NEW.launchpad_completed_at 
      ELSE graduated_at 
    END,
    updated_at = strftime('%s', 'now')
  WHERE token_mint = NEW.mint_address;
END;

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
