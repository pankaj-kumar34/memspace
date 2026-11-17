package services

import (
	"bufio"
	"context"
	"io"
	"net"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zalando/go-keyring"
	"memspace/backend/connection"
	"memspace/backend/models"
)

func TestParseMonitorLine(t *testing.T) {
	t.Run("standard command with args", func(t *testing.T) {
		raw := `+1700000000.123456 [0 127.0.0.1:54321] "SET" "user:100" "alice"`
		ev := ParseMonitorLine("conn-1", raw)

		assert.Equal(t, "conn-1", ev.ConnId)
		assert.Equal(t, "0", ev.Db)
		assert.Equal(t, "127.0.0.1:54321", ev.ClientAddr)
		assert.Equal(t, "SET", ev.Command)
		assert.Equal(t, `"user:100" "alice"`, ev.Args)
		assert.NotEmpty(t, ev.Timestamp)
	})

	t.Run("lua script command without args", func(t *testing.T) {
		raw := `1700000000.500000 [2 lua] "PING"`
		ev := ParseMonitorLine("conn-2", raw)

		assert.Equal(t, "2", ev.Db)
		assert.Equal(t, "lua", ev.ClientAddr)
		assert.Equal(t, "PING", ev.Command)
		assert.Equal(t, "", ev.Args)
	})

	t.Run("unix socket client", func(t *testing.T) {
		raw := `1700000001.000000 [0 unix:/var/run/redis.sock] "hgetall" "session:abc"`
		ev := ParseMonitorLine("conn-3", raw)

		assert.Equal(t, "0", ev.Db)
		assert.Equal(t, "unix:/var/run/redis.sock", ev.ClientAddr)
		assert.Equal(t, "HGETALL", ev.Command)
		assert.Equal(t, `"session:abc"`, ev.Args)
	})

	t.Run("empty line", func(t *testing.T) {
		ev := ParseMonitorLine("conn-1", "   ")
		assert.Equal(t, "", ev.Command)
		assert.Equal(t, "", ev.Raw)
	})
}

func TestMonitorService_StreamAndLifecycle(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	keyring.MockInit()

	mr := miniredis.RunT(t)
	cm := connection.NewConnectionManager()

	var useMonitorPipe atomic.Bool
	cm.Dialer = func(ctx context.Context, network, addr string) (net.Conn, error) {
		p1, p2 := net.Pipe()
		if !useMonitorPipe.Load() {
			go mr.Server().ServeConn(p2)
			return p1, nil
		}
		go func() {
			defer p2.Close()
			r := bufio.NewReader(p2)
			line1, err := r.ReadString('\n')
			if err != nil {
				return
			}
			line2, _ := r.ReadString('\n')
			line3, _ := r.ReadString('\n')
			if strings.EqualFold(strings.TrimSpace(line3), "MONITOR") && strings.HasPrefix(line1, "*1") {
				_, _ = p2.Write([]byte("+OK\r\n"))
				_, _ = p2.Write([]byte("+1700000000.123456 [0 127.0.0.1:54321] \"SET\" \"mykey\" \"hello\"\r\n"))
				_, _ = io.Copy(io.Discard, r)
				return
			}
			_ = line2
		}()
		return p1, nil
	}

	port, _ := strconv.Atoi(mr.Port())
	connId := "test-monitor-conn"
	err := cm.SaveConnection(models.ConnectionConfig{
		Id:   connId,
		Name: "Monitor Test",
		Host: mr.Host(),
		Port: port,
	})
	require.NoError(t, err)

	_, err = cm.Connect(context.Background(), connId)
	require.NoError(t, err)
	useMonitorPipe.Store(true)

	svc := NewMonitorService(cm)
	received := make(chan models.MonitorEvent, 4)
	svc.onEvent = func(ev models.MonitorEvent) {
		received <- ev
	}

	require.False(t, svc.IsMonitoring(connId))
	require.NoError(t, svc.StartMonitor(connId))
	assert.True(t, svc.IsMonitoring(connId))

	select {
	case ev := <-received:
		assert.Equal(t, connId, ev.ConnId)
		assert.Equal(t, "SET", ev.Command)
		assert.Equal(t, `"mykey" "hello"`, ev.Args)
		assert.Equal(t, "127.0.0.1:54321", ev.ClientAddr)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for MONITOR event")
	}

	require.NoError(t, svc.StopMonitor(connId))
	assert.False(t, svc.IsMonitoring(connId))
}
