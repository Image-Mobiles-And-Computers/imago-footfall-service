FROM node:20-alpine AS builder

WORKDIR /app
RUN npm install -g typescript
COPY package*.json tsconfig.json ./
RUN npm install --ignore-scripts || true
COPY src ./src
RUN mkdir -p dist && (tsc || npm run build || true)

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts || true
COPY --from=builder /app/dist ./dist

EXPOSE 4006
CMD ["node", "dist/server.js"]
