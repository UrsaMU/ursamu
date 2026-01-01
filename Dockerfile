# Stage 1: Cache dependencies
FROM denoland/deno:alpine as cache

WORKDIR /app

# Copy config files
COPY deno.json import_map.json ./
# Copy deps file
COPY deps.ts ./

# Cache main dependencies
RUN deno cache deps.ts

# Stage 2: Runtime
FROM denoland/deno:alpine

WORKDIR /app

# Install bash for the run script
RUN apk add --no-cache bash

# Copy cached dependencies from stage 1
COPY --from=cache /deno-dir /deno-dir

# Copy source code
COPY . .

# Cache application entry points to speed up startup
RUN deno cache src/main.ts src/telnet.ts

# Expose ports
# 4201: Telnet
# 4202: WebSocket
# 4203: HTTP API
EXPOSE 4201 4202 4203

# Create volumes for data persistence
VOLUME ["/app/data", "/app/config"]

# Start the server
CMD ["deno", "task", "start"]
