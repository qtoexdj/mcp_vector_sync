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

# Establecer directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --omit=dev

# Copiar la aplicación compilada desde la etapa de construcción
COPY --from=builder /app/dist ./dist

# Exponer puerto para MCP (opcional, principalmente para documentación)
EXPOSE 3000

# Iniciar la aplicación
CMD ["node", "dist/index.js"]