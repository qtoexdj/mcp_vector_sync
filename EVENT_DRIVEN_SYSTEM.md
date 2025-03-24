# Sistema MCP Vector Sync: Enfoque Basado 100% en Eventos

Este documento describe el nuevo enfoque basado completamente en eventos implementado en MCP Vector Sync para optimizar el rendimiento y reducir costos.

## Cambios Principales

Hemos realizado los siguientes cambios en el sistema:

1. **Eliminación del polling periódico**: Eliminamos el sistema de verificación cada 6 horas para reducir costos y consultas innecesarias.

2. **Webhooks directos desde Supabase**: Implementamos un trigger que envía webhooks directamente desde Supabase cuando ocurre un cambio en los proyectos.

3. **Retraso ampliado para nuevas inserciones**: Aumentamos el tiempo de espera para nuevas inserciones de 2 a 20 segundos para garantizar mayor consistencia.

4. **Sistema de reintentos mejorado**: Añadimos reintentos automáticos con backoff exponencial en el trigger de Supabase.

## Arquitectura del Nuevo Sistema

### 1. Flujo de Eventos

```
[Cambio en proyectos] → [Trigger Supabase] → [Envío de webhook] → [MCP Vector Sync] → [Generación de vector]
```

### 2. Manejo de Fallos

El sistema implementa múltiples capas de protección:

- **Reintentos automáticos**: El trigger intenta enviar el webhook hasta 3 veces antes de desistir
- **Backoff exponencial**: Esperas de 2, 4 y 8 segundos entre intentos
- **Tabla de respaldo**: Si todos los intentos fallan, se guarda en `pending_webhooks`
- **Registro de auditoría**: Todos los intentos se registran en `webhook_logs`

### 3. Consistencia de Datos

Para garantizar la consistencia:

- Se aplica un retraso de 20 segundos para nuevas inserciones (INSERT)
- Este tiempo permite que la transacción se complete totalmente antes de procesar el webhook
- Reduce significativamente las condiciones de carrera

## Ventajas del Nuevo Sistema

### Reducción de Costos

- **Eliminación de consultas periódicas**: Solo se realizan consultas cuando hay cambios reales
- **Menos uso de recursos en Railway**: El servidor permanece inactivo la mayor parte del tiempo
- **Menor consumo de API en Supabase**: Se eliminan las consultas periódicas a todas las tablas

### Mayor Eficiencia

- **Procesamiento inmediato**: Los cambios se procesan en tiempo real (con el retraso controlado)
- **Aprovechamiento de recursos**: Solo se utilizan recursos cuando realmente se necesitan
- **Sin tiempos de espera**: No hay que esperar al siguiente ciclo de polling (antes 6 horas)

### Sistema Más Limpio

- **Arquitectura simplificada**: Enfoque puramente event-driven
- **Menos puntos de fallo**: Eliminación de componentes redundantes
- **Código más mantenible**: Flujo de datos más directo y trazable

## Cómo Funciona el Nuevo Sistema

1. **Cuando se modifica un proyecto en Supabase**:
   - Se activa el trigger `projects_change_trigger`
   - La función `notify_project_change_direct()` envía un webhook HTTP directamente
   - Se registra el intento en `webhook_logs`

2. **En caso de éxito**:
   - El MCP Vector Sync recibe la notificación
   - Espera 20 segundos si es una inserción nueva
   - Procesa solo el proyecto específico mencionado en el payload
   - Actualiza el vector correspondiente

3. **En caso de fallo**:
   - El trigger reintenta hasta 3 veces con esperas progresivas
   - Si todos los intentos fallan, se registra en `pending_webhooks` como respaldo
   - El job cron que procesa `pending_webhooks` ha sido desactivado pero puede reactivarse si es necesario

## Implementación

### SQL para Supabase

El archivo `direct_webhook.sql` contiene todos los cambios necesarios:

- Creación de la función `notify_project_change_direct()`
- Configuración del trigger para usar la nueva función
- Desactivación del job cron de procesamiento

### Cambios en el Código

- `src/health.ts`: Aumento del tiempo de retraso a 20 segundos
- `src/index.ts`: Eliminación del inicio automático del monitoreo periódico

## Consideraciones de Seguridad

Igual que antes, en un entorno de producción se recomienda:

1. Implementar autenticación para los webhooks
2. Configurar límites de tasa (rate limiting)
3. Implementar validación estricta de los datos

## Monitoreo y Mantenimiento

- La tabla `webhook_logs` registra todos los intentos de envío
- Proporciona información valiosa para debugging y auditoría
- Permite identificar patrones de fallos o problemas recurrentes

## Conclusión

El nuevo sistema basado 100% en eventos ofrece un enfoque más eficiente, económico y robusto para mantener sincronizados los vectores con los cambios en proyectos, eliminando el desperdicio de recursos mientras mantiene todas las capacidades del sistema anterior.