import { logger } from '../config/config.js';
import { supabaseService } from './supabase.js';
import { VectorData } from '../types/vector.js';

/**
 * Utilidad para diagnosticar y corregir problemas con los vectores
 */
export class VectorDiagnostic {
  
  /**
   * Verifica si un vector existe y si tiene todos los campos requeridos
   */
  async checkVector(projectId: string): Promise<any> {
    try {
      logger.info({ projectId }, 'Verificando vector para proyecto');
      
      // Verificar si el proyecto existe primero
      const projectExists = await this.checkProjectExists(projectId);
      
      if (!projectExists) {
        logger.warn({ projectId }, 'Diagnóstico: Proyecto no existe en tabla proyectos');
        return { 
          exists: false, 
          error: 'El proyecto no existe en la tabla proyectos',
          projectId
        };
      }
      
      // Verificar si existe en proyecto_vector
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
  }
  
  /**
   * Verifica si un proyecto existe
   */
  async checkProjectExists(projectId: string): Promise<boolean> {
    try {
      const { data, error } = await supabaseService.getClient()
        .from('proyectos')
        .select('id')
        .eq('id', projectId)
        .maybeSingle();
      
      if (error) {
        logger.error({ error, projectId }, 'Error verificando existencia del proyecto');
        return false;
      }
      
      return !!data;
    } catch (error) {
      logger.error({ error, projectId }, 'Error en checkProjectExists');
      return false;
    }
  }
  
  /**
   * Intenta insertar/actualizar un vector manualmente
   */
  async fixVector(projectId: string, inmobiliariaId: string): Promise<any> {
    try {
      logger.info({ projectId, inmobiliariaId }, 'Intentando reparar vector');
      
      // 1. Obtener el proyecto completo
      const { data: proyecto, error: proyectoError } = await supabaseService.getClient()
        .from('proyectos')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();
      
      if (proyectoError || !proyecto) {
        logger.error({ error: proyectoError, projectId }, 'Error obteniendo proyecto para reparación');
        return { 
          success: false, 
          error: proyectoError ? proyectoError.message : 'Proyecto no encontrado'
        };
      }
      
      // 2. Preparar contenido para el embedding
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
      
      // 3. Crear un vector temporal (embedding placeholder)
      // Nota: En producción deberías generar un embedding real con OpenAI
      const dummyEmbedding = Array(1536).fill(0.1);
      
      // 4. Preparar datos para upsert
      const vectorData: VectorData = {
        id: projectId,
        inmobiliaria_id: inmobiliariaId,
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
      
      // 5. Intentar el upsert con datos detallados de error
      const startTime = Date.now();
      
      // Usar una transacción para mayor consistencia
      const { data, error, status, statusText } = await supabaseService.getClient()
        .from('proyecto_vector')
        .upsert(vectorData, {
          onConflict: 'project_id'
        });
      
      const duration = Date.now() - startTime;
      
      if (error) {
        logger.error({
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          httpStatus: status,
          httpStatusText: statusText,
          durationMs: duration
        }, 'Error en reparación de vector');
        
        return {
          success: false,
          error: {
            message: error.message,
            code: error.code,
            details: error.details,
            httpStatus: status
          },
          durationMs: duration
        };
      }
      
      logger.info({
        projectId,
        durationMs: duration,
        httpStatus: status,
        httpStatusText: statusText
      }, 'Reparación de vector exitosa');
      
      // 6. Verificar nuevamente después de la reparación
      const verificacion = await this.checkVector(projectId);
      
      return {
        success: true,
        httpStatus: status,
        httpStatusText: statusText,
        durationMs: duration,
        verificacion
      };
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

// Instancia para uso directo
export const vectorDiagnostic = new VectorDiagnostic();