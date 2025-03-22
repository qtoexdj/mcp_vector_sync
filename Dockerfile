# Usar una imagen base de Node.js con versión LTS (Node 20)
FROM node:20-alpine AS builder

# Establecer directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar el resto del código fuente
COPY . .

# Compilar la aplicación TypeScript
RUN npm run build

# Etapa de producción
FROM node:20-alpine AS production

# Configurar variables de entorno para producción
ENV NODE_ENV=production
ENV DEMO_MODE=true

# Establecer directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --omit=dev

# Copiar la aplicación compilada desde la etapa de construcción
COPY --from=builder /app/dist ./dist

# Copiar el archivo .env.example como .env para tener valores predeterminados
COPY .env.example .env

# Exponer puerto para MCP (opcional, principalmente para documentación)
EXPOSE 3000

# Script para iniciar la aplicación con variables de entorno
COPY <<EOF /app/start.sh
#!/bin/sh
# Imprimir variables de entorno para depuración (sin mostrar valores sensibles)
echo "Variables de entorno configuradas:"
echo "SUPABASE_URL: ${SUPABASE_URL:+configurado}"
echo "SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:+configurado}"
echo "OPENAI_API_KEY: ${OPENAI_API_KEY:+configurado}"
echo "OPENAI_MODEL: ${OPENAI_MODEL}"
echo "MONITOR_INTERVAL: ${MONITOR_INTERVAL}"
echo "BATCH_SIZE: ${BATCH_SIZE}"
echo "MAX_CONCURRENT: ${MAX_CONCURRENT}"
echo "LOG_LEVEL: ${LOG_LEVEL}"

# Iniciar la aplicación
node dist/index.js
EOF

RUN chmod +x /app/start.sh

# Iniciar la aplicación usando el script
CMD ["/app/start.sh"]