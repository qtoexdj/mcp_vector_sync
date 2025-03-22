# Plan de Despliegue: MCP Vector Sync

Este documento detalla el plan paso a paso para desplegar el servicio MCP Vector Sync en Railway a través de GitHub.

## 1. Preparación del Repositorio

1. **Crear repositorio en GitHub**:
   ```bash
   # Inicializar git si aún no está inicializado
   git init

   # Agregar archivos al repositorio
   git add .

   # Commit inicial
   git commit -m "Initial commit: MCP Vector Sync service"

   # Agregar repositorio remoto (reemplaza con tu URL de GitHub)
   git remote add origin https://github.com/tu-usuario/mcp-vector-sync.git

   # Subir código
   git push -u origin main
   ```

2. **Configuración de archivos para producción**:
   - Asegurarse de que `.env` está en `.gitignore` para no subir credenciales
   - Verificar que `Dockerfile`, `docker-compose.yml` y `railway.json` estén correctamente configurados

## 2. Configuración en Railway

1. **Crear cuenta en Railway**:
   - Registrarse en [Railway](https://railway.app/) si aún no tienes cuenta
   - Se recomienda vincular con la cuenta de GitHub para facilitar el despliegue

2. **Nuevo proyecto**:
   - Crear un nuevo proyecto en Railway
   - Seleccionar "Deploy from GitHub repo"
   - Seleccionar el repositorio `mcp-vector-sync`

3. **Configuración de variables de entorno**:
   Agregar todas las variables de entorno necesarias:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   OPENAI_API_KEY=your-openai-api-key
   OPENAI_MODEL=text-embedding-ada-002
   MONITOR_INTERVAL=60000
   BATCH_SIZE=50
   MAX_CONCURRENT=3
   MAX_RETRIES=3
   RATE_LIMIT_PER_TENANT=100
   CONCURRENT_REQUESTS=5
   LOG_LEVEL=info
   PORT=3000
   ```

4. **Configuración de recursos**:
   - Memoria: Mínimo 512 MB, recomendado 1 GB
   - CPU: Mínimo 0.5 vCPU, recomendado 1 vCPU
   - Escalamiento: Configurar a "No scaling" inicialmente

## 3. Despliegue y Validación

1. **Despliegue inicial**:
   - Hacer clic en "Deploy" para iniciar el despliegue
   - Railway detectará automáticamente el Dockerfile y lo usará para construir la imagen

2. **Validación post-despliegue**:
   - Verificar logs en Railway para asegurarse de que el servicio inicia correctamente
   - Probar el endpoint de health check: `https://tu-servicio.railway.app/health`
   - Seguir las instrucciones en `VALIDATION.md` para validación completa

3. **Configuración de dominio personalizado** (opcional):
   - En la sección "Settings" > "Domains"
   - Agregar un dominio personalizado si se requiere

## 4. Monitoreo y Operación

1. **Configuración de alertas**:
   - Configurar alertas de errores en Railway
   - Configurar notificaciones por email o Slack si es posible

2. **Monitoreo regular**:
   - Revisar logs diariamente los primeros días
   - Verificar uso de recursos (memoria, CPU)
   - Comprobar funcionamiento correcto del health check

3. **Respaldo**:
   - Asegurarse de que el código siempre esté respaldado en GitHub
   - Considerar realizar respaldos periódicos de la configuración

## 5. Escalamiento y Optimización

1. **Evaluación de rendimiento**:
   - Después de 1-2 semanas, evaluar el rendimiento y uso de recursos
   - Ajustar variables de entorno si es necesario (BATCH_SIZE, MAX_CONCURRENT)

2. **Escalamiento** (si es necesario):
   - Aumentar recursos en Railway si hay problemas de rendimiento
   - Considerar múltiples instancias si el volumen de datos crece significativamente

## 6. Mantenimiento Continuo

1. **Actualizaciones**:
   - Para actualizar el servicio, simplemente hacer commit y push a GitHub
   - Railway detectará los cambios y redesplegará automáticamente

2. **Versiones**:
   - Mantener un registro de versiones en el repositorio
   - Actualizar siempre la versión en `package.json` al hacer cambios significativos

## Recuperación ante Desastres

En caso de fallo grave:

1. **Rollback**:
   - Railway permite volver a una versión anterior del despliegue fácilmente
   - Seleccionar la versión estable anterior en el historial de despliegues

2. **Redespliege desde cero**:
   - Si es necesario, se puede crear un nuevo servicio y configurarlo con las mismas variables
   - El código fuente siempre estará disponible en GitHub

## Contacto y Soporte

Para problemas con el despliegue:
- Revisar la documentación de Railway: https://docs.railway.app/
- Consultar la documentación de Supabase para pgvector: https://supabase.com/docs/guides/database/extensions/pgvector