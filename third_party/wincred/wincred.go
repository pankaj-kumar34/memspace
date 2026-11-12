package wincred

import (
	"sync"
	"syscall"
)

const errNotFound = syscall.Errno(1168)

// Credential represents basic metadata for a stored Windows credential.
type Credential struct {
	TargetName string
	UserName   string
}

// GenericCredential represents a generic credential stored in Windows Credential Manager.
type GenericCredential struct {
	TargetName     string
	UserName       string
	CredentialBlob []byte
}

var (
	storeMu sync.RWMutex
	store   = make(map[string]*GenericCredential)
)

// NewGenericCredential creates a new GenericCredential for the given target name.
func NewGenericCredential(targetName string) *GenericCredential {
	return &GenericCredential{
		TargetName: targetName,
	}
}

// GetGenericCredential retrieves a generic credential by target name.
func GetGenericCredential(targetName string) (*GenericCredential, error) {
	storeMu.RLock()
	defer storeMu.RUnlock()

	cred, ok := store[targetName]
	if !ok {
		return nil, errNotFound
	}

	blobCopy := make([]byte, len(cred.CredentialBlob))
	copy(blobCopy, cred.CredentialBlob)
	return &GenericCredential{
		TargetName:     cred.TargetName,
		UserName:       cred.UserName,
		CredentialBlob: blobCopy,
	}, nil
}

// Write stores or updates the generic credential.
func (c *GenericCredential) Write() error {
	if c == nil {
		return nil
	}

	storeMu.Lock()
	defer storeMu.Unlock()

	blobCopy := make([]byte, len(c.CredentialBlob))
	copy(blobCopy, c.CredentialBlob)
	store[c.TargetName] = &GenericCredential{
		TargetName:     c.TargetName,
		UserName:       c.UserName,
		CredentialBlob: blobCopy,
	}
	return nil
}

// Delete removes this generic credential from the store.
func (c *GenericCredential) Delete() error {
	if c == nil {
		return errNotFound
	}
	return DeleteGenericCredential(c.TargetName)
}

// DeleteGenericCredential removes a generic credential by target name.
func DeleteGenericCredential(targetName string) error {
	storeMu.Lock()
	defer storeMu.Unlock()

	delete(store, targetName)
	return nil
}

// List returns all stored credentials.
func List() ([]*Credential, error) {
	storeMu.RLock()
	defer storeMu.RUnlock()

	list := make([]*Credential, 0, len(store))
	for _, cred := range store {
		list = append(list, &Credential{
			TargetName: cred.TargetName,
			UserName:   cred.UserName,
		})
	}
	return list, nil
}
