package services

import (
	"bufio"
	"context"
	"fmt"
	"math"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"memspace/backend/connection"
	"memspace/backend/models"
)

type monitorSession struct {
	conn   net.Conn
	cancel context.CancelFunc
}

// MonitorService streams live Redis MONITOR commands to the frontend.
type MonitorService struct {
	mgr      *connection.ConnectionManager
	mu       sync.Mutex
	sessions map[string]*monitorSession
	onEvent  func(models.MonitorEvent)
}

// NewMonitorService creates a new MonitorService.
func NewMonitorService(mgr *connection.ConnectionManager) *MonitorService {
	return &MonitorService{
		mgr:      mgr,
		sessions: make(map[string]*monitorSession),
	}
}

// ParseMonitorLine parses a raw Redis MONITOR line into a structured MonitorEvent.
// Example: +1700000000.123456 [0 127.0.0.1:54321] "SET" "key" "value"
func ParseMonitorLine(connId string, raw string) models.MonitorEvent {
	trimmed := strings.TrimSpace(raw)
	trimmed = strings.TrimPrefix(trimmed, "+")
	ev := models.MonitorEvent{
		ConnId: connId,
		Raw:    trimmed,
	}
	if trimmed == "" {
		return ev
	}

	// Skip initial "OK" acknowledgement if emitted
	if strings.EqualFold(trimmed, "OK") {
		ev.Command = "OK"
		ev.Timestamp = time.Now().Format("15:04:05.000")
		return ev
	}

	// Extract timestamp before first space
	spaceIdx := strings.IndexByte(trimmed, ' ')
	if spaceIdx == -1 {
		ev.Command = trimmed
		return ev
	}

	tsRaw := trimmed[:spaceIdx]
	ev.Timestamp = formatMonitorTimestamp(tsRaw)
	rest := strings.TrimSpace(trimmed[spaceIdx+1:])

	// Extract [db clientAddr]
	if strings.HasPrefix(rest, "[") {
		closeBracket := strings.IndexByte(rest, ']')
		if closeBracket != -1 {
			meta := strings.TrimSpace(rest[1:closeBracket])
			metaParts := strings.SplitN(meta, " ", 2)
			if len(metaParts) >= 1 {
				ev.Db = metaParts[0]
			}
			if len(metaParts) == 2 {
				ev.ClientAddr = strings.TrimSpace(metaParts[1])
			}
			rest = strings.TrimSpace(rest[closeBracket+1:])
		}
	}

	// Extract command and args
	if rest != "" {
		cmdPart, argsPart := splitCommandAndArgs(rest)
		ev.Command = strings.ToUpper(strings.Trim(cmdPart, `"`))
		ev.Args = argsPart
	}

	return ev
}

func formatMonitorTimestamp(tsRaw string) string {
	val, err := strconv.ParseFloat(tsRaw, 64)
	if err != nil {
		return tsRaw
	}
	sec := int64(val)
	nsec := int64(math.Round((val - float64(sec)) * 1e9))
	return time.Unix(sec, nsec).Format("15:04:05.000")
}

func splitCommandAndArgs(rest string) (string, string) {
	if strings.HasPrefix(rest, `"`) {
		escaped := false
		for i := 1; i < len(rest); i++ {
			if escaped {
				escaped = false
				continue
			}
			if rest[i] == '\\' {
				escaped = true
				continue
			}
			if rest[i] == '"' {
				cmd := rest[1:i]
				args := strings.TrimSpace(rest[i+1:])
				return cmd, args
			}
		}
	}
	parts := strings.SplitN(rest, " ", 2)
	if len(parts) == 1 {
		return parts[0], ""
	}
	return parts[0], strings.TrimSpace(parts[1])
}

func writeRESPCommand(conn net.Conn, args ...string) error {
	var b strings.Builder
	fmt.Fprintf(&b, "*%d\r\n", len(args))
	for _, arg := range args {
		fmt.Fprintf(&b, "$%d\r\n%s\r\n", len(arg), arg)
	}
	_, err := conn.Write([]byte(b.String()))
	return err
}

func readRESPLine(r *bufio.Reader) (string, error) {
	line, err := r.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

// StartMonitor starts streaming MONITOR events for the specified connection.
func (s *MonitorService) StartMonitor(connId string) error {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return err
	}

	if strings.EqualFold(mc.Config.Type, "cluster") {
		return fmt.Errorf("MONITOR is only supported on standalone or failover connections (not Cluster mode)")
	}

	dialCtx, dialCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer dialCancel()

	conn, err := mc.DialRaw(dialCtx)
	if err != nil {
		return fmt.Errorf("failed to open monitor connection: %w", err)
	}

	reader := bufio.NewReaderSize(conn, 16*1024)

	// Authenticate if credentials are configured
	if mc.Config.Password != "" {
		var authErr error
		if mc.Config.Username != "" {
			authErr = writeRESPCommand(conn, "AUTH", mc.Config.Username, mc.Config.Password)
		} else {
			authErr = writeRESPCommand(conn, "AUTH", mc.Config.Password)
		}
		if authErr != nil {
			_ = conn.Close()
			return fmt.Errorf("failed to send AUTH: %w", authErr)
		}
		reply, err := readRESPLine(reader)
		if err != nil {
			_ = conn.Close()
			return fmt.Errorf("failed to read AUTH reply: %w", err)
		}
		if strings.HasPrefix(reply, "-") {
			_ = conn.Close()
			return fmt.Errorf("AUTH failed: %s", strings.TrimPrefix(reply, "-"))
		}
	}

	// Send MONITOR command
	if err := writeRESPCommand(conn, "MONITOR"); err != nil {
		_ = conn.Close()
		return fmt.Errorf("failed to send MONITOR: %w", err)
	}

	ack, err := readRESPLine(reader)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("failed to start MONITOR: %w", err)
	}
	if strings.HasPrefix(ack, "-") {
		_ = conn.Close()
		return fmt.Errorf("MONITOR rejected: %s", strings.TrimPrefix(ack, "-"))
	}

	s.mu.Lock()
	if existing, exists := s.sessions[connId]; exists {
		existing.cancel()
		_ = existing.conn.Close()
		delete(s.sessions, connId)
	}

	ctx, cancel := context.WithCancel(context.Background())
	session := &monitorSession{
		conn:   conn,
		cancel: cancel,
	}
	s.sessions[connId] = session
	s.mu.Unlock()

	go func() {
		defer func() {
			_ = conn.Close()
			s.mu.Lock()
			if cur, exists := s.sessions[connId]; exists && cur == session {
				delete(s.sessions, connId)
			}
			s.mu.Unlock()
			if app := application.Get(); app != nil {
				app.Event.Emit("monitor:stopped", connId)
			}
		}()

		for {
			if ctx.Err() != nil {
				return
			}
			line, err := readRESPLine(reader)
			if err != nil {
				return
			}
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || strings.EqualFold(trimmed, "OK") || strings.EqualFold(trimmed, "+OK") {
				continue
			}
			ev := ParseMonitorLine(connId, trimmed)
			if s.onEvent != nil {
				s.onEvent(ev)
			}
			if app := application.Get(); app != nil {
				app.Event.Emit("monitor:event", ev)
			}
		}
	}()

	return nil
}

// StopMonitor stops an active MONITOR stream for the specified connection.
func (s *MonitorService) StopMonitor(connId string) error {
	s.mu.Lock()
	session, exists := s.sessions[connId]
	if exists {
		delete(s.sessions, connId)
	}
	s.mu.Unlock()

	if !exists {
		return nil
	}

	session.cancel()
	_ = session.conn.Close()
	return nil
}

// IsMonitoring reports whether a MONITOR stream is currently active for connId.
func (s *MonitorService) IsMonitoring(connId string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, exists := s.sessions[connId]
	return exists
}
