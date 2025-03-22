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
    model: z.string().default('text-embedding-ada-002'),
    maxRetries: z.number().int().positive().default(3),
  }),

  // Monitor
  monitor: z.object({
    interval: z.number().int().positive().default(10000),
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

function createConfig(): Config {
  try {
    return configSchema.parse({
      supabase: {
        url: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'text-embedding-ada-002',
        maxRetries: parseNumber(process.env.MAX_RETRIES, 3),
      },
      monitor: {
        interval: parseNumber(process.env.MONITOR_INTERVAL, 60000),
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
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Error de validación en la configuración:', error.errors);
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