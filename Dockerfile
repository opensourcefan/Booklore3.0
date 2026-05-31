# Stage 1: Build the Angular app
FROM node:24-alpine AS angular-build

WORKDIR /angular-app

COPY ./fable-ui/package.json ./fable-ui/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm config set registry https://registry.npmjs.org/ \
    && npm ci --force --ignore-scripts

COPY ./fable-ui /angular-app/

RUN npm run build --configuration=production

# Stage 2: Build the Spring Boot app with Gradle
FROM gradle:9.4.1-jdk25-alpine AS springboot-build

WORKDIR /springboot-app

# Copy only build files first to cache dependencies
COPY ./fable-api/build.gradle ./fable-api/settings.gradle /springboot-app/

# Download dependencies (cached layer)
RUN --mount=type=cache,target=/home/gradle/.gradle \
    gradle dependencies --no-daemon

COPY ./fable-api/src /springboot-app/src

# Copy Angular dist into Spring Boot static resources so it's embedded in the JAR
COPY --from=angular-build /angular-app/dist/app/browser /springboot-app/src/main/resources/static

# Inject version into application.yaml using yq
ARG APP_VERSION
RUN apk add --no-cache yq && \
    yq eval '.app.version = strenv(APP_VERSION)' -i /springboot-app/src/main/resources/application.yaml

RUN --mount=type=cache,target=/home/gradle/.gradle \
    gradle clean build -x test --no-daemon --parallel

# Stage 3: Final image
FROM eclipse-temurin:25-jre-alpine

ARG APP_VERSION
ARG APP_REVISION

# Set OCI labels
LABEL org.opencontainers.image.title="Fable" \
      org.opencontainers.image.description="Fable: A self-hosted, multi-user digital library with smart shelves, auto metadata, Kobo & KOReader sync, BookDrop imports, OPDS support, and a built-in reader for EPUB, PDF, and comics." \
      org.opencontainers.image.source="https://github.com/opensourcefan/Fable" \
      org.opencontainers.image.url="https://github.com/opensourcefan/Fable" \
      org.opencontainers.image.documentation="https://booklore.org/docs/getting-started" \
      org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$APP_REVISION \
      org.opencontainers.image.licenses="GPL-3.0" \
      org.opencontainers.image.base.name="docker.io/library/eclipse-temurin:25-jre-alpine"

ENV JAVA_TOOL_OPTIONS="--enable-native-access=ALL-UNNAMED -XX:+UseG1GC -XX:+UseCompactObjectHeaders -XX:+UseStringDeduplication -XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"

ARG TARGETARCH
RUN apk update && apk add --no-cache su-exec libstdc++ libgcc && \
    mkdir -p /bookdrop /opt/fable-rar

COPY docker/unrar/unrar-${TARGETARCH} /usr/local/bin/unrar
RUN chmod 755 /usr/local/bin/unrar

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
COPY --from=springboot-build /springboot-app/build/libs/fable-api-3.21.16.jar /app/app.jar

ARG FABLE_PORT=6060
EXPOSE ${FABLE_PORT}

# Health check for container orchestration (Docker Compose, K8s readiness probes, etc.)
# The /api/v1/healthcheck endpoint is unauthenticated and returns 200 when the app is ready.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -qO- http://localhost:${FABLE_PORT}/api/v1/healthcheck || exit 1

ENTRYPOINT ["entrypoint.sh"]
CMD ["java", "-jar", "/app/app.jar"]
