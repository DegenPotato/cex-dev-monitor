package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/gotd/td/telegram"
	"github.com/gotd/td/telegram/auth"
	"github.com/gotd/td/telegram/message"
	"github.com/gotd/td/telegram/updates"
	"github.com/gotd/td/tg"
	"go.uber.org/zap"
)

const (
	// Schema version for message format
	SCHEMA_VERSION = "1.0.0"
	
	// Metrics tracking intervals
	METRICS_LOG_INTERVAL = 30 * time.Second
	REDIS_PING_INTERVAL  = 5 * time.Second
)

// Contract detection patterns
var (
	solPattern            = regexp.MustCompile(`\b[1-9A-HJ-NP-Za-km-z]{32,44}\b`)
	solPatternWithSpecial = regexp.MustCompile(`[1-9A-HJ-NP-Za-km-z]{8,}[-_.\s]{1,2}[1-9A-HJ-NP-Za-km-z]{8,}(?:[-_.\s]{1,2}[1-9A-HJ-NP-Za-km-z]{8,})*`)
)

// Detection represents a contract detection with schema versioning
type Detection struct {
	SchemaVersion string `json:"schema_version"`
	UserID        int    `json:"user_id"`
	ChatID        int64  `json:"chat_id"`
	MessageID     int    `json:"message_id"`
	Contract      string `json:"contract"`
	Type          string `json:"type"`
	Sender        int64  `json:"sender_id"`
	Username      string `json:"username"`
	Message       string `json:"message"`
	DetectedAt    int64  `json:"detected_at"`
	ProcessedAt   int64  `json:"processed_at"` // Track Go processing time
}

// Metrics tracks performance statistics
type Metrics struct {
	MessagesProcessed  uint64
	ContractsDetected  uint64
	RedisWrites        uint64
	RedisErrors        uint64
	AvgProcessingTime  int64 // microseconds
	LastError          string
	StartTime          time.Time
}

// Config holds the app configuration
type Config struct {
	APIID       int
	APIHash     string
	Phone       string
	SessionFile string
	RedisAddr   string
	MonitoredChats []int64
	UserFilters    []int64
}

func main() {
	cfg := &Config{
		APIID:       getEnvInt("API_ID", 26373394),
		APIHash:     getEnv("API_HASH", "45c5edf0039ffdd8efe7965189b42141"),
		Phone:       getEnv("PHONE", "+66642397038"),
		SessionFile: getEnv("SESSION_FILE", "telegram.session"),
		RedisAddr:   getEnv("REDIS_ADDR", "localhost:6379"),
		MonitoredChats: []int64{-4945112939}, // Your GROUP_TARGETS
		UserFilters:    []int64{448480473},   // Your USER_FILTER
	}

	// Initialize metrics
	metrics := &Metrics{
		StartTime: time.Now(),
	}

	// Setup Redis with reconnection
	rdb := setupRedisWithReconnect(cfg.RedisAddr, metrics)
	defer rdb.Close()

	// Start metrics logger
	go logMetrics(metrics)

	// Start Redis health checker
	go redisHealthCheck(rdb, metrics)

	// Setup logger
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	// Create Telegram client
	client := telegram.NewClient(cfg.APIID, cfg.APIHash, telegram.Options{
		Logger:        logger,
		SessionStorage: &FileSessionStorage{Path: cfg.SessionFile},
	})

	// Setup message handler
	dispatcher := updates.NewDispatcher()
	gaps := updates.New(updates.Config{
		Handler: dispatcher,
	})

	// Message handler with metrics
	dispatcher.OnNewMessage(func(ctx context.Context, e tg.Entities, update *tg.UpdateNewMessage) error {
		startTime := time.Now()
		atomic.AddUint64(&metrics.MessagesProcessed, 1)
		
		msg, ok := update.Message.(*tg.Message)
		if !ok || msg.Message == "" {
			return nil
		}

		// Check if from monitored chat
		chatID := msg.PeerID.(*tg.PeerChat).ChatID
		if !isMonitoredChat(chatID, cfg.MonitoredChats) {
			return nil
		}

		// Check user filter
		if len(cfg.UserFilters) > 0 && !isFilteredUser(msg.FromID, cfg.UserFilters) {
			return nil
		}

		// Extract contracts
		contracts := extractContracts(msg.Message)
		if len(contracts) == 0 {
			return nil
		}

		// Get sender info
		var username string
		if user, err := e.Users[msg.FromID.(*tg.PeerUser).UserID]; err == nil {
			username = user.Username
		}

		// Push each detection to Redis with metrics
		for _, contract := range contracts {
			detection := Detection{
				SchemaVersion: SCHEMA_VERSION,
				UserID:        1, // Your user ID from auth
				ChatID:        chatID,
				MessageID:     msg.ID,
				Contract:      contract.Address,
				Type:          contract.Type,
				Sender:        msg.FromID.(*tg.PeerUser).UserID,
				Username:      username,
				Message:       msg.Message,
				DetectedAt:    time.Now().Unix(),
				ProcessedAt:   time.Now().UnixMicro(),
			}

			// Push to Redis stream for real-time processing
			data, _ := json.Marshal(detection)
			err := rdb.XAdd(ctx, &redis.XAddArgs{
				Stream: "telegram:detections",
				Values: map[string]interface{}{
					"data": string(data),
				},
			}).Err()

			if err != nil {
				atomic.AddUint64(&metrics.RedisErrors, 1)
				metrics.LastError = err.Error()
				log.Printf("❌ Redis error: %v", err)
			} else {
				atomic.AddUint64(&metrics.RedisWrites, 1)
				atomic.AddUint64(&metrics.ContractsDetected, 1)
				log.Printf("✅ [%s] %s... | Latency: %dµs", 
					contract.Type, 
					contract.Address[:8],
					time.Since(startTime).Microseconds())
			}
		}
		
		// Update average processing time
		processingTime := time.Since(startTime).Microseconds()
		atomic.StoreInt64(&metrics.AvgProcessingTime, processingTime)

		return nil
	})

	// Run client
	if err := client.Run(context.Background(), func(ctx context.Context) error {
		// Authentication flow
		flow := auth.NewFlow(
			auth.Constant(cfg.Phone,
				auth.CodeAuthenticatorFunc(func(ctx context.Context, sentCode *tg.AuthSentCode) (string, error) {
					// In production, get code from Redis or HTTP endpoint
					fmt.Print("Enter code: ")
					var code string
					fmt.Scanln(&code)
					return code, nil
				}),
			),
			auth.SendCodeOptions{},
		)

		if err := client.Auth().IfNecessary(ctx, flow); err != nil {
			return err
		}

		log.Println("✅ Authenticated to Telegram")
		
		// Start receiving updates
		return gaps.Run(ctx, client.API(), e.Self.ID, updates.AuthOptions{
			OnStart: func(ctx context.Context) {
				log.Println("🚀 Telegram listener started")
			},
		})
	}); err != nil {
		log.Fatal(err)
	}
}

// Contract represents a detected contract
type Contract struct {
	Address  string
	Type     string
	Original string
}

// extractContracts finds all contract addresses in text
func extractContracts(text string) []Contract {
	var contracts []Contract
	seen := make(map[string]bool)

	// Standard format
	for _, match := range solPattern.FindAllString(text, -1) {
		if isValidSolanaAddress(match) && !seen[match] {
			contracts = append(contracts, Contract{
				Address: match,
				Type:    "standard",
				Original: match,
			})
			seen[match] = true
		}
	}

	// Obfuscated format
	for _, match := range solPatternWithSpecial.FindAllString(text, -1) {
		cleaned := strings.ReplaceAll(match, "-", "")
		cleaned = strings.ReplaceAll(cleaned, "_", "")
		cleaned = strings.ReplaceAll(cleaned, ".", "")
		cleaned = strings.ReplaceAll(cleaned, " ", "")
		
		if isValidSolanaAddress(cleaned) && !seen[cleaned] {
			contracts = append(contracts, Contract{
				Address:  cleaned,
				Type:     "obfuscated",
				Original: match,
			})
			seen[cleaned] = true
		}
	}

	// Split format (check consecutive lines)
	lines := strings.Split(text, "\n")
	for i := 0; i < len(lines)-1; i++ {
		combined := strings.TrimSpace(lines[i]) + strings.TrimSpace(lines[i+1])
		cleaned := regexp.MustCompile(`[^1-9A-HJ-NP-Za-km-z]`).ReplaceAllString(combined, "")
		
		if isValidSolanaAddress(cleaned) && !seen[cleaned] {
			contracts = append(contracts, Contract{
				Address:  cleaned,
				Type:     "split",
				Original: combined,
			})
			seen[cleaned] = true
		}
	}

	return contracts
}

// isValidSolanaAddress checks if string is valid Solana address
func isValidSolanaAddress(addr string) bool {
	if len(addr) < 32 || len(addr) > 44 {
		return false
	}
	return solPattern.MatchString(addr)
}

// Helper functions
func isMonitoredChat(chatID int64, monitored []int64) bool {
	for _, id := range monitored {
		if id == chatID {
			return true
		}
	}
	return false
}

func isFilteredUser(fromID tg.PeerClass, filters []int64) bool {
	if fromID == nil {
		return true // Allow if no sender
	}
	
	userPeer, ok := fromID.(*tg.PeerUser)
	if !ok {
		return true
	}
	
	for _, id := range filters {
		if id == userPeer.UserID {
			return true
		}
	}
	return false
}

// FileSessionStorage implements session storage
type FileSessionStorage struct {
	Path string
}

func (f *FileSessionStorage) LoadSession(ctx context.Context) ([]byte, error) {
	data, err := os.ReadFile(f.Path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	return data, err
}

func (f *FileSessionStorage) StoreSession(ctx context.Context, data []byte) error {
	return os.WriteFile(f.Path, data, 0600)
}

// setupRedisWithReconnect creates Redis client with automatic reconnection
func setupRedisWithReconnect(addr string, metrics *Metrics) *redis.Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:         addr,
		MaxRetries:   10,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     10,
		MinIdleConns: 5,
		OnConnect: func(ctx context.Context, cn *redis.Conn) error {
			log.Println("✅ Redis connected")
			return nil
		},
	})

	// Initial connection test
	ctx := context.Background()
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("⚠️ Initial Redis connection failed: %v (will retry)", err)
		atomic.AddUint64(&metrics.RedisErrors, 1)
	}

	return rdb
}

// redisHealthCheck monitors Redis connection health
func redisHealthCheck(rdb *redis.Client, metrics *Metrics) {
	ticker := time.NewTicker(REDIS_PING_INTERVAL)
	defer ticker.Stop()

	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		if err := rdb.Ping(ctx).Err(); err != nil {
			log.Printf("❌ Redis health check failed: %v", err)
			atomic.AddUint64(&metrics.RedisErrors, 1)
			metrics.LastError = fmt.Sprintf("Redis ping failed: %v", err)
		}
		cancel()
	}
}

// logMetrics periodically logs performance metrics
func logMetrics(metrics *Metrics) {
	ticker := time.NewTicker(METRICS_LOG_INTERVAL)
	defer ticker.Stop()

	for range ticker.C {
		uptime := time.Since(metrics.StartTime)
		messagesProcessed := atomic.LoadUint64(&metrics.MessagesProcessed)
		contractsDetected := atomic.LoadUint64(&metrics.ContractsDetected)
		redisWrites := atomic.LoadUint64(&metrics.RedisWrites)
		redisErrors := atomic.LoadUint64(&metrics.RedisErrors)
		avgProcessingTime := atomic.LoadInt64(&metrics.AvgProcessingTime)

		log.Printf(`
📊 Telegram Listener Metrics:
├─ Uptime: %v
├─ Messages Processed: %d
├─ Contracts Detected: %d
├─ Redis Writes: %d
├─ Redis Errors: %d
├─ Avg Processing: %dµs
├─ Throughput: %.2f msg/sec
└─ Success Rate: %.2f%%`,
			uptime,
			messagesProcessed,
			contractsDetected,
			redisWrites,
			redisErrors,
			avgProcessingTime,
			float64(messagesProcessed)/uptime.Seconds(),
			(float64(redisWrites)/float64(redisWrites+redisErrors))*100,
		)

		if metrics.LastError != "" {
			log.Printf("⚠️ Last Error: %s", metrics.LastError)
		}
	}
}

// getEnv gets environment variable with fallback
func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// getEnvInt gets integer environment variable with fallback
func getEnvInt(key string, fallback int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return fallback
}
