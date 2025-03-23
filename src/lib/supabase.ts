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
   */
  async getProject(tenantId: string, projectId: string): Promise<Project | null> {
    try {
      // Verificar que tenemos las credenciales correctas
      logger.info({
        url: config.supabase.url,
        hasServiceKey: !!config.supabase.serviceRoleKey,
        tenantId,
        projectId
      }, 'Intentando obtener proyecto');

      // Primero verificar si la tabla existe
      const { data: tables, error: tableError } = await this.client
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_name', 'proyectos')
        .single();

      if (tableError) {
        logger.error({ error: tableError }, 'Error verificando tabla proyectos');
        throw new Error('Error verificando tabla proyectos: ' + tableError.message);
      }

      if (!tables) {
        logger.error('La tabla proyectos no existe');
        throw new Error('La tabla proyectos no existe');
      }

      // Intentar obtener el proyecto
      const { data, error } = await this.client
        .from('proyectos')
        .select('*')
        .eq('inmobiliaria_id', tenantId)
        .eq('id', projectId)
        .single();

      if (error) {
        logger.error({
          error,
          tenantId,
          projectId,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details
        }, 'Error al obtener proyecto específico');
        
        if (error.code === '42501') {
          throw new Error('Error de permisos: No tienes acceso a la tabla proyectos');
        }
        throw error;
      }

      if (!data) {
        logger.warn({ tenantId, projectId }, 'Proyecto no encontrado');
        return null;
      }

      logger.info({
        tenantId,
        projectId,
        hasData: !!data
      }, 'Proyecto obtenido correctamente');

      return data;
    } catch (error) {
      logger.error({
        error,
        tenantId,
        projectId,
        errorMessage: error instanceof Error ? error.message : 'Error desconocido',
        errorStack: error instanceof Error ? error.stack : undefined
      }, 'Error en getProject');
      throw error;
    }
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