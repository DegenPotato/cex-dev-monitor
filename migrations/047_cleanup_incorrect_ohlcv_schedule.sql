-- Clean up incorrect ohlcv_update_schedule entries
-- These were created with pool_address as mint_address due to incorrect parsing

DELETE FROM ohlcv_update_schedule 
WHERE mint_address = pool_address;

-- Log cleanup
SELECT 'Cleaned up incorrect ohlcv_update_schedule entries' as status;
