# Stage 1: Budowanie aplikacji
FROM node:18-alpine AS builder

WORKDIR /app

# Kopiuj pliki package.json i package-lock.json (lub yarn.lock)
COPY package.json package-lock.json* ./

# Instalacja zależności
RUN npm ci

# Kopiuj resztę kodu źródłowego
COPY . .

# Buduj aplikację
RUN npm run build

# Stage 2: Uruchomienie aplikacji
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Zainstaluj tylko produkcyjne zależności
COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev

# Skopiuj zbudowaną aplikację
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./

# Eksponuj port dla aplikacji
EXPOSE 3000

# Uruchom aplikację
CMD ["npm", "start"]
