FROM node:20-alpine
WORKDIR /app

# Install all workspace deps (includes dev deps for tsx + prisma CLI)
COPY package.json package-lock.json* ./
COPY packages ./packages
RUN npm install

# Build the proxy (tsc → dist/)
RUN npm run build -w @agentgate/proxy

WORKDIR /app/packages/proxy
EXPOSE 4000

# Entrypoint: apply migrations → seed → start server (+ demo generator in AG-6)
CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && npm start"]