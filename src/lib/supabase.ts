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