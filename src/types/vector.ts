/**
 * Tipos relacionados con los vectores y embeddings
 */

export interface VectorData {
  id: string;
  inmobiliaria_id: string;
  project_id: string;
  content?: string; // Agregar el campo content que falta en la tabla
  embedding: number[];
  metadata: {
    lastUpdate: string;
    contentVersion: number;
    processedFields: string[];
    dimensions: number;
    model: string;
  };
  created_at?: string;
  updated_at?: string;
}

export interface EmbeddingRequest {
  inmobiliaria_id: string;
  project_id: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface EmbeddingResult {
  success: boolean;
  vector?: number[];
  error?: string;
  metadata: {
    model: string;
    dimensions: number;
    tokenCount: number;
    processingTime: number;
  };
}

export interface VectorSyncStatus {
  inmobiliaria_id: string;
  totalProjects: number;
  processedProjects: number;
  failedProjects: number;
  lastSync: string;
  status: 'IDLE' | 'SYNCING' | 'ERROR' | 'NO_DATA';
  error?: string;
  performance: {
    averageProcessingTime: number;
    tokenCount: number;
    costEstimate: number;
  };
}

export interface VectorSearchConfig {
  similarityThreshold: number;
  maxResults: number;
  includeMetadata: boolean;
  filterByTenant: boolean;
}

export interface VectorSyncMetrics {
  syncStart: string;
  syncEnd?: string;
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  tokensProcessed: number;
  processingTime: number;
  tenantMetrics: Record<string, {
    processed: number;
    errors: number;
    tokens: number;
    cost: number;
  }>;
}

export interface VectorBatch {
  tenantId: string;
  items: {
    projectId: string;
    content: string;
    metadata?: Record<string, any>;
  }[];
  priority: number;
  retryCount: number;
}

export interface BatchProcessingResult {
  batchId: string;
  success: boolean;
  results: {
    projectId: string;
    success: boolean;
    error?: string;
    vector?: number[];
  }[];
  metrics: {
    totalTime: number;
    tokensProcessed: number;
    successCount: number;
    errorCount: number;
  };
}