# Estágio 1: Build do PWA (React 19 + TypeScript + Vite + Tailwind v4)
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# "self" faz o app usar a mesma origem (location.origin) para /auth/v1 e /rest/v1 via gateway Nginx
ARG VITE_SUPABASE_URL=self
ARG VITE_SUPABASE_ANON_KEY=self-hosted-gateway
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

RUN npm run build

# Estágio 2: Gateway Nginx não-root (porta 8080)
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner
COPY docker/nginx-prod.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html

USER 101
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
