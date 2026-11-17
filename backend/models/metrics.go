package models

// ServerMetrics represents real-time operational diagnostics of a Redis node.
type ServerMetrics struct {
	CPU              float64 `json:"cpu"`
	MemoryUsed       int64   `json:"memoryUsed"`      // used_memory in bytes
	MemoryUsedHuman  string  `json:"memoryUsedHuman"` // e.g. "24.50M"
	MemoryPeak       int64   `json:"memoryPeak"`
	MemoryFragRatio  float64 `json:"memoryFragRatio"`
	TotalKeys        int64   `json:"totalKeys"`
	OpsPerSec        int64   `json:"opsPerSec"`
	ConnectedClients int64   `json:"connectedClients"`
	Version          string  `json:"version"`
	Role             string  `json:"role"`
	Uptime           int64   `json:"uptime"` // in seconds
}

// SlowLogEntry holds an individual execution event recorded by Redis SLOWLOG.
type SlowLogEntry struct {
	Id            int64    `json:"id"`
	Timestamp     int64    `json:"timestamp"`
	ExecutionTime int64    `json:"executionTime"` // in microseconds
	Args          []string `json:"args"`
	ClientAddr    string   `json:"clientAddr"`
	ClientName    string   `json:"clientName"`
}

// ClientEntry holds details for an active client connection returned by CLIENT LIST.
type ClientEntry struct {
	Id         string `json:"id"`
	Addr       string `json:"addr"`
	Name       string `json:"name"`
	Age        string `json:"age"`
	Idle       string `json:"idle"`
	Flags      string `json:"flags"`
	Db         string `json:"db"`
	Sub        string `json:"sub"`
	Psub       string `json:"psub"`
	Multi      string `json:"multi"`
	Cmd        string `json:"cmd"`
	User       string `json:"user"`
	OutputBuf  string `json:"outputBuf"`
	QueryBuf   string `json:"queryBuf"`
}

// BigKeyEntry represents a sampled key and its memory footprint / element count.
type BigKeyEntry struct {
	Key         string `json:"key"`
	Type        string `json:"type"`
	MemoryBytes int64  `json:"memoryBytes"`
	Length      int64  `json:"length"`
}

// BigKeyScanResult summarizes a non-blocking BigKey scan across a Redis keyspace.
type BigKeyScanResult struct {
	ScannedKeys int64         `json:"scannedKeys"`
	TotalMemory int64         `json:"totalMemory"`
	TopKeys     []BigKeyEntry `json:"topKeys"`
	Completed   bool          `json:"completed"`
	DurationMs  int64         `json:"durationMs"`
}
