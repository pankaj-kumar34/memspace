package models

// CliRequest defines a raw or parsed Redis command execution invocation.
type CliRequest struct {
	ConnId string   `json:"connId"`
	DB     int      `json:"db"`
	Args   []string `json:"args"`
}

// CliResponse encapsulates the response from command execution.
type CliResponse struct {
	Output          any    `json:"output"`
	RawOutput       string `json:"rawOutput"`
	Error           string `json:"error,omitempty"`
	ExecutionTimeMs int64  `json:"executionTimeMs"`
}
