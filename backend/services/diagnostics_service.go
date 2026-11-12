package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"redisian/backend/connection"
	"redisian/backend/models"
)

// DiagnosticsService provides performance metrics, slowlog queries, and client list inspection.
type DiagnosticsService struct {
	mgr *connection.ConnectionManager
}

// NewDiagnosticsService creates a new DiagnosticsService.
func NewDiagnosticsService(mgr *connection.ConnectionManager) *DiagnosticsService {
	return &DiagnosticsService{mgr: mgr}
}

// ParseInfoOutput parses raw Redis INFO output into a nested map of sections and key-values.
func ParseInfoOutput(infoStr string) map[string]map[string]string {
	result := make(map[string]map[string]string)
	currentSection := "general"
	result[currentSection] = make(map[string]string)

	normalized := strings.ReplaceAll(infoStr, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "# ") {
			currentSection = strings.ToLower(strings.TrimPrefix(line, "# "))
			if _, exists := result[currentSection]; !exists {
				result[currentSection] = make(map[string]string)
			}
			continue
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) == 2 {
			result[currentSection][parts[0]] = parts[1]
		}
	}
	return result
}

// GetInfo returns structured server telemetry from Redis INFO.
func (s *DiagnosticsService) GetInfo(connId string) (map[string]map[string]string, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	infoStr, err := mc.Client.Info(ctx).Result()
	if err != nil {
		return nil, err
	}

	return ParseInfoOutput(infoStr), nil
}

// GetSlowLog retrieves recent slow operations recorded by Redis SLOWLOG.
func (s *DiagnosticsService) GetSlowLog(connId string, count int64) ([]models.SlowLogEntry, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return nil, err
	}

	if count <= 0 {
		count = 50
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	entries, err := mc.Client.SlowLogGet(ctx, count).Result()
	if err != nil {
		return nil, err
	}

	result := make([]models.SlowLogEntry, len(entries))
	for i, e := range entries {
		result[i] = models.SlowLogEntry{
			Id:            e.ID,
			Timestamp:     e.Time.Unix(),
			ExecutionTime: int64(e.Duration / time.Microsecond),
			Args:          e.Args,
			ClientAddr:    e.ClientAddr,
			ClientName:    e.ClientName,
		}
	}
	return result, nil
}

// ParseClientListOutput parses raw output from CLIENT LIST into structured ClientEntry items.
func ParseClientListOutput(raw string) []models.ClientEntry {
	var clients []models.ClientEntry
	lines := strings.Split(raw, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		entry := models.ClientEntry{}
		for _, f := range fields {
			parts := strings.SplitN(f, "=", 2)
			if len(parts) != 2 {
				continue
			}
			k, v := parts[0], parts[1]
			switch k {
			case "id":
				entry.Id = v
			case "addr":
				entry.Addr = v
			case "name":
				entry.Name = v
			case "age":
				entry.Age = v
			case "idle":
				entry.Idle = v
			case "flags":
				entry.Flags = v
			case "db":
				entry.Db = v
			case "sub":
				entry.Sub = v
			case "psub":
				entry.Psub = v
			case "multi":
				entry.Multi = v
			case "cmd":
				entry.Cmd = v
			case "user":
				entry.User = v
			case "obl":
				entry.OutputBuf = v
			case "qbl":
				entry.QueryBuf = v
			}
		}
		clients = append(clients, entry)
	}
	return clients
}

// GetClientList retrieves connected clients and their state.
func (s *DiagnosticsService) GetClientList(connId string) ([]models.ClientEntry, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	raw, err := mc.Client.ClientList(ctx).Result()
	if err != nil {
		return nil, err
	}

	return ParseClientListOutput(raw), nil
}

// KillClient terminates a client connection given its IP:Port address.
func (s *DiagnosticsService) KillClient(connId string, clientAddr string) error {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return err
	}
	if mc.Config.ReadOnly {
		return fmt.Errorf("connection is in read-only mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return mc.Client.ClientKill(ctx, clientAddr).Err()
}

// GetMemoryUsage returns exact memory consumption for a key via MEMORY USAGE.
func (s *DiagnosticsService) GetMemoryUsage(connId string, db int, key string) (int64, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return 0, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return mc.GetClientForDB(db).MemoryUsage(ctx, key).Result()
}
