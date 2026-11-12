# Code Quality Evaluation Algorithm

This document provides a comprehensive explanation of the algorithm used to evaluate code quality before generating the top-5 lowest quality nodes report.

## Overview

The quality evaluation system uses a **multi-metric scoring approach** that combines four industry-standard software metrics to produce a single quality score (0-100, where **higher is better**). The system then ranks all nodes by quality score, with the **lowest scores** indicating code that requires the most attention.

---

## Phase 1: Metric Calculation (Per Node)

For each code node (class, method, function), the system calculates four fundamental metrics using the **typhonjs-escomplex** library:

### 1. Cyclomatic Complexity (CC)

**What it measures**: The number of independent paths through the code.

**How it's calculated**:
- TypeScript/JavaScript code is transpiled to JavaScript (ES2020)
- The escomplex analyzer counts decision points:
  - `if`, `else`, `case` statements
  - `&&`, `||` operators
  - `for`, `while`, `do-while` loops
  - Ternary operators (`? :`)
  - `catch` blocks
- Base complexity = 1, each decision point adds +1

**Code location**: [ProgramDependencyGraphBuilder.ts:89-92](src/ProgramDependencyGraphBuilder.ts#L89-L92)

```typescript
const analysis = escomplex.analyzeModule(jsCode, {
  loc: true,
  newmi: true,
});
const cc = analysis.aggregate.cyclomatic;
```

**Example**:
```typescript
// CC = 1 (no branches)
function simple() {
  return 42;
}

// CC = 3 (two if statements)
function moderate(x, y) {
  if (x > 0) {  // +1
    if (y > 0) {  // +1
      return x + y;
    }
  }
  return 0;
}

// CC = 8 (complex logic)
async function complex(req, res) {
  if (!req.file) return;  // +1
  if (!category) return;  // +1

  try {  // +1 (implicit)
    if (category === 'A') {  // +1
      // ...
    } else if (category === 'B') {  // +1
      // ...
    }

    if (result && result.rows) {  // +2 (&&)
      // ...
    }
  } catch (error) {  // +1
    // ...
  }
}
```

**Industry thresholds**:
- CC ≤ 10: Simple, easy to test
- CC 11-20: Moderate, needs attention
- CC 21-50: Complex, refactoring recommended
- CC > 50: Very complex, high risk

---

### 2. Maintainability Index (MI)

**What it measures**: Overall code maintainability (0-100 scale, higher is better).

**How it's calculated**:
The escomplex library uses the **Microsoft Visual Studio formula**:

```
MI = MAX(0, (171 - 5.2 * ln(V) - 0.23 * CC - 16.2 * ln(LOC)) * 100 / 171)
```

Where:
- **V** = Halstead Volume (code complexity based on operators/operands)
- **CC** = Cyclomatic Complexity
- **LOC** = Lines of Code

**Code location**: [ProgramDependencyGraphBuilder.ts:96-98](src/ProgramDependencyGraphBuilder.ts#L96-L98)

```typescript
const maintainability = analysis.maintainability !== undefined
  ? analysis.maintainability
  : analysis.aggregate.maintainability;
```

**Factors that lower MI**:
- Large number of operators/operands (high Halstead Volume)
- High cyclomatic complexity
- Many lines of code
- Complex nesting

**Industry thresholds**:
- MI ≥ 85: Highly maintainable (green)
- MI 65-84: Moderately maintainable (yellow)
- MI 40-64: Low maintainability (orange)
- MI < 40: Very low maintainability (red)

**Example**:
```typescript
// MI ≈ 95 (excellent)
function add(a: number, b: number): number {
  return a + b;
}

// MI ≈ 60 (needs improvement)
export const uploadPhoto = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const { category } = req.body;
    const user = req.user as any;
    if (!category || !['NATURE', 'URBAN', 'PORTRAIT'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    const result = await pool.query(
      `INSERT INTO photos (user_id, filename, original_name, category, file_path)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user.id, req.file.filename, req.file.originalname, category, `/uploads/${req.file.filename}`]
    );
    res.status(201).json({ photo: result.rows[0] });
  } catch (error) {
    console.error('Error uploading photo:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
};
```

---

### 3. Halstead Volume

**What it measures**: Code size based on the number and variety of operators and operands.

**How it's calculated**:

1. **Count unique operators** (n1): `+`, `-`, `if`, `return`, `=>`, `.query()`, etc.
2. **Count unique operands** (n2): Variables, constants, literals
3. **Count total operators** (N1): All operator occurrences
4. **Count total operands** (N2): All operand occurrences

**Formulas**:
```
Vocabulary = n1 + n2
Length = N1 + N2
Volume = Length × log₂(Vocabulary)
```

**Code location**: [ProgramDependencyGraphBuilder.ts:103](src/ProgramDependencyGraphBuilder.ts#L103)

```typescript
halsteadVolume: analysis.aggregate.halstead?.volume
```

**Example**:
```typescript
function example(x, y) {  // Operators: function, (, ), {
  return x + y;            // Operators: return, +, ;
}                          // Operands: example, x, y, x, y

// n1 = 6 unique operators (function, (, ), {, return, +)
// n2 = 3 unique operands (example, x, y)
// N1 = 8 total operators
// N2 = 5 total operands
// Vocabulary = 6 + 3 = 9
// Length = 8 + 5 = 13
// Volume = 13 × log₂(9) ≈ 41.2
```

**Industry thresholds**:
- Volume ≤ 1000: Reasonable size
- Volume 1001-2000: Large, consider splitting
- Volume > 2000: Very large, refactoring needed

---

### 4. Lack of Cohesion of Methods (LCOM)

**What it measures**: How well methods in a class work together (0-1 scale, **lower is better**).

**How it's calculated** (Henderson-Sellers method):

1. **Identify instance variables**: All non-static properties in the class
2. **Track variable access**: For each method, record which instance variables it uses
3. **Calculate cohesion**:

```
For each variable V:
  - Count methods that access V (accessCount)
  - Count methods that DON'T access V (methods.length - accessCount)

totalAccess = sum of all accessCounts
totalNonAccess = sum of all nonAccessCounts

LCOM = (totalNonAccess - totalAccess) / (methods.length × variables.count)
```

**Code location**: [ProgramDependencyGraphBuilder.ts:126-190](src/ProgramDependencyGraphBuilder.ts#L126-L190)

```typescript
private calculateLCOM(classDecl: any): number | undefined {
  const methods = classDecl.getMethods();
  const instanceVariables = new Set<string>();

  // Collect properties
  classDecl.getProperties().forEach((prop: any) => {
    if (!prop.isStatic()) {
      instanceVariables.add(prop.getName());
    }
  });

  // Track which variables each method accesses
  methods.forEach((method: any) => {
    const body = method.getBody();
    const identifiers = body.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
    identifiers.forEach((propAccess: any) => {
      if (propAccess.getExpression().getText() === 'this') {
        // Track this.variableName access
      }
    });
  });

  // Calculate LCOM score
  const lcom = (totalNonAccess - totalAccess) / (methods.length * instanceVariables.size);
  return Math.max(0, lcom);
}
```

**Example**:

```typescript
// LCOM ≈ 0.33 (good cohesion - methods share variables)
class UserService {
  private db: Database;
  private cache: Cache;

  async getUser(id: string) {
    // Uses: this.db, this.cache
    const cached = this.cache.get(id);
    if (cached) return cached;
    return this.db.query(id);
  }

  async saveUser(user: User) {
    // Uses: this.db, this.cache
    await this.db.save(user);
    this.cache.set(user.id, user);
  }

  clearCache() {
    // Uses: this.cache only
    this.cache.clear();
  }
}
// 3 methods, 2 variables
// db: accessed by 2 methods (2 access, 1 non-access)
// cache: accessed by 3 methods (3 access, 0 non-access)
// totalAccess = 2 + 3 = 5
// totalNonAccess = 1 + 0 = 1
// LCOM = (1 - 5) / (3 × 2) = -4/6 = max(0, -0.67) = 0.33 ✓

// LCOM ≈ 0.83 (poor cohesion - unrelated methods)
class MixedBag {
  private userId: string;
  private config: Config;
  private logger: Logger;

  getUserId() {
    // Uses: this.userId only
    return this.userId;
  }

  loadConfig() {
    // Uses: this.config only
    return this.config.load();
  }

  log(msg: string) {
    // Uses: this.logger only
    this.logger.info(msg);
  }
}
// 3 methods, 3 variables
// Each variable accessed by only 1 method
// totalAccess = 1 + 1 + 1 = 3
// totalNonAccess = 2 + 2 + 2 = 6
// LCOM = (6 - 3) / (3 × 3) = 3/9 = 0.33... but with worse sharing pattern
```

**Industry thresholds**:
- LCOM ≤ 0.6: Good cohesion
- LCOM 0.6-0.8: Low cohesion, consider refactoring
- LCOM > 0.8: Very low cohesion, class should be split

---

## Phase 2: Quality Score Calculation

After calculating the four metrics, the system computes a **unified quality score** using a penalty-based system.

**Algorithm**: [QualityAnalyzer.ts:14-69](src/QualityAnalyzer.ts#L14-L69)

```typescript
calculateQualityScore(node: PDGNode): number {
  let score = 100;  // Start with perfect score

  // Apply penalties based on thresholds

  // 1. Cyclomatic Complexity penalties
  if (cc > 50) score -= 40;       // Critical
  else if (cc > 20) score -= 25;  // High
  else if (cc > 10) score -= 15;  // Moderate

  // 2. Maintainability Index adjustments
  if (mi < 40) score -= 30;       // Very low
  else if (mi < 65) score -= 15;  // Low
  else if (mi > 85) score += 10;  // Excellent (bonus!)

  // 3. LCOM penalties (classes only)
  if (node.type === CLASS && lcom > 0.8) score -= 20;  // Very low cohesion
  else if (lcom > 0.6) score -= 10;                    // Low cohesion

  // 4. Halstead Volume penalties
  if (volume > 2000) score -= 15;  // Very large
  else if (volume > 1000) score -= 10;  // Large

  return Math.max(0, Math.min(100, score));  // Clamp to [0, 100]
}
```

### Scoring Examples

**Example 1: High-quality function**
```typescript
function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
```
- CC = 1 → No penalty
- MI = 98 → +10 bonus
- Volume = 45 → No penalty
- **Final Score: 110 → clamped to 100** ✅

**Example 2: Moderate-quality function**
```typescript
export const uploadPhoto = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // ... 20 more lines with 3 if statements, try-catch
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
};
```
- CC = 6 → No penalty
- MI = 58 → -15 penalty (< 65)
- Volume = 450 → No penalty
- **Final Score: 85** ⚠️

**Example 3: Low-quality function**
```typescript
async function processOrder(order, user, inventory, payment, shipping) {
  // 150 lines of code
  // 15 if/else statements
  // 8 nested loops
  // 12 try-catch blocks
  // Multiple database queries
  // Complex business logic
}
```
- CC = 42 → -25 penalty (> 20)
- MI = 35 → -30 penalty (< 40)
- Volume = 2500 → -15 penalty (> 2000)
- **Final Score: 100 - 25 - 30 - 15 = 30** 🔴

---

## Phase 3: Ranking and Filtering

### Step 1: Filter Meaningful Nodes

**Code**: [QualityAnalyzer.ts:77-83](src/QualityAnalyzer.ts#L77-L83)

```typescript
pdg.nodes.forEach((node) => {
  // Only analyze meaningful nodes (skip statements and variable declarations)
  // Variable declarations are data, not logic, and rarely have meaningful metrics
  if (node.type === PDGNodeType.STATEMENT ||
      node.type === PDGNodeType.VARIABLE_DECLARATION) {
    return;
  }
  // Only analyze: CLASS, METHOD, FUNCTION
});
```

**Rationale**: Individual statements and variable declarations are too granular or lack meaningful complexity. We focus on:
- **Functions**: Complete units of behavior (including arrow functions)
- **Methods**: Class member functions
- **Classes**: Object-oriented structures

**Filtered out**:
- **Statements**: Too granular (individual assignments, returns)
- **Variable declarations**: Data, not logic (e.g., `const config = { ... }`, `const regex = /pattern/`)

**Note**: Arrow functions stored in variables (e.g., `const handler = async () => { ... }`) are automatically classified as FUNCTION nodes, not VARIABLE_DECLARATION, so they are still evaluated correctly.

### Step 2: Sort by Quality Score

**Code**: [QualityAnalyzer.ts:91-92](src/QualityAnalyzer.ts#L91-L92)

```typescript
return results.sort((a, b) => a.qualityScore - b.qualityScore);
```

**Result**: Nodes with **lowest quality scores** appear first (worst code rises to the top).

### Step 3: Generate Top-N Report

**Code**: [QualityAnalyzer.ts:129-172](src/QualityAnalyzer.ts#L129-L172)

```typescript
generateReport(pdg: ProgramDependencyGraph, topN: number = 5): string {
  const analysis = this.analyzeQuality(pdg);
  const worst = analysis.slice(0, topN);  // Take first N (worst)

  // Format report with:
  // - Node name and type
  // - Quality score
  // - File location (path:line-line)
  // - All four metrics
  // - Specific issues detected
}
```

**Example report** (from photos-portal repository):
```
================================================================================
CODE QUALITY ANALYSIS - LOWEST QUALITY NODES
================================================================================

1. function: register
   Node ID: server_node_5
   Quality Score: 75.0/100
   Location: server/src/controllers/authController.ts:6-53
   Metrics:
     - Cyclomatic Complexity: 9
     - Maintainability Index: 55.9
     - Halstead Volume: 1038
   Issues:
     - Low maintainability (MI: 55.9)
     - Large code volume (1038)

2. function: initDatabase
   Node ID: server_node_2
   Quality Score: 85.0/100
   Location: server/src/config/database.ts:10-89
   Metrics:
     - Cyclomatic Complexity: 2
     - Maintainability Index: 62.2
     - Halstead Volume: 327
   Issues:
     - Low maintainability (MI: 62.2)

3. function: addComment
   Node ID: server_node_15
   Quality Score: 85.0/100
   Location: server/src/controllers/commentController.ts:4-35
   Metrics:
     - Cyclomatic Complexity: 4
     - Maintainability Index: 57.2
     - Halstead Volume: 698
   Issues:
     - Low maintainability (MI: 57.2)

4. function: uploadPhoto
   Node ID: server_node_19
   Quality Score: 85.0/100
   Location: server/src/controllers/photoController.ts:5-36
   Metrics:
     - Cyclomatic Complexity: 5
     - Maintainability Index: 56.9
     - Halstead Volume: 788
   Issues:
     - Low maintainability (MI: 56.9)

...

================================================================================
Total nodes analyzed: 21
Average quality score: 88.1/100
================================================================================
```

**Note**: Only FUNCTION, METHOD, and CLASS nodes are analyzed. Variable declarations and statements are excluded because they represent data rather than executable logic.

---

## Phase 4: Issue Detection

For each low-quality node, the system generates **human-readable issue descriptions**:

**Code**: [QualityAnalyzer.ts:98-124](src/QualityAnalyzer.ts#L98-L124)

```typescript
private getIssues(node: PDGNode): string[] {
  const issues: string[] = [];

  if (cc > 50) issues.push(`Extremely high complexity (CC: ${cc})`);
  else if (cc > 20) issues.push(`High complexity (CC: ${cc})`);
  else if (cc > 10) issues.push(`Moderate complexity (CC: ${cc})`);

  if (mi < 40) issues.push(`Very low maintainability (MI: ${mi.toFixed(1)})`);
  else if (mi < 65) issues.push(`Low maintainability (MI: ${mi.toFixed(1)})`);

  if (node.type === CLASS && lcom > 0.8) {
    issues.push(`Very low cohesion (LCOM: ${lcom.toFixed(2)})`);
  } else if (lcom > 0.6) {
    issues.push(`Low cohesion (LCOM: ${lcom.toFixed(2)})`);
  }

  if (volume > 2000) issues.push(`Very large code volume (${volume.toFixed(0)})`);
  else if (volume > 1000) issues.push(`Large code volume (${volume.toFixed(0)})`);

  return issues;
}
```

**Issue priority**:
1. **Critical** (CC > 50, MI < 40, LCOM > 0.8): Immediate refactoring needed
2. **High** (CC 21-50, MI 40-64, LCOM 0.6-0.8): Should be addressed soon
3. **Moderate** (CC 11-20, MI 65-84): Consider refactoring when convenient

---

## Complete Algorithm Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. PARSE CODEBASE (ProgramDependencyGraphBuilder)          │
├─────────────────────────────────────────────────────────────┤
│ • Load TypeScript files via ts-morph                        │
│ • Detect: Classes, Methods, Functions, Arrow Functions      │
│ • Build AST (Abstract Syntax Tree)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. CALCULATE METRICS (per node)                            │
├─────────────────────────────────────────────────────────────┤
│ For each node:                                              │
│   • Transpile TypeScript → JavaScript (ES2020)             │
│   • Run escomplex analyzer:                                 │
│     - Cyclomatic Complexity (control flow paths)            │
│     - Maintainability Index (Microsoft formula)             │
│     - Halstead Volume (operator/operand analysis)           │
│   • For classes only: Calculate LCOM                        │
│     - Track variable access patterns                        │
│     - Henderson-Sellers method                              │
│   • Store metrics in node.metadata.metrics                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. CALCULATE QUALITY SCORES (QualityAnalyzer)              │
├─────────────────────────────────────────────────────────────┤
│ For each node:                                              │
│   score = 100                                               │
│   if (CC > 50) score -= 40                                  │
│   else if (CC > 20) score -= 25                             │
│   else if (CC > 10) score -= 15                             │
│                                                             │
│   if (MI < 40) score -= 30                                  │
│   else if (MI < 65) score -= 15                             │
│   else if (MI > 85) score += 10                             │
│                                                             │
│   if (LCOM > 0.8) score -= 20                              │
│   else if (LCOM > 0.6) score -= 10                          │
│                                                             │
│   if (volume > 2000) score -= 15                            │
│   else if (volume > 1000) score -= 10                       │
│                                                             │
│   qualityScore = clamp(score, 0, 100)                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. RANK NODES                                               │
├─────────────────────────────────────────────────────────────┤
│ • Filter out STATEMENT nodes (too granular)                 │
│ • Sort by qualityScore (ascending = worst first)            │
│ • Calculate average quality across all nodes                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. GENERATE REPORT                                          │
├─────────────────────────────────────────────────────────────┤
│ • Take top N worst nodes (default: 5)                       │
│ • For each node:                                            │
│   - Display: name, type, ID, quality score                  │
│   - Display: file location (path:startLine-endLine)         │
│   - Display: all four metrics                               │
│   - Generate human-readable issues list                     │
│ • Show summary statistics                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Benefits of This Approach

### 1. Multi-dimensional Analysis
- **No single metric** determines quality
- Combines complexity, maintainability, size, and cohesion
- More robust than any individual metric

### 2. Industry-standard Thresholds
- Based on research (McCabe, Halstead, Henderson-Sellers)
- Proven correlation with defect rates
- Used by tools like SonarQube, CodeClimate

### 3. Actionable Results
- Specific issues identified ("High complexity: CC 42")
- Clear location (file:line)
- Prioritized by severity (worst first)

### 4. Scalable
- Works for single projects and monorepos
- Handles thousands of nodes efficiently
- Combines results from multiple subprojects

### 5. Extensible
- Easy to add new metrics
- Adjustable thresholds
- Pluggable scoring formula

---

## References

### Academic Papers
- **McCabe, T. J.** (1976). "A Complexity Measure". IEEE Transactions on Software Engineering.
- **Halstead, M. H.** (1977). "Elements of Software Science". Elsevier.
- **Henderson-Sellers, B.** (1996). "Object-Oriented Metrics: Measures of Complexity". Prentice Hall.

### Tools
- **typhonjs-escomplex**: JavaScript complexity analysis library
- **ts-morph**: TypeScript AST manipulation
- **TypeScript Compiler API**: Transpilation and type analysis

### Industry Standards
- **Microsoft Maintainability Index**: Visual Studio Code Metrics
- **SonarQube Rules**: Quality gates and thresholds
- **IEEE Standards**: Software quality measurement

---

## Summary

The code quality evaluation algorithm:

1. **Parses** the codebase and extracts all meaningful code nodes
2. **Filters** to only evaluate executable logic:
   - ✅ Classes, Methods, Functions
   - ❌ Statements, Variable Declarations (data, not logic)
3. **Calculates** four metrics for each node:
   - Cyclomatic Complexity (control flow)
   - Maintainability Index (overall quality)
   - Halstead Volume (code size)
   - LCOM (class cohesion)
4. **Scores** each node (0-100) using a penalty-based system
5. **Ranks** nodes by score (lowest = worst quality)
6. **Reports** the top N worst nodes with detailed issues

The result is a **prioritized list** of code that needs refactoring, making it easy for developers to focus on the most problematic areas first.

### Important Note on Node Type Filtering

The algorithm applies the **same mathematical formula** to all evaluated node types (CLASS, METHOD, FUNCTION), with one exception:
- **LCOM penalty** only applies to CLASS nodes

However, not all node types are evaluated:
- **VARIABLE_DECLARATION** nodes are **excluded** because they represent data declarations (constants, config objects) rather than executable logic
- **STATEMENT** nodes are **excluded** because they are too granular (individual lines of code)

This ensures that the quality report focuses on **meaningful code units** that developers can actually refactor, rather than trivial variable assignments that would pollute the results.
