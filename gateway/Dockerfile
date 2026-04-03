FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && \
    sed -i 's/this\.lastActivity + 10000/this.lastActivity + 60000/' \
    node_modules/guacamole-lite/lib/GuacdClient.js

# Patch Crypt.js decrypt to use Buffer instead of buggy binary string encoding
COPY crypt-patch.js /tmp/crypt-patch.js
RUN node /tmp/crypt-patch.js && rm /tmp/crypt-patch.js

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
