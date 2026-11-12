package models

// AppVersionInfo describes the current running application version and platform metadata.
type AppVersionInfo struct {
	Version string `json:"version"`
	Repo    string `json:"repo"`
	OS      string `json:"os"`
	Arch    string `json:"arch"`
}

// UpdateCheckResult holds the result of checking GitHub Releases for a newer version.
type UpdateCheckResult struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	HasUpdate      bool   `json:"hasUpdate"`
	ReleaseName    string `json:"releaseName"`
	ReleaseNotes   string `json:"releaseNotes"`
	ReleaseUrl     string `json:"releaseUrl"`
	PublishedAt    string `json:"publishedAt"`
	AssetName      string `json:"assetName"`
	AssetUrl       string `json:"assetUrl"`
	AssetSize      int64  `json:"assetSize"`
	ChecksumUrl    string `json:"checksumUrl"`
	CanSelfUpdate  bool   `json:"canSelfUpdate"`
}

// UpdateProgress is emitted via Wails events during download, verification, and installation.
type UpdateProgress struct {
	Stage           string  `json:"stage"` // "downloading", "verifying", "extracting", "installing", "ready", "error"
	Percent         float64 `json:"percent"`
	DownloadedBytes int64   `json:"downloadedBytes"`
	TotalBytes      int64   `json:"totalBytes"`
	Message         string  `json:"message"`
}
