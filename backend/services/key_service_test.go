package services

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestKeyService_ScanKeys(t *testing.T) {
	cm, mr, connId := setupTestEnv(t, false)
	svc := NewKeyService(cm)

	// Test Empty DB
	res, err := svc.ScanKeys(connId, 0, 0, "*", "all", 100)
	require.NoError(t, err)
	assert.Empty(t, res.Keys)
	assert.Equal(t, int64(0), res.Total)

	// Populate various key types
	mr.Set("user:101", "Alice")
	mr.Set("user:102", "Bob")
	mr.Set("config:theme", "dark")
	mr.HSet("profile:101", "bio", "Engineer")
	mr.Push("queue:tasks", "task1", "task2")
	mr.SAdd("tags:tech", "go", "redis")
	mr.ZAdd("leaderboard", 100, "Alice")
	mr.SetTTL("user:101", 300*time.Second)

	// 1. Scan all
	res, err = svc.ScanKeys(connId, 0, 0, "*", "all", 100)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(res.Keys), 7)
	assert.Equal(t, int64(7), res.Total)

	// 2. Scan with pattern
	res, err = svc.ScanKeys(connId, 0, 0, "user:*", "all", 100)
	require.NoError(t, err)
	assert.Len(t, res.Keys, 2)
	for _, k := range res.Keys {
		assert.Contains(t, k.Key, "user:")
		assert.Equal(t, "string", k.Type)
		if k.Key == "user:101" {
			assert.Greater(t, k.TTL, int64(0))
		}
	}

	// 3. Scan with type filter
	res, err = svc.ScanKeys(connId, 0, 0, "*", "hash", 100)
	require.NoError(t, err)
	assert.Len(t, res.Keys, 1)
	assert.Equal(t, "profile:101", res.Keys[0].Key)
	assert.Equal(t, "hash", res.Keys[0].Type)

	// 4. Scan with invalid connId
	_, err = svc.ScanKeys("invalid-conn", 0, 0, "*", "all", 100)
	assert.Error(t, err)
}

func TestKeyService_GetKeyDetails(t *testing.T) {
	cm, mr, connId := setupTestEnv(t, false)
	svc := NewKeyService(cm)

	// Non-existent key
	_, err := svc.GetKeyDetails(connId, 0, "nonexistent")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "key does not exist")

	// String key
	mr.Set("str_key", "hello world")
	mr.SetTTL("str_key", 600*time.Second)
	details, err := svc.GetKeyDetails(connId, 0, "str_key")
	require.NoError(t, err)
	assert.Equal(t, "str_key", details.Key)
	assert.Equal(t, "string", details.Type)
	assert.Equal(t, "hello world", details.Value)
	assert.Greater(t, details.TTL, int64(0))

	// Hash key
	mr.HSet("hash_key", "f1", "v1", "f2", "v2")
	details, err = svc.GetKeyDetails(connId, 0, "hash_key")
	require.NoError(t, err)
	assert.Equal(t, "hash", details.Type)
	hMap, ok := details.Value.(map[string]string)
	require.True(t, ok)
	assert.Equal(t, "v1", hMap["f1"])
	assert.Equal(t, "v2", hMap["f2"])

	// List key
	mr.Push("list_key", "item1", "item2")
	details, err = svc.GetKeyDetails(connId, 0, "list_key")
	require.NoError(t, err)
	assert.Equal(t, "list", details.Type)
	lItems, ok := details.Value.([]string)
	require.True(t, ok)
	assert.Len(t, lItems, 2)

	// Set key
	mr.SAdd("set_key", "member1", "member2")
	details, err = svc.GetKeyDetails(connId, 0, "set_key")
	require.NoError(t, err)
	assert.Equal(t, "set", details.Type)
	sItems, ok := details.Value.([]string)
	require.True(t, ok)
	assert.Len(t, sItems, 2)

	// ZSet key
	mr.ZAdd("zset_key", 42.5, "player1")
	details, err = svc.GetKeyDetails(connId, 0, "zset_key")
	require.NoError(t, err)
	assert.Equal(t, "zset", details.Type)
}

func TestKeyService_TTL(t *testing.T) {
	cm, mr, connId := setupTestEnv(t, false)
	svc := NewKeyService(cm)

	mr.Set("expire_key", "val")
	assert.Equal(t, time.Duration(0), mr.TTL("expire_key"))

	// Set expiration
	err := svc.SetTTL(connId, 0, "expire_key", 3600)
	require.NoError(t, err)
	assert.Greater(t, mr.TTL("expire_key"), time.Duration(0))

	// Persist key (remove TTL)
	err = svc.SetTTL(connId, 0, "expire_key", -1)
	require.NoError(t, err)
	assert.Equal(t, time.Duration(0), mr.TTL("expire_key"))
}

func TestKeyService_RenameKey(t *testing.T) {
	cm, mr, connId := setupTestEnv(t, false)
	svc := NewKeyService(cm)

	mr.Set("old_name", "my_val")
	err := svc.RenameKey(connId, 0, "old_name", "new_name")
	require.NoError(t, err)

	assert.False(t, mr.Exists("old_name"))
	assert.True(t, mr.Exists("new_name"))
	val, err := mr.Get("new_name")
	require.NoError(t, err)
	assert.Equal(t, "my_val", val)
}

func TestKeyService_DeleteAndUnlink(t *testing.T) {
	cm, mr, connId := setupTestEnv(t, false)
	svc := NewKeyService(cm)

	mr.Set("del_target", "1")
	mr.Set("unlink_target", "2")

	// Delete
	require.NoError(t, svc.DeleteKey(connId, 0, "del_target"))
	assert.False(t, mr.Exists("del_target"))

	// Unlink
	require.NoError(t, svc.UnlinkKey(connId, 0, "unlink_target"))
	assert.False(t, mr.Exists("unlink_target"))
}

func TestKeyService_DeleteKeysAndUnlinkKeys(t *testing.T) {
	cm, mr, connId := setupTestEnv(t, false)
	svc := NewKeyService(cm)

	mr.Set("batch_del_1", "a")
	mr.Set("batch_del_2", "b")
	mr.Set("batch_keep", "c")
	mr.Set("batch_unlink_1", "d")
	mr.Set("batch_unlink_2", "e")

	// Empty slice returns 0, nil
	n, err := svc.DeleteKeys(connId, 0, []string{})
	require.NoError(t, err)
	assert.Equal(t, int64(0), n)

	// Batch delete (including a non-existent key)
	n, err = svc.DeleteKeys(connId, 0, []string{"batch_del_1", "batch_del_2", "does_not_exist"})
	require.NoError(t, err)
	assert.Equal(t, int64(2), n)
	assert.False(t, mr.Exists("batch_del_1"))
	assert.False(t, mr.Exists("batch_del_2"))
	assert.True(t, mr.Exists("batch_keep"))

	// Batch unlink
	n, err = svc.UnlinkKeys(connId, 0, []string{"batch_unlink_1", "batch_unlink_2"})
	require.NoError(t, err)
	assert.Equal(t, int64(2), n)
	assert.False(t, mr.Exists("batch_unlink_1"))
	assert.False(t, mr.Exists("batch_unlink_2"))
	assert.True(t, mr.Exists("batch_keep"))
}

func TestKeyService_ReadOnlyProtection(t *testing.T) {
	cm, mr, roConnId := setupTestEnv(t, true)
	svc := NewKeyService(cm)

	mr.Set("ro_key", "val")

	// Delete blocked
	err := svc.DeleteKey(roConnId, 0, "ro_key")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")

	// Batch Delete & Unlink blocked
	_, err = svc.DeleteKeys(roConnId, 0, []string{"ro_key"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")

	_, err = svc.UnlinkKeys(roConnId, 0, []string{"ro_key"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")

	// Unlink blocked
	err = svc.UnlinkKey(roConnId, 0, "ro_key")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")

	// SetTTL blocked
	err = svc.SetTTL(roConnId, 0, "ro_key", 100)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")

	// RenameKey blocked
	err = svc.RenameKey(roConnId, 0, "ro_key", "ro_key2")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")

	// Key should still be intact
	assert.True(t, mr.Exists("ro_key"))
}

func TestKeyService_ScanPagination(t *testing.T) {
	cm, mr, connId := setupTestEnv(t, false)
	svc := NewKeyService(cm)

	// Seed 30 keys
	for i := 0; i < 30; i++ {
		mr.Set(fmt.Sprintf("item:%02d", i), fmt.Sprintf("val-%d", i))
	}

	// Scan with count 10
	res, err := svc.ScanKeys(connId, 0, 0, "item:*", "string", 10)
	require.NoError(t, err)
	assert.NotEmpty(t, res.Keys)
	assert.Equal(t, int64(30), res.Total)
}
