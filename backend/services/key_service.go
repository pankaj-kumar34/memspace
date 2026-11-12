package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"memspace/backend/connection"
	"memspace/backend/models"
)

// KeyService provides Redis key browsing, scanning, TTL management, and mutations.
type KeyService struct {
	mgr *connection.ConnectionManager
}

// NewKeyService creates a new KeyService.
func NewKeyService(mgr *connection.ConnectionManager) *KeyService {
	return &KeyService{mgr: mgr}
}

// ScanKeys uses non-blocking Redis SCAN to iterate keys safely without blocking production instances.
func (s *KeyService) ScanKeys(connId string, db int, cursor uint64, pattern string, typeFilter string, count int64) (*models.ScanResult, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return nil, err
	}

	client := mc.GetClientForDB(db)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if pattern == "" {
		pattern = "*"
	}
	if count <= 0 {
		count = 500
	}

	keys, newCursor, err := client.Scan(ctx, cursor, pattern, count).Result()
	if err != nil {
		return nil, fmt.Errorf("scan failed: %w", err)
	}

	pipe := client.Pipeline()
	typeCmds := make([]*redis.StatusCmd, len(keys))
	ttlCmds := make([]*redis.DurationCmd, len(keys))

	for i, k := range keys {
		typeCmds[i] = pipe.Type(ctx, k)
		ttlCmds[i] = pipe.TTL(ctx, k)
	}

	_, _ = pipe.Exec(ctx)

	var resultKeys []models.KeyInfo
	filterLower := strings.ToLower(typeFilter)

	for i, k := range keys {
		kType := "none"
		if typeCmds[i].Err() == nil {
			kType = typeCmds[i].Val()
		}

		if filterLower != "" && filterLower != "all" && filterLower != kType {
			continue
		}

		ttlSec := int64(-1)
		if ttlCmds[i].Err() == nil {
			dur := ttlCmds[i].Val()
			if dur == -1*time.Second || dur == -2*time.Second {
				ttlSec = int64(dur / time.Second)
			} else {
				ttlSec = int64(dur.Seconds())
			}
		}

		resultKeys = append(resultKeys, models.KeyInfo{
			Key:  k,
			Type: kType,
			TTL:  ttlSec,
		})
	}

	// Try DBSIZE for total key count estimation
	var total int64
	if dbsize, err := client.DBSize(ctx).Result(); err == nil {
		total = dbsize
	}

	return &models.ScanResult{
		Keys:   resultKeys,
		Cursor: newCursor,
		Total:  total,
	}, nil
}

// GetKeyDetails returns full metadata, encoding, memory size, and initial content for a key.
func (s *KeyService) GetKeyDetails(connId string, db int, key string) (*models.KeyDetails, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return nil, err
	}

	client := mc.GetClientForDB(db)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	kType, err := client.Type(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get key type: %w", err)
	}
	if kType == "none" {
		return nil, fmt.Errorf("key does not exist")
	}

	ttlDur, _ := client.TTL(ctx, key).Result()
	ttlSec := int64(ttlDur.Seconds())
	if ttlDur < 0 {
		ttlSec = int64(ttlDur / time.Second)
	}

	memUsage, _ := client.MemoryUsage(ctx, key).Result()
	encoding, _ := client.ObjectEncoding(ctx, key).Result()

	var val any
	const maxStringPreviewBytes = 2 * 1024 * 1024 // 2MB

	switch kType {
	case "string":
		strLen, err := client.StrLen(ctx, key).Result()
		if err == nil && strLen > maxStringPreviewBytes {
			preview, _ := client.GetRange(ctx, key, 0, maxStringPreviewBytes-1).Result()
			val = fmt.Sprintf("%s\n\n[... Truncated: showing first 2MB of %d bytes ...]", preview, strLen)
		} else {
			val, _ = client.Get(ctx, key).Result()
		}

	case "hash":
		// Safely bounded preview using HSCAN instead of HGETALL to avoid freezing on massive hashes
		fields, _, err := client.HScan(ctx, key, 0, "*", 250).Result()
		if err == nil && len(fields) > 0 {
			previewMap := make(map[string]string)
			for i := 0; i+1 < len(fields); i += 2 {
				previewMap[fields[i]] = fields[i+1]
			}
			val = previewMap
		} else {
			val = make(map[string]string)
		}

	case "list":
		val, _ = client.LRange(ctx, key, 0, 99).Result()

	case "set":
		// Safely bounded preview using SSCAN instead of SMEMBERS to avoid freezing on massive sets
		members, _, err := client.SScan(ctx, key, 0, "*", 250).Result()
		if err == nil {
			val = members
		} else {
			val = []string{}
		}

	case "zset":
		val, _ = client.ZRangeWithScores(ctx, key, 0, 99).Result()

	case "stream":
		entries, _ := client.XRangeN(ctx, key, "-", "+", 50).Result()
		val = entries

	default:
		strLen, err := client.StrLen(ctx, key).Result()
		if err == nil && strLen > maxStringPreviewBytes {
			preview, _ := client.GetRange(ctx, key, 0, maxStringPreviewBytes-1).Result()
			val = fmt.Sprintf("%s\n\n[... Truncated: showing first 2MB of %d bytes ...]", preview, strLen)
		} else {
			val, _ = client.Get(ctx, key).Result()
		}
	}

	return &models.KeyDetails{
		Key:      key,
		Type:     kType,
		TTL:      ttlSec,
		Size:     memUsage,
		Encoding: encoding,
		Value:    val,
	}, nil
}

// DeleteKey removes a key using hard DEL.
func (s *KeyService) DeleteKey(connId string, db int, key string) error {
	_, err := s.removeKeys(connId, db, []string{key}, false)
	return err
}

// DeleteKeys removes multiple keys using hard DEL and returns the number of keys deleted.
func (s *KeyService) DeleteKeys(connId string, db int, keys []string) (int64, error) {
	return s.removeKeys(connId, db, keys, false)
}

// UnlinkKey non-blockingly reclaims memory for a key using UNLINK.
func (s *KeyService) UnlinkKey(connId string, db int, key string) error {
	_, err := s.removeKeys(connId, db, []string{key}, true)
	return err
}

// UnlinkKeys non-blockingly reclaims memory for multiple keys using UNLINK and returns the number of keys unlinked.
func (s *KeyService) UnlinkKeys(connId string, db int, keys []string) (int64, error) {
	return s.removeKeys(connId, db, keys, true)
}

func (s *KeyService) removeKeys(connId string, db int, keys []string, unlink bool) (int64, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return 0, err
	}
	if mc.Config.ReadOnly {
		return 0, fmt.Errorf("connection is in read-only mode")
	}
	if len(keys) == 0 {
		return 0, nil
	}

	client := mc.GetClientForDB(db)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// In cluster mode, multi-key DEL/UNLINK fails with CROSSSLOT if keys span slots,
	// so pipeline individual commands which go-redis routes per slot.
	if _, isCluster := client.(*redis.ClusterClient); isCluster || mc.Config.Type == "cluster" {
		pipe := client.Pipeline()
		cmds := make([]*redis.IntCmd, 0, len(keys))
		for _, k := range keys {
			if unlink {
				cmds = append(cmds, pipe.Unlink(ctx, k))
			} else {
				cmds = append(cmds, pipe.Del(ctx, k))
			}
		}
		if _, err := pipe.Exec(ctx); err != nil {
			return 0, err
		}
		var total int64
		for _, cmd := range cmds {
			total += cmd.Val()
		}
		return total, nil
	}

	const batchSize = 1000
	var total int64
	for i := 0; i < len(keys); i += batchSize {
		end := i + batchSize
		if end > len(keys) {
			end = len(keys)
		}
		batch := keys[i:end]
		var n int64
		if unlink {
			n, err = client.Unlink(ctx, batch...).Result()
		} else {
			n, err = client.Del(ctx, batch...).Result()
		}
		if err != nil {
			return total, err
		}
		total += n
	}
	return total, nil
}

// SetTTL sets or removes the key's expiration. If ttlSeconds <= 0, the key is made persistent.
func (s *KeyService) SetTTL(connId string, db int, key string, ttlSeconds int64) error {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return err
	}
	if mc.Config.ReadOnly {
		return fmt.Errorf("connection is in read-only mode")
	}

	client := mc.GetClientForDB(db)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if ttlSeconds < 0 {
		return client.Persist(ctx, key).Err()
	}
	return client.Expire(ctx, key, time.Duration(ttlSeconds)*time.Second).Err()
}

// RenameKey alters the key's identifier.
func (s *KeyService) RenameKey(connId string, db int, oldKey string, newKey string) error {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return err
	}
	if mc.Config.ReadOnly {
		return fmt.Errorf("connection is in read-only mode")
	}

	client := mc.GetClientForDB(db)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return client.Rename(ctx, oldKey, newKey).Err()
}
