import http from 'http';
import { logger } from './config/config.js';

// Creamos un servidor HTTP simple para health checks
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

export function startHealthServer(port = 3000) {
  server.listen(port, () => {
    logger.info(`Health check server running on port ${port}`);
  });

  // Manejar errores del servidor
  server.on('error', (error) => {
    logger.error({ error }, 'Error en servidor de health check');
  });

  // Manejar cierre limpio
  const shutdown = () => {
    server.close(() => {
      logger.info('Servidor de health check cerrado');
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}