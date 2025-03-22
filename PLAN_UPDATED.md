# Plan de Implementación Actualizado: MCP Vector Sync

## Descripción
Servicio MCP que mantiene actualizados los vectores de búsqueda por tenant, monitoreando cambios en la tabla proyectos de Supabase y generando embeddings usando OpenAI.

## Arquitectura MCP

### Configuración del Servidor
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "vector-sync",
  version: "1.0.0"
});
```

### Estructura del Proyecto
```
MCP/MCP Vector Sync/
├── package.json        # Dependencias y scripts
├── tsconfig.json       # Configuración de TypeScript
├── src/
│   ├── index.ts       # Punto de entrada
│   ├── server.ts      # Configuración del servidor MCP
│   ├── config/
│   │   └── config.ts  # Configuración y variables de entorno
│   ├── lib/
│   │   ├── supabase.ts     # Cliente y operaciones de Supabase
│   │   ├── openai.ts       # Cliente y operaciones de OpenAI
│   │   └── monitor.ts      # Sistema de monitoreo de cambios
│   ├── types/
│   │   ├── project.ts      # Tipos para proyectos
│   │   └── vector.ts       # Tipos para vectores
│   └── tools/
│       ├── sync.ts         # Herramienta de sincronización
│       └── status.ts       # Herramienta de estado
└── tests/               # Pruebas unitarias
```

## Implementación de Componentes

### 1. Herramientas MCP

```typescript
// Herramienta de Sincronización Manual
server.tool(
  "sync-tenant",
  {
    tenant_id: z.string().uuid(),
    force: z.boolean().optional()
  },
  async ({ tenant_id, force }) => {
    // Lógica de sincronización
  }
);

// Herramienta de Estado
server.tool(
  "sync-status",
  {
    tenant_id: z.string().uuid()
  },
  async ({ tenant_id }) => {
    // Retornar estado de sincronización
  }
);
```

### 2. Recursos MCP

```typescript
// Estado del Vector por Tenant
server.resource(
  "vector-status",
  new ResourceTemplate("vector://status/{tenant_id}", { list: undefined }),
  async (uri, { tenant_id }) => {
    // Retornar estado de vectores
  }
);
```

### 3. Sistema de Monitoreo

```typescript
class ChangeMonitor {
  private lastCheck: Date;
  private running: boolean;

  async start() {
    this.running = true;
    while (this.running) {
      await this.checkForChanges();
      await this.sleep(10000); // 10 segundos entre checks
    }
  }

  private async checkForChanges() {
    // Consultar cambios en Supabase
    // Procesar cambios por tenant
    // Actualizar vectores
  }
}
```

## Componentes Principales

### 1. Cliente Supabase
```typescript
export class SupabaseClient {
  constructor(private supabase: SupabaseClient) {}

  async getProjectChanges(lastCheck: Date, tenantId: string) {
    return await this.supabase
      .from('proyectos')
      .select('*')
      .eq('inmobiliaria_id', tenantId)
      .gt('updated_at', lastCheck.toISOString());
  }

  async updateVector(data: VectorData) {
    return await this.supabase
      .from('proyecto_vector')
      .upsert(data);
  }
}
```

### 2. Cliente OpenAI
```typescript
export class OpenAIClient {
  constructor(private openai: OpenAIApi) {}

  async generateEmbedding(content: string): Promise<number[]> {
    const response = await this.openai.createEmbedding({
      model: "text-embedding-ada-002",
      input: content
    });
    return response.data.data[0].embedding;
  }
}
```

## Flujo de Sincronización

1. Monitor detecta cambios en `proyectos`
2. Filtra cambios por tenant
3. Genera embeddings para contenido actualizado
4. Actualiza tabla `proyectos_vector`
5. Registra resultados y errores

## Configuración Necesaria

### Variables de Entorno
```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
MONITOR_INTERVAL=10000
LOG_LEVEL=info
```

### SQL para Tabla Vectores
```sql
CREATE TABLE proyecto_vector (
  id UUID PRIMARY KEY,
  inmobiliaria_id UUID NOT NULL,
  project_id UUID NOT NULL,
  content_embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (inmobiliaria_id) REFERENCES inmobiliarias(id)
);

CREATE INDEX idx_proyecto_vector_tenant ON proyecto_vector(inmobiliaria_id);
```

## Plan de Implementación

### Fase 1: Configuración Base (2 días)
1. Inicializar proyecto con TypeScript y dependencias
2. Configurar estructura de archivos
3. Implementar conexiones básicas con Supabase y OpenAI

### Fase 2: Core MCP (3 días)
1. Implementar servidor MCP
2. Desarrollar herramientas básicas
3. Configurar recursos de estado

### Fase 3: Sistema de Sincronización (4 días)
1. Implementar monitor de cambios
2. Desarrollar lógica de generación de embeddings
3. Crear sistema de actualización de vectores

### Fase 4: Testing y Optimización (3 días)
1. Implementar pruebas unitarias
2. Realizar pruebas de integración
3. Optimizar rendimiento y manejo de errores

## Consideraciones de Seguridad

1. Validación estricta de tenant_id
2. Rate limiting por tenant
3. Logging seguro (sin datos sensibles)
4. Manejo seguro de credenciales

## Métricas de Éxito

1. Tiempo de sincronización < 5 minutos
2. Zero data leaks entre tenants
3. 99.9% uptime
4. Costos optimizados por tenant
5. Latencia < 100ms para consultas de estado