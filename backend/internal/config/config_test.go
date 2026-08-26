package config

import (
	"strings"
	"testing"
)

func setBase(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("SESSION_SECRET", "s")
	t.Setenv("RP_ORIGIN", "http://localhost")
	t.Setenv("GUARDIAN_ENABLED", "")
	t.Setenv("GUARDIAN_WALL", "")
	t.Setenv("GUARDIAN_FAKE_DEVICES", "")
	t.Setenv("ROUTEROS_URL", "")
	t.Setenv("ROUTEROS_USER", "")
	t.Setenv("ROUTEROS_PASSWORD", "")
	t.Setenv("ROUTEROS_INSECURE_TLS", "")
}

func TestGuardianDefaultsOff(t *testing.T) {
	setBase(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.GuardianEnabled {
		t.Fatal("guardian should default to off")
	}
	if cfg.GuardianWall != WallFake {
		t.Fatalf("wall = %q, want fake", cfg.GuardianWall)
	}
}

func TestGuardianRouterOSRequiresCreds(t *testing.T) {
	setBase(t)
	t.Setenv("GUARDIAN_ENABLED", "1")
	t.Setenv("GUARDIAN_WALL", "routeros")
	t.Setenv("ROUTEROS_URL", "https://192.168.88.1")
	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "ROUTEROS_USER") || !strings.Contains(err.Error(), "ROUTEROS_PASSWORD") {
		t.Fatalf("expected missing user/password error, got %v", err)
	}

	t.Setenv("ROUTEROS_USER", "u")
	t.Setenv("ROUTEROS_PASSWORD", "p")
	t.Setenv("ROUTEROS_INSECURE_TLS", "true")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.GuardianEnabled || cfg.GuardianWall != WallRouterOS || !cfg.RouterOSInsecureTLS {
		t.Fatalf("unexpected cfg: %+v", cfg)
	}
}

func TestGuardianRouterOSNotValidatedWhenDisabled(t *testing.T) {
	setBase(t)
	t.Setenv("GUARDIAN_WALL", "routeros")
	if _, err := Load(); err != nil {
		t.Fatalf("disabled guardian must not validate routeros creds: %v", err)
	}
}

func TestGuardianUnknownWall(t *testing.T) {
	setBase(t)
	t.Setenv("GUARDIAN_ENABLED", "true")
	t.Setenv("GUARDIAN_WALL", "iptables")
	if _, err := Load(); err == nil {
		t.Fatal("expected unknown wall error")
	}
}

func TestFakeDevicesParse(t *testing.T) {
	setBase(t)
	t.Setenv("GUARDIAN_FAKE_DEVICES", "aa:bb:cc:dd:ee:01=laptop, AA-BB-CC-DD-EE-02 ,,")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	want := []FakeDevice{{MAC: "aa:bb:cc:dd:ee:01", Hostname: "laptop"}, {MAC: "AA-BB-CC-DD-EE-02"}}
	if len(cfg.GuardianFakeDevices) != len(want) {
		t.Fatalf("got %+v", cfg.GuardianFakeDevices)
	}
	for i := range want {
		if cfg.GuardianFakeDevices[i] != want[i] {
			t.Fatalf("seed %d = %+v, want %+v", i, cfg.GuardianFakeDevices[i], want[i])
		}
	}

	t.Setenv("GUARDIAN_FAKE_DEVICES", "=nomac")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for entry without mac")
	}
}
