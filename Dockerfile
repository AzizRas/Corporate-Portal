# Сборка для Railway и любого Docker-хостинга: Node 22, один контейнер (API + интерфейс).
FROM node:22-slim
WORKDIR /app

# зависимости отдельным слоем (кэшируются, пока не меняется package-lock)
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start"]
