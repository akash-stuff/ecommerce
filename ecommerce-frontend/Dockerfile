# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Baked at build time. Only the API URL and apex domain — never a tenant id,
# because one bundle serves every store.
ARG VITE_API_URL
ARG VITE_STORE_DOMAIN
ENV VITE_API_URL=$VITE_API_URL VITE_STORE_DOMAIN=$VITE_STORE_DOMAIN
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
