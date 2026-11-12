package services

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/wailsapp/wails/v3/pkg/application"
	"memspace/backend/connection"
)

// PubSubMessage is emitted when a message is received on a subscribed channel.
type PubSubMessage struct {
	ConnId    string `json:"connId"`
	Channel   string `json:"channel"`
	Pattern   string `json:"pattern,omitempty"`
	Payload   string `json:"payload"`
	Timestamp int64  `json:"timestamp"`
}

// PubSubService manages live Pub/Sub channels and relays messages to the frontend.
type PubSubService struct {
	mgr       *connection.ConnectionManager
	mu        sync.Mutex
	pubsubs   map[string]*redis.PubSub
	cancels   map[string]context.CancelFunc
}

// NewPubSubService creates a new PubSubService.
func NewPubSubService(mgr *connection.ConnectionManager) *PubSubService {
	return &PubSubService{
		mgr:     mgr,
		pubsubs: make(map[string]*redis.PubSub),
		cancels: make(map[string]context.CancelFunc),
	}
}

// Publish sends a message to the specified Redis channel.
func (s *PubSubService) Publish(connId string, channel string, message string) (int64, error) {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return 0, err
	}
	if mc.Config.ReadOnly {
		return 0, fmt.Errorf("connection is in read-only mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return mc.Client.Publish(ctx, channel, message).Result()
}

// Subscribe listens to channels on the specified connection and emits events to Wails.
func (s *PubSubService) Subscribe(connId string, channels []string) error {
	mc, err := s.mgr.GetClient(connId)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Stop any existing subscription for this connId
	if cancel, exists := s.cancels[connId]; exists {
		cancel()
		delete(s.cancels, connId)
	}
	if ps, exists := s.pubsubs[connId]; exists {
		_ = ps.Close()
		delete(s.pubsubs, connId)
	}

	ctx, cancel := context.WithCancel(context.Background())
	ps := mc.Client.Subscribe(ctx, channels...)
	s.pubsubs[connId] = ps
	s.cancels[connId] = cancel

	go func() {
		ch := ps.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				eventMsg := PubSubMessage{
					ConnId:    connId,
					Channel:   msg.Channel,
					Pattern:   msg.Pattern,
					Payload:   msg.Payload,
					Timestamp: time.Now().UnixMilli(),
				}
				if app := application.Get(); app != nil {
					app.Event.Emit("pubsub:message", eventMsg)
				}
			}
		}
	}()

	return nil
}

// Unsubscribe stops listening to channels on the specified connection.
func (s *PubSubService) Unsubscribe(connId string, channels []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if ps, exists := s.pubsubs[connId]; exists {
		if len(channels) == 0 {
			if cancel, exists := s.cancels[connId]; exists {
				cancel()
				delete(s.cancels, connId)
			}
			_ = ps.Close()
			delete(s.pubsubs, connId)
			return nil
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return ps.Unsubscribe(ctx, channels...)
	}

	return fmt.Errorf("no active subscription for connection %s", connId)
}
