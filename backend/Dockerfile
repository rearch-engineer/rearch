FROM oven/bun:1-alpine

WORKDIR /app

# Install git (required by simple-git for Bitbucket rebuild operations)
RUN apk add --no-cache git

# Copy package files and install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy application source
COPY . .

# Create data directory
RUN mkdir -p /app/data

EXPOSE 5000

CMD ["bun", "run", "server.js"]
