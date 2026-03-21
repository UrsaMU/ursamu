FROM denoland/deno:2.3.1

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY deno.json deps.ts mod.ts ./

# Pre-cache dependencies
RUN deno cache src/main.ts || true

# Copy remaining source files
COPY . .

# Cache with full source available
RUN deno cache --unstable-kv src/main.ts

# Expose ports: 4201 (Telnet), 4202 (WebSocket), 4203 (HTTP API)
EXPOSE 4201
EXPOSE 4202
EXPOSE 4203

CMD ["deno", "run", "--allow-all", "--unstable-detect-cjs", "--unstable-kv", "./src/main.ts"]
