-- Check token_mints table
SELECT 'token_mints count:' as table_name, COUNT(*) as count FROM token_mints;

-- Check token_registry table  
SELECT 'token_registry count:' as table_name, COUNT(*) as count FROM token_registry;

-- Check telegram_detections table
SELECT 'telegram_detections count:' as table_name, COUNT(*) as count FROM telegram_detections;

-- Show recent token_mints
SELECT 'Recent token_mints:' as info;
SELECT mint_address, first_seen_source, datetime(first_seen_at, 'unixepoch') as first_seen 
FROM token_mints 
ORDER BY first_seen_at DESC 
LIMIT 5;

-- Show recent token_registry
SELECT 'Recent token_registry:' as info;
SELECT token_mint, first_source_type, datetime(first_seen_at, 'unixepoch') as first_seen
FROM token_registry
ORDER BY first_seen_at DESC
LIMIT 5;

-- Show recent telegram_detections
SELECT 'Recent telegram_detections:' as info;
SELECT contract_address, chat_id, datetime(detected_at, 'unixepoch') as detected
FROM telegram_detections
ORDER BY detected_at DESC
LIMIT 5;
