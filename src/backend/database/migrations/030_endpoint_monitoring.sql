-- Migration 030: Endpoint Monitoring & Traffic Logging
-- Tracks all API endpoint usage for performance monitoring and analytics

CREATE TABLE IF NOT EXISTS endpoint_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER NOT NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  user_agent TEXT,
  ip_address TEXT,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_endpoint_logs_endpoint ON endpoint_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_endpoint_logs_timestamp ON endpoint_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_endpoint_logs_user ON endpoint_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_endpoint_logs_status ON endpoint_logs(status_code);

-- View for endpoint performance analytics
CREATE VIEW IF NOT EXISTS endpoint_performance AS
SELECT 
  endpoint,
  method,
  COUNT(*) as total_calls,
  AVG(response_time_ms) as avg_response_time,
  MIN(response_time_ms) as min_response_time,
  MAX(response_time_ms) as max_response_time,
  COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count,
  COUNT(CASE WHEN status_code < 400 THEN 1 END) as success_count,
  MAX(timestamp) as last_called
FROM endpoint_logs
GROUP BY endpoint, method;

-- View for traffic by hour
CREATE VIEW IF NOT EXISTS endpoint_traffic_hourly AS
SELECT 
  strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
  COUNT(*) as total_requests,
  COUNT(DISTINCT user_id) as unique_users,
  AVG(response_time_ms) as avg_response_time,
  COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
FROM endpoint_logs
GROUP BY hour
ORDER BY hour DESC;
