FROM guacamole/guacd:1.5.5 AS guacd

FROM node:20-alpine

# Install runtime libs that guacd needs (FreeRDP for RDP support)
RUN apk add --no-cache \
    cairo \
    libjpeg-turbo \
    libpng \
    libwebp \
    pango \
    freerdp \
    freerdp-libs \
    libuuid \
    ossp-uuid

# Copy guacd from the official image
COPY --from=guacd /opt/guacamole /opt/guacamole
ENV PATH="/opt/guacamole/sbin:/opt/guacamole/bin:${PATH}"
ENV LD_LIBRARY_PATH="/opt/guacamole/lib:${LD_LIBRARY_PATH}"

WORKDIR /app

# Install Node dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy application code
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

CMD ["sh", "start.sh"]
