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
   * Obtiene una instancia del cliente de Supabase para operaciones específicas
   * que requieren acceso directo al cliente.
   */
  public getClient(): SupabaseClient {
    return this.client;
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
    // Aumentar el backoff exponencial para dar más tiempo entre reintentos
    // Mínimo de 1 segundo, máximo de 15 segundos
    const getBackoffTime = (attempt: number) => Math.min(Math.pow(2, attempt) * 500, 15000);
    
    // Verificar que la conexión a Supabase esté activa primero
    try {
      // Realizar una consulta simple para verificar la conexión
      const testResult = await this.client.from('proyectos').select('count(*)', { count: 'exact', head: true });
      logger.info({
        testConnectionSuccess: !testResult.error,
        errorIfAny: testResult.error ? {
          code: testResult.error.code,
          message: testResult.error.message,
          details: testResult.error.details
        } : null
      }, 'Verificación de conexión a Supabase');
    } catch (connError) {
      logger.error({
        error: connError,
        errorMessage: connError instanceof Error ? connError.message : 'Error desconocido',
        url: config.supabase.url,
        hasKey: !!config.supabase.serviceRoleKey
      }, 'Error de conexión con Supabase');
    }
    
    // Verificar si el proyecto existe primero usando listado (puede ser más confiable que single)
    try {
      const { data: checkData, error: checkError } = await this.client
        .from('proyectos')
        .select('id')
        .eq('id', projectId)
        .limit(1);
      
      logger.info({
        checkResult: {
          success: !checkError,
          found: checkData && checkData.length > 0,
          count: checkData?.length || 0,
          errorIfAny: checkError ? {
            code: checkError.code,
            message: checkError.message
          } : null
        }
      }, 'Verificación previa de existencia del proyecto');
    } catch (checkError) {
      logger.warn({
        checkError,
        message: 'Error en verificación previa'
      }, 'Error verificando existencia del proyecto');
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Verificar que tenemos las credenciales correctas
        logger.info({
          url: config.supabase.url.substring(0, 20) + '...', // Solo mostrar parte de la URL por seguridad
          hasServiceKey: !!config.supabase.serviceRoleKey,
          keyLength: config.supabase.serviceRoleKey?.length || 0,
          tenantId,
          projectId,
          attempt,
          totalRetries: maxRetries,
          backoffTime: getBackoffTime(attempt - 1)
        }, 'Intentando obtener proyecto');

        // Consulta directa a proyectos, con diagnóstico ampliado
        const startTime = Date.now();
        const { data, error, status, statusText, count } = await this.client
          .from('proyectos')
          .select('*')
          .eq('inmobiliaria_id', tenantId)
          .eq('id', projectId)
          .single();
        const queryTime = Date.now() - startTime;

        logger.debug({
          queryTimeMs: queryTime,
          httpStatus: status,
          httpStatusText: statusText,
          dataReceived: !!data,
          errorReceived: !!error,
          count
        }, 'Resultados de consulta a Supabase');

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
              maxRetries,
              httpStatus: status,
              httpStatusText: statusText,
              queryTimeMs: queryTime
            }, 'Error al obtener proyecto específico después de todos los reintentos');
            
            if (error.code === '42501') {
              throw new Error('Error de permisos: No tienes acceso a la tabla proyectos');
            }
            throw new Error(`Error al obtener proyecto: ${error.message} (Código: ${error.code}, HTTP: ${status})`);
          }
          
          // Si no es el último intento, esperar y reintentar
          logger.warn({
            errorCode: error.code,
            errorMessage: error.message,
            errorHint: error.hint,
            tenantId,
            projectId,
            attempt,
            nextAttemptIn: getBackoffTime(attempt),
            httpStatus: status
          }, 'Error al obtener proyecto, reintentando después de backoff');
          
          await new Promise(resolve => setTimeout(resolve, getBackoffTime(attempt)));
          continue;
        }

        if (!data) {
          // Si es el último intento y no hay datos, retornar null
          if (attempt === maxRetries) {
            logger.warn({
              tenantId,
              projectId,
              attempt,
              maxRetries,
              httpStatus: status
            }, 'Proyecto no encontrado después de todos los reintentos');
            return null;
          }
          
          // Si no es el último intento, esperar y reintentar
          logger.warn({
            tenantId,
            projectId,
            attempt,
            nextAttemptIn: getBackoffTime(attempt),
            httpStatus: status
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
          inmobiliariaIdMatch: data.inmobiliaria_id === tenantId,
          idMatch: data.id === projectId,
          caracteristicasKeys: data.caracteristicas ? Object.keys(data.caracteristicas) : 'no-caracteristicas',
          queryTimeMs: queryTime
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
            errorName: error instanceof Error ? error.name : 'Unknown',
            attempt,
            maxRetries
          }, 'Error en getProject después de todos los reintentos');
          throw error;
        }
        
        // Si no es el último intento, esperar y reintentar
        logger.warn({
          error: error instanceof Error ? {
            name: error.name,
            message: error.message
          } : 'Error desconocido',
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
      // Añadimos más diagnóstico detallado
      logger.info({
        project_id: vectorData.project_id,
        project_id_type: typeof vectorData.project_id,
        id: vectorData.id,
        inmobiliaria_id: vectorData.inmobiliaria_id,
        has_content: !!vectorData.content,
        content_length: vectorData.content?.length || 0,
        embedding_length: vectorData.embedding?.length || 0,
        metadata: vectorData.metadata
      }, 'Iniciando upsert en proyecto_vector');
      
      // Verificar que el proyecto existe (validar la FK)
      const projectExists = await this.checkProjectExists(vectorData.project_id);
      if (!projectExists) {
        logger.error({
          project_id: vectorData.project_id,
          reason: 'Proyecto referenciado no existe en tabla proyectos'
        }, 'No se puede insertar vector: Violación de clave foránea');
        throw new Error(`No se puede insertar vector: El proyecto ${vectorData.project_id} no existe en la tabla proyectos`);
      }
      
      // Verificar que la inmobiliaria existe (validar la FK)
      const inmobiliariaExists = await this.checkInmobiliariaExists(vectorData.inmobiliaria_id);
      if (!inmobiliariaExists) {
        logger.error({
          inmobiliaria_id: vectorData.inmobiliaria_id,
          reason: 'Inmobiliaria referenciada no existe en tabla inmobiliarias'
        }, 'No se puede insertar vector: Violación de clave foránea');
        throw new Error(`No se puede insertar vector: La inmobiliaria ${vectorData.inmobiliaria_id} no existe en la tabla inmobiliarias`);
      }
      
      // Intentar la inserción con manejo detallado de errores
      try {
        const startTime = Date.now();
        const { error, status, statusText } = await this.client
          .from('proyecto_vector')
          .upsert({
            id: vectorData.id,
            inmobiliaria_id: vectorData.inmobiliaria_id,
            project_id: vectorData.project_id,
            content: vectorData.content || '', // Garantizar que content no sea null
            embedding: vectorData.embedding,
            metadata: vectorData.metadata,
            updated_at: new Date().toISOString(),
          });
        const duration = Date.now() - startTime;

        if (error) {
          logger.error({
            error,
            errorCode: error.code,
            errorMessage: error.message,
            errorDetails: error.details,
            httpStatus: status,
            httpStatusText: statusText,
            durationMs: duration,
            project_id: vectorData.project_id,
            id: vectorData.id
          }, 'Error específico al actualizar vector');
          throw error;
        }
        
        // Registro de éxito detallado
        logger.info({
          project_id: vectorData.project_id,
          id: vectorData.id,
          durationMs: duration,
          httpStatus: status,
          httpStatusText: statusText
        }, 'Vector actualizado correctamente');
      } catch (dbError) {
        // Capturar errores específicos de la base de datos
        logger.error({
          dbError,
          errorType: typeof dbError,
          errorMessage: dbError instanceof Error ? dbError.message : 'Error desconocido',
          errorName: dbError instanceof Error ? dbError.name : 'Unknown',
          errorStack: dbError instanceof Error ? dbError.stack : undefined,
          project_id: vectorData.project_id,
          id: vectorData.id
        }, 'Error de base de datos al insertar vector');
        throw dbError;
      }
    } catch (error) {
      logger.error({
        error,
        errorType: typeof error,
        errorMessage: error instanceof Error ? error.message : 'Error desconocido',
        vectorData: {
          id: vectorData.id,
          project_id: vectorData.project_id,
          inmobiliaria_id: vectorData.inmobiliaria_id
        }
      }, 'Error general en upsertVector');
      throw error;
    }
  }
  
  /**
   * Verifica si una inmobiliaria existe
   */
  async checkInmobiliariaExists(inmobiliariaId: string): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('inmobiliarias')
        .select('id')
        .eq('id', inmobiliariaId)
        .limit(1);
      
      if (error) {
        logger.warn({ error, inmobiliariaId }, 'Error al verificar existencia de inmobiliaria');
        return false;
      }
      
      return !!(data && data.length > 0);
    } catch (error) {
      logger.warn({ error, inmobiliariaId }, 'Excepción al verificar existencia de inmobiliaria');
      return false;
    }
  }

  /**
   * Verifica si un proyecto existe sin recuperar todos sus datos
   * Útil como verificación rápida antes de intentar operaciones más pesadas
   */
  async checkProjectExists(projectId: string): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('proyectos')
        .select('id')
        .eq('id', projectId)
        .limit(1);
      
      if (error) {
        logger.warn({ error, projectId }, 'Error al verificar existencia del proyecto');
        return false;
      }
      
      return !!(data && data.length > 0);
    } catch (error) {
      logger.warn({ error, projectId }, 'Excepción al verificar existencia del proyecto');
      return false;
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
// Añadir métodos de diagnóstico a SupabaseService
export class SupabaseDiagnostic {
  async checkVectorExists(projectId: string): Promise<any> {
    try {
      logger.info({ projectId }, 'Verificando vector para proyecto');
      
      // Verificar si el proyecto existe
      const projectExists = await supabaseService.checkProjectExists(projectId);
      
      if (!projectExists) {
        logger.warn({ projectId }, 'Diagnóstico: Proyecto no existe en tabla proyectos');
        return {
          exists: false,
          error: 'El proyecto no existe en la tabla proyectos',
          projectId
        };
      }
      
      // Consultar en proyecto_vector
      try {
        const { data, error } = await supabaseService.getClient()
          .from('proyecto_vector')
          .select('*')
          .eq('project_id', projectId)
          .maybeSingle();
        
        if (error) {
          logger.error({ error, projectId }, 'Error al verificar vector en diagnóstico');
          return {
            exists: false,
            error: `Error consultando vector: ${error.message} (${error.code})`,
            projectId
          };
        }
        
        if (!data) {
          logger.warn({ projectId }, 'Diagnóstico: Vector no encontrado');
          return {
            exists: false,
            projectId
          };
        }
        
        // Vector encontrado, verificar su estructura
        const diagnostico = {
          exists: true,
          id: data.id,
          projectId: data.project_id,
          inmobiliariaId: data.inmobiliaria_id,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          hasContent: !!data.content,
          hasEmbedding: !!data.embedding,
          hasMetadata: !!data.metadata,
          metadata: data.metadata
        };
        
        logger.info(diagnostico, 'Diagnóstico de vector completado');
        return diagnostico;
      } catch (error) {
        logger.error({ error, projectId }, 'Error en diagnóstico de vector');
        throw error;
      }
    } catch (error) {
      logger.error({ error, projectId }, 'Error en checkVectorExists');
      throw error;
    }
  }

  async fixVectorForProject(projectId: string, tenantId: string): Promise<any> {
    try {
      logger.info({ projectId, tenantId }, 'Intentando reparar vector');
      
      // Obtener el proyecto
      const proyecto = await supabaseService.getProject(tenantId, projectId);
      
      if (!proyecto) {
        logger.error({ projectId, tenantId }, 'Error obteniendo proyecto para reparación');
        return {
          success: false,
          error: 'Proyecto no encontrado'
        };
      }
      
      // Preparar contenido para el embedding
      const caract = proyecto.caracteristicas || {};
      const content = [
        caract.nombre,
        caract.caracteristicas,
        caract.valor,
        caract.ubicacion,
        JSON.stringify(caract)
      ]
        .filter(Boolean)
        .join(' ');
      
      if (!content) {
        logger.warn({ projectId }, 'Contenido vacío para vector, usando nombre por defecto');
      }
      
      // Crear un vector temporal (embedding placeholder)
      const dummyEmbedding = Array(1536).fill(0.1);
      
      // Preparar datos para upsert
      const vectorData: VectorData = {
        id: projectId,
        inmobiliaria_id: tenantId,
        project_id: projectId,
        content: content || 'Contenido temporal de diagnóstico',
        embedding: dummyEmbedding,
        metadata: {
          lastUpdate: new Date().toISOString(),
          contentVersion: 1,
          processedFields: ['nombre', 'descripcion', 'caracteristicas'],
          dimensions: 1536,
          model: 'text-embedding-ada-002'
        }
      };
      
      try {
        // Intentar el upsert con el método existente
        await supabaseService.upsertVector(vectorData);
        
        // Verificar nuevamente después de la reparación
        const verificacion = await this.checkVectorExists(projectId);
        
        return {
          success: true,
          verificacion
        };
      } catch (error) {
        logger.error({ error, projectId }, 'Error en reparación de vector');
        
        return {
          success: false,
          error: error instanceof Error ?
            { message: error.message } :
            { message: 'Error desconocido', details: JSON.stringify(error) }
        };
      }
    } catch (error) {
      logger.error({ error, projectId }, 'Excepción en reparación de vector');
      
      return {
        success: false,
        error: error instanceof Error ?
          { message: error.message, stack: error.stack } :
          { message: 'Error desconocido', details: JSON.stringify(error) }
      };
    }
  }
}

export const supabaseService = new SupabaseService();
export const supabaseDiagnostic = new SupabaseDiagnostic();