FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
# postinstall runs prisma generate, but schema is not copied until the build stage
RUN npm ci --workspace server --include-workspace-root --ignore-scripts

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server ./server
WORKDIR /app/server
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app/server
ENV NODE_ENV=production
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/server/prisma ./prisma
COPY --from=build /app/server/src/emails ./src/emails
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/server/node_modules ./node_modules
COPY server/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["./docker-entrypoint.sh"]
