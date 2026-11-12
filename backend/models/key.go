package models

// KeyInfo holds summary information for a Redis key.
type KeyInfo struct {
	Key      string `json:"key"`
	Type     string `json:"type"`     // string, hash, list, set, zset, stream, ReJSON-RL, etc.
	TTL      int64  `json:"ttl"`      // -1 for no expire, -2 if key does not exist, or seconds remaining
	Size     int64  `json:"size"`     // Memory usage in bytes or element count
	Encoding string `json:"encoding"` // embstr, raw, hashtable, ziplist, quicklist, skiplist, etc.
}

// ScanResult is returned by paginated key scanning.
type ScanResult struct {
	Keys   []KeyInfo `json:"keys"`
	Cursor uint64    `json:"cursor"`
	Total  int64     `json:"total"`
}

// KeyDetails represents full inspection metadata and payload of a key.
type KeyDetails struct {
	Key      string `json:"key"`
	Type     string `json:"type"`
	TTL      int64  `json:"ttl"`
	Size     int64  `json:"size"`
	Encoding string `json:"encoding"`
	Value    any    `json:"value"`
}
