package services

import (
	"context"
	"net"
	"strconv"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zalando/go-keyring"
	"memspace/backend/connection"
	"memspace/backend/models"
)

func TestConnectionService_Lifecycle(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	keyring.MockInit()

	mr := miniredis.RunT(t)
	cm := connection.NewConnectionManager()
	cm.Dialer = func(ctx context.Context, network, addr string) (net.Conn, error) {
		p1, p2 := net.Pipe()
		go mr.Server().ServeConn(p2)
		return p1, nil
	}

	svc := NewConnectionService(cm)
	port, _ := strconv.Atoi(mr.Port())

	cfg := models.ConnectionConfig{
		Id:       "cs-test-1",
		Name:     "Test Service Connection",
		Host:     mr.Host(),
		Port:     port,
		Database: 0,
	}

	// SaveConnection
	require.NoError(t, svc.SaveConnection(cfg))

	// GetConnections
	conns := svc.GetConnections()
	require.Len(t, conns, 1)
	assert.Equal(t, "cs-test-1", conns[0].Id)

	// TestConnection
	msg, err := svc.TestConnection(cfg)
	require.NoError(t, err)
	assert.Contains(t, msg, "Successfully connected")

	// Connect
	status, err := svc.Connect("cs-test-1")
	require.NoError(t, err)
	require.NotNil(t, status)
	assert.True(t, status.Connected)

	// Disconnect
	err = svc.Disconnect("cs-test-1")
	require.NoError(t, err)

	// DeleteConnection
	err = svc.DeleteConnection("cs-test-1")
	require.NoError(t, err)
	assert.Empty(t, svc.GetConnections())
}
