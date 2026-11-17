package services

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2/server"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"memspace/backend/connection"
)

func TestDiagnosticsService_ParseInfoOutput(t *testing.T) {
	rawInfo := `# Server
redis_version:7.2.4
os:Darwin 23.4.0
tcp_port:6379
uptime_in_seconds:86400

# Clients
connected_clients:12
maxclients:10000

# Memory
used_memory:16777216
used_memory_human:16.00M
used_memory_peak:33554432
mem_fragmentation_ratio:1.15

# Replication
role:master
connected_slaves:2

# Keyspace
db0:keys=150,expires=10,avg_ttl=3600
db1:keys=20,expires=0,avg_ttl=0
`

	parsed := ParseInfoOutput(rawInfo)
	require.NotNil(t, parsed)

	// Server
	assert.Equal(t, "7.2.4", parsed["server"]["redis_version"])
	assert.Equal(t, "Darwin 23.4.0", parsed["server"]["os"])
	assert.Equal(t, "86400", parsed["server"]["uptime_in_seconds"])

	// Clients
	assert.Equal(t, "12", parsed["clients"]["connected_clients"])
	assert.Equal(t, "10000", parsed["clients"]["maxclients"])

	// Memory
	assert.Equal(t, "16.00M", parsed["memory"]["used_memory_human"])
	assert.Equal(t, "1.15", parsed["memory"]["mem_fragmentation_ratio"])

	// Replication
	assert.Equal(t, "master", parsed["replication"]["role"])
	assert.Equal(t, "2", parsed["replication"]["connected_slaves"])

	// Keyspace
	assert.Contains(t, parsed["keyspace"]["db0"], "keys=150")

	// Empty string
	emptyParsed := ParseInfoOutput("")
	assert.Empty(t, emptyParsed["general"])
}

func TestDiagnosticsService_GetInfo_Integration(t *testing.T) {
	cm, _, connId := setupTestEnv(t, false)
	svc := NewDiagnosticsService(cm)

	info, err := svc.GetInfo(connId)
	require.NoError(t, err)
	require.NotNil(t, info)

	// miniredis natively outputs clients & stats sections
	assert.Contains(t, info, "clients")
	assert.Contains(t, info, "stats")
	assert.NotEmpty(t, info["clients"]["connected_clients"])
}

func TestDiagnosticsService_ParseClientListOutput(t *testing.T) {
	rawClientList := `id=101 addr=127.0.0.1:51234 fd=6 name=worker-pool age=150 idle=3 flags=N db=0 sub=0 psub=0 multi=-1 qbl=0 obl=0 cmd=ping user=default
id=102 addr=192.168.1.50:62345 fd=7 name=desktop-gui age=3600 idle=0 flags=O db=1 sub=2 psub=1 multi=5 qbl=64 obl=128 cmd=exec user=admin
`

	clients := ParseClientListOutput(rawClientList)
	require.Len(t, clients, 2)

	// Client 1
	c1 := clients[0]
	assert.Equal(t, "101", c1.Id)
	assert.Equal(t, "127.0.0.1:51234", c1.Addr)
	assert.Equal(t, "worker-pool", c1.Name)
	assert.Equal(t, "150", c1.Age)
	assert.Equal(t, "3", c1.Idle)
	assert.Equal(t, "N", c1.Flags)
	assert.Equal(t, "0", c1.Db)
	assert.Equal(t, "ping", c1.Cmd)
	assert.Equal(t, "default", c1.User)

	// Client 2
	c2 := clients[1]
	assert.Equal(t, "102", c2.Id)
	assert.Equal(t, "192.168.1.50:62345", c2.Addr)
	assert.Equal(t, "desktop-gui", c2.Name)
	assert.Equal(t, "3600", c2.Age)
	assert.Equal(t, "0", c2.Idle)
	assert.Equal(t, "O", c2.Flags)
	assert.Equal(t, "1", c2.Db)
	assert.Equal(t, "2", c2.Sub)
	assert.Equal(t, "1", c2.Psub)
	assert.Equal(t, "5", c2.Multi)
	assert.Equal(t, "64", c2.QueryBuf)
	assert.Equal(t, "128", c2.OutputBuf)
	assert.Equal(t, "exec", c2.Cmd)
	assert.Equal(t, "admin", c2.User)

	// Empty input
	assert.Empty(t, ParseClientListOutput(""))
}

func TestDiagnosticsService_GetClientList_Integration(t *testing.T) {
	cm, mr, connId := setupTestEnv(t, false)
	svc := NewDiagnosticsService(cm)

	mockOutput := "id=12 addr=127.0.0.1:4000 fd=5 name=memspace-app age=20 idle=1 flags=N db=0 sub=0 psub=0 multi=-1 qbl=0 obl=0 cmd=client user=default\n"

	mr.Server().SetPreHook(func(c *server.Peer, cmd string, args ...string) bool {
		if cmd == "CLIENT" && len(args) > 0 && strings.ToUpper(args[0]) == "LIST" {
			c.WriteBulk(mockOutput)
			return true
		}
		return false
	})

	clients, err := svc.GetClientList(connId)
	require.NoError(t, err)
	require.Len(t, clients, 1)
	assert.Equal(t, "12", clients[0].Id)
	assert.Equal(t, "memspace-app", clients[0].Name)
}

func TestDiagnosticsService_SlowLog_And_MemoryUsage(t *testing.T) {
	cm, mr, connId := setupTestEnv(t, false)
	svc := NewDiagnosticsService(cm)

	now := time.Now().Unix()

	mr.Server().SetPreHook(func(c *server.Peer, cmd string, args ...string) bool {
		if cmd == "SLOWLOG" {
			resp := fmt.Sprintf("*1\r\n*6\r\n:1\r\n:%d\r\n:25000\r\n*2\r\n$4\r\nKEYS\r\n$1\r\n*\r\n$15\r\n127.0.0.1:54321\r\n$6\r\nclient\r\n", now)
			c.WriteRaw(resp)
			return true
		}
		if cmd == "MEMORY" && len(args) > 0 && strings.ToUpper(args[0]) == "USAGE" {
			c.WriteInt(2048)
			return true
		}
		if cmd == "CLIENT" && len(args) > 0 && strings.ToUpper(args[0]) == "KILL" {
			c.WriteOK()
			return true
		}
		return false
	})

	entries, err := svc.GetSlowLog(connId, 10)
	require.NoError(t, err)
	require.Len(t, entries, 1)
	assert.Equal(t, int64(1), entries[0].Id)
	assert.Equal(t, now, entries[0].Timestamp)
	assert.Equal(t, int64(25000), entries[0].ExecutionTime)
	assert.Equal(t, []string{"KEYS", "*"}, entries[0].Args)
	assert.Equal(t, "127.0.0.1:54321", entries[0].ClientAddr)
	assert.Equal(t, "client", entries[0].ClientName)

	mem, err := svc.GetMemoryUsage(connId, 0, "my_big_key")
	require.NoError(t, err)
	assert.Equal(t, int64(2048), mem)

	err = svc.KillClient(connId, "127.0.0.1:54321")
	require.NoError(t, err)
}

func TestDiagnosticsService_ConnectionNotFound(t *testing.T) {
	cm := connection.NewConnectionManager()
	svc := NewDiagnosticsService(cm)

	_, err := svc.GetInfo("nonexistent")
	assert.Error(t, err)

	_, err = svc.GetSlowLog("nonexistent", 10)
	assert.Error(t, err)

	_, err = svc.GetClientList("nonexistent")
	assert.Error(t, err)

	_, err = svc.GetMemoryUsage("nonexistent", 0, "key")
	assert.Error(t, err)

	err = svc.KillClient("nonexistent", "127.0.0.1:1234")
	assert.Error(t, err)

	_, err = svc.ScanBigKeys("nonexistent", 0, "*", 100, 10)
	assert.Error(t, err)
}

func TestDiagnosticsService_ScanBigKeys(t *testing.T) {
	cm, mr, connId := setupTestEnv(t, false)
	svc := NewDiagnosticsService(cm)

	_ = mr.Set("small:str", "hi")
	_ = mr.Set("big:str", strings.Repeat("x", 500))
	mr.HSet("user:hash", "f1", "v1", "f2", "v2", "f3", "v3")
	_, _ = mr.Lpush("queue:list", "a")
	_, _ = mr.Lpush("queue:list", "b")

	res, err := svc.ScanBigKeys(connId, 0, "*", 100, 3)
	require.NoError(t, err)
	assert.Equal(t, int64(4), res.ScannedKeys)
	assert.True(t, res.Completed)
	require.Len(t, res.TopKeys, 3)
	assert.Equal(t, "big:str", res.TopKeys[0].Key)
	assert.Equal(t, "string", res.TopKeys[0].Type)
	assert.Equal(t, int64(500), res.TopKeys[0].Length)
}
