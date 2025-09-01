# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production
# default state path inside container; can be overridden
ENV STATE_FILE=/app/data/bot-state.json
ENV SAFE_MODE=true

# Install deps first for better cache
COPY package.json ./
RUN npm i --omit=dev

# Copy source
COPY . .

# Create non-root user
RUN adduser -D -h /app appuser &&     mkdir -p /app/data && chown -R appuser:appuser /app
USER appuser

VOLUME ["/app/data"]
CMD ["npm", "start"]
