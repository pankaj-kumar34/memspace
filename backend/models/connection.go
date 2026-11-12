package models

// SshConfig holds SSH bastion tunnel credentials and connection parameters.
type SshConfig struct {
	Enabled    bool   `json:"enabled"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	User       string `json:"user"`
	Password   string `json:"password,omitempty"`
	KeyPath    string `json:"keyPath,omitempty"`
	Passphrase string `json:"passphrase,omitempty"`
}

// TlsConfig holds TLS/mTLS parameters.
type TlsConfig struct {
	Enabled            bool   `json:"enabled"`
	CaCert             string `json:"caCert,omitempty"`
	ClientCert         string `json:"clientCert,omitempty"`
	ClientKey          string `json:"clientKey,omitempty"`
	InsecureSkipVerify bool   `json:"insecureSkipVerify"`
}

// ConnectionConfig defines all parameters to establish a connection to Redis.
type ConnectionConfig struct {
	Id             string    `json:"id"`
	Name           string    `json:"name"`
	Host           string    `json:"host"`
	Port           int       `json:"port"`
	Username       string    `json:"username,omitempty"`
	Password       string    `json:"password,omitempty"`
	Database       int       `json:"database"`
	Type           string    `json:"type"` // "standalone", "cluster", "sentinel"
	SentinelMaster string    `json:"sentinelMaster,omitempty"`
	SentinelNodes  []string  `json:"sentinelNodes,omitempty"`
	ClusterNodes   []string  `json:"clusterNodes,omitempty"`
	Ssh            SshConfig `json:"ssh"`
	Tls            TlsConfig `json:"tls"`
	ReadOnly       bool      `json:"readOnly"`
	Color          string    `json:"color"`
	Group          string    `json:"group"`
	Ephemeral      bool      `json:"ephemeral,omitempty"`
}

// ConnectionStatus provides operational metadata after connecting.
type ConnectionStatus struct {
	Id            string `json:"id"`
	Connected     bool   `json:"connected"`
	LatencyMs     int64  `json:"latencyMs"`
	ServerVersion string `json:"serverVersion"`
	Role          string `json:"role"`
	ClusterMode   bool   `json:"clusterMode"`
	TotalKeys     int64  `json:"totalKeys"`
	ErrorMessage  string `json:"errorMessage,omitempty"`
}
