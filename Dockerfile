# Tamveen POS + ZATCA service in one container, for the POS machine.
#   docker build -t tamveen-pos .
#   docker run -d --restart unless-stopped -p 127.0.0.1:8080:8080 \
#     -v "$PWD/zatca.config.json:/app/server/zatca.config.json:ro" -v tamveen-data:/data tamveen-pos
FROM node:20-alpine
WORKDIR /app
COPY index.html favicon.ico version.json ./
COPY css ./css
COPY js ./js
COPY assets ./assets
COPY server ./server
WORKDIR /app/server
ENV HOST=0.0.0.0 PORT=8080 ZATCA_DATA_DIR=/data
VOLUME /data
EXPOSE 8080
CMD ["node", "index.js"]
