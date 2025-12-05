FROM node:20-alpine AS deps
WORKDIR /app
# Copiamos solo los archivos de dependencias primero para aprovechar la caché de Docker
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

USER node
# Copiamos node_modules de la etapa anterior
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
# Copiamos el resto del código
COPY --chown=node:node .
.

EXPOSE 8001 

# --- MEJORA: Healthcheck ---
# Comprueba que el servidor responde en /health cada 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget --quiet --tries=1 --spider http://localhost:8001/health || exit 1

CMD ["node", "server.js"]

LABEL org.opencontainers.image.title="Vuzon"
LABEL org.opencontainers.image.description="UI para Cloudflare Email Routing"
LABEL org.opencontainers.image.url="https://vuzon.cc"
LABEL org.opencontainers.image.source="https://github.com/svnz0x/vuzon-docker"
LABEL org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"
