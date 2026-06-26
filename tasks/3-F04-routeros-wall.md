# 3-F04 — RouterOS (MikroTik) Wall impl

- **Wave:** 3-foundation · **Module:** wall · **Lang:** Go · **Depends on:** 3-F03

## Goal
Implement `Wall` against **MikroTik RouterOS v7 REST API** (spec §11): targeted, allow-by-default grants via hotspot IP-bindings / `session-timeout`.

## Owns
- `guardian/internal/wall/routeros/routeros.go`
- `guardian/internal/wall/routeros/client.go` (RouterOS REST client; creds from config)

## Steps
1. `Grant` = authorize the device's MAC for N minutes (session-timeout / bypass binding). `Revoke` = remove. `ListActive` = current sessions. `Discover` = ARP/DHCP/hotspot hosts.
2. MAC is the primary key (IP/hostname helpers).

## Acceptance
- [ ] Satisfies `Wall`; unit-tested against a mocked RouterOS REST server. (Live verification = 3-T07.)
> See RouterOS skills (routeros-fundamentals/hotspot/firewall) for exact endpoints; confirm v7 REST during build.
