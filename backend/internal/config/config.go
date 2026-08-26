// Package config loads StudyRover backend configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strings"
)

// Config holds all runtime configuration for the backend server.
type Config struct {
	// Port is the TCP port the HTTP server listens on (env PORT).
	Port string
	// DatabaseURL is the PostgreSQL connection string (env DATABASE_URL).
	DatabaseURL string
	// SessionSecret is the secret used to sign/encrypt session cookies (env SESSION_SECRET).
	SessionSecret string
	// RPID is the WebAuthn Relying Party ID (env RP_ID), e.g. "localhost".
	RPID string
	// RPOrigin is the WebAuthn Relying Party origin (env RP_ORIGIN), e.g. "http://localhost:5173".
	RPOrigin string
	// StorageDir is the local filesystem directory for uploaded source files
	// (env STORAGE_DIR). Optional; empty selects a sensible default at wiring time.
	StorageDir string
	// GeminiAPIKey authenticates the Gemini knowledge backend (env GEMINI_API_KEY).
	// Optional; when empty the Gemini adapter is not provisioned and the selector
	// falls back to another backend.
	GeminiAPIKey string
	// GeminiModel overrides the Gemini model id (env GEMINI_MODEL). Optional;
	// empty uses the adapter default. Set when the default model's quota is
	// exhausted (e.g. "gemini-2.5-flash").
	GeminiModel string
	// OllamaAPIKey authenticates the Ollama Cloud knowledge backend (env
	// OLLAMA_API_KEY). Optional; empty leaves the Ollama adapter unprovisioned.
	OllamaAPIKey string
	// OllamaBaseURL overrides the Ollama endpoint (env OLLAMA_BASE_URL). Optional;
	// empty uses the adapter default (https://ollama.com).
	OllamaBaseURL string
	// OllamaModel overrides the Ollama model id (env OLLAMA_MODEL). Optional;
	// empty uses the adapter default (gpt-oss:120b).
	OllamaModel string
	// ZaiAPIKey authenticates the z.ai (Zhipu GLM) knowledge backend (env
	// ZAI_API_KEY). Optional; empty leaves the z.ai adapter unprovisioned.
	ZaiAPIKey string
	// ZaiBaseURL overrides the z.ai endpoint root (env ZAI_BASE_URL). Optional;
	// empty uses the adapter default (https://api.z.ai/api/paas/v4).
	ZaiBaseURL string
	// ZaiModel overrides the z.ai model id (env ZAI_MODEL). Optional; empty uses
	// the adapter default (glm-5.2).
	ZaiModel string

	// Lessons — enrichment providers (Phase 2.5 "class lessons").
	// YouTubeAPIKey enables YouTube Data API v3 search in the Enrich job; empty
	// = YouTube skipped with a warning. WikipediaLang is the Wikipedia edition
	// (default "en").
	YouTubeAPIKey string
	WikipediaLang string

	// GuardianEnabled wires the Phase-3 Guardian (reward engine + network wall)
	// into this server (env GUARDIAN_ENABLED, "true"/"1"). Off by default: the
	// platform then runs exactly as Phase 1+2 and no Guardian code executes.
	GuardianEnabled bool
	// GuardianWall selects the Network Wall implementation (env GUARDIAN_WALL):
	// "fake" (default; in-memory, no hardware) or "routeros" (MikroTik REST).
	GuardianWall string
	// GuardianFakeDevices seeds the fake wall's Discover (env
	// GUARDIAN_FAKE_DEVICES, comma-separated `mac=hostname` pairs; the hostname
	// is optional). Ignored unless GuardianWall is "fake".
	GuardianFakeDevices []FakeDevice
	// RouterOSURL is the RouterOS REST base URL, e.g. "https://192.168.88.1"
	// (env ROUTEROS_URL). Required when GuardianWall is "routeros".
	RouterOSURL string
	// RouterOSUser / RouterOSPassword authenticate the REST API (env
	// ROUTEROS_USER / ROUTEROS_PASSWORD). Required for the routeros wall.
	RouterOSUser     string
	RouterOSPassword string
	// RouterOSInsecureTLS skips TLS certificate verification for self-signed
	// router certificates (env ROUTEROS_INSECURE_TLS, "true"/"1").
	RouterOSInsecureTLS bool
	// RouterOSHotspotServer names the /ip/hotspot server gating the student
	// devices (env ROUTEROS_HOTSPOT_SERVER). Optional; empty = first/only.
	RouterOSHotspotServer string
}

// FakeDevice is one seed for the fake wall's network discovery.
type FakeDevice struct {
	MAC      string
	Hostname string
}

// Wall kinds accepted by GUARDIAN_WALL.
const (
	WallFake     = "fake"
	WallRouterOS = "routeros"
)

// Default values applied when an optional env var is unset.
const (
	defaultPort = "8080"
	defaultRPID = "localhost"
)

// Load reads configuration from environment variables, applies defaults, and
// validates required fields. It returns an error listing every missing required
// variable so misconfiguration is obvious at startup.
func Load() (*Config, error) {
	cfg := &Config{
		Port:          getenv("PORT", defaultPort),
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		SessionSecret: os.Getenv("SESSION_SECRET"),
		RPID:          getenv("RP_ID", defaultRPID),
		RPOrigin:      os.Getenv("RP_ORIGIN"),
		StorageDir:    os.Getenv("STORAGE_DIR"),
		GeminiAPIKey:  os.Getenv("GEMINI_API_KEY"),
		GeminiModel:   os.Getenv("GEMINI_MODEL"),
		OllamaAPIKey:  os.Getenv("OLLAMA_API_KEY"),
		OllamaBaseURL: os.Getenv("OLLAMA_BASE_URL"),
		OllamaModel:   os.Getenv("OLLAMA_MODEL"),
		ZaiAPIKey:     os.Getenv("ZAI_API_KEY"),
		ZaiBaseURL:    os.Getenv("ZAI_BASE_URL"),
		ZaiModel:      os.Getenv("ZAI_MODEL"),
		YouTubeAPIKey: os.Getenv("YOUTUBE_API_KEY"),
		WikipediaLang: getenv("WIKIPEDIA_LANG", "en"),

		GuardianEnabled:       envBool("GUARDIAN_ENABLED"),
		GuardianWall:          strings.ToLower(getenv("GUARDIAN_WALL", WallFake)),
		RouterOSURL:           os.Getenv("ROUTEROS_URL"),
		RouterOSUser:          os.Getenv("ROUTEROS_USER"),
		RouterOSPassword:      os.Getenv("ROUTEROS_PASSWORD"),
		RouterOSInsecureTLS:   envBool("ROUTEROS_INSECURE_TLS"),
		RouterOSHotspotServer: os.Getenv("ROUTEROS_HOTSPOT_SERVER"),
	}

	seeds, err := parseFakeDevices(os.Getenv("GUARDIAN_FAKE_DEVICES"))
	if err != nil {
		return nil, err
	}
	cfg.GuardianFakeDevices = seeds

	var missing []string
	if cfg.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if cfg.SessionSecret == "" {
		missing = append(missing, "SESSION_SECRET")
	}
	if cfg.RPOrigin == "" {
		missing = append(missing, "RP_ORIGIN")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("config: missing required environment variables: %s", strings.Join(missing, ", "))
	}

	if err := cfg.validateGuardian(); err != nil {
		return nil, err
	}

	return cfg, nil
}

// validateGuardian checks the Guardian block: the wall kind must be known and
// the routeros wall needs its connection settings. Only enforced when the
// Guardian is enabled so a half-filled block does not break a server that has
// the feature off.
func (c *Config) validateGuardian() error {
	if !c.GuardianEnabled {
		return nil
	}
	switch c.GuardianWall {
	case WallFake:
		return nil
	case WallRouterOS:
		var missing []string
		if c.RouterOSURL == "" {
			missing = append(missing, "ROUTEROS_URL")
		}
		if c.RouterOSUser == "" {
			missing = append(missing, "ROUTEROS_USER")
		}
		if c.RouterOSPassword == "" {
			missing = append(missing, "ROUTEROS_PASSWORD")
		}
		if len(missing) > 0 {
			return fmt.Errorf("config: GUARDIAN_WALL=routeros requires: %s", strings.Join(missing, ", "))
		}
		return nil
	default:
		return fmt.Errorf("config: GUARDIAN_WALL must be %q or %q (got %q)", WallFake, WallRouterOS, c.GuardianWall)
	}
}

// parseFakeDevices parses GUARDIAN_FAKE_DEVICES: a comma-separated list of
// `mac=hostname` (hostname optional). MACs are kept verbatim; the wall
// normalises them.
func parseFakeDevices(raw string) ([]FakeDevice, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var out []FakeDevice
	for _, item := range strings.Split(raw, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		mac, host, _ := strings.Cut(item, "=")
		mac = strings.TrimSpace(mac)
		if mac == "" {
			return nil, fmt.Errorf("config: GUARDIAN_FAKE_DEVICES: entry %q has no mac", item)
		}
		out = append(out, FakeDevice{MAC: mac, Hostname: strings.TrimSpace(host)})
	}
	return out, nil
}

// envBool reports whether key is set to a truthy value ("true" or "1",
// case-insensitive). Unset or anything else is false.
func envBool(key string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true":
		return true
	default:
		return false
	}
}

// Addr returns the listen address derived from Port (e.g. ":8080").
func (c *Config) Addr() string {
	return ":" + c.Port
}

// getenv returns the value of key, or def when the variable is unset or empty.
func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
