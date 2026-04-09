FROM node:20-alpine

WORKDIR /app

# Native deps fuer sharp / bcrypt
RUN apk add --no-cache python3 make g++ vips-dev

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Uploads-Verzeichnis (Fallback wenn kein S3)
RUN mkdir -p backend/uploads

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "backend/server.js"]
