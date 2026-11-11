FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM nginx:alpine
ARG EDITOR_FRONTEND_REVISION=development
ENV EDITOR_API_UPSTREAM=api:8000
LABEL org.opencontainers.image.revision=$EDITOR_FRONTEND_REVISION
COPY --from=build /app/dist /usr/share/nginx/html
# Public files can retain mode 0600 from the private deployment checkout.
# Nginx workers must be able to read every built static asset.
RUN printf '%s\n' "$EDITOR_FRONTEND_REVISION" | grep -Eq '^(development|[a-f0-9]{40})$' \
    && test -s /usr/share/nginx/html/index.html \
    && find /usr/share/nginx/html/assets -type f -name '*.js' -size +0c | grep -q . \
    && printf '%s\n' "$EDITOR_FRONTEND_REVISION" > /usr/share/nginx/html/release.txt \
    && chmod -R a+rX /usr/share/nginx/html
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
