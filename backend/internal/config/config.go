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
}

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
	}

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

	return cfg, nil
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
