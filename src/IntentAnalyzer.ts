import { Intent, IntentType, IntentAnalysis } from './types';

/**
 * Analyzes user queries to extract development intents using LLM
 *
 * Converts conversational queries like:
 *   "I want to add support for payments via PayPal"
 *
 * Into structured intents:
 *   - Functional: payment processing (keywords: payment, paypal, transaction, checkout)
 *   - Non-functional: API integration (keywords: api, http, external service)
 */
export class IntentAnalyzer {
  private ollamaUrl: string;
  private model: string;

  constructor(ollamaUrl: string = 'http://127.0.0.1:11434', model: string = 'llama3.2:3b') {
    this.ollamaUrl = ollamaUrl;
    this.model = model;
  }

  /**
   * Check if Ollama is available and model is loaded
   */
  async initialize(): Promise<void> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      const data: any = await response.json();

      const modelAvailable = data.models?.some((m: any) => m.name.includes(this.model.split(':')[0]));

      if (!modelAvailable) {
        console.warn(`⚠ Warning: Model ${this.model} not found. Using default model.`);
        this.model = data.models?.[0]?.name || 'llama3.2:3b';
      }

      console.log(`✓ Intent Analyzer ready (using ${this.model})`);
    } catch (error: any) {
      throw new Error(`Failed to connect to Ollama: ${error.message}`);
    }
  }

  /**
   * Analyze user query and extract development intents
   */
  async analyzeQuery(userQuery: string): Promise<IntentAnalysis> {
    const prompt = this.buildAnalysisPrompt(userQuery);

    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          format: 'json',
          options: {
            temperature: 0.3,  // Lower temperature for more focused output
            top_p: 0.9,
          }
        }),
      });

      const data: any = await response.json();
      const llmResponse = data.response;

      // Parse LLM response
      const intents = this.parseIntents(llmResponse);

      return {
        originalQuery: userQuery,
        intents,
      };
    } catch (error: any) {
      console.error('Intent analysis failed:', error.message);

      // Fallback: create simple intent from query
      return {
        originalQuery: userQuery,
        intents: [
          {
            type: IntentType.FUNCTIONAL,
            description: userQuery,
            keywords: this.extractSimpleKeywords(userQuery),
          }
        ],
      };
    }
  }

  /**
   * Build prompt for LLM to analyze query
   */
  private buildAnalysisPrompt(userQuery: string): string {
    return `You are a code search assistant. Analyze the following development query and extract structured intents.

User Query: "${userQuery}"

Extract development intents from this query. For each intent, identify:
1. Type: "functional" (business logic, features) or "non-functional" (architecture, performance, integration)
2. Description: What the developer wants to achieve
3. Keywords: Technical terms to search for in code (5-10 keywords)
4. Technical Terms: Specific technical concepts (API, database, async, etc.)
5. Related Concepts: Related terms that might help search

Output ONLY valid JSON in this exact format:
{
  "intents": [
    {
      "type": "functional",
      "description": "Brief description",
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "technicalTerms": ["term1", "term2"],
      "relatedConcepts": ["concept1", "concept2"]
    }
  ]
}

Examples:

Query: "I want to add support for payments via PayPal"
{
  "intents": [
    {
      "type": "functional",
      "description": "Payment processing integration",
      "keywords": ["payment", "paypal", "transaction", "checkout", "billing", "purchase"],
      "technicalTerms": ["api", "webhook", "callback"],
      "relatedConcepts": ["order", "cart", "customer", "invoice"]
    },
    {
      "type": "non-functional",
      "description": "Third-party API integration",
      "keywords": ["api", "integration", "external", "http", "request", "response"],
      "technicalTerms": ["async", "promise", "fetch"],
      "relatedConcepts": ["authentication", "error-handling", "retry"]
    }
  ]
}

Query: "add a new quality metric related with cohesion"
{
  "intents": [
    {
      "type": "functional",
      "description": "Code quality metric calculation",
      "keywords": ["metric", "quality", "cohesion", "lcom", "calculate", "analyze"],
      "technicalTerms": ["algorithm", "computation"],
      "relatedConcepts": ["complexity", "maintainability", "class", "method"]
    }
  ]
}

Now analyze the user query and output JSON:`;
  }

  /**
   * Parse LLM response into Intent objects
   */
  private parseIntents(llmResponse: string): Intent[] {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(llmResponse);

      if (parsed.intents && Array.isArray(parsed.intents)) {
        return parsed.intents.map((intent: any) => ({
          type: intent.type === 'functional' ? IntentType.FUNCTIONAL : IntentType.NON_FUNCTIONAL,
          description: intent.description || '',
          keywords: intent.keywords || [],
          technicalTerms: intent.technicalTerms || [],
          relatedConcepts: intent.relatedConcepts || [],
          confidence: 0.8,  // Default confidence for LLM-generated intents
        }));
      }
    } catch (error) {
      // If JSON parsing fails, try to extract structured info from text
      console.warn('Failed to parse LLM response as JSON, using fallback');
    }

    // Fallback: return empty array
    return [];
  }

  /**
   * Fallback: extract simple keywords from query
   */
  private extractSimpleKeywords(query: string): string[] {
    // Remove common words
    const stopWords = new Set([
      'i', 'want', 'to', 'add', 'a', 'an', 'the', 'with', 'for', 'in', 'on', 'at',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may',
      'new', 'how', 'what', 'where', 'when', 'why', 'which', 'that', 'this',
      'support', 'via', 'related', 'about'
    ]);

    const words = query
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    return [...new Set(words)];
  }

  /**
   * Test the analyzer with a sample query
   */
  async test(): Promise<void> {
    console.log('Testing Intent Analyzer...\n');

    const testQuery = 'I want to add a new quality metric related with cohesion';
    console.log(`Query: "${testQuery}"\n`);

    const analysis = await this.analyzeQuery(testQuery);

    console.log('Extracted Intents:');
    analysis.intents.forEach((intent, i) => {
      console.log(`\n${i + 1}. ${intent.type.toUpperCase()}`);
      console.log(`   Description: ${intent.description}`);
      console.log(`   Keywords: ${intent.keywords.join(', ')}`);
      if (intent.technicalTerms && intent.technicalTerms.length > 0) {
        console.log(`   Technical: ${intent.technicalTerms.join(', ')}`);
      }
      if (intent.relatedConcepts && intent.relatedConcepts.length > 0) {
        console.log(`   Related: ${intent.relatedConcepts.join(', ')}`);
      }
    });
  }
}
