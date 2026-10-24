FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
EXPOSE 8080
CMD ["node", "server.js"]
