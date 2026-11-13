import { ProgramDependencyGraph, PDGNode, PDGNodeType } from './types';

export interface NodeQuality {
  node: PDGNode;
  qualityScore: number;
  issues: string[];
}

export class QualityAnalyzer {
  /**
   * Calculates overall quality score (0-100, higher is better)
   * Based on: Cyclomatic Complexity, Maintainability Index, LCOM
   */
  calculateQualityScore(node: PDGNode): number {
    const metrics = node.metadata?.metrics;
    if (!metrics) return 50; // Default neutral score for nodes without metrics

    let score = 100;
    const issues: string[] = [];

    // Cyclomatic Complexity penalty (CC > 10 is concerning)
    const cc = metrics.cyclomaticComplexity || 1;
    if (cc > 50) {
      score -= 40;
      issues.push(`Very high complexity: ${cc}`);
    } else if (cc > 20) {
      score -= 25;
      issues.push(`High complexity: ${cc}`);
    } else if (cc > 10) {
      score -= 15;
      issues.push(`Moderate complexity: ${cc}`);
    }

    // Maintainability Index boost/penalty (MI < 65 is concerning)
    const mi = metrics.maintainabilityIndex || 70;
    if (mi < 40) {
      score -= 30;
      issues.push(`Very low maintainability: ${mi.toFixed(1)}`);
    } else if (mi < 65) {
      score -= 15;
      issues.push(`Low maintainability: ${mi.toFixed(1)}`);
    } else if (mi > 85) {
      score += 10;
    }

    // LCOM penalty (LCOM > 0.7 is concerning for classes)
    if (node.type === PDGNodeType.CLASS && metrics.lcom !== undefined) {
      const lcom = metrics.lcom;
      if (lcom > 0.8) {
        score -= 20;
        issues.push(`Very low cohesion: ${lcom.toFixed(2)}`);
      } else if (lcom > 0.6) {
        score -= 10;
        issues.push(`Low cohesion: ${lcom.toFixed(2)}`);
      }
    }

    // Halstead volume penalty (very large functions)
    const volume = metrics.halsteadVolume || 0;
    if (volume > 2000) {
      score -= 15;
      issues.push(`Very large code volume: ${volume.toFixed(0)}`);
    } else if (volume > 1000) {
      score -= 10;
      issues.push(`Large code volume: ${volume.toFixed(0)}`);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Analyzes all nodes and returns them sorted by quality (worst first)
   */
  analyzeQuality(pdg: ProgramDependencyGraph): NodeQuality[] {
    const results: NodeQuality[] = [];

    pdg.nodes.forEach((node) => {
      // Only analyze meaningful nodes (skip statements and variable declarations)
      // Variable declarations are data, not logic, and rarely have meaningful metrics
      if (node.type === PDGNodeType.STATEMENT ||
          node.type === PDGNodeType.VARIABLE_DECLARATION) {
        return;
      }

      const qualityScore = this.calculateQualityScore(node);
      const issues = this.getIssues(node);

      results.push({
        node,
        qualityScore,
        issues
      });
    });

    // Sort by quality score (lowest first)
    return results.sort((a, b) => a.qualityScore - b.qualityScore);
  }

  /**
   * Gets detailed issues for a node
   */
  public getIssues(node: PDGNode): string[] {
    const issues: string[] = [];
    const metrics = node.metadata?.metrics;
    if (!metrics) return issues;

    const cc = metrics.cyclomaticComplexity || 1;
    const mi = metrics.maintainabilityIndex || 70;
    const lcom = metrics.lcom;
    const volume = metrics.halsteadVolume || 0;

    if (cc > 50) issues.push(`Extremely high complexity (CC: ${cc})`);
    else if (cc > 20) issues.push(`High complexity (CC: ${cc})`);
    else if (cc > 10) issues.push(`Moderate complexity (CC: ${cc})`);

    if (mi < 40) issues.push(`Very low maintainability (MI: ${mi.toFixed(1)})`);
    else if (mi < 65) issues.push(`Low maintainability (MI: ${mi.toFixed(1)})`);

    if (node.type === PDGNodeType.CLASS && lcom !== undefined) {
      if (lcom > 0.8) issues.push(`Very low cohesion (LCOM: ${lcom.toFixed(2)})`);
      else if (lcom > 0.6) issues.push(`Low cohesion (LCOM: ${lcom.toFixed(2)})`);
    }

    if (volume > 2000) issues.push(`Very large code volume (${volume.toFixed(0)})`);
    else if (volume > 1000) issues.push(`Large code volume (${volume.toFixed(0)})`);

    return issues;
  }

  /**
   * Generates a quality report for top N worst nodes
   */
  generateReport(pdg: ProgramDependencyGraph, topN: number = 5): string {
    const analysis = this.analyzeQuality(pdg);
    const worst = analysis.slice(0, topN);

    const lines: string[] = [];
    lines.push('='.repeat(80));
    lines.push('CODE QUALITY ANALYSIS - LOWEST QUALITY NODES');
    lines.push('='.repeat(80));
    lines.push('');

    worst.forEach((item, index) => {
      const { node, qualityScore, issues } = item;
      const metrics = node.metadata?.metrics;

      lines.push(`${index + 1}. ${node.type}: ${node.name}`);
      lines.push(`   Node ID: ${node.id}`);
      lines.push(`   Quality Score: ${qualityScore.toFixed(1)}/100`);
      lines.push(`   Location: ${node.filePath}:${node.startLine}-${node.endLine}`);

      if (metrics) {
        lines.push(`   Metrics:`);
        lines.push(`     - Cyclomatic Complexity: ${metrics.cyclomaticComplexity || 'N/A'}`);
        lines.push(`     - Maintainability Index: ${metrics.maintainabilityIndex?.toFixed(1) || 'N/A'}`);
        if (node.type === PDGNodeType.CLASS && metrics.lcom !== undefined) {
          lines.push(`     - LCOM (Cohesion): ${metrics.lcom.toFixed(2)}`);
        }
        lines.push(`     - Halstead Volume: ${metrics.halsteadVolume?.toFixed(0) || 'N/A'}`);
      }

      if (issues.length > 0) {
        lines.push(`   Issues:`);
        issues.forEach(issue => lines.push(`     - ${issue}`));
      }

      lines.push('');
    });

    lines.push('='.repeat(80));
    lines.push(`Total nodes analyzed: ${analysis.length}`);
    lines.push(`Average quality score: ${(analysis.reduce((sum, item) => sum + item.qualityScore, 0) / analysis.length).toFixed(1)}/100`);
    lines.push('='.repeat(80));

    return lines.join('\n');
  }
}
