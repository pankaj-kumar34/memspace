package services

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"memspace/backend/models"
)

type handlerRoundTripper struct {
	handler http.HandlerFunc
}

func (h handlerRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	rec := httptest.NewRecorder()
	h.handler(rec, req)
	return rec.Result(), nil
}

func newTestHTTPClient(fn http.HandlerFunc) *http.Client {
	return &http.Client{
		Transport: handlerRoundTripper{handler: fn},
	}
}

func TestCompareSemver(t *testing.T) {
	assert.Equal(t, 0, CompareSemver("1.0.0", "v1.0.0"))
	assert.Equal(t, -1, CompareSemver("1.0.0", "1.0.1"))
	assert.Equal(t, -1, CompareSemver("1.0.0", "1.2.0"))
	assert.Equal(t, -1, CompareSemver("0.9.9", "1.0.0"))
	assert.Equal(t, 1, CompareSemver("2.0.0", "1.9.9"))
	assert.Equal(t, 1, CompareSemver("1.0.0", "1.0.0-beta.1"))
	assert.Equal(t, -1, CompareSemver("1.0.0-alpha.1", "1.0.0-beta.1"))
}

func TestNormalizeRepoSlug(t *testing.T) {
	assert.Equal(t, "pankaj-kumar34/memspace", normalizeRepoSlug("https://github.com/pankaj-kumar34/memspace.git"))
	assert.Equal(t, "pankaj-kumar34/memspace", normalizeRepoSlug("pankaj-kumar34/memspace"))
	assert.Equal(t, "pankaj-kumar34/memspace", normalizeRepoSlug("git@github.com:pankaj-kumar34/memspace.git"))
}

func TestCheckForUpdate_UpdateAvailable(t *testing.T) {
	updater := NewUpdaterService()
	updater.HTTPClient = newTestHTTPClient(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/repos/pankaj-kumar34/memspace/releases/latest", r.URL.Path)
		rel := githubRelease{
			TagName:     "v1.2.0",
			Name:        "Memspace v1.2.0",
			Body:        "### What's New\n- Added GitHub Releases Auto-Updater",
			HTMLURL:     "https://github.com/pankaj-kumar34/memspace/releases/tag/v1.2.0",
			PublishedAt: "2026-11-14T20:00:00Z",
			Assets: []githubAsset{
				{
					Name:               "memspace-darwin-arm64.dmg",
					Size:               42000000,
					BrowserDownloadURL: "https://example.com/memspace-darwin-arm64.dmg",
				},
				{
					Name:               "memspace-darwin-arm64.tar.gz",
					Size:               18500000,
					BrowserDownloadURL: "https://example.com/memspace-darwin-arm64.tar.gz",
				},
				{
					Name:               "checksums.txt",
					Size:               512,
					BrowserDownloadURL: "https://example.com/checksums.txt",
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rel)
	})
	updater.Repo = "pankaj-kumar34/memspace"
	updater.Version = "1.0.0"
	updater.TargetOS = "darwin"
	updater.TargetArch = "arm64"

	res, err := updater.CheckForUpdate()
	require.NoError(t, err)
	assert.True(t, res.HasUpdate)
	assert.Equal(t, "1.0.0", res.CurrentVersion)
	assert.Equal(t, "1.2.0", res.LatestVersion)
	assert.Equal(t, "memspace-darwin-arm64.tar.gz", res.AssetName)
	assert.True(t, res.CanSelfUpdate)
	assert.Equal(t, "https://example.com/checksums.txt", res.ChecksumUrl)
}

func TestCheckForUpdate_NoReleases404(t *testing.T) {
	updater := NewUpdaterService()
	updater.HTTPClient = newTestHTTPClient(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	updater.Version = "1.0.0"

	res, err := updater.CheckForUpdate()
	require.NoError(t, err)
	assert.False(t, res.HasUpdate)
	assert.Equal(t, "1.0.0", res.LatestVersion)
}

func TestDownloadAndInstallUpdate_EndToEnd(t *testing.T) {
	// Build an in-memory .tar.gz containing a fake updated memspace binary
	updatedPayload := []byte("#!/bin/sh\necho memspace-v1.2.0\n")
	var tarGzBuf bytes.Buffer
	gzw := gzip.NewWriter(&tarGzBuf)
	tw := tar.NewWriter(gzw)

	hdr := &tar.Header{
		Name: "Memspace.app/Contents/MacOS/memspace",
		Mode: 0755,
		Size: int64(len(updatedPayload)),
	}
	require.NoError(t, tw.WriteHeader(hdr))
	_, err := tw.Write(updatedPayload)
	require.NoError(t, err)
	require.NoError(t, tw.Close())
	require.NoError(t, gzw.Close())

	archiveBytes := tarGzBuf.Bytes()
	hash := sha256.Sum256(archiveBytes)
	expectedHex := hex.EncodeToString(hash[:])

	tmpDir := t.TempDir()
	fakeExecPath := filepath.Join(tmpDir, "memspace")
	require.NoError(t, os.WriteFile(fakeExecPath, []byte("old-binary"), 0755))

	var stages []string
	updater := NewUpdaterService()
	updater.HTTPClient = newTestHTTPClient(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/memspace-darwin-arm64.tar.gz":
			w.Header().Set("Content-Length", fmt.Sprintf("%d", len(archiveBytes)))
			_, _ = w.Write(archiveBytes)
		case "/checksums.txt":
			_, _ = fmt.Fprintf(w, "%s  memspace-darwin-arm64.tar.gz\n", expectedHex)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	updater.TargetOS = "linux"
	updater.TargetArch = "arm64"
	updater.ExecutableFn = func() (string, error) {
		return fakeExecPath, nil
	}
	updater.ProgressEmit = func(p models.UpdateProgress) {
		stages = append(stages, p.Stage)
	}

	err = updater.DownloadAndInstallUpdate(
		"https://example.com/memspace-darwin-arm64.tar.gz",
		"memspace-darwin-arm64.tar.gz",
		"https://example.com/checksums.txt",
	)
	require.NoError(t, err)

	installedBytes, err := os.ReadFile(fakeExecPath)
	require.NoError(t, err)
	assert.Equal(t, updatedPayload, installedBytes)
	assert.Contains(t, stages, "downloading")
	assert.Contains(t, stages, "verifying")
	assert.Contains(t, stages, "extracting")
	assert.Contains(t, stages, "installing")
	assert.Contains(t, stages, "ready")
}

func TestDownloadAndInstallUpdate_ChecksumMismatch(t *testing.T) {
	archiveBytes := []byte("corrupted-payload")

	updater := NewUpdaterService()
	updater.HTTPClient = newTestHTTPClient(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/memspace-linux-amd64":
			_, _ = w.Write(archiveBytes)
		case "/checksums.txt":
			_, _ = fmt.Fprintf(w, "0000000000000000000000000000000000000000000000000000000000000000  memspace-linux-amd64\n")
		}
	})
	updater.TargetOS = "linux"
	updater.TargetArch = "amd64"

	err := updater.DownloadAndInstallUpdate(
		"https://example.com/memspace-linux-amd64",
		"memspace-linux-amd64",
		"https://example.com/checksums.txt",
	)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "SHA-256 checksum mismatch")
}

func TestParseTranslocatedOriginFromMount(t *testing.T) {
	mountOut := `/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)
/Users/pankajkumar/Downloads/Memspace.app on /private/var/folders/zn/n9cmqb5151vcgqt6mtycvr6h0000gn/T/AppTranslocation/08AA4AB0-DB2E-414C-B8BA-4EB95DE1125E (nullfs, local, nodev, nosuid, read-only, nobrowse, mounted by pankajkumar)
/Users/john doe/My Apps/Memspace.app on /private/var/folders/ab/xyz/T/AppTranslocation/11112222-3333-4444-5555-666677778888 (nullfs, local, read-only, nobrowse)`

	resolved := parseTranslocatedOriginFromMount(
		mountOut,
		"/private/var/folders/zn/n9cmqb5151vcgqt6mtycvr6h0000gn/T/AppTranslocation/08AA4AB0-DB2E-414C-B8BA-4EB95DE1125E/d/Memspace.app/Contents/MacOS/memspace",
	)
	assert.Equal(t, "/Users/pankajkumar/Downloads/Memspace.app/Contents/MacOS/memspace", resolved)

	// Verify paths containing spaces resolve properly
	resolvedWithSpaces := parseTranslocatedOriginFromMount(
		mountOut,
		"/private/var/folders/ab/xyz/T/AppTranslocation/11112222-3333-4444-5555-666677778888/d/Memspace.app/Contents/MacOS/memspace",
	)
	assert.Equal(t, "/Users/john doe/My Apps/Memspace.app/Contents/MacOS/memspace", resolvedWithSpaces)

	// Non-translocated paths return empty string
	assert.Equal(t, "", parseTranslocatedOriginFromMount(mountOut, "/Applications/Memspace.app/Contents/MacOS/memspace"))
}

func TestReplaceExecutable_TranslocatedOrReadOnlyFallback(t *testing.T) {
	// Build a realistic .tar.gz archive containing a Memspace.app bundle
	updatedBinary := []byte("#!/bin/sh\necho memspace-v1.0.1\n")
	plistData := []byte("<?xml version=\"1.0\" encoding=\"UTF-8\"?><plist version=\"1.0\"><dict><key>CFBundleShortVersionString</key><string>1.0.1</string></dict></plist>")

	var tarGzBuf bytes.Buffer
	gzw := gzip.NewWriter(&tarGzBuf)
	tw := tar.NewWriter(gzw)

	for _, entry := range []struct {
		name string
		mode int64
		body []byte
	}{
		{name: "Memspace.app/Contents/MacOS/memspace", mode: 0755, body: updatedBinary},
		{name: "Memspace.app/Contents/Info.plist", mode: 0644, body: plistData},
	} {
		hdr := &tar.Header{
			Name: entry.name,
			Mode: entry.mode,
			Size: int64(len(entry.body)),
		}
		require.NoError(t, tw.WriteHeader(hdr))
		_, err := tw.Write(entry.body)
		require.NoError(t, err)
	}
	require.NoError(t, tw.Close())
	require.NoError(t, gzw.Close())

	archiveBytes := tarGzBuf.Bytes()
	hash := sha256.Sum256(archiveBytes)
	expectedHex := hex.EncodeToString(hash[:])

	// Simulate an un-writable / read-only current executable directory
	readOnlyParent := filepath.Join(t.TempDir(), "ro")
	roBundleMacOS := filepath.Join(readOnlyParent, "Memspace.app", "Contents", "MacOS")
	require.NoError(t, os.MkdirAll(roBundleMacOS, 0755))
	roExec := filepath.Join(roBundleMacOS, "memspace")
	require.NoError(t, os.WriteFile(roExec, []byte("old-binary"), 0755))
	require.NoError(t, os.Chmod(roBundleMacOS, 0555))
	t.Cleanup(func() {
		_ = os.Chmod(roBundleMacOS, 0755)
	})

	// Fallback directory: first dir is unwritable, second dir is writable Applications
	unwritableApps := filepath.Join(t.TempDir(), "SystemApps")
	require.NoError(t, os.MkdirAll(unwritableApps, 0555))
	t.Cleanup(func() {
		_ = os.Chmod(unwritableApps, 0755)
	})
	writableApps := filepath.Join(t.TempDir(), "UserApplications")

	updater := NewUpdaterService()
	updater.HTTPClient = newTestHTTPClient(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/memspace-darwin-amd64.tar.gz":
			w.Header().Set("Content-Length", fmt.Sprintf("%d", len(archiveBytes)))
			_, _ = w.Write(archiveBytes)
		case "/checksums.txt":
			_, _ = fmt.Fprintf(w, "%s  memspace-darwin-amd64.tar.gz\n", expectedHex)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	updater.TargetOS = "darwin"
	updater.TargetArch = "amd64"
	updater.ExecutableFn = func() (string, error) {
		return roExec, nil
	}
	updater.FallbackAppDirs = []string{unwritableApps, writableApps}

	err := updater.DownloadAndInstallUpdate(
		"https://example.com/memspace-darwin-amd64.tar.gz",
		"memspace-darwin-amd64.tar.gz",
		"https://example.com/checksums.txt",
	)
	require.NoError(t, err)

	expectedInstalledExec := filepath.Join(writableApps, "Memspace.app", "Contents", "MacOS", "memspace")
	assert.Equal(t, expectedInstalledExec, updater.UpdatedExecPath)

	installedBytes, err := os.ReadFile(expectedInstalledExec)
	require.NoError(t, err)
	assert.Equal(t, updatedBinary, installedBytes)

	installedPlist, err := os.ReadFile(filepath.Join(writableApps, "Memspace.app", "Contents", "Info.plist"))
	require.NoError(t, err)
	assert.Equal(t, plistData, installedPlist)
}
