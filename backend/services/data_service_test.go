package services

import (
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2/server"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"memspace/backend/connection"
)

func TestDataService_Strings(t *testing.T) {
	cm, mr, connId := setupTestEnv(t, false)
	svc := NewDataService(cm)

	// SetString with TTL
	err := svc.SetString(connId, 0, "msg:hello", "world", 100)
	require.NoError(t, err)
	assert.Greater(t, mr.TTL("msg:hello"), time.Duration(0))

	// GetString
	val, err := svc.GetString(connId, 0, "msg:hello")
	require.NoError(t, err)
	assert.Equal(t, "world", val)

	// SetString without TTL
	err = svc.SetString(connId, 0, "msg:permanent", "persisted", 0)
	require.NoError(t, err)
	val, err = svc.GetString(connId, 0, "msg:permanent")
	require.NoError(t, err)
	assert.Equal(t, "persisted", val)

	// Read-only check
	roCm, _, roConnId := setupTestEnv(t, true)
	roSvc := NewDataService(roCm)
	err = roSvc.SetString(roConnId, 0, "msg:ro", "fail", 0)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
}

func TestDataService_Hashes(t *testing.T) {
	cm, _, connId := setupTestEnv(t, false)
	svc := NewDataService(cm)

	// HSet
	require.NoError(t, svc.HSet(connId, 0, "user:1", "name", "Alice"))
	require.NoError(t, svc.HSet(connId, 0, "user:1", "email", "alice@example.com"))

	// HGetAll
	fields, err := svc.HGetAll(connId, 0, "user:1")
	require.NoError(t, err)
	assert.Equal(t, "Alice", fields["name"])
	assert.Equal(t, "alice@example.com", fields["email"])

	// HDel
	deleted, err := svc.HDel(connId, 0, "user:1", []string{"email"})
	require.NoError(t, err)
	assert.Equal(t, int64(1), deleted)

	fields, err = svc.HGetAll(connId, 0, "user:1")
	require.NoError(t, err)
	assert.NotContains(t, fields, "email")

	// Read-only check
	roCm, _, roConnId := setupTestEnv(t, true)
	roSvc := NewDataService(roCm)
	err = roSvc.HSet(roConnId, 0, "user:1", "name", "Bob")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
	_, err = roSvc.HDel(roConnId, 0, "user:1", []string{"name"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
}

func TestDataService_Lists(t *testing.T) {
	cm, _, connId := setupTestEnv(t, false)
	svc := NewDataService(cm)

	// LPush and RPush
	n, err := svc.LPush(connId, 0, "mylist", []string{"b", "a"})
	require.NoError(t, err)
	assert.Equal(t, int64(2), n)

	n, err = svc.RPush(connId, 0, "mylist", []string{"c", "d"})
	require.NoError(t, err)
	assert.Equal(t, int64(4), n)

	// LRange
	items, err := svc.LRange(connId, 0, "mylist", 0, -1)
	require.NoError(t, err)
	assert.Equal(t, []string{"a", "b", "c", "d"}, items)

	// LPop and RPop
	popped, err := svc.LPop(connId, 0, "mylist")
	require.NoError(t, err)
	assert.Equal(t, "a", popped)

	popped, err = svc.RPop(connId, 0, "mylist")
	require.NoError(t, err)
	assert.Equal(t, "d", popped)

	// LSet
	err = svc.LSet(connId, 0, "mylist", 0, "b-modified")
	require.NoError(t, err)

	// LRem
	removed, err := svc.LRem(connId, 0, "mylist", 1, "b-modified")
	require.NoError(t, err)
	assert.Equal(t, int64(1), removed)

	// Read-only check
	roCm, _, roConnId := setupTestEnv(t, true)
	roSvc := NewDataService(roCm)
	_, err = roSvc.LPush(roConnId, 0, "mylist", []string{"x"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
	_, err = roSvc.RPush(roConnId, 0, "mylist", []string{"x"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
	_, err = roSvc.LPop(roConnId, 0, "mylist")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
	_, err = roSvc.RPop(roConnId, 0, "mylist")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
	assert.Error(t, roSvc.LSet(roConnId, 0, "mylist", 0, "val"))
	_, err = roSvc.LRem(roConnId, 0, "mylist", 0, "val")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
}

func TestDataService_Sets(t *testing.T) {
	cm, _, connId := setupTestEnv(t, false)
	svc := NewDataService(cm)

	// SAdd
	added, err := svc.SAdd(connId, 0, "myset", []string{"alpha", "beta", "gamma"})
	require.NoError(t, err)
	assert.Equal(t, int64(3), added)

	// SMembers
	members, err := svc.SMembers(connId, 0, "myset")
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"alpha", "beta", "gamma"}, members)

	// SRem
	rem, err := svc.SRem(connId, 0, "myset", []string{"beta"})
	require.NoError(t, err)
	assert.Equal(t, int64(1), rem)

	members, err = svc.SMembers(connId, 0, "myset")
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"alpha", "gamma"}, members)

	// Read-only check
	roCm, _, roConnId := setupTestEnv(t, true)
	roSvc := NewDataService(roCm)
	_, err = roSvc.SAdd(roConnId, 0, "myset", []string{"delta"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
	_, err = roSvc.SRem(roConnId, 0, "myset", []string{"alpha"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
}

func TestDataService_ZSets(t *testing.T) {
	cm, _, connId := setupTestEnv(t, false)
	svc := NewDataService(cm)

	// ZAdd
	added, err := svc.ZAdd(connId, 0, "leaderboard", 150.5, "Alice")
	require.NoError(t, err)
	assert.Equal(t, int64(1), added)

	added, err = svc.ZAdd(connId, 0, "leaderboard", 95.0, "Bob")
	require.NoError(t, err)
	assert.Equal(t, int64(1), added)

	// ZRangeWithScores
	zrange, err := svc.ZRangeWithScores(connId, 0, "leaderboard", 0, -1)
	require.NoError(t, err)
	require.Len(t, zrange, 2)
	assert.Equal(t, "Bob", zrange[0].Member)
	assert.Equal(t, 95.0, zrange[0].Score)
	assert.Equal(t, "Alice", zrange[1].Member)
	assert.Equal(t, 150.5, zrange[1].Score)

	// ZRem
	rem, err := svc.ZRem(connId, 0, "leaderboard", []string{"Bob"})
	require.NoError(t, err)
	assert.Equal(t, int64(1), rem)

	zrange, err = svc.ZRangeWithScores(connId, 0, "leaderboard", 0, -1)
	require.NoError(t, err)
	require.Len(t, zrange, 1)
	assert.Equal(t, "Alice", zrange[0].Member)

	// Read-only check
	roCm, _, roConnId := setupTestEnv(t, true)
	roSvc := NewDataService(roCm)
	_, err = roSvc.ZAdd(roConnId, 0, "leaderboard", 10.0, "Charlie")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
	_, err = roSvc.ZRem(roConnId, 0, "leaderboard", []string{"Alice"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
}

func TestDataService_Streams(t *testing.T) {
	cm, mr, connId := setupTestEnv(t, false)
	svc := NewDataService(cm)

	// XAdd
	id1, err := svc.XAdd(connId, 0, "events", map[string]any{"action": "login", "user": "alice"})
	require.NoError(t, err)
	assert.NotEmpty(t, id1)

	id2, err := svc.XAdd(connId, 0, "events", map[string]any{"action": "checkout", "total": "50"})
	require.NoError(t, err)
	assert.NotEmpty(t, id2)

	// XRange
	msgs, err := svc.XRange(connId, 0, "events", "-", "+", 10)
	require.NoError(t, err)
	assert.Len(t, msgs, 2)
	assert.Equal(t, id1, msgs[0].ID)
	assert.Equal(t, "login", msgs[0].Values["action"])

	// XDel
	delCount, err := svc.XDel(connId, 0, "events", []string{id1})
	require.NoError(t, err)
	assert.Equal(t, int64(1), delCount)

	// Verify group inspection when supported
	_, _ = mr.XAdd("events", "100-0", []string{"sensor", "temp"})
	groups, err := svc.XInfoGroups(connId, 0, "events")
	if err == nil {
		assert.NotNil(t, groups)
	}

	// Read-only check
	roCm, _, roConnId := setupTestEnv(t, true)
	roSvc := NewDataService(roCm)
	_, err = roSvc.XAdd(roConnId, 0, "events", map[string]any{"foo": "bar"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
	_, err = roSvc.XDel(roConnId, 0, "events", []string{id2})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
	_, err = roSvc.XAck(roConnId, 0, "events", "group1", []string{id2})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
}

func TestDataService_RedisJSON(t *testing.T) {
	cm, mr, connId := setupTestEnv(t, false)
	svc := NewDataService(cm)

	// In-memory store for mock JSON module
	jsonStore := make(map[string]string)

	// Register JSON.SET and JSON.GET handlers on miniredis server
	_ = mr.Server().Register("JSON.SET", func(c *server.Peer, cmd string, args []string) {
		if len(args) < 3 {
			c.WriteError("ERR wrong number of arguments for JSON.SET")
			return
		}
		key := args[0]
		val := args[2]
		jsonStore[key] = val
		c.WriteOK()
	})

	_ = mr.Server().Register("JSON.GET", func(c *server.Peer, cmd string, args []string) {
		if len(args) < 1 {
			c.WriteError("ERR wrong number of arguments for JSON.GET")
			return
		}
		key := args[0]
		val, ok := jsonStore[key]
		if !ok {
			c.WriteNull()
			return
		}
		c.WriteBulk(val)
	})

	// JSONSet
	doc := `{"name":"Memspace","features":["fast","secure","modern"]}`
	err := svc.JSONSet(connId, 0, "app:meta", "$", doc)
	require.NoError(t, err)

	// JSONGet
	res, err := svc.JSONGet(connId, 0, "app:meta", "$")
	require.NoError(t, err)
	assert.Equal(t, doc, res)

	// Read-only check
	roCm, _, roConnId := setupTestEnv(t, true)
	roSvc := NewDataService(roCm)
	err = roSvc.JSONSet(roConnId, 0, "app:meta", "$", `{"test":1}`)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read-only")
}

func TestDataService_ConnectionNotFound(t *testing.T) {
	cm := connection.NewConnectionManager()
	svc := NewDataService(cm)

	_, err := svc.GetString("unknown-conn", 0, "key")
	assert.Error(t, err)

	err = svc.SetString("unknown-conn", 0, "key", "val", 0)
	assert.Error(t, err)

	_, err = svc.HGetAll("unknown-conn", 0, "key")
	assert.Error(t, err)
}
