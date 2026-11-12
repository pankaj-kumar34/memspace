package services

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode"

	"redisian/backend/connection"
	"redisian/backend/models"
)

// CliService allows interactive command execution within the embedded terminal.
type CliService struct {
	mgr *connection.ConnectionManager
}

// NewCliService creates a new CliService.
func NewCliService(mgr *connection.ConnectionManager) *CliService {
	return &CliService{mgr: mgr}
}

var destructiveCommands = map[string]bool{
	"FLUSHALL": true,
	"FLUSHDB":  true,
	"DEL":      true,
	"UNLINK":   true,
	"SHUTDOWN": true,
	"DEBUG":    true,
	"CONFIG":   true,
	"RENAME":   true,
	"RESTORE":  true,
	"MIGRATE":  true,
	"EVAL":     true,
	"EVALSHA":  true,
	"FCALL":    true,
}

// ParseCommandArgs tokenizes a Redis command line, handling quotes and escapes.
func ParseCommandArgs(raw string) ([]string, error) {
	var args []string
	var current strings.Builder
	inQuotes := false
	quoteChar := byte(0)
	escaped := false

	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return []string{}, nil
	}

	for i := 0; i < len(trimmed); i++ {
		ch := trimmed[i]

		if escaped {
			current.WriteByte(ch)
			escaped = false
			continue
		}

		if ch == '\\' {
			escaped = true
			continue
		}

		if inQuotes {
			if ch == quoteChar {
				inQuotes = false
				quoteChar = 0
			} else {
				current.WriteByte(ch)
			}
			continue
		}

		if ch == '"' || ch == '\'' {
			inQuotes = true
			quoteChar = ch
			continue
		}

		if unicode.IsSpace(rune(ch)) {
			if current.Len() > 0 {
				args = append(args, current.String())
				current.Reset()
			}
			continue
		}

		current.WriteByte(ch)
	}

	if escaped {
		current.WriteByte('\\')
	}

	if inQuotes {
		return nil, fmt.Errorf("unclosed quote in command")
	}

	if current.Len() > 0 {
		args = append(args, current.String())
	}

	return args, nil
}

// ParseCommandArgs tokenizes a Redis command line.
func (s *CliService) ParseCommandArgs(raw string) ([]string, error) {
	return ParseCommandArgs(raw)
}

// ExecuteRawCommand parses a raw command string and executes it.
func (s *CliService) ExecuteRawCommand(connId string, db int, rawCmd string) (*models.CliResponse, error) {
	args, err := ParseCommandArgs(rawCmd)
	if err != nil {
		return &models.CliResponse{Error: err.Error(), RawOutput: fmt.Sprintf("(error) %s", err.Error())}, nil
	}
	return s.ExecuteCommand(connId, db, args)
}

// ExecuteCommand runs a command with raw arguments and measures latency.
func (s *CliService) ExecuteCommand(connId string, db int, args []string) (*models.CliResponse, error) {
	if len(args) == 0 {
		return &models.CliResponse{Error: "empty command"}, nil
	}

	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return &models.CliResponse{Error: err.Error()}, err
	}

	cmdUpper := strings.ToUpper(args[0])
	if mc.Config.ReadOnly && destructiveCommands[cmdUpper] {
		return &models.CliResponse{
			Error: fmt.Sprintf("command '%s' is blocked in read-only mode", cmdUpper),
		}, nil
	}

	client := mc.GetClientForDB(db)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cmdArgs := make([]any, len(args))
	for i, a := range args {
		cmdArgs[i] = a
	}

	start := time.Now()
	res, err := client.Do(ctx, cmdArgs...).Result()
	durationMs := time.Since(start).Milliseconds()

	if err != nil {
		return &models.CliResponse{
			Error:           err.Error(),
			RawOutput:       fmt.Sprintf("(error) %s", err.Error()),
			ExecutionTimeMs: durationMs,
		}, nil
	}

	return &models.CliResponse{
		Output:          res,
		RawOutput:       fmt.Sprintf("%v", res),
		ExecutionTimeMs: durationMs,
	}, nil
}
