FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js start.sh ./
COPY public/ ./public/

RUN chmod +x start.sh

EXPOSE 8080

ENV PORT=8080 \
    GUACD_HOST=127.0.0.1 \
    GUACD_PORT=4822 \
    RDP_PORT=3389 \
    RDP_USERNAME=admin \
    RDP_PASSWORD=changeme

CMD ["node", "server.js"]
