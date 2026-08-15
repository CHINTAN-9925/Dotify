FROM node:24-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm exec tsc -b packages/config packages/protocol packages/simulation apps/server

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 2567
CMD ["node", "apps/server/dist/index.js"]
