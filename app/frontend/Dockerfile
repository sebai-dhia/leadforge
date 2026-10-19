# Build the Angular app, then serve it with Caddy, which also forwards /api to the backend and gets HTTPS certificates.
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx ng build --configuration production

FROM caddy:2.10-alpine
COPY --from=build /src/dist/frontend/browser /srv
COPY Caddyfile /etc/caddy/Caddyfile
