# Stage 1: Build the Astro site
FROM oven/bun:1-alpine AS build

WORKDIR /app

# sharp requires native dependencies on Alpine
RUN apk add --no-cache python3 make g++ vips-dev

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ARG SITE_URL=https://rearch.engineer
ENV SITE_URL=${SITE_URL}

RUN bun run build

# Stage 2: Serve with nginx
FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
