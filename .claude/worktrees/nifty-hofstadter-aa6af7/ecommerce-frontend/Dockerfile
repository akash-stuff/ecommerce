# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Baked at build time and read by the browser. Only the API URL and apex domain
# — never a tenant id, because one build serves every store.
ARG VITE_API_URL
ARG VITE_STORE_DOMAIN
ENV VITE_API_URL=$VITE_API_URL VITE_STORE_DOMAIN=$VITE_STORE_DOMAIN
# Produces two bundles: dist/client for the browser, dist/server for the renderer.
RUN npm run build

# The storefront is server-rendered, so the runtime is Node rather than a static
# file server. Vite leaves the framework packages external in the SSR bundle,
# which is why the production dependencies are installed here too.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server.mjs ./
# Where the renderer reaches the API: an internal address, not the public one.
ENV SSR_API_URL=http://backend:4000/api/v1
ENV PORT=5173
EXPOSE 5173
USER node
CMD ["node", "server.mjs"]
