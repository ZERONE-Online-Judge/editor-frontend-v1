FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Public files can retain mode 0600 from the private deployment checkout.
# Nginx workers must be able to read every built static asset.
RUN chmod -R a+rX /usr/share/nginx/html
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
