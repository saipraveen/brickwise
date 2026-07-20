FROM node:24-slim

COPY --from=public.ecr.aws/awsguru/aws-lambda-web-adapter:0.8.4 /lambda-web-adapter /opt/extensions/lambda-web-adapter

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY . .

EXPOSE 8080
CMD ["node", "dist/server.js"]
