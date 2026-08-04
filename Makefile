.PHONY: run logs
# без логов для ci
run:
	touch youtube_cookies.txt
	docker compose up -d --build --wait
	cd backend && npm ci && npx drizzle-kit migrate

# с логами
logs:
	docker compose logs -f
