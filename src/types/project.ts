/**
 * Tipos relacionados con los proyectos y su sincronización
 */

export interface Project {
  id: string;
  inmobiliaria_id: string;
  caracteristicas?: {
    nombre?: string;
    valor?: string;
    ubicacion?: string;
    caracteristicas?: string;
    [key: string]: any;
  };
  updated_at: string;
  created_at: string;
}

export interface ProjectChange {
  project: Project;
  changeType: 'INSERT' | 'UPDATE' | 'DELETE';
  timestamp: string;
}

export interface ProjectProcessingStatus {
  project_id: string;
  inmobiliaria_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  error?: string;
  last_processed: string;
  attempts: number;
}

export interface ProjectContent {
  id: string;
  inmobiliaria_id: string;
  project_id: string;
  content: string; // Contenido procesado para generar embedding
  metadata: {
    lastUpdate: string;
    source: string[];
    version: number;
  };
}