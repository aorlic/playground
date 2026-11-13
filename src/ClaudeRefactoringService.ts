import Anthropic from '@anthropic-ai/sdk';

export interface RefactoringRequest {
  code: string;
  filePath: string;
  nodeType: string;
  nodeName: string;
  currentMetrics: {
    cyclomaticComplexity?: number;
    maintainabilityIndex?: number;
    halsteadVolume?: number;
    lcom?: number;
  };
  issues: string[];
}

export interface RefactoringResult {
  refactoredCode: string;
  explanation: string;
  improvements: string[];
}

export class ClaudeRefactoringService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey: apiKey,
    });
  }

  /**
   * Refactor code using Claude API
   */
  async refactorCode(request: RefactoringRequest): Promise<RefactoringResult> {
    const prompt = this.buildRefactoringPrompt(request);

    const message = await this.client.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract refactored code from response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    return this.parseRefactoringResponse(responseText);
  }

  /**
   * Build the refactoring prompt
   */
  private buildRefactoringPrompt(request: RefactoringRequest): string {
    const { code, filePath, nodeType, nodeName, currentMetrics, issues } = request;

    return `You are an expert code refactoring assistant. Your task is to refactor the following code to improve its quality metrics.

**File**: ${filePath}
**Node Type**: ${nodeType}
**Node Name**: ${nodeName}

**Current Metrics**:
- Cyclomatic Complexity: ${currentMetrics.cyclomaticComplexity || 'N/A'}
- Maintainability Index: ${currentMetrics.maintainabilityIndex?.toFixed(1) || 'N/A'}
- Halstead Volume: ${currentMetrics.halsteadVolume?.toFixed(0) || 'N/A'}
${currentMetrics.lcom !== undefined ? `- LCOM (Class Cohesion): ${currentMetrics.lcom.toFixed(2)}` : ''}

**Identified Issues**:
${issues.length > 0 ? issues.map(i => `- ${i}`).join('\n') : '- None identified'}

**Code to Refactor**:
\`\`\`typescript
${code}
\`\`\`

**Your Task**:
1. Refactor the code to improve quality metrics, focusing on:
   - Reducing cyclomatic complexity (simplify control flow)
   - Improving maintainability (better structure, naming, documentation)
   - Reducing code volume (eliminate redundancy)
   ${currentMetrics.lcom !== undefined ? '- Improving class cohesion (group related methods)' : ''}

2. Maintain the exact same functionality and external API
3. Preserve type safety and existing types
4. Add helpful comments where complexity is unavoidable
5. Follow TypeScript best practices

**Response Format**:
Provide your response in the following format:

REFACTORED_CODE:
\`\`\`typescript
[Your refactored code here]
\`\`\`

EXPLANATION:
[Brief explanation of what you changed and why]

IMPROVEMENTS:
- [List key improvements made]
- [E.g., "Extracted validation logic into separate function"]
- [E.g., "Replaced nested if-else with early returns"]

Important: Return ONLY the refactored code block, not the entire file. Maintain the same function signature and exports.`;
  }

  /**
   * Parse Claude's refactoring response
   */
  private parseRefactoringResponse(responseText: string): RefactoringResult {
    // Extract refactored code
    const codeMatch = responseText.match(/REFACTORED_CODE:\s*```(?:typescript|ts)?\s*([\s\S]*?)```/i);
    const refactoredCode = codeMatch ? codeMatch[1].trim() : '';

    // Extract explanation
    const explanationMatch = responseText.match(/EXPLANATION:\s*([\s\S]*?)(?=IMPROVEMENTS:|$)/i);
    const explanation = explanationMatch ? explanationMatch[1].trim() : '';

    // Extract improvements
    const improvementsMatch = responseText.match(/IMPROVEMENTS:\s*([\s\S]*?)$/i);
    const improvementsText = improvementsMatch ? improvementsMatch[1].trim() : '';
    const improvements = improvementsText
      .split('\n')
      .map(line => line.replace(/^[-*]\s*/, '').trim())
      .filter(line => line.length > 0);

    // Fallback: if structured format not found, try to extract any code block
    if (!refactoredCode) {
      const anyCodeMatch = responseText.match(/```(?:typescript|ts)?\s*([\s\S]*?)```/);
      if (anyCodeMatch) {
        return {
          refactoredCode: anyCodeMatch[1].trim(),
          explanation: 'Code refactored (format not as expected)',
          improvements: ['Code improvements applied'],
        };
      }
      throw new Error('Could not extract refactored code from response');
    }

    return {
      refactoredCode,
      explanation,
      improvements,
    };
  }

  /**
   * Validate that the refactored code is valid TypeScript
   */
  async validateRefactoredCode(
    originalCode: string,
    refactoredCode: string
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Basic validation checks
    if (refactoredCode.length === 0) {
      errors.push('Refactored code is empty');
    }

    if (refactoredCode.length > originalCode.length * 3) {
      errors.push('Refactored code is significantly larger than original (possible error)');
    }

    // Check for common syntax issues
    const openBraces = (refactoredCode.match(/\{/g) || []).length;
    const closeBraces = (refactoredCode.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`Mismatched braces: ${openBraces} open, ${closeBraces} close`);
    }

    const openParens = (refactoredCode.match(/\(/g) || []).length;
    const closeParens = (refactoredCode.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push(`Mismatched parentheses: ${openParens} open, ${closeParens} close`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
