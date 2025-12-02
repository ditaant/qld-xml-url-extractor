FROM node:20-slim

# Install Chromium and required fonts/libs
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libnspr4 \
    libnss3 \
    libxss1 \
    xdg-utils \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Expose the port
EXPOSE 3176

# Start app
CMD ["node", "pdf-fetcher.js"]
