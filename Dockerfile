# ---- build client (React + Vite) ----
FROM node:24-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- install server deps ----
FROM node:24-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./

# ---- runtime: API + static frontend (single origin) ----
FROM node:24-alpine
WORKDIR /app
COPY --from=server-builder /app/server ./server
COPY --from=client-builder /app/client/dist ./server/public
WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "src/index.js"]
