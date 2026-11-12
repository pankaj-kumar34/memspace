package connection

import (
	"context"
	"fmt"
	"net"
	"os"
	"time"

	"golang.org/x/crypto/ssh"
	"memspace/backend/models"
)

// SSHTunnel encapsulates an active SSH connection used to forward TCP traffic.
type SSHTunnel struct {
	client *ssh.Client
}

// NewSSHTunnel connects to the SSH bastion server defined in cfg.
func NewSSHTunnel(cfg models.SshConfig) (*SSHTunnel, error) {
	if !cfg.Enabled || cfg.Host == "" {
		return nil, fmt.Errorf("ssh tunnel is not enabled or host is empty")
	}

	port := cfg.Port
	if port <= 0 {
		port = 22
	}

	var authMethods []ssh.AuthMethod

	// Private key authentication
	if cfg.KeyPath != "" {
		keyBytes, err := os.ReadFile(cfg.KeyPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read ssh key file %s: %w", cfg.KeyPath, err)
		}

		var signer ssh.Signer
		if cfg.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(keyBytes, []byte(cfg.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(keyBytes)
		}
		if err != nil {
			return nil, fmt.Errorf("failed to parse ssh private key: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	// Password authentication fallback or additional method
	if cfg.Password != "" {
		authMethods = append(authMethods, ssh.Password(cfg.Password))
	}

	if len(authMethods) == 0 {
		return nil, fmt.Errorf("no valid ssh authentication method provided")
	}

	sshConfig := &ssh.ClientConfig{
		User:            cfg.User,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, port)
	client, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to dial ssh bastion %s: %w", addr, err)
	}

	return &SSHTunnel{client: client}, nil
}

// DialContext returns a net.Conn routed through the SSH tunnel to targetAddr.
func (t *SSHTunnel) DialContext(ctx context.Context, network, targetAddr string) (net.Conn, error) {
	if t.client == nil {
		return nil, fmt.Errorf("ssh tunnel is not connected")
	}
	return t.client.Dial(network, targetAddr)
}

// Close terminates the SSH connection.
func (t *SSHTunnel) Close() error {
	if t.client != nil {
		return t.client.Close()
	}
	return nil
}
