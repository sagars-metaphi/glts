FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
COPY src/templates ./dist/templates
COPY src/models ./dist/models
EXPOSE 3001
CMD ["node", "dist/server.js"]

FROM deps AS development
ENV NODE_ENV=development
COPY . .
RUN npx prisma generate || true
EXPOSE 3001
CMD ["npm", "run", "dev"]
