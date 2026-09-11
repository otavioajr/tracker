.PHONY: help gateway web simulator db-push db-types db-reset gateway-build gateway-release

# Anchor paths to this Makefile, including invocations with make -C or -f.
REPO_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
BUILDINFO_PACKAGE := github.com/otavioajr/tracker/gateway/internal/buildinfo

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --- Gateway ---
gateway-build: ## Build the native Go gateway with source identity

gateway-release: ## Build a clean, reproducible Linux/amd64 gateway

# Release time is SOURCE_DATE_EPOCH or commit time: identical inputs yield identical bytes.
# --untracked-files=all includes new sources but respects ignored secrets/build outputs.
gateway-build gateway-release:
	@set -eu; \
	cd "$(REPO_ROOT)"; \
	revision=$$(git rev-parse --verify HEAD); \
	status=$$(git status --porcelain=v1 --untracked-files=all); \
	dirty=false; [ -z "$$status" ] || dirty=true; \
	target=''; output=bin/gateway; \
	if [ "$@" = gateway-release ]; then \
		if [ "$$dirty" != false ]; then \
			printf '%s\n' 'Release requires a clean working tree (including untracked files).' >&2; exit 1; \
		fi; \
		epoch=$${SOURCE_DATE_EPOCH:-$$(git show -s --format=%ct HEAD)}; \
		case "$$epoch" in ''|*[!0-9]*) printf '%s\n' 'SOURCE_DATE_EPOCH must be an integer Unix timestamp.' >&2; exit 1;; esac; \
		build_time=$$(date -u -d "@$$epoch" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -r "$$epoch" '+%Y-%m-%dT%H:%M:%SZ'); \
		target='GOOS=linux GOARCH=amd64 GOAMD64=v1 CGO_ENABLED=0'; output=bin/gateway-linux-amd64; \
	else \
		build_time=$$(date -u '+%Y-%m-%dT%H:%M:%SZ'); \
	fi; \
	cd gateway; \
	env $$target go build -mod=readonly -trimpath -buildvcs=false \
		-ldflags "-buildid= -X $(BUILDINFO_PACKAGE).revision=$$revision -X $(BUILDINFO_PACKAGE).buildTime=$$build_time -X $(BUILDINFO_PACKAGE).dirty=$$dirty" \
		-o "$$output" ./cmd/gateway

gateway-run: ## Run the Go gateway
	cd gateway && go run ./cmd/gateway

gateway-test: ## Run gateway tests
	cd gateway && go test ./... -v

# --- Web ---
web-install: ## Install web dependencies
	cd web && npm install

web-dev: ## Run Next.js dev server
	cd web && npm run dev

web-build: ## Build Next.js for production
	cd web && npm run build

web-test: ## Run web tests
	cd web && npm test

# --- Simulator ---
simulator-build: ## Build the device simulator
	cd simulator && go build -o bin/simulator ./cmd/simulator

simulator-run: ## Run the device simulator
	cd simulator && go run ./cmd/simulator

# --- Database ---
db-push: ## Push migrations to Supabase
	supabase db push

db-types: ## Generate TypeScript types from Supabase
	supabase gen types typescript --project-id "$(SUPABASE_PROJECT_ID)" > web/src/types/database.ts

db-reset: ## Reset database (WARNING: deletes all data)
	supabase db reset

db-migration: ## Create a new migration (usage: make db-migration name=my_migration)
	supabase migration new $(name)
