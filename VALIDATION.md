# Validación de MCP Vector Sync

Este documento proporciona instrucciones paso a paso para validar que el servicio MCP Vector Sync está funcionando correctamente después del despliegue.

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

## 2. Verificación de la sincronización de vectores

Para verificar que la sincronización de vectores está funcionando:

1. Realiza un cambio en un proyecto en Supabase (actualiza cualquier campo)
2. Espera al menos un ciclo completo de sincronización (normalmente 1 minuto)
3. Consulta la tabla `proyecto_vector` para verificar que se ha actualizado el embedding:

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

Si `vector_update` es posterior a `proyecto_update`, la sincronización está funcionando correctamente.

## 3. Verificación de la búsqueda vectorial

Prueba la funcionalidad de búsqueda vectorial en n8n:

1. Crea un flujo de trabajo que utilice el nodo "Vector Store - Supabase"
2. Configura el nodo para usar la tabla `proyecto_vector`
3. Realiza una consulta de prueba como "proyecto con piscina" o "departamento en Santiago"
4. Verifica que los resultados sean relevantes y que la consulta no arroje errores

## 4. Verificación de aislamiento multi-tenant

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

## 5. Verificación de rendimiento

Para verificar el rendimiento, monitorea los logs y presta atención a:

- Tiempo de procesamiento de proyectos
- Tamaño de los lotes procesados
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

## 6. Monitoreo de errores

Verifica si hay errores en los logs del servicio. Los errores comunes incluyen:

- Problemas de conexión a Supabase
- Errores en la API de OpenAI
- Problemas de memoria o rendimiento

## Resolución de problemas

Si encuentras problemas durante la validación:

1. **Problemas de sincronización**: Verifica las credenciales de Supabase y OpenAI.
2. **Errores de búsqueda vectorial**: Asegúrate de que la función `match_documents` está correctamente definida.
3. **Problemas de rendimiento**: Ajusta los parámetros `BATCH_SIZE` y `MAX_CONCURRENT` en las variables de entorno.
4. **Errores de memoria**: Considera aumentar los recursos asignados al servicio en Railway.

## Mejoras futuras

Considera implementar:

- Monitoreo más detallado con métricas de Prometheus
- Alertas automáticas para errores de sincronización
- Pruebas automáticas para verificar la calidad de los resultados de búsqueda
- Optimización de índices para mejorar el rendimiento de búsqueda