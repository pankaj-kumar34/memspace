package services

import (
	"context"
	"net"
	"strconv"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/require"
	"github.com/zalando/go-keyring"
	"memspace/backend/connection"
	"memspace/backend/models"
)

func setupTestEnv(t *testing.T, readOnly bool) (*connection.ConnectionManager, *miniredis.Miniredis, string) {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	keyring.MockInit()

	mr := miniredis.RunT(t)

	cm := connection.NewConnectionManager()
	cm.Dialer = func(ctx context.Context, network, addr string) (net.Conn, error) {
		p1, p2 := net.Pipe()
		go mr.Server().ServeConn(p2)
		return p1, nil
	}

	port, _ := strconv.Atoi(mr.Port())
	connId := "test-conn-1"
	if readOnly {
		connId = "test-ro-conn"
	}

	cfg := models.ConnectionConfig{
		Id:       connId,
		Name:     "Test Miniredis",
		Host:     mr.Host(),
		Port:     port,
		Database: 0,
		ReadOnly: readOnly,
	}

	err := cm.SaveConnection(cfg)
	require.NoError(t, err)

	_, err = cm.Connect(context.Background(), connId)
	require.NoError(t, err)

	return cm, mr, connId
}
