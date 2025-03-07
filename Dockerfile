# 1. Basis-Image (Node.js LTS Version)
FROM node:18

# 2. Arbeitsverzeichnis setzen
WORKDIR /app

# 3. Abhängigkeiten kopieren und installieren
COPY package.json package-lock.json ./
RUN npm install --production

# 4. Projektdateien kopieren
COPY . .

# 5. Port für Express-Server freigeben (falls du API-Endpoints hast)
EXPOSE 8081

# 6. Startkommando für den Bot
CMD ["node", "server.js"]
