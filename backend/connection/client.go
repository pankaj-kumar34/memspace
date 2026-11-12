package connection

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"memspace/backend/models"
)

type redisVoidLogger struct{}

func (redisVoidLogger) Printf(ctx context.Context, format string, v ...interface{}) {}

func init() {
	redis.SetLogger(redisVoidLogger{})
}

// ManagedClient wraps a Redis UniversalClient along with its configuration and optional SSH tunnel.
type ManagedClient struct {
	Config    models.ConnectionConfig
	Client    redis.UniversalClient
	Tunnel    *SSHTunnel
	dbClients map[int]*redis.Client
	mu        sync.RWMutex
}

// BuildTLSConfig generates a *tls.Config based on user preferences.
func BuildTLSConfig(host string, tlsCfg models.TlsConfig) (*tls.Config, error) {
	if !tlsCfg.Enabled {
		return nil, nil
	}

	// Extract hostname without port if present
	sniHost := host
	if h, _, err := net.SplitHostPort(host); err == nil {
		sniHost = h
	}

	tc := &tls.Config{
		InsecureSkipVerify: tlsCfg.InsecureSkipVerify,
		ServerName:         sniHost,
	}

	if tlsCfg.CaCert != "" {
		caCertBytes, err := os.ReadFile(tlsCfg.CaCert)
		if err != nil {
			// CaCert might be inline PEM content rather than a file path
			caCertBytes = []byte(tlsCfg.CaCert)
		}
		caCertPool := x509.NewCertPool()
		if !caCertPool.AppendCertsFromPEM(caCertBytes) {
			return nil, fmt.Errorf("failed to parse CA certificate")
		}
		tc.RootCAs = caCertPool
	}

	if tlsCfg.ClientCert != "" && tlsCfg.ClientKey != "" {
		var cert tls.Certificate
		var err error
		// Check if file paths exist, otherwise treat as inline PEM
		if _, errF1 := os.Stat(tlsCfg.ClientCert); errF1 == nil {
			cert, err = tls.LoadX509KeyPair(tlsCfg.ClientCert, tlsCfg.ClientKey)
		} else {
			cert, err = tls.X509KeyPair([]byte(tlsCfg.ClientCert), []byte(tlsCfg.ClientKey))
		}
		if err != nil {
			return nil, fmt.Errorf("failed to load client key pair: %w", err)
		}
		tc.Certificates = []tls.Certificate{cert}
	}

	return tc, nil
}

// NewManagedClient establishes a new Redis client according to config (Standalone, Sentinel, or Cluster).
func NewManagedClient(ctx context.Context, cfg models.ConnectionConfig) (*ManagedClient, error) {
	return NewManagedClientWithDialer(ctx, cfg, nil)
}

// NewManagedClientWithDialer establishes a new Redis client with an optional custom net dialer.
func NewManagedClientWithDialer(ctx context.Context, cfg models.ConnectionConfig, customDialer func(ctx context.Context, network, addr string) (net.Conn, error)) (*ManagedClient, error) {
	var tunnel *SSHTunnel
	var err error

	if cfg.Ssh.Enabled {
		tunnel, err = NewSSHTunnel(cfg.Ssh)
		if err != nil {
			return nil, fmt.Errorf("failed to establish ssh tunnel: %w", err)
		}
	}

	tlsConfig, err := BuildTLSConfig(cfg.Host, cfg.Tls)
	if err != nil {
		if tunnel != nil {
			_ = tunnel.Close()
		}
		return nil, fmt.Errorf("invalid tls configuration: %w", err)
	}

	var dialer func(ctx context.Context, network, addr string) (net.Conn, error) = customDialer
	if tunnel != nil {
		dialer = func(ctx context.Context, network, addr string) (net.Conn, error) {
			return tunnel.DialContext(ctx, network, addr)
		}
	}

	var client redis.UniversalClient

	connType := strings.ToLower(cfg.Type)
	switch connType {
	case "cluster":
		addrs := cfg.ClusterNodes
		if len(addrs) == 0 {
			addrs = []string{fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)}
		}
		client = redis.NewClusterClient(&redis.ClusterOptions{
			Addrs:        addrs,
			Username:     cfg.Username,
			Password:     cfg.Password,
			TLSConfig:    tlsConfig,
			Dialer:       dialer,
			DialTimeout:  4 * time.Second,
			ReadTimeout:  10 * time.Second,
			WriteTimeout: 10 * time.Second,
			ReadOnly:     cfg.ReadOnly,
			MaxRetries:   2,
		})

	case "sentinel":
		addrs := cfg.SentinelNodes
		if len(addrs) == 0 {
			addrs = []string{fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)}
		}
		client = redis.NewFailoverClient(&redis.FailoverOptions{
			MasterName:    cfg.SentinelMaster,
			SentinelAddrs: addrs,
			Username:      cfg.Username,
			Password:      cfg.Password,
			DB:            cfg.Database,
			TLSConfig:     tlsConfig,
			Dialer:        dialer,
			DialTimeout:   4 * time.Second,
			ReadTimeout:   10 * time.Second,
			WriteTimeout:  10 * time.Second,
			MaxRetries:    2,
		})

	default: // "standalone" or empty
		addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
		client = redis.NewClient(&redis.Options{
			Addr:         addr,
			Username:     cfg.Username,
			Password:     cfg.Password,
			DB:           cfg.Database,
			TLSConfig:    tlsConfig,
			Dialer:       dialer,
			DialTimeout:  4 * time.Second,
			ReadTimeout:  10 * time.Second,
			WriteTimeout: 10 * time.Second,
			MaxRetries:   2,
		})
	}

	// Verify connection with Ping
	pingCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	if err := client.Ping(pingCtx).Err(); err != nil {
		_ = client.Close()
		if tunnel != nil {
			_ = tunnel.Close()
		}
		errMsg := err.Error()
		if strings.Contains(errMsg, "HTTP/1.1 400 Bad Request") || strings.Contains(errMsg, "HTTP/") {
			return nil, fmt.Errorf("server responded with 'HTTP/1.1 400 Bad Request'. This server requires TLS/SSL encryption (e.g. AWS ElastiCache, Azure, Upstash, or cloud Redis). Please enable TLS under the 'TLS / SSL' tab (and check 'Skip TLS verification' if using a self-signed or private CA cert)")
		}
		if strings.Contains(errMsg, "deadline exceeded") || strings.Contains(errMsg, "i/o timeout") {
			if strings.Contains(cfg.Host, ".private.") {
				return nil, fmt.Errorf("connection timed out (context deadline exceeded): This is a private service endpoint and cannot be reached directly over the public internet. Connect to your corporate/cloud VPN (e.g. IBM Cloud VPN) or configure an SSH Tunnel under the 'SSH Tunnel' tab")
			}
			return nil, fmt.Errorf("connection timed out (context deadline exceeded): Host could not be reached. Please check your network, VPN, or firewall settings")
		}
		return nil, fmt.Errorf("ping failed: %w", err)
	}

	return &ManagedClient{
		Config:    cfg,
		Client:    client,
		Tunnel:    tunnel,
		dbClients: make(map[int]*redis.Client),
	}, nil
}

// GetClientForDB returns a redis.UniversalClient configured for the requested database.
// In Cluster mode, DB is always 0.
func (mc *ManagedClient) GetClientForDB(db int) redis.UniversalClient {
	if strings.ToLower(mc.Config.Type) == "cluster" {
		return mc.Client
	}

	// For standalone or sentinel, if DB matches current configuration, reuse Client
	if mc.Config.Database == db {
		return mc.Client
	}

	// For standalone client, create and cache a client for the requested DB
	if standaloneClient, ok := mc.Client.(*redis.Client); ok {
		mc.mu.RLock()
		if c, exists := mc.dbClients[db]; exists {
			mc.mu.RUnlock()
			return c
		}
		mc.mu.RUnlock()

		mc.mu.Lock()
		defer mc.mu.Unlock()
		if c, exists := mc.dbClients[db]; exists {
			return c
		}

		opts := standaloneClient.Options()
		cloneOpts := *opts
		cloneOpts.DB = db
		newClient := redis.NewClient(&cloneOpts)
		mc.dbClients[db] = newClient
		return newClient
	}

	return mc.Client
}

// Close gracefully closes the Redis client and any underlying SSH tunnel.
func (mc *ManagedClient) Close() error {
	var errs []string

	// Close cached per-DB clients to prevent resource/connection leaks
	mc.mu.Lock()
	for db, c := range mc.dbClients {
		if c != nil {
			if err := c.Close(); err != nil {
				errs = append(errs, fmt.Sprintf("db %d: %s", db, err.Error()))
			}
		}
	}
	mc.dbClients = make(map[int]*redis.Client)
	mc.mu.Unlock()

	if mc.Client != nil {
		if err := mc.Client.Close(); err != nil {
			errs = append(errs, err.Error())
		}
	}
	if mc.Tunnel != nil {
		if err := mc.Tunnel.Close(); err != nil {
			errs = append(errs, err.Error())
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("errors closing connection: %s", strings.Join(errs, "; "))
	}
	return nil
}
