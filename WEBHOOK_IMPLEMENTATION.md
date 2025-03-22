# Implementación de Webhooks en MCP Vector Sync

## Resumen de Cambios

Se ha implementado un sistema basado en webhooks para reducir costos y optimizar recursos. Los cambios incluyen:

1. Adición de un endpoint de webhook en el servidor HTTP existente
2. Creación de un método para procesar proyectos individuales
3. Ajuste del intervalo de polling a 6 horas como respaldo
4. Script SQL para configurar triggers en Supabase

## ¿Cómo funciona?

### Arquitectura Híbrida

El sistema ahora utiliza un enfoque híbrido:

- **Principal**: Sistema basado en eventos/webhooks
  - Supabase envía notificaciones cuando hay cambios en proyectos
  - El frontend también puede enviar señales directamente

- **Respaldo**: Polling con intervalo extenso (6 horas)
  - Garantiza que ningún cambio se pierda en caso de fallos en webhooks

### Flujo de Trabajo

1. Cuando un proyecto se crea o actualiza en Supabase:
   - Un trigger PostgreSQL envía un webhook al MCP
   - El MCP procesa solo ese proyecto específico
   - Se actualiza el embedding correspondiente

2. Como respaldo, cada 6 horas:
   - El sistema realiza una verificación completa
   - Identifica y procesa cualquier proyecto que pudiera haberse perdido

## Configuración en Supabase

Para habilitar los webhooks en Supabase, ejecuta el script SQL proporcionado (`webhook_setup.sql`) en el SQL Editor de Supabase:

1. Accede al panel de Supabase
2. Ve a SQL Editor
3. Copia y pega el contenido de `webhook_setup.sql`
4. Ejecuta el script

El script:
- Crea la extensión HTTP si no existe
- Define una función que envía webhooks cuando los proyectos cambian
- Establece un trigger en la tabla `proyectos`
- Crea una tabla opcional para registrar los webhooks (útil para debugging)

## Integración con Frontend

Puedes enviar webhooks directamente desde el frontend como respaldo adicional:

```typescript
// En tu componente React que actualiza proyectos
const updateProjectAndNotify = async (projectData) => {
  // 1. Guardar en Supabase normalmente
  const { data, error } = await supabase
    .from('proyectos')
    .upsert(projectData);
    
  if (error) throw error;
  
  // 2. Notificar también al MCP directamente (respaldo)
  try {
    await fetch('https://mcpvectorsync-production.up.railway.app/webhook/project-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inmobiliaria_id: projectData.inmobiliaria_id,
        project_id: data[0]?.id || projectData.id,
        source: 'frontend',
        timestamp: new Date().toISOString()
      }),
    });
  } catch (err) {
    console.error('Error notificando al MCP:', err);
    // Continuar normalmente, ya que el trigger de Supabase debería funcionar
  }
  
  return data;
};
```

## Beneficios del Nuevo Sistema

1. **Reducción significativa de costos**
   - Menos consultas a Supabase
   - Menor uso de CPU y memoria en Railway
   - Procesamiento más eficiente de recursos

2. **Mayor eficiencia**
   - Actualización inmediata de embeddings tras cambios
   - Solo se procesan los proyectos modificados
   - No hay que esperar al siguiente ciclo de polling

3. **Mejor escalabilidad**
   - El sistema puede manejar más tenants sin aumentar proporcionalmente los costos
   - Menor carga en la base de datos

## Consideraciones de Seguridad

En un entorno de producción, considera implementar:

1. **Autenticación para webhooks**:
   - Añadir un token de seguridad en los headers
   - Implementar firma HMAC para verificar el origen

2. **Límites de tasa (rate limiting)**:
   - Proteger contra ataques DoS
   - Limitar el número de solicitudes por IP

3. **Validación estricta**:
   - Validar minuciosamente los datos recibidos
   - Implementar timeout para solicitudes largas

## Monitoreo y Debugging

- La tabla `webhook_logs` en Supabase registra cada webhook enviado
- Los logs del MCP Vector Sync ahora incluyen información detallada sobre webhooks recibidos
- Considera implementar métricas para comparar eficacia de webhooks vs polling