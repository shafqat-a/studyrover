# StudyRover — root build orchestration (F01)
#
# Polyglot monorepo: Go backend (prod runtime) + React/Vite SPA (build-time only)
# + OpenAPI contract (codegen source of truth).
#
# Node/pnpm are BUILD-TIME ONLY. The production artifact is a single Go binary
# that serves the API and the SPA embedded via go:embed. No Node at runtime.

# ---- Config -----------------------------------------------------------------
SHELL          := /bin/bash
.DEFAULT_GOAL  := help

BACKEND_DIR    := backend
FRONTEND_DIR   := frontend
CONTRACTS_DIR  := contracts

# Where the Vite build is emitted and embedded into the Go binary.
SPA_DIST       := $(FRONTEND_DIR)/dist
SPA_EMBED      := $(BACKEND_DIR)/internal/http/dist

BIN_DIR        := $(BACKEND_DIR)/bin
BINARY         := $(BIN_DIR)/studyrover

GO             := go
PNPM           := pnpm

# Database URL used by migrate/seed (override on the CLI as needed).
DATABASE_URL  ?= postgres://studyrover:studyrover@localhost:5432/studyrover?sslmode=disable
MIGRATIONS_DIR := $(BACKEND_DIR)/db/migrations

.PHONY: help gen gen-go gen-ts build build-spa build-backend dev dev-backend dev-frontend \
        test test-go test-frontend lint lint-go lint-frontend migrate migrate-down seed \
        install clean

# ---- Help -------------------------------------------------------------------
help: ## List available targets
	@echo "StudyRover — make targets:"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ---- Dependencies -----------------------------------------------------------
install: ## Install build-time deps (Go modules + pnpm packages)
	cd $(BACKEND_DIR) && $(GO) mod download
	cd $(FRONTEND_DIR) && $(PNPM) install

# ---- Codegen ----------------------------------------------------------------
gen: gen-go gen-ts ## Generate code from the OpenAPI contract (Go + TS)

gen-go: ## Generate Go types + chi server from OpenAPI (oapi-codegen)
	cd $(BACKEND_DIR) && $(GO) generate ./...

gen-ts: ## Generate the TypeScript client from OpenAPI (openapi-typescript)
	cd $(FRONTEND_DIR) && $(PNPM) run gen

# ---- Build ------------------------------------------------------------------
# build = gen -> built SPA -> backend binary embedding the SPA.
build: gen build-spa build-backend ## Full build: codegen, build SPA, embed into Go binary

build-spa: ## Build the React SPA and stage it for go:embed
	cd $(FRONTEND_DIR) && $(PNPM) install --frozen-lockfile && $(PNPM) run build
	rm -rf $(SPA_EMBED)
	mkdir -p $(SPA_EMBED)
	cp -R $(SPA_DIST)/. $(SPA_EMBED)/

build-backend: ## Compile the Go server binary (embeds the staged SPA)
	mkdir -p $(BIN_DIR)
	cd $(BACKEND_DIR) && CGO_ENABLED=0 $(GO) build -o bin/studyrover ./cmd/server

# ---- Dev --------------------------------------------------------------------
dev: ## Run backend and frontend dev servers concurrently
	$(MAKE) -j2 dev-backend dev-frontend

dev-backend: ## Run the Go API server with live reload-free go run
	cd $(BACKEND_DIR) && $(GO) run ./cmd/server

dev-frontend: ## Run the Vite dev server (proxies /api to the backend)
	cd $(FRONTEND_DIR) && $(PNPM) run dev

# ---- Test -------------------------------------------------------------------
test: test-go test-frontend ## Run all tests (Go + frontend)

test-go: ## Run Go tests with race detector
	cd $(BACKEND_DIR) && $(GO) test -race ./...

test-frontend: ## Run frontend unit tests (Vitest)
	cd $(FRONTEND_DIR) && $(PNPM) run test

# ---- Lint -------------------------------------------------------------------
lint: lint-go lint-frontend ## Lint both languages

lint-go: ## Lint Go (golangci-lint)
	cd $(BACKEND_DIR) && golangci-lint run ./...

lint-frontend: ## Lint frontend (eslint)
	cd $(FRONTEND_DIR) && $(PNPM) run lint

# ---- Database ---------------------------------------------------------------
migrate: ## Apply all up migrations (golang-migrate)
	migrate -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" up

migrate-down: ## Roll back the last migration
	migrate -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" down 1

seed: ## Seed the database with development data
	cd $(BACKEND_DIR) && DATABASE_URL="$(DATABASE_URL)" $(GO) run ./cmd/seed

# ---- Clean ------------------------------------------------------------------
clean: ## Remove build artifacts (binary, SPA dist, embedded copy)
	rm -rf $(BIN_DIR) $(SPA_DIST) $(SPA_EMBED) $(FRONTEND_DIR)/.vite
