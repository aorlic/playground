import { SyntaxKind } from 'ts-morph';
import {
  SemanticAnnotations,
  JSDocTag,
  CodePurpose,
  PDGNodeType,
} from './types';

/**
 * Extracts semantic annotations from AST nodes to improve search quality
 */
export class SemanticAnalyzer {
  /**
   * Extract semantic annotations from a ts-morph AST node
   */
  extractAnnotations(astNode: any, nodeType: PDGNodeType): SemanticAnnotations {
    const annotations: SemanticAnnotations = {};

    // Extract JSDoc documentation
    const jsdoc = this.extractJSDoc(astNode);
    if (jsdoc.description) annotations.description = jsdoc.description;
    if (jsdoc.summary) annotations.summary = jsdoc.summary;
    if (jsdoc.tags && jsdoc.tags.length > 0) annotations.tags = jsdoc.tags;

    // Extract domain terms from name and code
    const domainTerms = this.extractDomainTerms(astNode);
    if (domainTerms.length > 0) annotations.domainTerms = domainTerms;

    // Extract technical keywords
    const technicalKeywords = this.extractTechnicalKeywords(astNode);
    if (technicalKeywords.length > 0) annotations.technicalKeywords = technicalKeywords;

    // Detect patterns
    const patterns = this.detectPatterns(astNode, nodeType);
    if (patterns.length > 0) annotations.patterns = patterns;

    // Infer purpose
    const purpose = this.inferPurpose(astNode, nodeType);
    if (purpose !== CodePurpose.UNKNOWN) annotations.purpose = purpose;

    // Extract external dependencies
    const externalDeps = this.extractExternalDependencies(astNode);
    if (externalDeps.length > 0) annotations.externalDependencies = externalDeps;

    return annotations;
  }

  /**
   * Extract JSDoc comments
   */
  private extractJSDoc(astNode: any): {
    description?: string;
    summary?: string;
    tags?: JSDocTag[];
  } {
    try {
      const jsDocs = astNode.getJsDocs?.() || [];
      if (jsDocs.length === 0) return {};

      const firstDoc = jsDocs[0];
      const fullText = firstDoc.getDescription?.() || '';

      // Extract tags
      const tags: JSDocTag[] = [];
      const jsDocTags = firstDoc.getTags?.() || [];

      for (const tag of jsDocTags) {
        tags.push({
          name: tag.getTagName?.() || '',
          text: tag.getComment?.() || '',
        });
      }

      // Summary is first line, description is full text
      const lines = fullText.trim().split('\n');
      const summary = lines[0]?.trim();
      const description = fullText.trim();

      return {
        description: description || undefined,
        summary: summary || undefined,
        tags: tags.length > 0 ? tags : undefined,
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * Extract domain-specific terms from names and context
   */
  private extractDomainTerms(astNode: any): string[] {
    const terms = new Set<string>();

    // Common domain term patterns
    const domainPatterns = [
      // Business/Domain
      'user', 'account', 'customer', 'order', 'payment', 'invoice', 'product',
      'cart', 'checkout', 'shipping', 'billing', 'transaction', 'subscription',
      'authentication', 'authorization', 'permission', 'role', 'session',
      'notification', 'email', 'message', 'report', 'analytics', 'metrics',
      'dashboard', 'profile', 'settings', 'configuration', 'preference',

      // Technical domains
      'database', 'cache', 'queue', 'storage', 'file', 'upload', 'download',
      'search', 'index', 'query', 'filter', 'sort', 'pagination',
      'webhook', 'callback', 'event', 'listener', 'handler', 'processor',
      'validator', 'parser', 'serializer', 'formatter', 'converter',
      'logger', 'monitor', 'tracker', 'audit', 'security', 'encryption',
    ];

    // Get node name and code
    const name = astNode.getName?.()?.toLowerCase() || '';
    const code = astNode.getText?.()?.toLowerCase() || '';

    // Check for domain terms in name
    for (const pattern of domainPatterns) {
      if (name.includes(pattern)) {
        terms.add(pattern);
      }
    }

    // Check for domain terms in code (but limit search to avoid performance issues)
    const codePreview = code.substring(0, 500);
    for (const pattern of domainPatterns) {
      if (codePreview.includes(pattern)) {
        terms.add(pattern);
      }
    }

    return Array.from(terms);
  }

  /**
   * Extract technical keywords (async, promise, http, etc.)
   */
  private extractTechnicalKeywords(astNode: any): string[] {
    const keywords = new Set<string>();

    // Check for async
    if (astNode.isAsync?.()) {
      keywords.add('async');
      keywords.add('promise');
    }

    // Get code text
    const code = astNode.getText?.() || '';
    const lowerCode = code.toLowerCase();

    // Technical patterns
    const technicalPatterns = [
      { pattern: /\bfetch\b|\bhttp\b|\brequest\b|\bresponse\b/i, keywords: ['http', 'api', 'request'] },
      { pattern: /\bpromise\b|\basync\b|\bawait\b/i, keywords: ['async', 'promise'] },
      { pattern: /\btry\b.*\bcatch\b/is, keywords: ['error-handling', 'exception'] },
      { pattern: /\bvalidate\b|\bcheck\b|\bverify\b/i, keywords: ['validation'] },
      { pattern: /\btransform\b|\bconvert\b|\bmap\b/i, keywords: ['transformation'] },
      { pattern: /\bcreate\b|\bnew\b|\bbuild\b/i, keywords: ['creation', 'instantiation'] },
      { pattern: /\bquery\b|\bfind\b|\bsearch\b/i, keywords: ['query', 'search'] },
      { pattern: /\bupdate\b|\bmodify\b|\bset\b/i, keywords: ['mutation', 'update'] },
      { pattern: /\bdelete\b|\bremove\b|\bdestroy\b/i, keywords: ['deletion'] },
      { pattern: /\bevent\b|\bemit\b|\blisten\b/i, keywords: ['event', 'pub-sub'] },
      { pattern: /\bcache\b|\bmemo\b/i, keywords: ['caching', 'optimization'] },
      { pattern: /\bparse\b|\bencode\b|\bdecode\b/i, keywords: ['parsing', 'serialization'] },
      { pattern: /\btest\b|\bexpect\b|\bassert\b/i, keywords: ['testing', 'assertion'] },
    ];

    for (const { pattern, keywords: kws } of technicalPatterns) {
      if (pattern.test(code)) {
        kws.forEach(kw => keywords.add(kw));
      }
    }

    // Check return type
    const returnType = astNode.getReturnType?.()?.getText() || '';
    if (returnType.includes('Promise')) {
      keywords.add('async');
      keywords.add('promise');
    }

    return Array.from(keywords);
  }

  /**
   * Detect design patterns
   */
  private detectPatterns(astNode: any, nodeType: PDGNodeType): string[] {
    const patterns: string[] = [];

    if (nodeType === PDGNodeType.CLASS) {
      const name = astNode.getName?.() || '';
      const lowerName = name.toLowerCase();

      // Pattern detection by naming convention
      if (lowerName.includes('factory')) patterns.push('factory');
      if (lowerName.includes('builder')) patterns.push('builder');
      if (lowerName.includes('singleton')) patterns.push('singleton');
      if (lowerName.includes('observer')) patterns.push('observer');
      if (lowerName.includes('adapter')) patterns.push('adapter');
      if (lowerName.includes('decorator')) patterns.push('decorator');
      if (lowerName.includes('strategy')) patterns.push('strategy');
      if (lowerName.includes('repository')) patterns.push('repository');
      if (lowerName.includes('service')) patterns.push('service');
      if (lowerName.includes('controller')) patterns.push('controller');
      if (lowerName.includes('manager')) patterns.push('manager');
      if (lowerName.includes('handler')) patterns.push('handler');
      if (lowerName.includes('provider')) patterns.push('provider');
      if (lowerName.includes('serializer')) patterns.push('serializer');
      if (lowerName.includes('validator')) patterns.push('validator');
    }

    return patterns;
  }

  /**
   * Infer the primary purpose of the code
   */
  private inferPurpose(astNode: any, nodeType: PDGNodeType): CodePurpose {
    const name = astNode.getName?.()?.toLowerCase() || '';
    const code = astNode.getText?.()?.toLowerCase() || '';

    // CRUD operations
    if (name.match(/\b(create|insert|add|new|post)\b/)) return CodePurpose.CREATE;
    if (name.match(/\b(get|fetch|read|find|query|select|retrieve|load)\b/)) return CodePurpose.READ;
    if (name.match(/\b(update|modify|edit|change|patch|put)\b/)) return CodePurpose.UPDATE;
    if (name.match(/\b(delete|remove|destroy|drop)\b/)) return CodePurpose.DELETE;

    // Processing
    if (name.match(/\b(validate|check|verify|ensure)\b/)) return CodePurpose.VALIDATION;
    if (name.match(/\b(transform|convert|map|translate|parse|serialize)\b/)) return CodePurpose.TRANSFORMATION;
    if (name.match(/\b(calculate|compute|process|analyze)\b/)) return CodePurpose.CALCULATION;

    // Integration
    if (name.match(/\b(handle|on[A-Z])/)) return CodePurpose.EVENT_HANDLER;
    if (code.includes('fetch(') || code.includes('http')) return CodePurpose.API_CLIENT;

    // Infrastructure
    if (name.match(/\b(config|setup|init|initialize)\b/)) return CodePurpose.CONFIGURATION;
    if (name.match(/\b(util|helper|common)\b/)) return CodePurpose.UTILITY;
    if (name.match(/\b(factory|builder|create)\b/) && nodeType === PDGNodeType.CLASS) return CodePurpose.FACTORY;

    return CodePurpose.UNKNOWN;
  }

  /**
   * Extract external dependencies (libraries, APIs)
   */
  private extractExternalDependencies(astNode: any): string[] {
    const deps = new Set<string>();

    try {
      // Get import declarations from source file
      const sourceFile = astNode.getSourceFile?.();
      if (!sourceFile) return [];

      const imports = sourceFile.getImportDeclarations?.() || [];

      for (const imp of imports) {
        const moduleSpecifier = imp.getModuleSpecifierValue?.() || '';

        // Skip relative imports
        if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/')) {
          continue;
        }

        // Add external package name
        const pkgName = moduleSpecifier.split('/')[0];
        if (pkgName && pkgName !== '@types') {
          deps.add(pkgName);
        }
      }

      // Also check for common API patterns in code
      const code = astNode.getText?.() || '';
      if (code.includes('fetch(')) deps.add('fetch-api');
      if (code.includes('XMLHttpRequest')) deps.add('xhr');
      if (code.includes('WebSocket')) deps.add('websocket');
      if (code.includes('localStorage') || code.includes('sessionStorage')) deps.add('web-storage');

    } catch (error) {
      // Ignore errors
    }

    return Array.from(deps);
  }
}
