.PHONY: run logs
# без логов для ci
run:
	docker compose up -d --build --wait
	cd backend && npm ci && npx drizzle-kit migrate

# с логами
#run:
#	docker compose logs -f
