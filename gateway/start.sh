#!/bin/sh
set -e

echo "Starting guacd..."
/opt/guacamole/sbin/guacd -b 127.0.0.1 -l 4822 -f &
GUACD_PID=$!

# Wait for guacd to be ready
sleep 1

echo "Starting gateway server..."
exec node /app/server.js
