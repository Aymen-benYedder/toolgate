FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages ./packages
RUN npm install
RUN npm run build -w @agentgate/dashboard

FROM nginx:alpine
COPY --from=build /app/packages/dashboard/dist /usr/share/nginx/html
COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80