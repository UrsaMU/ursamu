FROM node:20-alpine

# Install additional development tools
RUN apk update && apk add --no-cache \
    alpine-sdk \
    bash \
    git \
    curl \
    vim \
    python3 \
    make \
    g++

# Create app directory
WORKDIR /ursamu

# Install global development tools
RUN npm install -g \
    typescript \
    ts-node \
    nodemon \
    pm2

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Create data directory
RUN mkdir -p /ursamu/data

# Set up non-root user for better security
USER node

# Keep container running
CMD ["sleep", "infinity"]
