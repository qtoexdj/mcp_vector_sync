# Validación de MCP Vector Sync

Este documento proporciona instrucciones paso a paso para validar que el servicio MCP Vector Sync basado en eventos está funcionando correctamente después del despliegue.

## 1. Verificación de Health Check

Después de desplegar el servicio, verifica que el endpoint de health check responda correctamente:

```bash
curl https://tu-servicio-url.railway.app/health
```

Deberías recibir una respuesta similar a:

```json
{
  "status": "ok",
  "timestamp": "2025-03-22T21:22:15.123Z"
}
```

## 2. Verificación de la sincronización de vectores mediante eventos

Para verificar que la sincronización basada en eventos funciona correctamente:

1. Realiza un cambio en un proyecto en Supabase (actualiza cualquier campo)
2. El trigger en Supabase debería enviar automáticamente un webhook al servicio
3. Verifica en la tabla `webhook_logs` que se registró el evento:
   ```sql
   SELECT * FROM webhook_logs 
   WHERE registro_id = 'id-del-proyecto-modificado' 
   ORDER BY tiempo DESC LIMIT 5;
   ```
4. Consulta la tabla `proyecto_vector` para verificar que se ha actualizado el embedding:
   ```sql
   SELECT 
     p.id, 
     p.nombre, 
     p.updated_at as proyecto_update, 
     pv.updated_at as vector_update 
   FROM 
     proyectos p 
   JOIN 
     proyecto_vector pv ON p.id = pv.project_id 
   WHERE 
     p.id = 'id-del-proyecto-modificado';
   ```

Si `vector_update` es posterior a `proyecto_update`, la sincronización basada en eventos está funcionando correctamente.

## 3. Prueba de reintentos automáticos

Para probar el sistema de reintentos (si es posible en un entorno de desarrollo):

1. Temporalmente, modifica la URL del webhook en la función `notify_project_change_direct` a una URL no válida
2. Realiza un cambio en un proyecto para activar el trigger
3. Verifica en `webhook_logs` que se registraron hasta 3 intentos fallidos:
   ```sql
   SELECT * FROM webhook_logs 
   WHERE registro_id = 'id-del-proyecto-modificado' 
   ORDER BY tiempo DESC;
   ```
4. Restaura la URL correcta y realiza otro cambio para verificar que vuelve a funcionar

## 4. Verificación de la búsqueda vectorial

Prueba la funcionalidad de búsqueda vectorial en n8n:

1. Crea un flujo de trabajo que utilice el nodo "Vector Store - Supabase"
2. Configura el nodo para usar la tabla `proyecto_vector`
3. Realiza una consulta de prueba como "proyecto con piscina" o "departamento en Santiago"
4. Verifica que los resultados sean relevantes y que la consulta no arroje errores

## 5. Verificación de aislamiento multi-tenant

Prueba el aislamiento multi-tenant realizando una búsqueda para un tenant específico:

```sql
SELECT 
  count(*) 
FROM 
  proyecto_vector 
WHERE 
  inmobiliaria_id = 'id-de-inmobiliaria';
```

Compara con la cantidad de proyectos para ese tenant:

```sql
SELECT 
  count(*) 
FROM 
  proyectos 
WHERE 
  inmobiliaria_id = 'id-de-inmobiliaria';
```

Los números deberían ser similares (puede haber pequeñas diferencias debido a cambios recientes).

## 6. Verificación de rendimiento

Para verificar el rendimiento, monitorea los logs y presta atención a:

- Tiempo de procesamiento de cada webhook (registrado en `webhook_logs`)
- Latencia entre cambios en proyectos y actualizaciones de vectores
- Errores o reintentos en la generación de embeddings

Usando Supabase, también puedes medir el rendimiento de las consultas vectoriales:

```sql
EXPLAIN ANALYZE 
SELECT 
  id, 
  content, 
  metadata, 
  1 - (embedding <=> '[0.1, 0.2, ...]'::vector) as similarity 
FROM 
  proyecto_vector 
WHERE 
  inmobiliaria_id = 'id-de-inmobiliaria' 
ORDER BY 
  embedding <=> '[0.1, 0.2, ...]'::vector 
LIMIT 5;
```

Reemplaza `[0.1, 0.2, ...]` con un vector real de prueba.

## 7. Verificación del webhook endpoint

Puedes probar directamente el endpoint de webhook con una llamada manual:

```bash
curl -X POST https://tu-servicio-url.railway.app/webhook/project-update \
  -H "Content-Type: application/json" \
  -d '{
    "inmobiliaria_id": "uuid-del-tenant",
    "project_id": "uuid-del-proyecto",
    "event": "UPDATE",
    "timestamp": "2025-03-23T00:00:00Z"
  }'
```

## 8. Monitoreo de errores

Verifica si hay errores en los logs del servicio. Los errores comunes incluyen:

- Problemas de conexión a Supabase
- Errores en la API de OpenAI
- Problemas de memoria o rendimiento
- Fallos en el envío de webhooks (visibles en `webhook_logs`)

## Resolución de problemas

Si encuentras problemas durante la validación:

1. **Problemas con webhooks**: Verifica la tabla `webhook_logs` para identificar errores específicos
2. **Errores de búsqueda vectorial**: Asegúrate de que la función `match_documents` está correctamente definida
3. **Problemas de rendimiento**: Monitorea los tiempos de procesamiento en los logs
4. **Errores de memoria**: Considera aumentar los recursos asignados al servicio en Railway

## Mejoras futuras

Considera implementar:

- Monitoreo más detallado con métricas de Prometheus
- Alertas automáticas para errores en webhooks
- Pruebas automáticas para verificar la calidad de los resultados de búsqueda
- Optimización de índices para mejorar el rendimiento de búsqueda
- Autenticación para el endpoint de webhook