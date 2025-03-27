import OpenAI from 'openai';
import { config, logger, MAX_CONTENT_LENGTH, VECTOR_DIMENSIONS } from '../config/config.js';

export class OpenAIService {
  private client: OpenAI;
  private retryDelays = [1000, 2000, 4000]; // Delays en ms para reintentos

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }

  /**
   * Procesa el contenido para generar un embedding
   * Incluye reintentos automáticos en caso de error
   */
  async generateEmbedding(content: string): Promise<number[]> {
    const truncatedContent = this.truncateContent(content);
    
    for (let attempt = 0; attempt < config.openai.maxRetries; attempt++) {
      try {
        const response = await this.client.embeddings.create({
          model: config.openai.model,
          input: truncatedContent,
        });

        const originalEmbedding = response.data[0].embedding;
        logger.info({
          originalDimensions: originalEmbedding.length,
          targetDimensions: VECTOR_DIMENSIONS,
          model: config.openai.model
        }, 'Redimensionando embedding al tamaño requerido');

        return this.resizeVector(originalEmbedding, VECTOR_DIMENSIONS);
      } catch (error: any) {
        if (attempt === config.openai.maxRetries - 1) {
          logger.error(
            { error, content: truncatedContent.slice(0, 100) + '...' },
            'Error final generando embedding'
          );
          throw error;
        }

        logger.warn(
          { error, attempt, content: truncatedContent.slice(0, 100) + '...' },
          'Reintentando generación de embedding'
        );

        await this.sleep(this.retryDelays[attempt]);
      }
    }

    throw new Error('No se pudo generar el embedding después de reintentos');
  }

  /**
   * Genera embeddings para múltiples contenidos en batch
   */
  async generateEmbeddings(
    contents: string[]
  ): Promise<{ embeddings: number[][]; errors: number[] }> {
    const embeddings: number[][] = [];
    const errors: number[] = [];

    await Promise.all(
      contents.map(async (content, index) => {
        try {
          const embedding = await this.generateEmbedding(content);
          embeddings[index] = embedding;
        } catch (error) {
          logger.error(
            { error, content: content.slice(0, 100) + '...' },
            'Error generando embedding en batch'
          );
          errors.push(index);
        }
      })
    );

    return { embeddings, errors };
  }

  /**
   * Trunca el contenido al máximo permitido de tokens
   * Nota: Esta es una aproximación simple, para una implementación más precisa
   * se debería usar un tokenizador real
   */
  private truncateContent(content: string): string {
    if (content.length <= MAX_CONTENT_LENGTH) {
      return content;
    }

    logger.warn(
      { originalLength: content.length, newLength: MAX_CONTENT_LENGTH },
      'Truncando contenido para embedding'
    );

    return content.slice(0, MAX_CONTENT_LENGTH);
  }

  /**
   * Utility para esperar entre reintentos
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Redimensiona un vector al tamaño deseado
   * Si el vector es más grande, se trunca
   * Si es más pequeño, se rellena con ceros
   */
  private resizeVector(vector: number[], targetSize: number): number[] {
    if (vector.length === targetSize) {
      return vector;
    }

    if (vector.length > targetSize) {
      // Si el vector es más grande, truncarlo
      return vector.slice(0, targetSize);
    } else {
      // Si el vector es más pequeño, rellenar con ceros
      return [...vector, ...new Array(targetSize - vector.length).fill(0)];
    }
  }
}

// Exportar una instancia única del servicio
export const openaiService = new OpenAIService();