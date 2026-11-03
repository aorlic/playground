import { SearchResult, ProgramDependencyGraph } from './types';

/**
 * Hybrid search combining vector similarity + keyword matching + metadata re-ranking
 */
export class HybridSearcher {
  /**
   * Re-rank search results using hybrid approach
   */
  rerank(
    vectorResults: SearchResult[],
    query: string,
    pdgNodes?: Map<string, any>
  ): SearchResult[] {
    const queryTerms = this.extractQueryTerms(query);

    const reranked = vectorResults.map(result => {
      let score = 1 - result._distance; // Base semantic similarity

      // 1. Keyword Boost: Check if query terms appear in name/code
      const keywordScore = this.calculateKeywordScore(result, queryTerms);
      score += keywordScore * 0.3; // 30% weight to keywords

      // 2. Name Match Boost: Exact or partial name match
      const nameScore = this.calculateNameScore(result.name, queryTerms);
      score += nameScore * 0.2; // 20% weight to name match

      // 3. File Path Boost: Query terms in file path
      const pathScore = this.calculatePathScore(result.filePath, queryTerms);
      score += pathScore * 0.1; // 10% weight to path

      // 4. Complexity Penalty: Very complex code is harder to modify
      const complexityPenalty = this.calculateComplexityPenalty(result.cyclomaticComplexity);
      score *= (1 - complexityPenalty); // Reduce score for high complexity

      // 5. Maintainability Boost: Higher MI = better code
      const maintainabilityBoost = this.calculateMaintainabilityBoost(result.maintainabilityIndex);
      score *= (1 + maintainabilityBoost);

      return {
        ...result,
        _distance: 1 - score, // Convert back to distance
        _originalDistance: result._distance,
        _hybridScore: score,
      };
    });

    // Sort by new hybrid score (lower distance = better)
    return reranked.sort((a, b) => a._distance - b._distance);
  }

  /**
   * Extract meaningful query terms (remove stop words)
   */
  private extractQueryTerms(query: string): string[] {
    const stopWords = new Set([
      'i', 'want', 'to', 'add', 'a', 'an', 'the', 'with', 'for', 'in', 'on', 'at',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may',
      'how', 'what', 'where', 'when', 'why', 'which', 'that', 'this',
    ]);

    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2 && !stopWords.has(term));
  }

  /**
   * Calculate keyword match score (BM25-like)
   */
  private calculateKeywordScore(result: SearchResult, queryTerms: string[]): number {
    const searchText = `${result.name} ${result.code}`.toLowerCase();

    let matches = 0;
    let totalTerms = queryTerms.length;

    for (const term of queryTerms) {
      // Check for exact match
      if (searchText.includes(term)) {
        matches++;
      }
      // Check for partial match (for compound words)
      else if (searchText.includes(term.substring(0, Math.max(4, term.length - 2)))) {
        matches += 0.5;
      }
    }

    return totalTerms > 0 ? matches / totalTerms : 0;
  }

  /**
   * Calculate name similarity score
   */
  private calculateNameScore(name: string, queryTerms: string[]): number {
    const nameLower = name.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      // Exact match in name
      if (nameLower === term) {
        score += 1.0;
      }
      // Name contains term
      else if (nameLower.includes(term)) {
        score += 0.7;
      }
      // Term is substring of name (camelCase match)
      else if (this.camelCaseMatch(name, term)) {
        score += 0.5;
      }
    }

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Check if term matches camelCase pattern
   * e.g., "payment" matches "PaymentService"
   */
  private camelCaseMatch(name: string, term: string): boolean {
    const words = name.split(/(?=[A-Z])/).map(w => w.toLowerCase());
    return words.some(w => w.startsWith(term));
  }

  /**
   * Calculate file path relevance
   */
  private calculatePathScore(filePath: string, queryTerms: string[]): number {
    const pathLower = filePath.toLowerCase();
    let matches = 0;

    for (const term of queryTerms) {
      if (pathLower.includes(term)) {
        matches++;
      }
    }

    return queryTerms.length > 0 ? matches / queryTerms.length : 0;
  }

  /**
   * Penalize very high complexity (> 50 CC)
   */
  private calculateComplexityPenalty(cc: number | null): number {
    if (cc === null || cc < 20) return 0;
    if (cc < 50) return 0.05;
    if (cc < 100) return 0.1;
    if (cc < 200) return 0.15;
    return 0.2; // Max 20% penalty for extreme complexity
  }

  /**
   * Boost for good maintainability (> 70 MI)
   */
  private calculateMaintainabilityBoost(mi: number | null): number {
    if (mi === null) return 0;
    if (mi > 80) return 0.1;   // 10% boost for excellent code
    if (mi > 70) return 0.05;  // 5% boost for good code
    if (mi < 50) return -0.05; // 5% penalty for poor code
    return 0;
  }

  /**
   * Explain why a result ranked highly
   */
  explainRanking(result: any, query: string): string[] {
    const reasons: string[] = [];
    const queryTerms = this.extractQueryTerms(query);

    // Check semantic similarity
    const semanticScore = (1 - (result._originalDistance || result._distance)) * 100;
    if (semanticScore > 20) {
      reasons.push(`Strong semantic match (${semanticScore.toFixed(1)}%)`);
    }

    // Check keyword matches
    const keywordScore = this.calculateKeywordScore(result, queryTerms);
    if (keywordScore > 0.5) {
      reasons.push(`Keywords found in code (${(keywordScore * 100).toFixed(0)}%)`);
    }

    // Check name match
    const nameScore = this.calculateNameScore(result.name, queryTerms);
    if (nameScore > 0.5) {
      reasons.push(`Name matches query`);
    }

    // Check path match
    const pathScore = this.calculatePathScore(result.filePath, queryTerms);
    if (pathScore > 0) {
      reasons.push(`Found in relevant file path`);
    }

    // Check maintainability
    if (result.maintainabilityIndex && result.maintainabilityIndex > 70) {
      reasons.push(`High code quality (MI: ${result.maintainabilityIndex.toFixed(0)})`);
    }

    if (reasons.length === 0) {
      reasons.push('Weak match - consider refining query');
    }

    return reasons;
  }
}
