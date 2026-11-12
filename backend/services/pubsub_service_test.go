package services

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"memspace/backend/connection"
)

func TestPubSubService(t *testing.T) {
	cm, _, connId := setupTestEnv(t, false)
	svc := NewPubSubService(cm)

	// Publish to channel
	n, err := svc.Publish(connId, "news", "hello")
	require.NoError(t, err)
	assert.GreaterOrEqual(t, n, int64(0))

	// Subscribe via service
	err = svc.Subscribe(connId, []string{"notifications", "alerts"})
	require.NoError(t, err)

	time.Sleep(50 * time.Millisecond)

	// Publish while subscribed
	n, err = svc.Publish(connId, "notifications", "system alert")
	require.NoError(t, err)
	assert.GreaterOrEqual(t, n, int64(0))

	// Unsubscribe
	err = svc.Unsubscribe(connId, []string{})
	require.NoError(t, err)

	// Connection not found
	cmEmpty := connection.NewConnectionManager()
	svcEmpty := NewPubSubService(cmEmpty)
	_, err = svcEmpty.Publish("invalid", "ch", "msg")
	assert.Error(t, err)
	assert.Error(t, svcEmpty.Subscribe("invalid", []string{"ch"}))
	assert.Error(t, svcEmpty.Unsubscribe("invalid", []string{}))
}
