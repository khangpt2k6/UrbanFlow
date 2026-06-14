# Multi-stage build for the UrbanFlow Spring Boot engine.
# Stage 1: build the fat jar with Maven (tests run in CI, skipped here for a fast image build).
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
# Cache dependencies first: copy only the POM, resolve, then copy sources.
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B clean package -DskipTests

# Stage 2: slim runtime image with just the JRE and the jar.
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/trafficflow-0.1.0.jar app.jar
# Render/Heroku inject $PORT; Spring reads it via server.port in application.yml.
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
