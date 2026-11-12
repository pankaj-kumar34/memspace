package wincred

type GenericCredential struct {
	TargetName     string
	UserName       string
	CredentialBlob []byte
}

func GetGenericCredential(targetName string) (*GenericCredential, error) {
	return nil, nil
}

func (c *GenericCredential) Write() error {
	return nil
}

func DeleteGenericCredential(targetName string) error {
	return nil
}
