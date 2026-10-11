# Сборка для Railway и любого Docker-хостинга: Node 22, один контейнер (API + интерфейс).
# Многоэтапно: в итоговом образе только собранный код и рабочие зависимости; запуск не от root.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/migrations server/migrations
COPY --from=build /app/web/dist web/dist
COPY --from=build /app/assist assist
RUN mkdir -p /app/server/uploads && chown -R node:node /app/server/uploads
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
