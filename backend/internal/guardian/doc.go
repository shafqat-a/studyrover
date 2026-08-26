// Package guardian is the Phase-3 Guardian: the reward engine + network wall
// that turns exam scores into enforced internet time (spec §4/§5/§10/§11,
// tasks/CONTRACTS-P3.md).
//
// Decoupling rules (the spec's "optional add-on"):
//   - The Study Platform never imports this package tree. The only thing that
//     crosses from the platform is the score_event outbox row (contract C10),
//     read forward by ingest.Subscriber.
//   - Everything here is wired only when config.GuardianEnabled is true (see
//     internal/app/wire.go). With it off, the platform is exactly Phase 1+2.
//
// Sub-packages:
//   - wall       — the swappable Network Wall interface (+ fake and routeros impls)
//   - reward     — pure score→minutes policy (mapping, diminishing returns, cap)
//   - session    — grant lifecycle: persist, schedule revoke, reconcile on boot
//   - ingest     — score_event subscriber + the ScoreEvent→grant pipeline
//
// Deviation from tasks/3-F01 (separate `guardian/` Go module): the Guardian is
// packages inside the platform module and a feature flag on the same binary,
// so it can reuse the session auth, store, and deploy topology of the single
// home host. Runtime decoupling (flag off → no Guardian code runs) is preserved.
package guardian
