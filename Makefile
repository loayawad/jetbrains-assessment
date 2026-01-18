.PHONY: help install dev build start stop restart logs clean test migrate

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	yarn install

dev: ## Run in development mode
	yarn dev

build: ## Build TypeScript
	yarn build

migrate: ## Run database migrations
	yarn migrate

start: ## Start all services with Docker Compose
	docker-compose up -d

start-scale: ## Start with 2 scheduler instances (demonstrates horizontal scaling)
	docker-compose --profile scale up -d

start-test: ## Start with mock agent service for testing
	docker-compose --profile test up -d

stop: ## Stop all services
	docker-compose down

restart: ## Restart all services
	docker-compose restart

logs: ## View logs from all services
	docker-compose logs -f

logs-scheduler: ## View logs from scheduler service only
	docker-compose logs -f scheduler

clean: ## Stop services and remove volumes
	docker-compose down -v
	rm -rf node_modules dist

test: ## Run integration test (create a test schedule)
	@echo "Creating a test schedule..."
	curl -X POST http://localhost:3000/api/schedules \
		-H "Content-Type: application/json" \
		-d '{"name":"Test Schedule","cronExpression":"*/2 * * * *","agentId":"test-001","agentUrl":"http://mock-agent:5678","httpMethod":"POST","enabled":true}'
