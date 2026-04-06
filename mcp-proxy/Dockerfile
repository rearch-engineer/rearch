FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Copy source
COPY src/ ./src/

EXPOSE 3100

CMD ["bun", "run", "src/index.js"]
