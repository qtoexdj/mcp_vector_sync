# Optimización de MCP Vector Sync con Webhooks

Este documento explica cómo se ha optimizado el sistema MCP Vector Sync para reducir costos y mejorar la eficiencia utilizando un enfoque basado en eventos (webhooks).

## Cambios implementados

Se han realizado los siguientes cambios en el sistema:

1. **Servidor HTTP mejorado**: Se ha añadido un endpoint `/webhook/project-update` que recibe notificaciones cuando hay cambios en los proyectos.

2. **Procesamiento individual**: Se ha implementado una función para procesar proyectos específicos cuando se recibe una notificación.

3. **Intervalos de polling optimizados**: Se ha aumentado el intervalo de polling a 6 horas como sistema de respaldo.

4. **Scripts SQL para Supabase**: Se ha proporcionado un script para configurar triggers en Supabase que envían webhooks automáticamente.

5. **Ejemplo de integración frontend**: Se ha proporcionado un ejemplo de cómo el frontend puede notificar directamente al MCP después de hacer cambios.

## Ventajas del nuevo enfoque

- **Reducción de costos**: Menos consultas a Supabase y menor uso de recursos en Railway.
- **Mayor eficiencia**: Procesamiento inmediato de cambios sin esperar al siguiente ciclo de polling.
- **Mejor escalabilidad**: El sistema puede manejar más tenants sin aumentar proporcionalmente los costos.
- **Sistema robusto**: El polling de respaldo garantiza que ningún cambio se pierda.

## Cómo usar el nuevo sistema

### 1. Configuración en Supabase

Ejecuta el script `webhook_setup.sql` en el SQL Editor de Supabase para configurar los triggers automáticos.

### 2. Integración con el frontend (opcional)

Si deseas enviar notificaciones directamente desde el frontend (como respaldo adicional), puedes usar el código de ejemplo en `frontend-integration-example.tsx`. Esto es útil si quieres actualizar los embeddings inmediatamente después de que el usuario realice cambios.

### 3. Monitoreo

- Los logs del MCP Vector Sync ahora incluyen información detallada sobre los webhooks recibidos.
- La tabla `webhook_logs` en Supabase (creada por el script) registra cada webhook enviado para debugging.

## Configuración del webhook

El webhook está configurado para escuchar en:
```
https://mcpvectorsync-production.up.railway.app/webhook/project-update
```

El payload esperado para el webhook debe incluir:
```json
{
  "inmobiliaria_id": "uuid-del-tenant",
  "project_id": "uuid-del-proyecto",
  "event": "INSERT|UPDATE", // opcional
  "timestamp": "2025-03-22T17:45:00Z" // opcional
}
```

## Consideraciones de seguridad

En un entorno de producción, considera:

1. Implementar autenticación para los webhooks (tokens o firmas HMAC)
2. Configurar límites de tasa (rate limiting)
3. Implementar validación estricta de los datos recibidos

## Sistema híbrido

El sistema ahora utiliza un enfoque híbrido:

- **Principal**: Sistema basado en eventos (webhooks)
- **Respaldo**: Polling con intervalo extenso (6 horas)

Este enfoque híbrido garantiza que el sistema sea tanto eficiente como robusto.

## Archivos modificados

- `src/health.ts`: Se ha añadido un endpoint para webhooks
- `src/lib/monitor.ts`: Se ha añadido un método para procesar proyectos específicos
- `src/lib/supabase.ts`: Se ha añadido un método para obtener un proyecto específico
- `src/config/config.ts`: Se ha aumentado el intervalo de polling a 6 horas

## Documentación adicional

Para más detalles sobre la implementación, consulta:

- `WEBHOOK_IMPLEMENTATION.md`: Documentación técnica detallada
- `webhook_setup.sql`: Script para configurar los triggers en Supabase
- `frontend-integration-example.tsx`: Ejemplo de integración con el frontend