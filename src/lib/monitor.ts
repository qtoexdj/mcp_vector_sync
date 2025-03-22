import { config, logger } from '../config/config.js';
import { supabaseService } from './supabase.js';
import { openaiService } from './openai.js';
import { Project, ProjectProcessingStatus } from '../types/project.js';
import { VectorData, VectorSyncStatus } from '../types/vector.js';

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

  private async checkForChanges(): Promise<void> {
    try {
      const tenants = await supabaseService.getActiveTenants();
      
      for (const tenantId of tenants) {
        await this.processTenantChanges(tenantId);
      }

      this.lastCheck = new Date();
    } catch (error) {
      logger.error({ error }, 'Error al verificar cambios');
      throw error;
    }
  }

  private async processTenantChanges(tenantId: string): Promise<void> {
    const status = this.getOrCreateStatus(tenantId);
    status.status = 'SYNCING';

    try {
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
      throw error;
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
              model: config.openai.model
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
    // Combinar campos relevantes del proyecto para el embedding
    const content = [
      project.nombre,
      project.descripcion,
      JSON.stringify(project.caracteristicas),
      project.ubicacion?.direccion,
      project.ubicacion?.comuna,
      project.ubicacion?.region
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