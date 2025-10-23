-- Technical indicators table
-- Stores calculated indicators per candle for each timeframe
CREATE TABLE IF NOT EXISTS technical_indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mint_address TEXT NOT NULL,
    pool_address TEXT,
    timeframe TEXT NOT NULL, -- '1m', '15m', '1h', '4h', '1d'
    timestamp INTEGER NOT NULL,
    
    -- RSI indicators
    rsi_2 REAL,        -- 2-period RSI (for scalping)
    rsi_14 REAL,       -- 14-period RSI (standard)
    
    -- Exponential Moving Averages
    ema_21 REAL,       -- 21-period EMA (short-term trend)
    ema_50 REAL,       -- 50-period EMA (medium-term)
    ema_100 REAL,      -- 100-period EMA (long-term)
    ema_200 REAL,      -- 200-period EMA (major trend)
    
    -- MACD
    macd_line REAL,    -- MACD line (12-26 EMA difference)
    macd_signal REAL,  -- Signal line (9-period EMA of MACD)
    macd_histogram REAL, -- MACD histogram (MACD - Signal)
    
    -- Bollinger Bands
    bb_upper REAL,     -- Upper Bollinger Band (20-period)
    bb_middle REAL,    -- Middle Band (20-period SMA)
    bb_lower REAL,     -- Lower Bollinger Band
    bb_width REAL,     -- Band width (upper - lower)
    
    -- Volume indicators
    volume_sma_20 REAL, -- 20-period volume SMA
    volume_ratio REAL,  -- Current volume / avg volume
    
    -- Additional metadata
    calculated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    
    -- Indexes for fast queries
    UNIQUE(mint_address, timeframe, timestamp),
    FOREIGN KEY (mint_address) REFERENCES token_mints(mint_address)
);

CREATE INDEX IF NOT EXISTS idx_technical_indicators_lookup 
ON technical_indicators(mint_address, timeframe, timestamp);

CREATE INDEX IF NOT EXISTS idx_technical_indicators_timestamp 
ON technical_indicators(timestamp);
