# The whole app in one container for a free Hugging Face Space: Caddy on port 7860 (the web app and /api),
# the backend and n8n on the container's loopback. The databases are on Supabase.
# On Hugging Face the source comes from the GitHub repo (GITHUB_REPO variable, GIT_REF set by
# .github/workflows/deploy-space.yml, GITHUB_TOKEN build secret only for a private repo); the Space holds only this file.
# Locally, from app/:  docker build --build-arg SRC=local -f deploy/hf/Dockerfile -t leadforge-hf .
ARG SRC=clone

FROM alpine:3.22 AS clone
ARG GITHUB_REPO
ARG GIT_REF=main
RUN apk add --no-cache git
# the token is only needed while the repository is private
RUN --mount=type=secret,id=GITHUB_TOKEN,mode=0444,required=false \
    auth=""; if [ -s /run/secrets/GITHUB_TOKEN ]; then auth="x-access-token:$(cat /run/secrets/GITHUB_TOKEN)@"; fi \
    && git clone --quiet "https://${auth}github.com/${GITHUB_REPO}.git" /repo \
    && git -C /repo checkout --quiet "${GIT_REF}" \
    && mv /repo/app /src && rm -rf /repo

FROM scratch AS local
COPY . /src

FROM ${SRC} AS src

FROM node:24-alpine AS web
WORKDIR /src
COPY --from=src /src/frontend/package.json /src/frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY --from=src /src/frontend ./
RUN npx ng build --configuration production

FROM eclipse-temurin:21-jdk AS api
WORKDIR /src
COPY --from=src /src/backend/.mvn .mvn
COPY --from=src /src/backend/mvnw /src/backend/pom.xml ./
RUN --mount=type=cache,target=/root/.m2 chmod +x mvnw && ./mvnw -q -B dependency:go-offline
COPY --from=src /src/backend/src src
# extracted (the jar plus lib/) so the class archive below can cover the libraries too
RUN --mount=type=cache,target=/root/.m2 ./mvnw -q -B package -DskipTests \
    && java -Djarmode=tools -jar target/*.jar extract --destination /app && mv /app/*.jar /app/app.jar

FROM n8nio/n8n:2.43.8
COPY --from=eclipse-temurin:21-jre-alpine /opt/java/openjdk /opt/java/openjdk
COPY --from=caddy:2.10-alpine /usr/bin/caddy /usr/bin/caddy
COPY --from=api /app /app
COPY --from=web /src/dist/frontend/browser /srv
COPY --from=src /src/frontend/Caddyfile /etc/caddy/Caddyfile
COPY --from=src /src/n8n/lead-finder.workflow.json /src/n8n/enrich-contact.workflow.json /src/n8n/draft-message.workflow.json /workflows/
COPY --from=src /src/deploy/hf/start.sh /start.sh

# Settings that are not secrets. The secrets are Space secrets (see deploy/hf/FREE-HOSTING.md).
ENV DOMAIN=:7860 \
    BACKEND_ADDR=127.0.0.1:8081 \
    XDG_DATA_HOME=/tmp/caddy-data \
    XDG_CONFIG_HOME=/tmp/caddy-config \
    PORT=8081 \
    PUBLIC_BASE_URL=http://127.0.0.1:8081 \
    N8N_WEBHOOK_URL=http://127.0.0.1:5678/webhook/find-leads \
    N8N_DRAFT_URL=http://127.0.0.1:5678/webhook/draft-message \
    N8N_ENRICH_URL=http://127.0.0.1:5678/webhook/enrich-contact \
    SERVER_FORWARD_HEADERS_STRATEGY=native \
    SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=5 \
    DB_TYPE=postgresdb \
    DB_POSTGRESDB_PORT=5432 \
    DB_POSTGRESDB_DATABASE=postgres \
    DB_POSTGRESDB_SSL_ENABLED=true \
    DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED=false \
    DB_POSTGRESDB_CONNECTION_TIMEOUT=60000 \
    N8N_LISTEN_ADDRESS=127.0.0.1 \
    N8N_PORT=5678 \
    WEBHOOK_URL=http://localhost:5678/ \
    N8N_SECURE_COOKIE=false \
    GENERIC_TIMEZONE=Africa/Tunis \
    TZ=Africa/Tunis \
    N8N_DIAGNOSTICS_ENABLED=false \
    N8N_PERSONALIZATION_ENABLED=false \
    N8N_BLOCK_ENV_ACCESS_IN_NODE=true \
    EXECUTIONS_DATA_PRUNE=true \
    EXECUTIONS_DATA_MAX_AGE=336

# Class archive for a faster backend start (CDS): one start that stops when Spring is ready, without a database.
# It ends early on the first database query; the classes loaded until then are archived. Optional: no archive, normal start.
USER root
RUN cd /app && /opt/java/openjdk/bin/java -Xmx1g -XX:ArchiveClassesAtExit=app.jsa -Dspring.context.exit=onRefresh \
      -Dspring.datasource.url=jdbc:postgresql://127.0.0.1:1/none -Dspring.flyway.enabled=false \
      -Dspring.jpa.hibernate.ddl-auto=none -Dspring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect \
      -Dspring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access=false -Dapp.telegram.polling=false \
      -jar /app/app.jar > /tmp/cds.log 2>&1 || true; \
    if [ -f app.jsa ]; then ls -l app.jsa; else tail -20 /tmp/cds.log; echo "No class archive: normal start"; fi; \
    rm -f /tmp/cds.log
USER node

EXPOSE 7860
ENTRYPOINT ["tini", "--", "sh", "/start.sh"]
