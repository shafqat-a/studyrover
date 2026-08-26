// Package routeros implements the Network Wall against a MikroTik router
// running RouterOS v7, using its REST API (task 3-F04, spec §11).
//
// # Mechanism — allow-by-default, gate only registered MACs
//
// The household is allow-by-default (spec §11 "targeted"): nothing changes for
// devices StudyRover does not know about. No hotspot / captive portal is
// involved; enforcement is two plain firewall objects, both tagged with the
// comment "studyrover:<mac>" so they can be found, replaced and removed
// idempotently (the RouterOS comment-as-tag idiom):
//
//   - Gate(mac, true) adds one /ip/firewall/filter rule
//     chain=forward src-mac-address=<MAC> src-address-list=!studyrover-online
//     action=drop, inserted at the TOP of the forward chain (place-before the
//     first static forward rule) so it precedes the default
//     "accept established,related" rule and therefore also cuts flows that
//     were open when the grant expired. Gate(mac, false) deletes the rule(s).
//   - Grant(mac, d) resolves the device's current IPv4 (an active
//     /ip/dhcp-server/lease for the MAC, falling back to /ip/arp) and adds an
//     /ip/firewall/address-list entry list=studyrover-online address=<ip>
//     timeout=<d> comment=studyrover:<mac>. RouterOS itself removes the entry
//     when the timeout runs out, so the router enforces expiry even if
//     StudyRover is down. A previous entry for the same MAC is removed first
//     (Grant replaces). The entry's ".id" is the wall ref.
//   - Revoke(mac) deletes the address-list entries tagged with the MAC;
//     ListActive reads the list and turns the remaining "timeout" into
//     ExpiresAt; Discover unions DHCP leases and the ARP table.
//
// While the address-list holds the device's IP, the gate rule does not match
// and the household's normal rules apply; the moment it is gone, the rule
// drops every forwarded packet from that MAC.
//
// # Router prerequisites
//
// Nothing has to be pre-created on the router beyond what Gate creates: the
// address-list springs into existence with its first entry and the filter
// rule references it by name. What the deployment must satisfy:
//
//  1. RouterOS v7 with the REST API reachable: the www or www-ssl service
//     enabled (/ip/service), and a user with "read,write,api,rest-api" policy
//     (a dedicated "studyrover" user is recommended over admin).
//  2. The StudyRover host must stay reachable from a gated device while it is
//     blocked, because the quiz IS the way to earn time. On the usual home
//     layout (router LAN ports + Wi-Fi in one bridge, StudyRover host on that
//     LAN) this holds automatically: same-segment traffic is switched by the
//     bridge and never enters the IP forward chain, and the router's own
//     services (DNS, DHCP) are the input chain, which the gate rule does not
//     touch. If the host lives on another subnet/VLAN, add an accept rule for
//     it above the studyrover rules yourself (the gate only drops forward
//     traffic that has no open grant).
//  3. IPv4 only: the gate rule lives in /ip/firewall, and grants are keyed by
//     the device's IPv4. A dual-stack LAN with IPv6 internet would let a gated
//     device bypass the wall over IPv6; disable IPv6 on the LAN (or on the
//     gated devices) if that applies.
//  4. The device must be on the network to receive a grant: Grant needs an
//     IP for the MAC. A device that is off/asleep gets a descriptive error and
//     the grant can be retried (session.Manager reconciles on boot).
//
// # Environment
//
// Wired by internal/config when GUARDIAN_WALL=routeros:
//
//	ROUTEROS_URL            base URL, e.g. https://192.168.88.1 ("/rest" is appended)
//	ROUTEROS_USER           REST user
//	ROUTEROS_PASSWORD       its password
//	ROUTEROS_INSECURE_TLS   "true" to accept the router's self-signed certificate
//	ROUTEROS_HOTSPOT_SERVER accepted for compatibility with the config contract;
//	                        unused by this mechanism (no hotspot is involved)
//
// # REST details relied upon (RouterOS 7.x)
//
// GET /rest/<path>[?field=value] prints (filters are re-checked client-side),
// PUT /rest/<path> adds (PUT creates in RouterOS — the opposite of most REST
// APIs) and returns the created object with its ".id", DELETE /rest/<path>/<id>
// removes. Errors come back as {"error":N,"message":"...","detail":"..."} and
// are surfaced as *Error. Time values are read in both RouterOS spellings
// ("1h2m3s" and "1d02:03:04") and written in unit form ("1h30m").
package routeros
