package connection

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/zalando/go-keyring"
	"memspace/backend/models"
)

const (
	keyringService = "memspace"
)

// ConnectionManager manages saved connection definitions and active Redis client sessions.
type ConnectionManager struct {
	mu          sync.RWMutex
	connections map[string]models.ConnectionConfig
	activePool  map[string]*ManagedClient
	storagePath string
	Dialer      func(ctx context.Context, network, addr string) (net.Conn, error)
}

// NewConnectionManager initializes the manager and loads existing connection configurations.
func NewConnectionManager() *ConnectionManager {
	storageDir := filepath.Join(os.Getenv("HOME"), ".memspace")
	_ = os.MkdirAll(storageDir, 0755)
	storagePath := filepath.Join(storageDir, "connections.json")

	// Backwards-compatible migration from legacy .redisian directory if present
	if _, err := os.Stat(storagePath); os.IsNotExist(err) {
		oldPath := filepath.Join(os.Getenv("HOME"), ".redisian", "connections.json")
		if oldData, err := os.ReadFile(oldPath); err == nil {
			_ = os.WriteFile(storagePath, oldData, 0600)
		}
	}

	cm := &ConnectionManager{
		connections: make(map[string]models.ConnectionConfig),
		activePool:  make(map[string]*ManagedClient),
		storagePath: storagePath,
	}

	cm.loadFromFile()
	return cm
}

func (cm *ConnectionManager) loadFromFile() {
	data, err := os.ReadFile(cm.storagePath)
	if err != nil {
		return
	}

	var list []models.ConnectionConfig
	if err := json.Unmarshal(data, &list); err != nil {
		return
	}

	cm.mu.Lock()
	defer cm.mu.Unlock()

	for _, cfg := range list {
		// Attempt to load password from system keyring
		if pass, err := keyring.Get(keyringService, cfg.Id); err == nil && pass != "" {
			cfg.Password = pass
		}
		if sshPass, err := keyring.Get(keyringService, cfg.Id+"_ssh"); err == nil && sshPass != "" {
			cfg.Ssh.Passphrase = sshPass
		}
		cm.connections[cfg.Id] = cfg
	}
}

func (cm *ConnectionManager) saveToFile() error {
	list := make([]models.ConnectionConfig, 0, len(cm.connections))
	for _, cfg := range cm.connections {
		if cfg.Ephemeral {
			continue
		}
		// Securely store credentials in OS keyring
		if cfg.Password != "" {
			_ = keyring.Set(keyringService, cfg.Id, cfg.Password)
		}
		if cfg.Ssh.Passphrase != "" {
			_ = keyring.Set(keyringService, cfg.Id+"_ssh", cfg.Ssh.Passphrase)
		}

		// Redact secrets on the disk copy before serialization to prevent plaintext leakage
		diskCfg := cfg
		diskCfg.Password = ""
		diskCfg.Ssh.Passphrase = ""
		list = append(list, diskCfg)
	}

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to encode connections: %w", err)
	}

	return os.WriteFile(cm.storagePath, data, 0600)
}

// GetSavedConnections returns all persisted connection configurations.
func (cm *ConnectionManager) GetSavedConnections() []models.ConnectionConfig {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	result := make([]models.ConnectionConfig, 0, len(cm.connections))
	for _, cfg := range cm.connections {
		result = append(result, cfg)
	}
	return result
}

// SaveConnection creates or updates a connection configuration.
func (cm *ConnectionManager) SaveConnection(cfg models.ConnectionConfig) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if cfg.Id == "" {
		cfg.Id = uuid.NewString()
	}
	if cfg.Port <= 0 {
		cfg.Port = 6379
	}
	if cfg.Name == "" {
		cfg.Name = fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	}

	cm.connections[cfg.Id] = cfg
	if cfg.Ephemeral {
		return nil
	}
	return cm.saveToFile()
}

// DeleteConnection removes a saved configuration and disconnects if currently active.
func (cm *ConnectionManager) DeleteConnection(id string) error {
	_ = cm.Disconnect(id)

	cm.mu.Lock()
	defer cm.mu.Unlock()

	delete(cm.connections, id)
	_ = keyring.Delete(keyringService, id)
	_ = keyring.Delete(keyringService, id+"_ssh")
	return cm.saveToFile()
}

// Connect establishes a connection to the specified Redis instance.
func (cm *ConnectionManager) Connect(ctx context.Context, id string) (*models.ConnectionStatus, error) {
	cm.mu.Lock()
	cfg, exists := cm.connections[id]
	cm.mu.Unlock()

	if !exists {
		return nil, fmt.Errorf("connection config with id %s not found", id)
	}

	// Close existing active client if already connected
	cm.mu.Lock()
	oldClient, clientExists := cm.activePool[id]
	if clientExists {
		delete(cm.activePool, id)
	}
	cm.mu.Unlock()
	if clientExists && oldClient != nil {
		_ = oldClient.Close()
	}

	start := time.Now()
	managed, err := NewManagedClientWithDialer(ctx, cfg, cm.Dialer)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return &models.ConnectionStatus{
			Id:           id,
			Connected:    false,
			ErrorMessage: err.Error(),
		}, err
	}

	cm.mu.Lock()
	cm.activePool[id] = managed
	cm.mu.Unlock()

	// Gather basic server info
	status := &models.ConnectionStatus{
		Id:          id,
		Connected:   true,
		LatencyMs:   latency,
		ClusterMode: cfg.Type == "cluster",
	}

	infoCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	if infoStr, err := managed.Client.Info(infoCtx).Result(); err == nil {
		lines := strings.Split(infoStr, "\r\n")
		for _, line := range lines {
			if strings.HasPrefix(line, "redis_version:") {
				status.ServerVersion = strings.TrimPrefix(line, "redis_version:")
			} else if strings.HasPrefix(line, "role:") {
				status.Role = strings.TrimPrefix(line, "role:")
			} else if strings.HasPrefix(line, "db") && strings.Contains(line, "keys=") {
				// e.g. db0:keys=123,expires=0,avg_ttl=0
				parts := strings.Split(line, ",")
				for _, p := range parts {
					if idx := strings.Index(p, "keys="); idx != -1 {
						kCount, _ := strconv.ParseInt(p[idx+5:], 10, 64)
						status.TotalKeys += kCount
					}
				}
			}
		}
	}

	return status, nil
}

// Disconnect terminates the active connection for the given id.
func (cm *ConnectionManager) Disconnect(id string) error {
	cm.mu.Lock()
	client, exists := cm.activePool[id]
	if exists {
		delete(cm.activePool, id)
	}
	cfg, cfgExists := cm.connections[id]
	if cfgExists && cfg.Ephemeral {
		delete(cm.connections, id)
	}
	cm.mu.Unlock()

	if exists && client != nil {
		return client.Close()
	}
	return nil
}

// GetClient retrieves the active managed client for a connection ID.
func (cm *ConnectionManager) GetClient(connId string) (*ManagedClient, error) {
	cm.mu.RLock()
	client, exists := cm.activePool[connId]
	cm.mu.RUnlock()

	if !exists || client == nil {
		return nil, fmt.Errorf("connection %s is not active", connId)
	}
	return client, nil
}

// SetActiveClient directly registers a ManagedClient in the active pool (useful for testing and mocks).
func (cm *ConnectionManager) SetActiveClient(id string, mc *ManagedClient) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.activePool[id] = mc
}

// TestConnection attempts a temporary connection and ping to test reachability.
func (cm *ConnectionManager) TestConnection(ctx context.Context, cfg models.ConnectionConfig) (string, error) {
	start := time.Now()
	client, err := NewManagedClientWithDialer(ctx, cfg, cm.Dialer)
	if err != nil {
		return "", err
	}
	defer client.Close()

	latency := time.Since(start).Milliseconds()
	return fmt.Sprintf("Successfully connected in %d ms", latency), nil
}

// CloseAll terminates all active connections.
func (cm *ConnectionManager) CloseAll() {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	for id, client := range cm.activePool {
		if client != nil {
			_ = client.Close()
		}
		delete(cm.activePool, id)
	}
}
