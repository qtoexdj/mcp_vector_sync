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
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          logger.info({ data }, 'Webhook recibido: actualización de proyecto');
          
          if (!data.inmobiliaria_id || !data.project_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'Datos incompletos: se requiere inmobiliaria_id y project_id'
            }));
            return;
          }
          
          // Procesar solo el proyecto específico
          try {
            await monitorService.processProject(data.inmobiliaria_id, data.project_id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: `Proyecto ${data.project_id} procesado correctamente`
            }));
          } catch (error) {
            logger.error({ error, data }, 'Error procesando webhook');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Error interno del servidor'
            }));
          }
        } catch (error) {
          logger.error({ error }, 'Error parseando JSON del webhook');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'JSON inválido'
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