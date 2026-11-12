package services

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"redisian/backend/connection"
)

// ZMember represents a sorted set entry with a member value and numerical score.
type ZMember struct {
	Member string  `json:"member"`
	Score  float64 `json:"score"`
}

// StreamMessage represents a Redis Stream entry.
type StreamMessage struct {
	ID     string         `json:"id"`
	Values map[string]any `json:"values"`
}

// XInfoGroup represents Consumer Group statistics for a Stream.
type XInfoGroup struct {
	Name            string `json:"name"`
	Consumers       int64  `json:"consumers"`
	Pending         int64  `json:"pending"`
	LastDeliveredID string `json:"lastDeliveredId"`
}

// XInfoConsumer represents consumer status inside a group.
type XInfoConsumer struct {
	Name    string `json:"name"`
	Pending int64  `json:"pending"`
	Idle    int64  `json:"idle"`
}

// XPendingInfo describes pending stream messages.
type XPendingInfo struct {
	Count     int64            `json:"count"`
	Lower     string           `json:"lower"`
	Higher    string           `json:"higher"`
	Consumers map[string]int64 `json:"consumers"`
}

// DataService provides CRUD operations across all Redis data structures.
type DataService struct {
	mgr *connection.ConnectionManager
}

// NewDataService creates a new DataService.
func NewDataService(mgr *connection.ConnectionManager) *DataService {
	return &DataService{mgr: mgr}
}

// -------------------------------------------------------------
// Strings
// -------------------------------------------------------------

func (s *DataService) GetString(connId string, db int, key string) (string, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return mc.GetClientForDB(db).Get(ctx, key).Result()
}

func (s *DataService) SetString(connId string, db int, key string, value string, ttlSeconds int64) error {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return err
	}
	if mc.Config.ReadOnly {
		return fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var expiration time.Duration
	if ttlSeconds > 0 {
		expiration = time.Duration(ttlSeconds) * time.Second
	}
	return mc.GetClientForDB(db).Set(ctx, key, value, expiration).Err()
}

// -------------------------------------------------------------
// Hashes
// -------------------------------------------------------------

func (s *DataService) HGetAll(connId string, db int, key string) (map[string]string, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return mc.GetClientForDB(db).HGetAll(ctx, key).Result()
}

func (s *DataService) HSet(connId string, db int, key string, field string, value string) error {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return err
	}
	if mc.Config.ReadOnly {
		return fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return mc.GetClientForDB(db).HSet(ctx, key, field, value).Err()
}

func (s *DataService) HDel(connId string, db int, key string, fields []string) (int64, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return 0, err
	}
	if mc.Config.ReadOnly {
		return 0, fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return mc.GetClientForDB(db).HDel(ctx, key, fields...).Result()
}

// -------------------------------------------------------------
// Lists
// -------------------------------------------------------------

func (s *DataService) LRange(connId string, db int, key string, start int64, stop int64) ([]string, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return mc.GetClientForDB(db).LRange(ctx, key, start, stop).Result()
}

func (s *DataService) LPush(connId string, db int, key string, values []string) (int64, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return 0, err
	}
	if mc.Config.ReadOnly {
		return 0, fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	vAny := make([]any, len(values))
	for i, v := range values {
		vAny[i] = v
	}
	return mc.GetClientForDB(db).LPush(ctx, key, vAny...).Result()
}

func (s *DataService) RPush(connId string, db int, key string, values []string) (int64, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return 0, err
	}
	if mc.Config.ReadOnly {
		return 0, fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	vAny := make([]any, len(values))
	for i, v := range values {
		vAny[i] = v
	}
	return mc.GetClientForDB(db).RPush(ctx, key, vAny...).Result()
}

func (s *DataService) LPop(connId string, db int, key string) (string, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return "", err
	}
	if mc.Config.ReadOnly {
		return "", fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return mc.GetClientForDB(db).LPop(ctx, key).Result()
}

func (s *DataService) RPop(connId string, db int, key string) (string, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return "", err
	}
	if mc.Config.ReadOnly {
		return "", fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return mc.GetClientForDB(db).RPop(ctx, key).Result()
}

func (s *DataService) LSet(connId string, db int, key string, index int64, value string) error {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return err
	}
	if mc.Config.ReadOnly {
		return fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return mc.GetClientForDB(db).LSet(ctx, key, index, value).Err()
}

func (s *DataService) LRem(connId string, db int, key string, count int64, value string) (int64, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return 0, err
	}
	if mc.Config.ReadOnly {
		return 0, fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return mc.GetClientForDB(db).LRem(ctx, key, count, value).Result()
}

// -------------------------------------------------------------
// Sets
// -------------------------------------------------------------

func (s *DataService) SMembers(connId string, db int, key string) ([]string, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return mc.GetClientForDB(db).SMembers(ctx, key).Result()
}

func (s *DataService) SAdd(connId string, db int, key string, members []string) (int64, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return 0, err
	}
	if mc.Config.ReadOnly {
		return 0, fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	mAny := make([]any, len(members))
	for i, m := range members {
		mAny[i] = m
	}
	return mc.GetClientForDB(db).SAdd(ctx, key, mAny...).Result()
}

func (s *DataService) SRem(connId string, db int, key string, members []string) (int64, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return 0, err
	}
	if mc.Config.ReadOnly {
		return 0, fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	mAny := make([]any, len(members))
	for i, m := range members {
		mAny[i] = m
	}
	return mc.GetClientForDB(db).SRem(ctx, key, mAny...).Result()
}

// -------------------------------------------------------------
// Sorted Sets (ZSets)
// -------------------------------------------------------------

func (s *DataService) ZRangeWithScores(connId string, db int, key string, start int64, stop int64) ([]ZMember, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := mc.GetClientForDB(db).ZRangeWithScores(ctx, key, start, stop).Result()
	if err != nil {
		return nil, err
	}

	result := make([]ZMember, len(res))
	for i, z := range res {
		memberStr := fmt.Sprintf("%v", z.Member)
		result[i] = ZMember{
			Member: memberStr,
			Score:  z.Score,
		}
	}
	return result, nil
}

func (s *DataService) ZAdd(connId string, db int, key string, score float64, member string) (int64, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return 0, err
	}
	if mc.Config.ReadOnly {
		return 0, fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return mc.GetClientForDB(db).ZAdd(ctx, key, redis.Z{
		Score:  score,
		Member: member,
	}).Result()
}

func (s *DataService) ZRem(connId string, db int, key string, members []string) (int64, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return 0, err
	}
	if mc.Config.ReadOnly {
		return 0, fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	mAny := make([]any, len(members))
	for i, m := range members {
		mAny[i] = m
	}
	return mc.GetClientForDB(db).ZRem(ctx, key, mAny...).Result()
}

// -------------------------------------------------------------
// Streams
// -------------------------------------------------------------

func (s *DataService) XRange(connId string, db int, key string, start string, stop string, count int64) ([]StreamMessage, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if start == "" {
		start = "-"
	}
	if stop == "" {
		stop = "+"
	}
	if count <= 0 {
		count = 100
	}

	msgs, err := mc.GetClientForDB(db).XRangeN(ctx, key, start, stop, count).Result()
	if err != nil {
		return nil, err
	}

	result := make([]StreamMessage, len(msgs))
	for i, m := range msgs {
		result[i] = StreamMessage{
			ID:     m.ID,
			Values: m.Values,
		}
	}
	return result, nil
}

func (s *DataService) XAdd(connId string, db int, key string, values map[string]any) (string, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return "", err
	}
	if mc.Config.ReadOnly {
		return "", fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return mc.GetClientForDB(db).XAdd(ctx, &redis.XAddArgs{
		Stream: key,
		Values: values,
	}).Result()
}

func (s *DataService) XDel(connId string, db int, key string, ids []string) (int64, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return 0, err
	}
	if mc.Config.ReadOnly {
		return 0, fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return mc.GetClientForDB(db).XDel(ctx, key, ids...).Result()
}

func (s *DataService) XAck(connId string, db int, key string, group string, ids []string) (int64, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return 0, err
	}
	if mc.Config.ReadOnly {
		return 0, fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return mc.GetClientForDB(db).XAck(ctx, key, group, ids...).Result()
}

func (s *DataService) XInfoGroups(connId string, db int, key string) ([]XInfoGroup, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	grps, err := mc.GetClientForDB(db).XInfoGroups(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	result := make([]XInfoGroup, len(grps))
	for i, g := range grps {
		result[i] = XInfoGroup{
			Name:            g.Name,
			Consumers:       g.Consumers,
			Pending:         g.Pending,
			LastDeliveredID: g.LastDeliveredID,
		}
	}
	return result, nil
}

func (s *DataService) XInfoConsumers(connId string, db int, key string, group string) ([]XInfoConsumer, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	consumers, err := mc.GetClientForDB(db).XInfoConsumers(ctx, key, group).Result()
	if err != nil {
		return nil, err
	}

	result := make([]XInfoConsumer, len(consumers))
	for i, c := range consumers {
		result[i] = XInfoConsumer{
			Name:    c.Name,
			Pending: c.Pending,
			Idle:    int64(c.Idle.Milliseconds()),
		}
	}
	return result, nil
}

func (s *DataService) XPending(connId string, db int, key string, group string) (*XPendingInfo, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	p, err := mc.GetClientForDB(db).XPending(ctx, key, group).Result()
	if err != nil {
		return nil, err
	}

	return &XPendingInfo{
		Count:     p.Count,
		Lower:     p.Lower,
		Higher:    p.Higher,
		Consumers: p.Consumers,
	}, nil
}

// -------------------------------------------------------------
// RedisJSON
// -------------------------------------------------------------

func (s *DataService) JSONGet(connId string, db int, key string, path string) (string, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if path == "" {
		path = "$"
	}

	res, err := mc.GetClientForDB(db).Do(ctx, "JSON.GET", key, path).Result()
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%v", res), nil
}

func (s *DataService) JSONSet(connId string, db int, key string, path string, jsonVal string) error {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return err
	}
	if mc.Config.ReadOnly {
		return fmt.Errorf("connection is in read-only mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if path == "" {
		path = "$"
	}

	return mc.GetClientForDB(db).Do(ctx, "JSON.SET", key, path, jsonVal).Err()
}
