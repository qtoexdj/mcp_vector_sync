import http from 'http';
import { logger } from './config/config.js';
import { monitorService } from './lib/monitor.js';

export function startHealthServer(port = 3000) {
  // Creamos un servidor HTTP para health checks y webhooks
  const server = http.createServer((req, res) => {
    // Endpoint de health check
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString()
      }));
      return;
    }
    
    // Endpoint para webhooks de actualización de proyectos
    if (req.url === '/webhook/project-update' && req.method === 'POST') {
      const startTime = Date.now();
      let body = '';
      
      // Timeout para el procesamiento de webhooks (30 segundos)
      const timeout = setTimeout(() => {
        logger.error('Timeout procesando webhook - operación cancelada después de 30 segundos');
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Timeout procesando webhook',
          processingTimeMs: Date.now() - startTime
        }));
      }, 30000);
      
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          // Registrar la recepción del webhook
          const receivedAt = new Date().toISOString();
          logger.info({ bodyLength: body.length, receivedAt }, 'Webhook recibido: cuerpo del mensaje');
          
          let data;
          try {
            data = JSON.parse(body);
            logger.info({
              data,
              event: data.event,
              tenantId: data.inmobiliaria_id,
              projectId: data.project_id
            }, 'Webhook recibido: actualización de proyecto');
          } catch (error) {
            clearTimeout(timeout);
            logger.error({ error, body }, 'Error parseando JSON del webhook');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'JSON inválido',
              processingTimeMs: Date.now() - startTime,
              receivedAt
            }));
            return;
          }
          
          if (!data.inmobiliaria_id || !data.project_id) {
            clearTimeout(timeout);
            logger.warn({ data }, 'Datos incompletos en webhook');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'Datos incompletos: se requiere inmobiliaria_id y project_id',
              processingTimeMs: Date.now() - startTime,
              receivedAt
            }));
            return;
          }
          
          // Procesar solo el proyecto específico
          try {
            // Capturar el tiempo de inicio del procesamiento
            const processStartTime = Date.now();
            logger.info({
              tenantId: data.inmobiliaria_id,
              projectId: data.project_id,
              event: data.event || 'INSERT/UPDATE'
            }, 'Iniciando procesamiento de proyecto por webhook');
            
            await monitorService.processProject(data.inmobiliaria_id, data.project_id);
            
            clearTimeout(timeout);
            const processingTime = Date.now() - startTime;
            const processingTimeMs = Date.now() - processStartTime;
            
            logger.info({
              tenantId: data.inmobiliaria_id,
              projectId: data.project_id,
              processingTimeMs,
              totalTimeMs: processingTime
            }, 'Webhook procesado correctamente');
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: `Proyecto ${data.project_id} procesado correctamente`,
              processingTimeMs,
              totalTimeMs: processingTime,
              receivedAt
            }));
          } catch (error) {
            clearTimeout(timeout);
            const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
            const errorStack = error instanceof Error ? error.stack : undefined;
            
            logger.error({
              error,
              errorMessage,
              errorStack,
              data,
              tenantId: data.inmobiliaria_id,
              projectId: data.project_id,
              processingTimeMs: Date.now() - startTime
            }, 'Error procesando webhook');
            
            // Determinar si es un error relacionado con condición de carrera
            const isRaceCondition = errorMessage.includes('no encontrado') ||
                                   errorMessage.includes('not found');
            
            // Código de estado basado en el tipo de error
            const statusCode = isRaceCondition ? 404 : 500;
            
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: errorMessage,
              isRaceCondition: isRaceCondition,
              // Si es un error de carrera, sugerir reintentar
              retryAfter: isRaceCondition ? 2 : undefined, // Segundos para reintentar
              processingTimeMs: Date.now() - startTime,
              receivedAt
            }));
          }
        } catch (error) {
          clearTimeout(timeout);
          logger.error({ error }, 'Error inesperado procesando webhook');
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Error interno del servidor',
            details: error instanceof Error ? error.message : 'Error desconocido',
            processingTimeMs: Date.now() - startTime
          }));
        }
      });
      
      return;
    }
    
    // Ruta no encontrada
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Ruta no encontrada'
    }));
  });

  server.listen(port, () => {
    logger.info(`Servidor HTTP corriendo en puerto ${port}`);
  });

  // Manejar errores del servidor
  server.on('error', (error) => {
    logger.error({ error }, 'Error en servidor HTTP');
  });

  // Manejar cierre limpio
  const shutdown = () => {
    server.close(() => {
      logger.info('Servidor HTTP cerrado');
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}