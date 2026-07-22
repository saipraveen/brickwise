FROM node:24-slim

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.1 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace root files needed for pnpm install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy server and shared package.json for dependency resolution
COPY server/package.json ./server/
COPY shared/package.json ./shared/

# Install production dependencies for the server workspace
RUN pnpm install --frozen-lockfile --prod --filter server

# Copy built server and shared source
COPY server/dist ./server/dist
COPY shared/src ./shared/src
COPY shared/package.json shared/tsconfig.json ./shared/

WORKDIR /app/server

EXPOSE 8080
CMD ["node", "dist/server.js"]
