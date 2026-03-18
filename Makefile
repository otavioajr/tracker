.PHONY: help gateway web simulator db-push db-types db-reset

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --- Gateway ---
gateway-build: ## Build the Go gateway
	cd gateway && go build -o bin/gateway ./cmd/gateway

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
