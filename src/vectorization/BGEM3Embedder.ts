/**
 * BGE-M3 Embedder using Ollama API
 *
 * Requirements:
 * - Ollama installed and running (ollama serve)
 * - BGE-M3 model pulled (ollama pull bge-m3)
 *
 * Model specs:
 * - Context window: 8192 tokens
 * - Embedding dimension: 1024
 * - Multi-lingual: 100+ languages
 */
export class BGEM3Embedder {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl = 'http://localhost:11434', model = 'bge-m3') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  /**
   * Initialize and verify Ollama is running with BGE-M3
   */
  async initialize(): Promise<void> {
    try {
      // Check if Ollama is running
      const response = await fetch(`${this.baseUrl}/api/tags`);

      if (!response.ok) {
        throw new Error('Ollama service not responding. Is it running? (ollama serve)');
      }

      const data: any = await response.json();

      // Check if BGE-M3 model is available
      const hasModel = data.models?.some((m: any) =>
        m.name === this.model || m.name.startsWith(`${this.model}:`)
      );

      if (!hasModel) {
        throw new Error(
          `BGE-M3 model not found in Ollama.\n` +
          `Please run: ollama pull ${this.model}`
        );
      }

      console.log(`✓ Ollama connected`);
      console.log(`✓ BGE-M3 model ready (8192 token context, 1024-dim embeddings)`);
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(
          'Cannot connect to Ollama. Please start it with: ollama serve'
        );
      }
      throw error;
    }
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          input: text,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error: ${error}`);
      }

      const data: any = await response.json();

      // Ollama returns embeddings in the format: { embeddings: [[...]] }
      const embedding = data.embeddings?.[0] || data.embedding;

      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }

      return embedding;
    } catch (error: any) {
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batches with parallelization
   */
  async embedBatch(
    texts: string[],
    options: { batchSize?: number; onProgress?: (current: number, total: number) => void } = {}
  ): Promise<number[][]> {
    const { batchSize = 4, onProgress } = options;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      // Process batch in parallel
      const batchPromises = batch.map((text) => this.embed(text));
      const batchResults = await Promise.all(batchPromises);

      results.push(...batchResults);

      // Report progress
      const current = Math.min(i + batchSize, texts.length);
      if (onProgress) {
        onProgress(current, texts.length);
      }
    }

    return results;
  }

  /**
   * Test the embedder with a sample text
   */
  async test(): Promise<void> {
    console.log('Testing BGE-M3 embedder...');

    const testText = 'This is a test for the embedding model.';
    const embedding = await this.embed(testText);

    console.log(`✓ Generated ${embedding.length}-dimensional embedding`);
    console.log(`  Sample values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}, ...]`);
  }
}
