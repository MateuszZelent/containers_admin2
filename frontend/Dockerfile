FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Buduj z pominięciem ESLint
RUN npm run build --no-lint 

# Uruchomienie aplikacji Next.js
CMD ["npm", "start"]
