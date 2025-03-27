import { config, logger } from '../config/config.js';
import { supabaseService } from './supabase.js';
import { openaiService } from './openai.js';
import { Project, ProjectProcessingStatus } from '../types/project.js';
import { VectorData, VectorSyncStatus } from '../types/vector.js';

// Verificar si estamos en modo demo
const isDemoMode = process.env.DEMO_MODE === 'true';

export class MonitorService {
  private isRunning: boolean = false;
  private lastCheck: Date = new Date(0);
  private syncStatus: Map<string, VectorSyncStatus> = new Map();
  private processingStatus: Map<string, ProjectProcessingStatus> = new Map();

  constructor() {
    // Inicializar estado del monitor
    this.resetStatus();
  }

  /**
   * Inicia el monitoreo de cambios
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Monitor ya está ejecutándose');
      return;
    }

    this.isRunning = true;
    logger.info('Iniciando monitor de sincronización de vectores');

    while (this.isRunning) {
      try {
        await this.checkForChanges();
      } catch (error) {
        logger.error({ error }, 'Error en ciclo de monitoreo');
      }

      // Esperar antes del siguiente ciclo
      await this.sleep(config.monitor.interval);
    }
  }

  /**
   * Detiene el monitoreo
   */
  stop(): void {
    this.isRunning = false;
    logger.info('Deteniendo monitor de sincronización');
  }

  /**
   * Obtiene el estado de sincronización para un tenant
   */
  getTenantStatus(tenantId: string): VectorSyncStatus | undefined {
    return this.syncStatus.get(tenantId);
  }

  /**
   * Fuerza una sincronización inmediata para un tenant
   */
  async forceSyncTenant(tenantId: string): Promise<void> {
    logger.info({ tenantId }, 'Forzando sincronización para tenant');
    await this.processTenantChanges(tenantId);
  }

  /**
   * Procesa un proyecto específico dado su ID y el ID del tenant
   * Este método es utilizado cuando se recibe una notificación via webhook
   */
  async processProject(tenantId: string, projectId: string): Promise<void> {
    const startTime = Date.now();
    logger.info({ tenantId, projectId }, 'Procesando proyecto específico por webhook');
    
    try {
      const status = this.getOrCreateStatus(tenantId);
      
      // En modo demo, simulamos el procesamiento
      if (isDemoMode) {
        logger.debug({ tenantId, projectId }, 'Simulando procesamiento de proyecto (modo demo)');
        await this.sleep(500); // Simular procesamiento
        return;
      }
      
      // Verificación alternativa de existencia del proyecto (método simplificado)
      let projectExists = false;
      try {
        // Utilizar el método checkProjectExists que acabamos de añadir a SupabaseService
        projectExists = await supabaseService.checkProjectExists(projectId);
        
        if (projectExists) {
          logger.info({
            tenantId,
            projectId,
            checkMethod: 'simplified-check',
          }, 'Verificación simple confirma que el proyecto existe');
        } else {
          logger.warn({
            tenantId,
            projectId
          }, 'Verificación simple no encontró el proyecto');
        }
      } catch (checkError) {
        logger.warn({
          checkError,
          tenantId,
          projectId,
          errorMessage: checkError instanceof Error ? checkError.message : 'Error desconocido'
        }, 'Error en verificación alternativa');
      }
      
      // Obtener el proyecto específico de Supabase
      // Utiliza el getProject mejorado con reintentos para manejar condiciones de carrera
      const project = await supabaseService.getProject(tenantId, projectId, 5); // Aumentamos a 5 reintentos
      
      if (!project) {
        logger.warn({
          tenantId,
          projectId,
          elapsedMs: Date.now() - startTime,
          simpleCheckFoundProject: projectExists
        }, 'Proyecto no encontrado después de todos los reintentos');
        
        // Si la verificación simple encontró el proyecto pero getProject falló, hay un problema con permisos o formato
        if (projectExists) {
          logger.error({
            tenantId,
            projectId,
            issue: 'Inconsistencia en la verificación'
          }, 'La verificación simple encontró el proyecto pero getProject no pudo recuperarlo');
        }
        
        // Actualizar estadísticas de fallos
        status.failedProjects += 1;
        status.error = `Proyecto ${projectId} no encontrado después de múltiples intentos`;
        return;
      }
      
      logger.info({
        tenantId,
        projectId,
        projectProps: Object.keys(project),
        hasCaracteristicas: !!project.caracteristicas,
        elapsedMs: Date.now() - startTime
      }, 'Proyecto encontrado, generando embedding');
      
      // Procesar un batch de un solo proyecto
      await this.processBatch(tenantId, [project]);
      
      // Actualizar estadísticas
      status.processedProjects += 1;
      status.lastSync = new Date().toISOString();
      
      const processingTime = Date.now() - startTime;
      logger.info({
        tenantId,
        projectId,
        processingTimeMs: processingTime
      }, 'Proyecto procesado correctamente vía webhook');
      
      // Actualizar información de rendimiento
      if (status.performance.averageProcessingTime === 0) {
        status.performance.averageProcessingTime = processingTime;
      } else {
        // Calcular un promedio móvil
        status.performance.averageProcessingTime =
          (status.performance.averageProcessingTime * 0.7) + (processingTime * 0.3);
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error({
        error,
        tenantId,
        projectId,
        processingTimeMs: processingTime,
        errorMessage: error instanceof Error ? error.message : 'Error desconocido',
        errorStack: error instanceof Error ? error.stack : undefined
      }, 'Error procesando proyecto específico');
      
      // Actualizar estadísticas de error
      const status = this.getOrCreateStatus(tenantId);
      status.failedProjects += 1;
      status.error = error instanceof Error ? error.message : 'Error desconocido';
      status.status = 'ERROR';
      
      throw error;
    }
  }

  private async checkForChanges(): Promise<void> {
    try {
      if (isDemoMode) {
        logger.info('Modo demo: Simulando verificación de cambios');
        // En modo demo, usamos tenants de ejemplo
        const demoTenants = [
          '32b2f8de-3fdc-4618-9510-434ee9014021',
          '7b01bc95-e70e-4fb8-8955-e1ac88dd3aac'
        ];
        
        for (const tenantId of demoTenants) {
          logger.debug({ tenantId }, 'No hay cambios para procesar (modo demo)');
        }
        
        this.lastCheck = new Date();
        return;
      }
      
      const tenants = await supabaseService.getActiveTenants();
      
      for (const tenantId of tenants) {
        await this.processTenantChanges(tenantId);
      }

      this.lastCheck = new Date();
    } catch (error) {
      logger.error({ error }, 'Error al verificar cambios');
      if (!isDemoMode) {
        throw error;
      } else {
        logger.warn('Error ignorado en modo demo');
      }
    }
  }

  private async processTenantChanges(tenantId: string): Promise<void> {
    const status = this.getOrCreateStatus(tenantId);
    status.status = 'SYNCING';

    try {
      // En modo demo, no hacemos nada real
      if (isDemoMode) {
        logger.debug({ tenantId }, 'No hay cambios para procesar (modo demo)');
        status.status = 'IDLE';
        status.lastSync = new Date().toISOString();
        return;
      }
      
      // Obtener proyectos modificados
      const projects = await supabaseService.getModifiedProjects(
        tenantId,
        this.lastCheck
      );

      if (projects.length === 0) {
        logger.debug({ tenantId }, 'No hay cambios para procesar');
        return;
      }

      logger.info(
        { tenantId, projectCount: projects.length },
        'Procesando cambios de proyectos'
      );

      // Procesar proyectos en lotes
      for (let i = 0; i < projects.length; i += config.monitor.batchSize) {
        const batch = projects.slice(i, i + config.monitor.batchSize);
        await this.processBatch(tenantId, batch);
      }

      // Limpiar vectores huérfanos
      await supabaseService.cleanupOrphanedVectors(tenantId);

      // Actualizar estado
      status.status = 'IDLE';
      status.lastSync = new Date().toISOString();
      status.processedProjects += projects.length;

    } catch (error) {
      logger.error({ error, tenantId }, 'Error procesando cambios del tenant');
      status.status = 'ERROR';
      status.error = error instanceof Error ? error.message : 'Error desconocido';
      
      if (!isDemoMode) {
        throw error;
      } else {
        logger.warn('Error ignorado en modo demo');
      }
    }
  }

  private async processBatch(tenantId: string, projects: Project[]): Promise<void> {
    const processedContents = await Promise.all(
      projects.map(project => this.prepareProjectContent(project))
    );

    const { embeddings, errors } = await openaiService.generateEmbeddings(
      processedContents
    );

    // Actualizar vectores exitosos
    await Promise.all(
      embeddings.map(async (embedding, index) => {
        if (!errors.includes(index)) {
          const project = projects[index];
          const content = processedContents[index];
          const vectorData: VectorData = {
            id: project.id,
            inmobiliaria_id: tenantId,
            project_id: project.id,
            content: content, // Agregar el campo content
            embedding: embedding, // Cambiar content_embedding a embedding
            metadata: {
              lastUpdate: new Date().toISOString(),
              contentVersion: 1,
              processedFields: ['nombre', 'descripcion', 'caracteristicas'],
              dimensions: embedding.length,
              model: process.env.OPENAI_MODEL || 'text-embedding-3-small'
            }
          };

          await supabaseService.upsertVector(vectorData);
        }
      })
    );

    // Registrar errores
    errors.forEach(index => {
      const project = projects[index];
      this.processingStatus.set(project.id, {
        project_id: project.id,
        inmobiliaria_id: tenantId,
        status: 'ERROR',
        error: 'Error generando embedding',
        last_processed: new Date().toISOString(),
        attempts: (this.processingStatus.get(project.id)?.attempts || 0) + 1
      });
    });
  }

  private prepareProjectContent(project: Project): string {
    // Obtener el objeto caracteristicas o un objeto vacío si no existe
    const caract = project.caracteristicas || {};
    
    // Combinar campos relevantes del proyecto para el embedding
    const content = [
      caract.nombre,
      caract.caracteristicas, // Este campo contiene la descripción del proyecto
      caract.valor,
      caract.ubicacion,
      JSON.stringify(caract) // Incluir todas las propiedades adicionales
    ]
      .filter(Boolean)
      .join(' ');

    return content;
  }

  private getOrCreateStatus(tenantId: string): VectorSyncStatus {
    if (!this.syncStatus.has(tenantId)) {
      this.syncStatus.set(tenantId, {
        inmobiliaria_id: tenantId,
        totalProjects: 0,
        processedProjects: 0,
        failedProjects: 0,
        lastSync: new Date(0).toISOString(),
        status: 'IDLE',
        performance: {
          averageProcessingTime: 0,
          tokenCount: 0,
          costEstimate: 0
        }
      });
    }

    return this.syncStatus.get(tenantId)!;
  }

  private resetStatus(): void {
    this.syncStatus.clear();
    this.processingStatus.clear();
    this.lastCheck = new Date(0);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Exportar una instancia única del servicio
export const monitorService = new MonitorService();