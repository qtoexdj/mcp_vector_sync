import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config, logger } from '../config/config.js';
import { Project } from '../types/project.js';
import { VectorData } from '../types/vector.js';

export class SupabaseService {
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      {
        auth: {
          persistSession: false,
        },
      }
    );
  }

  /**
   * Obtiene los proyectos modificados desde una fecha específica para un tenant
   */
  async getModifiedProjects(
    tenantId: string,
    since: Date
  ): Promise<Project[]> {
    try {
      const { data, error } = await this.client
        .from('proyectos')
        .select('*')
        .eq('inmobiliaria_id', tenantId)
        .gte('updated_at', since.toISOString());

      if (error) {
        logger.error({ error, tenantId }, 'Error al obtener proyectos modificados');
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ error, tenantId }, 'Error en getModifiedProjects');
      throw error;
    }
  }

  /**
   * Obtiene un proyecto específico por su ID
   * Implementa reintentos para manejar condiciones de carrera con inserciones nuevas
   */
  async getProject(tenantId: string, projectId: string, maxRetries = 3): Promise<Project | null> {
    // Usar backoff exponencial para los reintentos
    const getBackoffTime = (attempt: number) => Math.min(Math.pow(2, attempt) * 300, 5000);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Verificar que tenemos las credenciales correctas
        logger.info({
          url: config.supabase.url,
          hasServiceKey: !!config.supabase.serviceRoleKey,
          tenantId,
          projectId,
          attempt
        }, 'Intentando obtener proyecto');

        // Consulta simplificada directamente a la tabla proyectos
        const { data, error } = await this.client
          .from('proyectos')
          .select('*')
          .eq('inmobiliaria_id', tenantId)
          .eq('id', projectId)
          .single();

        if (error) {
          // Si estamos en el último intento, tratarlo como un error fatal
          if (attempt === maxRetries) {
            logger.error({
              error,
              tenantId,
              projectId,
              errorCode: error.code,
              errorMessage: error.message,
              errorDetails: error.details,
              fullError: JSON.stringify(error),
              attempt,
              maxRetries
            }, 'Error al obtener proyecto específico después de todos los reintentos');
            
            if (error.code === '42501') {
              throw new Error('Error de permisos: No tienes acceso a la tabla proyectos');
            }
            throw new Error(`Error al obtener proyecto: ${error.message} (Código: ${error.code})`);
          }
          
          // Si no es el último intento, esperar y reintentar
          logger.warn({
            errorCode: error.code,
            errorMessage: error.message,
            tenantId,
            projectId,
            attempt,
            nextAttemptIn: getBackoffTime(attempt)
          }, 'Error al obtener proyecto, reintentando después de backoff');
          
          await new Promise(resolve => setTimeout(resolve, getBackoffTime(attempt)));
          continue;
        }

        if (!data) {
          // Si es el último intento y no hay datos, retornar null
          if (attempt === maxRetries) {
            logger.warn({ tenantId, projectId, attempt, maxRetries }, 'Proyecto no encontrado después de todos los reintentos');
            return null;
          }
          
          // Si no es el último intento, esperar y reintentar
          logger.warn({
            tenantId,
            projectId,
            attempt,
            nextAttemptIn: getBackoffTime(attempt)
          }, 'Proyecto no encontrado, reintentando después de backoff');
          
          await new Promise(resolve => setTimeout(resolve, getBackoffTime(attempt)));
          continue;
        }

        // Proyecto obtenido correctamente
        logger.info({
          tenantId,
          projectId,
          attempt,
          hasData: !!data,
          dataKeys: Object.keys(data),
          caracteristicasKeys: data.caracteristicas ? Object.keys(data.caracteristicas) : 'no-caracteristicas'
        }, 'Proyecto obtenido correctamente');

        return data;
      } catch (error) {
        // Si es el último intento, propagar el error
        if (attempt === maxRetries) {
          logger.error({
            error,
            tenantId,
            projectId,
            errorMessage: error instanceof Error ? error.message : 'Error desconocido',
            errorStack: error instanceof Error ? error.stack : undefined,
            attempt,
            maxRetries
          }, 'Error en getProject después de todos los reintentos');
          throw error;
        }
        
        // Si no es el último intento, esperar y reintentar
        logger.warn({
          error,
          tenantId,
          projectId,
          attempt,
          nextAttemptIn: getBackoffTime(attempt)
        }, 'Error en getProject, reintentando después de backoff');
        
        await new Promise(resolve => setTimeout(resolve, getBackoffTime(attempt)));
      }
    }

    // Este punto nunca debería alcanzarse debido a los returns y throws dentro del bucle
    logger.error({ tenantId, projectId }, 'Error inesperado en getProject');
    throw new Error('Error inesperado en getProject');
  }

  /**
   * Actualiza o crea un vector en la tabla proyecto_vector
   */
  async upsertVector(vectorData: VectorData): Promise<void> {
    try {
      logger.debug({
        project_id: vectorData.project_id,
        project_id_type: typeof vectorData.project_id
      }, 'Validando project_id antes de upsert');
      
      const { error } = await this.client
        .from('proyecto_vector')
        .upsert({
          id: vectorData.id,
          inmobiliaria_id: vectorData.inmobiliaria_id,
          project_id: vectorData.project_id,
          content: vectorData.content, // Agregar el campo content
          embedding: vectorData.embedding,
          metadata: vectorData.metadata,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        logger.error({
          error,
          vectorData,
          project_id_value: vectorData.project_id,
          project_id_type: typeof vectorData.project_id
        }, 'Error al actualizar vector');
        throw error;
      }
    } catch (error) {
      logger.error({ error, vectorData }, 'Error en upsertVector');
      throw error;
    }
  }

  /**
   * Obtiene los vectores existentes para un tenant
   */
  async getExistingVectors(tenantId: string): Promise<VectorData[]> {
    try {
      const { data, error } = await this.client
        .from('proyecto_vector')
        .select('*')
        .eq('inmobiliaria_id', tenantId);

      if (error) {
        logger.error({ error, tenantId }, 'Error al obtener vectores existentes');
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ error, tenantId }, 'Error en getExistingVectors');
      throw error;
    }
  }

  /**
   * Elimina los vectores de proyectos que ya no existen
   */
  async cleanupOrphanedVectors(tenantId: string): Promise<void> {
    try {
      const { error } = await this.client.rpc('rpc_cleanup_orphaned_vectors', tenantId);

      if (error) {
        logger.error({ error, tenantId }, 'Error al limpiar vectores huérfanos');
        throw error;
      }
    } catch (error) {
      logger.error({ error, tenantId }, 'Error en cleanupOrphanedVectors');
      throw error;
    }
  }

  /**
   * Obtiene la lista de tenants activos
   */
  async getActiveTenants(): Promise<string[]> {
    try {
      // Por ahora, obtendremos todos los tenants sin filtrar por estado
      const { data, error } = await this.client
        .from('inmobiliarias')
        .select('id')
        .eq('active', true);

      if (error) {
        logger.error({ error }, 'Error al obtener tenants activos');
        throw error;
      }

      return (data || []).map(tenant => tenant.id);
    } catch (error) {
      logger.error({ error }, 'Error en getActiveTenants');
      throw error;
    }
  }
}

// Exportar una instancia única del servicio
export const supabaseService = new SupabaseService();