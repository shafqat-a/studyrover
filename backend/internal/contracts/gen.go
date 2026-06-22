// Package contracts holds the code generated from the frozen OpenAPI contract.
//
// The generated file (contracts.gen.go) contains the Go models for every schema
// under #/components/schemas plus a chi-compatible, strict server interface
// derived from the assembled root document (../../../contracts/openapi.yaml,
// owned by W01). Handlers (A-tasks) import these types and implement the
// generated ServerInterface; they never redefine a contract shape.
//
// Regenerate with `make gen-go`, which runs `go generate ./...` in the backend
// module. The directive below points oapi-codegen at the F06-owned config
// (../../../contracts/oapi-codegen.yaml) and the W01-owned root spec. Paths are
// relative to THIS file's directory (backend/internal/contracts).
//
// The generated contracts.gen.go is committed; CI (F10) fails on any drift
// between the contract and the committed output.
package contracts

//go:generate go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen -config ../../../contracts/oapi-codegen.yaml -o contracts.gen.go ../../../contracts/openapi.yaml
