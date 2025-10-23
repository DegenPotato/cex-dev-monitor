-- Migration 027: Clean up null OHLCV values
-- Fixes the 1-minute timeframe chart crashes by removing invalid candles

-- Delete candles with null OHLCV values
DELETE FROM ohlcv_data 
WHERE open IS NULL 
   OR high IS NULL 
   OR low IS NULL 
   OR close IS NULL
   OR open <= 0
   OR high <= 0
   OR low <= 0
   OR close <= 0;

-- Delete candles with invalid relationships (high < low, etc)
DELETE FROM ohlcv_data 
WHERE high < low 
   OR high < open
   OR high < close
   OR low > open
   OR low > close;

-- Log how many rows were cleaned
SELECT 'Cleaned invalid OHLCV candles from database' as message;
