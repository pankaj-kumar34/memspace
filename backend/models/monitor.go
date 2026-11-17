package models

// MonitorEvent represents a single parsed command line emitted by Redis MONITOR.
type MonitorEvent struct {
	ConnId     string `json:"connId"`
	Timestamp  string `json:"timestamp"`
	Db         string `json:"db"`
	ClientAddr string `json:"clientAddr"`
	Command    string `json:"command"`
	Args       string `json:"args"`
	Raw        string `json:"raw"`
}
