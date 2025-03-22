import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config, logger } from "./config/config.js";
import { monitorService } from "./lib/monitor.js";
import { VectorSyncStatus } from "./types/vector.js";
import { startHealthServer } from "./health.js";

// Crear servidor de health check para monitoreo
const healthServer = startHealthServer(3000);

// Crear servidor MCP
const server = new McpServer({
  name: "vector-sync",
  version: "1.0.0"
});

// Tool: Iniciar sincronización para un tenant específico
server.tool(
  "sync-tenant",
  {
    tenant_id: z.string().uuid(),
    force: z.boolean().optional()
  },
  async ({ tenant_id, force }) => {
    logger.info({ tenant_id, force }, "Iniciando sincronización manual");
    
    try {
      await monitorService.forceSyncTenant(tenant_id);
      return {
        content: [{
          type: "text",
          text: `Sincronización iniciada exitosamente para tenant ${tenant_id}`
        }]
      };
    } catch (error) {
      logger.error({ error, tenant_id }, "Error en sincronización manual");
      return {
        content: [{
          type: "text",
          text: `Error en sincronización: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Obtener estado de sincronización
server.tool(
  "get-sync-status",
  {
    tenant_id: z.string().uuid()
  },
  async ({ tenant_id }) => {
    logger.info({ tenant_id }, "Consultando estado de sincronización");
    
    try {
      const status = monitorService.getTenantStatus(tenant_id);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(status || {
            inmobiliaria_id: tenant_id,
            status: 'NO_DATA',
            message: 'No hay datos de sincronización para este tenant'
          }, null, 2)
        }]
      };
    } catch (error) {
      logger.error({ error, tenant_id }, "Error al consultar estado");
      return {
        content: [{
          type: "text",
          text: `Error al consultar estado: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Controlar el monitor (iniciar/detener)
server.tool(
  "control-monitor",
  {
    action: z.enum(['start', 'stop'])
  },
  async ({ action }) => {
    try {
      if (action === 'start') {
        await monitorService.start();
        return {
          content: [{
            type: "text",
            text: "Monitor iniciado exitosamente"
          }]
        };
      } else {
        monitorService.stop();
        return {
          content: [{
            type: "text",
            text: "Monitor detenido exitosamente"
          }]
        };
      }
    } catch (error) {
      logger.error({ error, action }, "Error al controlar monitor");
      return {
        content: [{
          type: "text",
          text: `Error al ${action === 'start' ? 'iniciar' : 'detener'} monitor: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }],
        isError: true
      };
    }
  }
);

// Recurso: Estado de vectores por tenant
server.resource(
  "vector-status",
  "vector://status/{tenant_id}",
  async (uri) => {
    const tenantId = uri.pathname.split('/').pop();
    if (!tenantId) {
      throw new Error('Tenant ID no proporcionado');
    }

    logger.info({ tenantId }, "Consultando estado de vectores");

    try {
      const status: VectorSyncStatus = monitorService.getTenantStatus(tenantId) || {
        inmobiliaria_id: tenantId,
        totalProjects: 0,
        processedProjects: 0,
        failedProjects: 0,
        lastSync: new Date(0).toISOString(),
        status: 'NO_DATA',
        performance: {
          averageProcessingTime: 0,
          tokenCount: 0,
          costEstimate: 0
        }
      };

      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(status, null, 2)
        }]
      };
    } catch (error) {
      logger.error({ error, tenantId }, "Error al obtener estado de vectores");
      throw error;
    }
  }
);

// Iniciar servidor con transporte stdio
const transport = new StdioServerTransport();

// Manejar señales de terminación
process.on('SIGINT', async () => {
  logger.info("Recibida señal SIGINT, cerrando servidor...");
  monitorService.stop();
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info("Recibida señal SIGTERM, cerrando servidor...");
  monitorService.stop();
  await server.close();
  process.exit(0);
});

// Conectar servidor
server.connect(transport).then(() => {
  logger.info(
    { 
      config: {
        monitor: {
          interval: config.monitor.interval,
          batchSize: config.monitor.batchSize
        }
      }
    },
    "Servidor MCP Vector Sync iniciado"
  );
  
  // Iniciar monitor automáticamente
  monitorService.start().catch((error) => {
    logger.error({ error }, "Error al iniciar monitor");
  });
}).catch((error) => {
  logger.error({ error }, "Error al iniciar servidor MCP");
  process.exit(1);
});