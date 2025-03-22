# MCP Vector Sync

Servicio MCP para sincronización automática de vectores de búsqueda multi-tenant con Supabase.

## Descripción

Este servicio monitorea cambios en la tabla `proyectos` de Supabase, genera embeddings vectoriales utilizando OpenAI, y actualiza la tabla `proyecto_vector` manteniendo una búsqueda vectorial eficiente para cada tenant. Implementa el protocolo MCP (Model Context Protocol) para exponer herramientas y recursos de sincronización.

## Características

- Monitoreo automático de cambios en proyectos por tenant
- Generación de embeddings con OpenAI
- Sincronización multi-tenant con aislamiento completo de datos
- Exposición de herramientas MCP para control y monitoreo
- Servidor de health check para supervisión
- Containerizado con Docker para fácil despliegue
- Compatible con Railway para despliegue en producción

## Requisitos

- Node.js >= 18
- Supabase con tabla `proyectos` y `proyecto_vector`
- API Key de OpenAI
- Docker (para despliegue)

## Configuración

El servicio utiliza variables de entorno para su configuración:

```
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=text-embedding-ada-002

# Monitor
MONITOR_INTERVAL=60000
BATCH_SIZE=50
MAX_CONCURRENT=3
MAX_RETRIES=3

# Rate Limiting
RATE_LIMIT_PER_TENANT=100
CONCURRENT_REQUESTS=5

# Logging
LOG_LEVEL=info
```

## Desarrollo Local

1. Instalar dependencias:

```bash
npm install
```

2. Configurar variables de entorno (crear archivo `.env` en la raíz del proyecto)

3. Ejecutar en modo desarrollo:

```bash
npm run dev
```

## Docker

Para ejecutar el servicio con Docker:

```bash
# Construir la imagen
docker build -t mcp-vector-sync .

# Ejecutar el contenedor
docker run -p 3000:3000 --env-file .env mcp-vector-sync
```

O con Docker Compose:

```bash
docker-compose up
```

## Despliegue en Railway

### Preparación

1. Crea un repositorio en GitHub y sube el código:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/tu-usuario/mcp-vector-sync.git
git push -u origin main
```

2. Crea una cuenta en [Railway](https://railway.app/) si aún no tienes una.

### Despliegue

1. En Railway, crea un nuevo proyecto desde GitHub
2. Selecciona el repositorio `mcp-vector-sync`
3. Railway detectará automáticamente el Dockerfile
4. Configura las variables de entorno en la sección "Variables"
5. Despliega el servicio

Railway utilizará el archivo `railway.json` para configurar el deployment y el Dockerfile para construir la imagen.

### Monitoreo

Una vez desplegado, puedes monitorear el servicio usando el endpoint `/health`:

```
https://tu-proyecto.railway.app/health
```

## Herramientas MCP

El servicio expone las siguientes herramientas MCP:

- `sync-tenant`: Fuerza la sincronización para un tenant específico
- `get-sync-status`: Obtiene el estado de sincronización de un tenant
- `control-monitor`: Inicia o detiene el monitor de sincronización

## Solución de problemas

- Si hay errores con la generación de embeddings, verifica tu API key de OpenAI
- Para problemas de conexión con Supabase, asegúrate de que la URL y la service key sean correctas
- Logs detallados se pueden habilitar con `LOG_LEVEL=debug`

## Mantenimiento

Para actualizar el servicio:

1. Haz cambios en el código
2. Actualiza la versión en `package.json`
3. Haz commit y push a GitHub
4. Railway detectará los cambios y redesplegará automáticamente

## Notas de seguridad

- Nunca incluyas credenciales o API keys en el código fuente
- Utiliza variables de entorno para toda la configuración sensible
- Asegúrate de que la service role key de Supabase tenga solo los permisos necesarios