# Stride+ API 서버 이미지. 저장소 루트에서 빌드한다:
#   docker build -f apps/server/Dockerfile -t stride-api .
FROM node:20-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
# 루트 husky·네이티브 빌드 스크립트는 필요 없다(bcrypt는 prebuild 바이너리를 쓴다)
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @stride/server...
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @stride/server build \
 && pnpm --filter @stride/server deploy --prod --legacy --ignore-scripts /out

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
