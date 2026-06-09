# Shelter Support AI — single image: Telegram connector + Next.js dashboard in one container.
# The engine runs on Node's native TypeScript (no build step for core). Node 24 LTS has it built in.
FROM node:24-slim

# tini = clean signal handling / zombie reaping for the two long-running processes
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) connector dependencies (the engine needs the Anthropic SDK) — copied first for layer caching
COPY core/package.json core/package-lock.json* ./core/
RUN cd core && npm install --omit=dev --no-audit --no-fund

# 2) dashboard dependencies (devDeps needed for the production build)
COPY dashboard/package.json dashboard/package-lock.json* ./dashboard/
RUN cd dashboard && npm install --no-audit --no-fund

# 3) the rest of the project
COPY . .

# 4) build the dashboard (production) — outputs dashboard/.next
RUN cd dashboard && npm run build

# 5) bake the static knowledge base into a seed dir so it can be re-seeded on top of a data volume,
#    and make the entrypoint executable
RUN mkdir -p /app/seed-kb && \
    for f in intents_taxonomy golden_answers dns_registry voice_guide escalation_playbook \
             hallucinations_caught dashboard_base_metrics volume_timeseries selftest_report; do \
      cp "dashboard/data/$f.json" /app/seed-kb/ 2>/dev/null || true; \
    done && \
    sed -i 's/\r$//' docker/entrypoint.sh && \
    chmod +x docker/entrypoint.sh

EXPOSE 3939
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
