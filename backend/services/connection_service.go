package services

import (
	"context"
	"time"

	"memspace/backend/connection"
	"memspace/backend/models"
)

// ConnectionService exposes connection lifecycle methods to the frontend.
type ConnectionService struct {
	mgr *connection.ConnectionManager
}

// NewConnectionService creates a new ConnectionService.
func NewConnectionService(mgr *connection.ConnectionManager) *ConnectionService {
	return &ConnectionService{mgr: mgr}
}

// GetConnections returns all saved connection configurations.
func (s *ConnectionService) GetConnections() []models.ConnectionConfig {
	return s.mgr.GetSavedConnections()
}

// SaveConnection persists or updates a connection configuration.
func (s *ConnectionService) SaveConnection(cfg models.ConnectionConfig) error {
	return s.mgr.SaveConnection(cfg)
}

// DeleteConnection deletes a connection configuration by ID.
func (s *ConnectionService) DeleteConnection(id string) error {
	return s.mgr.DeleteConnection(id)
}

// TestConnection attempts connecting to verify parameters.
func (s *ConnectionService) TestConnection(cfg models.ConnectionConfig) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return s.mgr.TestConnection(ctx, cfg)
}

// Connect activates a connection and retrieves operational status.
func (s *ConnectionService) Connect(id string) (*models.ConnectionStatus, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return s.mgr.Connect(ctx, id)
}

// Disconnect closes an active connection.
func (s *ConnectionService) Disconnect(id string) error {
	return s.mgr.Disconnect(id)
}
