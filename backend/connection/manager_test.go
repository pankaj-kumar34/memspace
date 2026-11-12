package connection

import (
	"context"
	"errors"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zalando/go-keyring"
	"redisian/backend/models"
)

func newTestPipeDialer(mr *miniredis.Miniredis) func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		p1, p2 := net.Pipe()
		go mr.Server().ServeConn(p2)
		return p1, nil
	}
}

func TestConnectionManager_SaveAndLoad(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	keyring.MockInit()

	cm := NewConnectionManager()
	require.NotNil(t, cm)

	cfg := models.ConnectionConfig{
		Host:     "127.0.0.1",
		Port:     6379,
		Password: "secret-password",
		Database: 0,
		Type:     "standalone",
	}

	// Save new connection (should generate UUID and default Name)
	err := cm.SaveConnection(cfg)
	require.NoError(t, err)

	saved := cm.GetSavedConnections()
	require.Len(t, saved, 1)
	savedCfg := saved[0]
	assert.NotEmpty(t, savedCfg.Id)
	assert.Equal(t, "127.0.0.1:6379", savedCfg.Name)
	assert.Equal(t, "secret-password", savedCfg.Password)

	// Check password was stored in keyring
	pass, err := keyring.Get(keyringService, savedCfg.Id)
	require.NoError(t, err)
	assert.Equal(t, "secret-password", pass)

	// Update existing connection
	savedCfg.Name = "Production Redis"
	savedCfg.Password = "new-secret"
	err = cm.SaveConnection(savedCfg)
	require.NoError(t, err)

	// Instantiate new manager to verify loading from disk and keyring
	cm2 := NewConnectionManager()
	reloaded := cm2.GetSavedConnections()
	require.Len(t, reloaded, 1)
	assert.Equal(t, "Production Redis", reloaded[0].Name)
	assert.Equal(t, "new-secret", reloaded[0].Password)
}

func TestConnectionManager_KeyringFallback(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	// Mock keyring to always fail
	keyring.MockInitWithError(errors.New("keyring service unavailable"))

	cm := NewConnectionManager()
	cfg := models.ConnectionConfig{
		Host:     "localhost",
		Password: "fallback-pass",
	}

	err := cm.SaveConnection(cfg)
	// Even if keyring fails, SaveConnection should proceed gracefully
	assert.NoError(t, err)
	saved := cm.GetSavedConnections()
	require.Len(t, saved, 1)
	assert.Equal(t, "fallback-pass", saved[0].Password)
}

func TestConnectionManager_DeleteConnection(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	keyring.MockInit()

	cm := NewConnectionManager()
	cfg := models.ConnectionConfig{
		Id:       "test-del-1",
		Host:     "127.0.0.1",
		Port:     6379,
		Password: "del-pass",
	}

	require.NoError(t, cm.SaveConnection(cfg))
	require.Len(t, cm.GetSavedConnections(), 1)

	// Verify in keyring
	p, err := keyring.Get(keyringService, "test-del-1")
	require.NoError(t, err)
	assert.Equal(t, "del-pass", p)

	// Delete
	require.NoError(t, cm.DeleteConnection("test-del-1"))
	assert.Len(t, cm.GetSavedConnections(), 0)

	// Keyring should now be cleaned up
	_, err = keyring.Get(keyringService, "test-del-1")
	assert.Error(t, err)
}

func TestConnectionManager_Connect_Success(t *testing.T) {
	mr := miniredis.RunT(t)
	defer mr.Close()

	// Seed some keys
	mr.Set("test:k1", "v1")
	mr.Set("test:k2", "v2")

	t.Setenv("HOME", t.TempDir())
	keyring.MockInit()

	cm := NewConnectionManager()
	cm.Dialer = newTestPipeDialer(mr)

	port, _ := strconv.Atoi(mr.Port())
	cfg := models.ConnectionConfig{
		Id:       "miniredis-1",
		Host:     mr.Host(),
		Port:     port,
		Database: 0,
		Type:     "standalone",
	}
	require.NoError(t, cm.SaveConnection(cfg))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	status, err := cm.Connect(ctx, "miniredis-1")
	require.NoError(t, err)
	require.NotNil(t, status)
	assert.True(t, status.Connected)
	assert.Equal(t, "miniredis-1", status.Id)
	assert.GreaterOrEqual(t, status.LatencyMs, int64(0))

	// GetClient
	mc, err := cm.GetClient("miniredis-1")
	require.NoError(t, err)
	require.NotNil(t, mc)

	val, err := mc.Client.Get(ctx, "test:k1").Result()
	require.NoError(t, err)
	assert.Equal(t, "v1", val)
}

func TestConnectionManager_Connect_NotFound(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	cm := NewConnectionManager()

	status, err := cm.Connect(context.Background(), "non-existent-id")
	assert.Error(t, err)
	assert.Nil(t, status)
	assert.Contains(t, err.Error(), "not found")
}

func TestConnectionManager_Connect_FailedPing(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	keyring.MockInit()

	cm := NewConnectionManager()
	cm.Dialer = func(ctx context.Context, network, addr string) (net.Conn, error) {
		return nil, errors.New("dial failed: connection refused")
	}

	cfg := models.ConnectionConfig{
		Id:       "bad-conn",
		Host:     "127.0.0.1",
		Port:     59999,
		Database: 0,
	}
	require.NoError(t, cm.SaveConnection(cfg))

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	status, err := cm.Connect(ctx, "bad-conn")
	assert.Error(t, err)
	require.NotNil(t, status)
	assert.False(t, status.Connected)
	assert.NotEmpty(t, status.ErrorMessage)

	// GetClient should fail
	_, err = cm.GetClient("bad-conn")
	assert.Error(t, err)
}

func TestConnectionManager_TestConnection(t *testing.T) {
	mr := miniredis.RunT(t)
	defer mr.Close()

	port, _ := strconv.Atoi(mr.Port())
	cfg := models.ConnectionConfig{
		Host: mr.Host(),
		Port: port,
	}

	cm := NewConnectionManager()
	cm.Dialer = newTestPipeDialer(mr)

	msg, err := cm.TestConnection(context.Background(), cfg)
	assert.NoError(t, err)
	assert.True(t, strings.HasPrefix(msg, "Successfully connected"))

	// Bad dialer
	cm.Dialer = func(ctx context.Context, network, addr string) (net.Conn, error) {
		return nil, errors.New("dial timeout")
	}

	badCfg := models.ConnectionConfig{
		Host: "127.0.0.1",
		Port: 59998,
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	_, err = cm.TestConnection(ctx, badCfg)
	assert.Error(t, err)
}

func TestConnectionManager_DisconnectAndCloseAll(t *testing.T) {
	mr := miniredis.RunT(t)
	defer mr.Close()

	port, _ := strconv.Atoi(mr.Port())
	t.Setenv("HOME", t.TempDir())
	keyring.MockInit()

	cm := NewConnectionManager()
	cm.Dialer = newTestPipeDialer(mr)

	cfg := models.ConnectionConfig{
		Id:   "conn-disc",
		Host: mr.Host(),
		Port: port,
	}
	require.NoError(t, cm.SaveConnection(cfg))

	_, err := cm.Connect(context.Background(), "conn-disc")
	require.NoError(t, err)

	_, err = cm.GetClient("conn-disc")
	assert.NoError(t, err)

	// Disconnect single
	err = cm.Disconnect("conn-disc")
	assert.NoError(t, err)
	_, err = cm.GetClient("conn-disc")
	assert.Error(t, err)

	// Connect again and CloseAll
	_, err = cm.Connect(context.Background(), "conn-disc")
	require.NoError(t, err)
	cm.CloseAll()
	_, err = cm.GetClient("conn-disc")
	assert.Error(t, err)
}

func TestConnectionManager_GetClientForDB(t *testing.T) {
	mr := miniredis.RunT(t)
	defer mr.Close()

	port, _ := strconv.Atoi(mr.Port())
	t.Setenv("HOME", t.TempDir())
	cm := NewConnectionManager()
	cm.Dialer = newTestPipeDialer(mr)

	cfg := models.ConnectionConfig{
		Id:       "db-test",
		Host:     mr.Host(),
		Port:     port,
		Database: 0,
	}
	require.NoError(t, cm.SaveConnection(cfg))
	_, err := cm.Connect(context.Background(), "db-test")
	require.NoError(t, err)

	mc, err := cm.GetClient("db-test")
	require.NoError(t, err)

	ctx := context.Background()
	// Set in DB 0
	c0 := mc.GetClientForDB(0)
	require.NoError(t, c0.Set(ctx, "scoped_key", "in_db_0", 0).Err())

	v0, err := c0.Get(ctx, "scoped_key").Result()
	require.NoError(t, err)
	assert.Equal(t, "in_db_0", v0)
}

func TestConnectionManager_SetActiveClient(t *testing.T) {
	cm := NewConnectionManager()
	mc := &ManagedClient{
		Config: models.ConnectionConfig{Id: "mock-1"},
	}
	cm.SetActiveClient("mock-1", mc)

	retrieved, err := cm.GetClient("mock-1")
	require.NoError(t, err)
	assert.Equal(t, "mock-1", retrieved.Config.Id)
}

func TestBuildTLSConfig(t *testing.T) {
	// Disabled
	tc, err := BuildTLSConfig(models.TlsConfig{Enabled: false})
	assert.NoError(t, err)
	assert.Nil(t, tc)

	// Enabled with InsecureSkipVerify
	tc, err = BuildTLSConfig(models.TlsConfig{Enabled: true, InsecureSkipVerify: true})
	assert.NoError(t, err)
	require.NotNil(t, tc)
	assert.True(t, tc.InsecureSkipVerify)

	// Enabled with invalid CA PEM
	_, err = BuildTLSConfig(models.TlsConfig{Enabled: true, CaCert: "invalid cert content"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to parse CA certificate")

	// Enabled with mismatched client key pair
	_, err = BuildTLSConfig(models.TlsConfig{Enabled: true, ClientCert: "not-a-cert", ClientKey: "not-a-key"})
	assert.Error(t, err)
}
