package services

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"memspace/backend/connection"
)

func TestCliService_TokenParsing(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		expected  []string
		expectErr bool
	}{
		{
			name:     "empty string",
			input:    "",
			expected: []string{},
		},
		{
			name:     "whitespace only",
			input:    "    ",
			expected: []string{},
		},
		{
			name:     "simple command",
			input:    "PING",
			expected: []string{"PING"},
		},
		{
			name:     "command with arguments and extra spaces",
			input:    "  SET   key1   val1  ",
			expected: []string{"SET", "key1", "val1"},
		},
		{
			name:     "double quoted arguments with spaces",
			input:    `SET "my long key" "hello beautiful world"`,
			expected: []string{"SET", "my long key", "hello beautiful world"},
		},
		{
			name:     "single quoted arguments",
			input:    "HSET user:100 'display name' 'Jane Doe'",
			expected: []string{"HSET", "user:100", "display name", "Jane Doe"},
		},
		{
			name:     "escaped double quotes",
			input:    `SET msg "hello \"nested\" world"`,
			expected: []string{"SET", "msg", `hello "nested" world`},
		},
		{
			name:      "unclosed double quote",
			input:     `SET "unclosed key value`,
			expectErr: true,
		},
		{
			name:      "unclosed single quote",
			input:     "SET 'unclosed key value",
			expectErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tokens, err := ParseCommandArgs(tc.input)
			if tc.expectErr {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tc.expected, tokens)
			}
		})
	}
}

func TestCliService_ExecuteCommand_BasicAndLatency(t *testing.T) {
	cm, _, connId := setupTestEnv(t, false)
	svc := NewCliService(cm)

	// Empty command
	res, err := svc.ExecuteCommand(connId, 0, []string{})
	require.NoError(t, err)
	assert.Equal(t, "empty command", res.Error)

	// Valid SET command
	res, err = svc.ExecuteCommand(connId, 0, []string{"SET", "counter", "10"})
	require.NoError(t, err)
	assert.Empty(t, res.Error)
	assert.Equal(t, "OK", res.RawOutput)
	assert.GreaterOrEqual(t, res.ExecutionTimeMs, int64(0))

	// Valid GET command
	res, err = svc.ExecuteCommand(connId, 0, []string{"GET", "counter"})
	require.NoError(t, err)
	assert.Empty(t, res.Error)
	assert.Equal(t, "10", res.RawOutput)
	assert.GreaterOrEqual(t, res.ExecutionTimeMs, int64(0))

	// Invalid command (syntax error in redis)
	res, err = svc.ExecuteCommand(connId, 0, []string{"UNKNOWNCOMMANDXYZ"})
	require.NoError(t, err) // Execution does not return Go error, but CliResponse.Error
	assert.NotEmpty(t, res.Error)
	assert.True(t, strings.HasPrefix(res.RawOutput, "(error)"))
}

func TestCliService_ExecuteRawCommand(t *testing.T) {
	cm, _, connId := setupTestEnv(t, false)
	svc := NewCliService(cm)

	// Raw command with quotes
	res, err := svc.ExecuteRawCommand(connId, 0, `SET "greeting msg" "Welcome to Memspace"`)
	require.NoError(t, err)
	assert.Empty(t, res.Error)
	assert.Equal(t, "OK", res.RawOutput)

	// Query with raw command
	res, err = svc.ExecuteRawCommand(connId, 0, `GET "greeting msg"`)
	require.NoError(t, err)
	assert.Empty(t, res.Error)
	assert.Equal(t, "Welcome to Memspace", res.RawOutput)

	// Malformed raw command (unclosed quote)
	res, err = svc.ExecuteRawCommand(connId, 0, `SET "unclosed value`)
	require.NoError(t, err)
	assert.Contains(t, res.Error, "unclosed quote")
}

func TestCliService_NilHandling(t *testing.T) {
	cm, _, connId := setupTestEnv(t, false)
	svc := NewCliService(cm)

	// GET non-existent key should return (nil) without error
	res, err := svc.ExecuteCommand(connId, 0, []string{"GET", "nonexistent-key-12345"})
	require.NoError(t, err)
	assert.Empty(t, res.Error)
	assert.Equal(t, "(nil)", res.RawOutput)
	assert.Nil(t, res.Output)

	// GETSET on new key should return (nil) without error
	res, err = svc.ExecuteCommand(connId, 0, []string{"GETSET", "new-key-12345", "hello"})
	require.NoError(t, err)
	assert.Empty(t, res.Error)
	assert.Equal(t, "(nil)", res.RawOutput)
	assert.Nil(t, res.Output)

	// Second GETSET should return previous value
	res, err = svc.ExecuteCommand(connId, 0, []string{"GETSET", "new-key-12345", "world"})
	require.NoError(t, err)
	assert.Empty(t, res.Error)
	assert.Equal(t, "hello", res.RawOutput)
}

func TestCliService_ReadOnlyProtection(t *testing.T) {
	cm, _, roConnId := setupTestEnv(t, true)
	svc := NewCliService(cm)

	dangerous := []string{
		"FLUSHALL",
		"flushall",
		"FLUSHDB",
		"flushdb",
		"SHUTDOWN",
		"shutdown",
		"DEL",
		"del",
		"UNLINK",
		"unlink",
		"DEBUG",
		"debug",
	}

	for _, cmd := range dangerous {
		res, err := svc.ExecuteCommand(roConnId, 0, []string{cmd, "somekey"})
		require.NoError(t, err)
		assert.Contains(t, res.Error, "blocked in read-only mode", "Command %s should be blocked", cmd)
	}

	// Safe command should proceed even in read-only mode
	res, err := svc.ExecuteCommand(roConnId, 0, []string{"PING"})
	require.NoError(t, err)
	assert.Empty(t, res.Error)
	assert.Equal(t, "PONG", res.RawOutput)
}

func TestCliService_ConnectionNotFound(t *testing.T) {
	cm := connection.NewConnectionManager()
	svc := NewCliService(cm)

	res, err := svc.ExecuteCommand("invalid-id", 0, []string{"PING"})
	assert.Error(t, err)
	assert.NotEmpty(t, res.Error)
}
