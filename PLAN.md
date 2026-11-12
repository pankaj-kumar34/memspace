# Memspace: Full-Featured Multi-Server Redis & Valkey Desktop Client (Wails v3)

A modern, high-performance, cross-platform desktop application for Redis, Valkey, and in-memory databases built with **Wails v3**, **Go 1.22+**, and **React 19 + TypeScript + Tailwind CSS / Shadcn UI**.

---

## 1. Architecture Overview

### Architectural Pillars
- **High Performance & Low Memory**: Utilizing Wails v3's native WebKit/WebView2 integration to achieve ~30–60 MB idle RAM footprint (compared to Electron's 200–400 MB).
- **Non-Blocking Redis Operations**: Heavy background scans, bulk exports, and real-time monitoring are decoupled from UI responsiveness using Go goroutines and streaming channels.
- **Enterprise-Grade Connectivity**: Full support for Standalone, Sentinel high-availability, Redis Cluster (hash-slot aware), TLS/mTLS, ACLs, and SSH bastion tunneling.
- **Complete Redis Feature Coverage**: First-class support for core data structures (Strings, Hashes, Lists, Sets, Sorted Sets), advanced structures (Streams, Bitmaps, HyperLogLog, Geospatial), and official Redis modules (RedisJSON, RediSearch, RedisBloom, RedisTimeSeries).

---

## 2. Technology Stack & Key Dependencies

| Layer | Technology | Purpose / Justification |
| :--- | :--- | :--- |
| **Desktop Framework** | **Wails v3 (`github.com/wailsapp/wails/v3`)** | Multi-window support, native menus, system tray, compact binary size, direct Go-to-TS bindings. |
| **Backend Language** | **Go 1.22+** | Concurrency with goroutines/channels, native networking, low memory footprint. |
| **Redis Driver** | **`github.com/redis/go-redis/v9`** | Industry-standard Go client. Full support for Standalone, Cluster, Sentinel, Pipelines, Pub/Sub, and Modules. |
| **SSH Tunneling** | **`golang.org/x/crypto/ssh`** | Direct port-forwarding over SSH without needing local external `ssh` binaries. |
| **Secure Storage** | **`github.com/zalando/go-keyring`** + SQLite | Passwords and private keys stored in macOS Keychain / Windows Credential Vault / Linux Secret Service. |
| **Frontend Framework** | **React 19 + TypeScript + Vite** | Component model, TypeScript safety, hot module reloading. |
| **UI Components & Styling**| **Tailwind CSS + Shadcn UI + Radix UI** | Polished dark/light themes, accessible modals, dropdowns, split panes, and toolbars. |
| **Key Virtualization** | **`@tanstack/react-virtual`** | Smooth scrolling through 100,000+ keys without DOM overload. |
| **Code & Data Editor** | **Monaco Editor (`@monaco-editor/react`)** | JSON formatting, Lua syntax highlighting, search/replace, diffing. |
| **Terminal / CLI** | **`@xterm/xterm`** | High-performance ANSI terminal emulator for the embedded `redis-cli`. |
| **Charts & Metrics** | **Apache ECharts (`echarts-for-react`)** | Real-time memory fragmentation, CPU usage, ops/sec throughput graphs. |
| **Map Rendering** | **Leaflet (`react-leaflet`)** | Geospatial visualization for `GEOSEARCH` and `GEORADIUS` results. |

---

## 3. Comprehensive Redis Feature Matrix

### 3.1 Connection & Server Management
- **Topologies Supported**:
  - **Standalone**: Direct host/port with optional database selection (DB 0–255).
  - **Redis Sentinel**: Master group name resolution, automatic replica discovery, and live failover tracking.
  - **Redis Cluster**: Automatic cluster nodes discovery, slot mapping (`CLUSTER SLOTS` / `CLUSTER SHARDS`), automatic `-MOVED` and `-ASK` redirection routing.
  - **Cloud Providers**: Redis Cloud, AWS ElastiCache (Cluster mode enabled/disabled), Azure Redis, GCP Memorystore.
- **Authentication & Security**:
  - Legacy single password (`AUTH <password>`).
  - Redis 6+ ACL (`AUTH <username> <password>`) with custom ACL rule viewer/editor.
  - TLS/mTLS encryption: CA certificate, Client certificate, Client private key, custom SNI, and skip-verify toggle.
  - SSH Bastion Tunnel: Password, Private Key (PEM, OpenSSH, encrypted with passphrase), or SSH Agent forwarding.
- **Safety & Organization**:
  - Environments / Folders: Production, Staging, Dev, Local.
  - Color-coded badges and border indicators (e.g., Red banner for Production).
  - **Read-Only Protection Mode**: Blocks destructive commands (`FLUSHALL`, `FLUSHDB`, `DEL`, `KEYS`, `CONFIG SET`).

---

### 3.2 Explorer & Navigation
- **Non-Blocking Scanning**: Strictly utilizes `SCAN` (and `SSCAN`, `HSCAN`, `ZSCAN`) with configurable cursor batches (e.g., 500–2000) to never freeze high-traffic servers.
- **Dual View Modes**:
  - **Hierarchical Tree View**: Automatic namespace folding based on configurable delimiters (`:`, `/`, `-`, `_`).
  - **Flat Table View**: Searchable and sortable by Key Name, Type, TTL, and Memory Size (`MEMORY USAGE`).
- **Filter Engine**: Glob matching (`user:100*`), regex patterns, data type dropdown filters, and TTL status (Expired, Expiring Soon, Persistent).
- **Key Actions**: Rename (`RENAME` / `RENAMENX`), Expire/TTL adjustment (`EXPIRE`, `PEXPIRE`, `PERSIST`), Copy key, Dump & Restore (`DUMP` / `RESTORE`), Soft delete (`UNLINK`) and hard delete (`DEL`).

---

### 3.3 Core & Advanced Data Structure Editors

| Data Type | Features & Capabilities |
| :--- | :--- |
| **Strings** | Text, Formatted JSON, Hex/Binary, Protobuf/MsgPack decompressor (Gzip/Brotli/Zstd), inline Monaco editor. |
| **Hashes** | Virtualized table, field-level search, pagination, inline editing, bulk field import/export. |
| **Lists** | Head/Tail push & pop, paged item explorer, index editing, LTRIM preview. |
| **Sets** | Member search, add/remove, multi-set intersection/union/difference visual calculator. |
| **Sorted Sets (ZSets)** | Score-sorted table, rank queries, score adjustment (`ZINCRBY`), range queries (by score or lex). |
| **Streams** | Timeline view, entry ID inspection, Consumer Group dashboard, PEL (Pending Entries List), `XACK`/`XDEL`. |
| **RedisJSON** | Tree inspector, JSONPath evaluator (`JSON.GET`), schema-validated Monaco editor, array editor. |
| **Geospatial** | Interactive map (Leaflet) with pin markers, radius queries, distance calculation, geohash decoder. |
| **Bitmaps & Fields** | Visual bit matrix grid, bit flips, `BITCOUNT` range, `BITFIELD` type inspector (u8, i16, etc.). |
| **Probabilistic** | Bloom Filter test/add (`BF.*`), Cuckoo Filter, Count-Min Sketch frequency, Top-K item tracker. |
| **RedisTimeSeries** | Interactive time-series line chart, downsampling aggregates, compaction rules & retention manager. |

---

### 3.4 Developer Tools, Observability & Diagnostics

1. **Interactive Embedded CLI Terminal**:
   - Built on `@xterm/xterm` with full Redis command dictionary.
   - Command auto-completion with parameter hints (e.g., `SET key value [EX seconds]`).
   - Command history navigation (Up/Down) with persistent local storage.
   - Raw RESP output vs. parsed tabular format toggle.
   - Cluster mode `-c` auto-redirection indicator.

2. **Real-Time `MONITOR` Stream**:
   - Live stream of all server-executed commands.
   - Filter by client IP, command type (`SET`, `GET`), or key pattern.
   - Pause/Resume and Export stream to CSV/log file.

3. **Pub/Sub Debugger**:
   - Multi-channel and pattern subscription (`SUBSCRIBE`, `PSUBSCRIBE`).
   - Live message feed with auto-scroll and timestamping.
   - Channel publisher with message templates and JSON validation.

4. **Slow Log & Client Manager**:
   - `SLOWLOG GET` table displaying execution duration, command arguments, and client IP.
   - `CLIENT LIST` viewer with filtering by idle time, flags, or memory usage; one-click `CLIENT KILL`.

5. **Server Metrics & Memory Profiler**:
   - Real-time `INFO` dashboard: CPU usage, Memory (Used, Peak, Frag ratio), Connected clients, Network I/O.
   - **BigKey & HotKey Scanner**: Non-blocking background worker to detect memory hogs without crashing production.
   - `MEMORY USAGE <key>` breakdown and `MEMORY STATS` recommendations.

6. **Lua Scripting & Redis 7 Functions**:
   - Monaco-powered Lua editor with syntax checking.
   - Script library to save, parameterize (`KEYS` & `ARGV`), and run reusable scripts (`EVALSHA` / `EVAL`).
   - Redis 7 Functions support (`FUNCTION LIST`, `FUNCTION LOAD`, `FCALL`).

7. **Data Import & Export**:
   - Export keys/values to JSON, CSV, raw RESP commands, or RDB file snapshot.
   - Import from JSON/CSV/RESP files with conflict resolution strategies (Overwrite, Skip, Rename).
   - Cross-server migration tool to sync keys between two active connections.

---

## 4. Directory & Module Structure

```
memspace/
├── main.go                     # Wails v3 application entrypoint
├── wails.json                  # Wails v3 project configuration
├── build/                      # App icons, build assets, and packaging configs
├── backend/                    # Go Backend Services
│   ├── app.go                  # Core App controller & lifecycle hooks
│   ├── config/                 # App preferences, saved connections, theme configs
│   ├── connection/             # Multi-server pool manager
│   │   ├── manager.go          # Connection lifecycle & active pool registry
│   │   ├── standalone.go       # Standalone client wrapper
│   │   ├── cluster.go          # Cluster client wrapper & slot routing
│   │   ├── sentinel.go         # Sentinel failover wrapper
│   │   ├── ssh_tunnel.go       # SSH port forwarder (golang.org/x/crypto/ssh)
│   │   └── security.go         # TLS config builder & OS Keyring integration
│   ├── services/               # Wails-bound RPC Services
│   │   ├── connection_service.go # RPC methods: Connect, Disconnect, Test, List
│   │   ├── key_service.go        # RPC methods: ScanKeys, GetKeyDetails, DeleteKey
│   │   ├── data_service.go       # RPC methods for String, Hash, List, Set, ZSet
│   │   ├── stream_service.go     # Streams, Consumer Groups, PEL
│   │   ├── module_service.go     # JSON, Geo, Bloom, TimeSeries
│   │   ├── cli_service.go        # Raw command execution & autocomplete specs
│   │   ├── pubsub_service.go     # Real-time Pub/Sub engine
│   │   ├── monitor_service.go    # MONITOR streaming service
│   │   ├── diagnostics_service.go# INFO, Slowlog, Clients, Memory profiler
│   │   └── migration_service.go  # Import/Export/Cross-instance sync
│   └── models/                 # Shared Data Models (auto-bound to TypeScript)
└── frontend/                   # Frontend Vite + React Project
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx             # Root layout with sidebar, tabs, and split panes
    │   ├── bindings/           # Auto-generated by Wails v3 (Go-to-TS interfaces)
    │   ├── components/         # Reusable UI Components (Shadcn/Radix)
    │   ├── features/           # Domain-Specific Feature Modules
    │   │   ├── connections/    # Server modal, SSH/TLS settings, connection list
    │   │   ├── explorer/       # Tree view, Flat table, Key filter bar
    │   │   ├── editors/        # String, Hash, List, Set, ZSet, JSON, Stream, Geo
    │   │   ├── terminal/       # Interactive Console
    │   │   ├── pubsub/         # Pub/Sub monitor & publisher dialog
    │   │   ├── monitor/        # Live MONITOR event viewer
    │   │   ├── diagnostics/    # Server INFO cards, Slowlog table, Client manager
    │   │   └── scripts/        # Lua script manager & editor
    │   ├── stores/             # Zustand Global State
    │   └── styles/             # Global Tailwind & typography styles
```

---

## 5. Phased Implementation Roadmap

- **Phase 1: Foundation & Scaffolding**: Setup Wails v3 + Vite + React 19 + Tailwind + Shadcn UI; establish Wails RPC binding architecture and event stream channels.
- **Phase 2: Multi-Server Connection Manager**: Support Standalone, Cluster, and Sentinel; integrate SSH tunneling, TLS/mTLS, OS Keyring credentials, and connection grouping.
- **Phase 3: Explorer & Core Data Types**: Non-blocking `SCAN` engine, virtualized tree/table views, and editors for Strings, Hashes, Lists, Sets, and Sorted Sets.
- **Phase 4: Extended Types & Modules**: Redis Streams (PEL & Consumer Groups), RedisJSON, Geospatial maps, Bitmaps, and RedisBloom / TimeSeries.
- **Phase 5: Developer Tools & Real-Time Streams**: Embedded Xterm.js Redis CLI with autocompletion, real-time Pub/Sub, live `MONITOR`, and Lua/Functions editor.
- **Phase 6: Diagnostics, Metrics & Memory Profiler**: Real-time `INFO` dashboard, `SLOWLOG`, `CLIENT LIST` / `CLIENT KILL`, BigKey analyzer, and data import/export.
- **Phase 7: Polish & Production Release**: Multi-window support, dark/light themes, keyboard shortcuts, and cross-platform native builds (macOS `.dmg`, Windows `.exe`, Linux `.AppImage`).
