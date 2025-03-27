import { z } from 'zod';
import dotenv from 'dotenv';
// @ts-ignore - pino tiene problemas con los tipos en ESM
import pino from 'pino';

// Cargar variables de entorno
dotenv.config();

// Schema de validación para la configuración
const configSchema = z.object({
  // Supabase
  supabase: z.object({
    url: z.string().url('Supabase URL inválida'),
    serviceRoleKey: z.string().min(1, 'Service role key es requerida'),
  }),

  // OpenAI
  openai: z.object({
    apiKey: z.string().min(1, 'OpenAI API key es requerida'),
    model: z.string().default('text-embedding-3-small'),
    maxRetries: z.number().int().positive().default(3),
  }),

  // Monitor
  monitor: z.object({
    // Intervalo alto por defecto ya que ahora el sistema usa principalmente webhooks
    interval: z.number().int().positive().default(21600000), // 6 horas por defecto
    batchSize: z.number().int().positive().default(50),
    maxConcurrent: z.number().int().positive().default(3),
  }),

  // Rate Limiting
  rateLimit: z.object({
    requestsPerMinute: z.number().int().positive().default(100),
    concurrent: z.number().int().positive().default(5),
  }),

  // Logging
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    pretty: z.boolean().default(false),
  }),
});

// Tipo inferido del schema
type Config = z.infer<typeof configSchema>;

// Función para crear la configuración validada
// Función auxiliar para convertir string a número con valor predeterminado
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Verificar si estamos en modo demo
const isDemoMode = process.env.DEMO_MODE === 'true';

function createConfig(): Config {
  try {
    // Verificar que las variables requeridas estén presentes y no vacías
    if (!isDemoMode && (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || !process.env.OPENAI_API_KEY?.trim())) {
      throw new Error('Variables de entorno requeridas no están configuradas. Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y OPENAI_API_KEY, o active el modo DEMO con DEMO_MODE=true');
    }

    // Configuración con valores predeterminados para modo demo o producción
    const config = {
      supabase: {
        url: isDemoMode ? 'https://demo-project.supabase.co' : process.env.SUPABASE_URL,
        serviceRoleKey: isDemoMode ? 'demo-service-role-key' : process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      openai: {
        apiKey: isDemoMode ? 'demo-openai-api-key' : process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'text-embedding-3-small',
        maxRetries: parseNumber(process.env.MAX_RETRIES, 3),
      },
      monitor: {
        // Intervalo largo por defecto (6 horas) para el modo de respaldo
        // Se puede anular con la variable de entorno MONITOR_INTERVAL
        interval: parseNumber(process.env.MONITOR_INTERVAL, 21600000), // 6 horas (21600000 ms)
        batchSize: parseNumber(process.env.BATCH_SIZE, 50),
        maxConcurrent: parseNumber(process.env.MAX_CONCURRENT, 3),
      },
      rateLimit: {
        requestsPerMinute: parseNumber(process.env.RATE_LIMIT_PER_TENANT, 100),
        concurrent: parseNumber(process.env.CONCURRENT_REQUESTS, 5),
      },
      logging: {
        level: (process.env.LOG_LEVEL as any) || 'info',
        pretty: process.env.NODE_ENV === 'development',
      },
    };

    if (isDemoMode) {
      console.warn('⚠️ Ejecutando en MODO DEMO - No se realizarán conexiones reales a Supabase u OpenAI');
    }

    return configSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Error de validación en la configuración:', error.errors);
      
      if (isDemoMode) {
        console.error('Asegúrate de que DEMO_MODE=true esté configurado correctamente en las variables de entorno');
      } else {
        console.error('Variables de entorno requeridas: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY');
      }
    }
    throw error;
  }
}

// Crear instancia de configuración
export const config = createConfig();

// Crear logger con tipos ignorados para evitar problemas con ESM
export const logger = pino({
  level: config.logging.level,
  transport: config.logging.pretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      }
    : undefined,
}) as any;

// Exportar tipos útiles
export type { Config };

// Constants
export const VECTOR_DIMENSIONS = 1536; // Dimensiones del modelo text-embedding-ada-002
export const MAX_CONTENT_LENGTH = 8192; // Máximo número de tokens para embedding
export const BATCH_TIMEOUT = 30000; // 30 segundos timeout para procesamiento de batch
export const HEALTH_CHECK_INTERVAL = 60000; // 1 minuto entre health checks
export const MAX_RETRY_DELAY = 300000; // 5 minutos máximo delay entre reintentos