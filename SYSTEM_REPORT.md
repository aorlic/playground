# Code Quality Analysis System - Technical Report

## Overview

A TypeScript-based static code analysis system that builds Program Dependency Graphs (PDG) from JavaScript/TypeScript codebases and identifies code quality issues through comprehensive metrics analysis.

## Architecture

```
Codebase (TS/JS files)
    ↓
[ProgramDependencyGraphBuilder]
    ↓
Program Dependency Graph (nodes + edges + metrics)
    ↓
[QualityAnalyzer]
    ↓
Quality Report (top 5 lowest quality nodes)
```

## Components

### 1. ProgramDependencyGraphBuilder

Parses TypeScript/JavaScript codebases into a graph representation with calculated metrics.

**Input**: Filesystem path to codebase with `tsconfig.json`

**Output**: `ProgramDependencyGraph`
```typescript
{
  nodes: Map<string, PDGNode>,
  edges: PDGEdge[]
}
```

**PDGNode Structure**:
```typescript
{
  id: "node_42",
  type: "CLASS" | "METHOD" | "FUNCTION" | "STATEMENT",
  name: "Cache",
  filePath: "/libs/r-cacher/src/index.ts",
  startLine: 156,
  endLine: 623,
  code: "class Cache { ... }",
  metadata: {
    metrics: {
      cyclomaticComplexity: 72,        // CC: measures branching/decision complexity
      maintainabilityIndex: 57.9,      // MI: 0-100 scale (higher is better)
      lcom: 0.94,                      // Lack of Cohesion (0-1, lower is better)
      halsteadVolume: 12811            // Code volume metric
    }
  }
}
```

**PDGEdge Structure**:
```typescript
{
  from: "node_42",
  to: "node_89",
  type: "CALLS" | "CONTROL_FLOW" | "DATA_FLOW" | "CONTAINS"
}
```

**Key Technologies**:
- **ts-morph**: TypeScript compiler API wrapper for AST parsing
- **typhonjs-escomplex**: Static analysis for complexity metrics
- **TypeScript Compiler**: Transpiles TS→JS before metrics calculation

**Metrics Calculation Process**:
1. Parse TypeScript AST using ts-morph
2. For methods: wrap as standalone function (preserving `async` keyword)
3. Transpile TypeScript → JavaScript (ES2020)
4. Analyze JavaScript with typhonjs-escomplex
5. Extract: CC, MI, LCOM, Halstead metrics

**Example Metrics Calculation**:
```typescript
// Input (TypeScript method)
async processPayment(data: PaymentData): Promise<PaymentResult> {
  if (!data.amount) throw new Error('Invalid amount');
  const result = await stripe.charge(data);
  return result;
}

// Step 1: Wrap as function
async function processPayment(data: PaymentData): Promise<PaymentResult> {
  if (!data.amount) throw new Error('Invalid amount');
  const result = await stripe.charge(data);
  return result;
}

// Step 2: Transpile to JS
async function processPayment(data) {
  if (!data.amount) throw new Error('Invalid amount');
  const result = await stripe.charge(data);
  return result;
}

// Step 3: Analyze → CC: 2, MI: 78.5
```

---

### 2. QualityAnalyzer

Scores nodes based on code quality metrics and identifies problematic code.

**Input**: `ProgramDependencyGraph`

**Output**: Quality report with lowest-scoring nodes

**Quality Score Algorithm** (0-100 scale):
```
baseScore = 100

// Cyclomatic Complexity penalty
if CC > 50:  baseScore -= 40
if CC > 20:  baseScore -= 25
if CC > 10:  baseScore -= 15

// Maintainability Index adjustment
if MI < 40:  baseScore -= 30
if MI < 65:  baseScore -= 15
if MI > 85:  baseScore += 10

// LCOM penalty (classes only)
if LCOM > 0.8:  baseScore -= 20
if LCOM > 0.6:  baseScore -= 10

// Halstead Volume penalty
if volume > 2000:  baseScore -= 15
if volume > 1000:  baseScore -= 10

qualityScore = clamp(baseScore, 0, 100)
```

**Example Quality Assessment**:
```typescript
// Node: Cache class
Metrics:
  CC: 72         → -40 (extremely high)
  MI: 57.9       → -15 (low)
  LCOM: 0.94     → -20 (very low cohesion)
  Volume: 12811  → -15 (very large)

Quality Score: 100 - 40 - 15 - 20 - 15 = 10/100
```

---

## Data Flow Examples

### Example 1: Analyzing a Simple Class

**Input Code**:
```typescript
// src/Calculator.ts
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  divide(a: number, b: number): number {
    if (b === 0) throw new Error('Division by zero');
    return a / b;
  }
}
```

**Phase 1 - PDG Construction**:
```typescript
{
  nodes: Map {
    "node_1" => {
      id: "node_1",
      type: "CLASS",
      name: "Calculator",
      filePath: "/src/Calculator.ts",
      startLine: 1,
      endLine: 10,
      code: "export class Calculator { ... }",
      metadata: {
        isExported: true,
        metrics: {
          cyclomaticComplexity: 3,
          maintainabilityIndex: 85.2,
          lcom: 0.0,
          halsteadVolume: 245
        }
      }
    },
    "node_2" => {
      id: "node_2",
      type: "METHOD",
      name: "add",
      metadata: {
        metrics: {
          cyclomaticComplexity: 1,
          maintainabilityIndex: 92.3
        }
      }
    },
    "node_3" => {
      id: "node_3",
      type: "METHOD",
      name: "divide",
      metadata: {
        metrics: {
          cyclomaticComplexity: 2,
          maintainabilityIndex: 78.5
        }
      }
    }
  },
  edges: [
    { from: "node_1", to: "node_2", type: "CONTAINS" },
    { from: "node_1", to: "node_3", type: "CONTAINS" }
  ]
}
```

**Phase 2 - Quality Analysis**:
```typescript
// Quality scores for each node
{
  "node_1": {
    qualityScore: 95.0,  // Excellent: low CC, high MI, high cohesion
    issues: []
  },
  "node_2": {
    qualityScore: 100.0, // Perfect: minimal complexity
    issues: []
  },
  "node_3": {
    qualityScore: 85.0,  // Good: simple branching logic
    issues: []
  }
}
```

---

### Example 2: Analyzing Complex Code (Real Output)

**Input**: [Cache class](../../../randevu-backend/libs/r-cacher/src/index.ts:156-623)

**Phase 1 - Metrics**:
```typescript
{
  id: "r-cacher_node_42",
  type: "CLASS",
  name: "Cache",
  filePath: "/Users/aleks/Dev/randevu-backend/libs/r-cacher/src/index.ts",
  startLine: 156,
  endLine: 623,
  code: "class Cache { ... }", // 467 lines
  metadata: {
    metrics: {
      cyclomaticComplexity: 72,    // 72 decision points!
      maintainabilityIndex: 57.9,  // Below 65 threshold
      lcom: 0.94,                  // Almost no cohesion (0.94/1.0)
      halsteadVolume: 12811        // Massive code volume
    }
  }
}
```

**Phase 2 - Quality Score**:
```
Base: 100
CC penalty (72): -40     (extremely high)
MI penalty (57.9): -15   (low maintainability)
LCOM penalty (0.94): -20 (very low cohesion)
Volume penalty (12811): -15 (very large)
────────────────────────
Final Score: 10/100
```

**Issues Identified**:
- Extremely high complexity (CC: 72) → suggests 72 independent code paths
- Low maintainability (MI: 57.9) → difficult to understand/modify
- Very low cohesion (LCOM: 0.94) → methods don't work together
- Very large code volume (12811) → class is doing too much

**Recommendations** (implicit):
- Split into smaller classes (address LCOM)
- Extract methods to reduce CC
- Reduce class size to improve MI

---

## Metrics Reference

### Cyclomatic Complexity (CC)
Counts independent paths through code (branches, loops, conditions).

**Thresholds**:
- 1-10: Simple, easy to test
- 11-20: Moderate complexity
- 21-50: High complexity, hard to test
- 50+: Extremely high, refactor immediately

**Example**:
```typescript
// CC = 1 (no branches)
function add(a, b) {
  return a + b;
}

// CC = 4 (3 if + 1 base)
function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  return 'F';
}
```

### Maintainability Index (MI)
Combines CC, Halstead, and LOC into 0-100 score.

**Thresholds**:
- 85-100: Highly maintainable
- 65-85: Moderately maintainable
- 40-65: Low maintainability
- 0-40: Very low maintainability

**Formula** (simplified):
```
MI = 171 - 5.2×ln(Halstead Volume) - 0.23×CC - 16.2×ln(LOC)
```

### LCOM (Lack of Cohesion of Methods)
Henderson-Sellers metric for class cohesion (0-1 scale).

**Interpretation**:
- 0.0: Perfect cohesion (all methods use all fields)
- 0.5: Moderate cohesion
- 0.8+: Very low cohesion (class should be split)

**Example**:
```typescript
// LCOM ≈ 0.8 (low cohesion - userMethods don't touch orderFields)
class UserOrderManager {
  userName: string;
  userEmail: string;
  orderId: string;
  orderTotal: number;

  getUserInfo() { return {name: this.userName, email: this.userEmail}; }
  updateEmail(email) { this.userEmail = email; }
  getOrderTotal() { return this.orderTotal; }
  setOrderTotal(total) { this.orderTotal = total; }
}

// Better: Split into two classes (LCOM → 0.0 for each)
class User {
  name: string;
  email: string;
  getInfo() { ... }
  updateEmail() { ... }
}

class Order {
  id: string;
  total: number;
  getTotal() { ... }
  setTotal() { ... }
}
```

### Halstead Volume
Measures code "size" based on operators and operands.

**Calculation**:
```
vocabulary = uniqueOperators + uniqueOperands
length = totalOperators + totalOperands
volume = length × log2(vocabulary)
```

**Thresholds**:
- <1000: Small/simple
- 1000-2000: Moderate
- 2000+: Large (consider refactoring)

---

## Usage

### Analyze Playground Codebase
```bash
npm run demo
```

**Output**:
```
=== Code Quality Analysis Demo ===

Analyzing project at: /Users/aleks/Dev/casper/playground

PDG Statistics:
  Total Nodes: 125
  Total Edges: 234
  Classes: 3
  Methods: 25
  Functions: 8

================================================================================
CODE QUALITY ANALYSIS - LOWEST QUALITY NODES
================================================================================

1. class: ProgramDependencyGraphBuilder
   Quality Score: 55.0/100
   Location: /src/ProgramDependencyGraphBuilder.ts:18-450
   Metrics:
     - Cyclomatic Complexity: 84
     - Maintainability Index: 62.3
   Issues:
     - Extremely high complexity (CC: 84)
     - Low maintainability (MI: 62.3)
...
```

### Analyze Randevu-Backend
```bash
npm run analyze-randevu
```

**Output**: (as shown in previous section)

---

## Real-World Results

**Randevu-Backend Analysis** (6 services/libs, 490 nodes):

| Rank | Node | Type | CC | MI | LCOM | Volume | Score |
|------|------|------|----|----|------|--------|-------|
| 1 | Cache | class | 72 | 57.9 | 0.94 | 12811 | 10/100 |
| 2 | PGProxy | class | 1059 | 54.7 | - | 317793 | 30/100 |
| 3 | GatewayAssert | class | 62 | 55.2 | - | 7885 | 30/100 |
| 4 | PaginationConverter | class | 78 | 53.4 | - | 8244 | 30/100 |
| 5 | AssetServices | class | 66 | 52.2 | - | 21370 | 30/100 |

**Key Findings**:
- **PGProxy**: CC of 1059 indicates auto-generated or extremely complex code
- **Cache**: Low cohesion (0.94) suggests class is doing multiple unrelated things
- **Average quality**: 68.1/100 (moderate, but with significant outliers)

---

## System Limitations

1. **STATEMENT nodes excluded**: Only analyzes classes, methods, functions (not individual statements)
2. **TypeScript-only**: Requires valid `tsconfig.json` in project root
3. **No runtime analysis**: Static analysis only (no execution profiling)
4. **Single-file classes**: Classes split across files may not be analyzed correctly
5. **LCOM calculation**: Only works for classes (not applicable to functions)

---

## Technology Stack

| Component | Library | Version | Purpose |
|-----------|---------|---------|---------|
| AST Parsing | ts-morph | ^28.0.0 | TypeScript AST manipulation |
| Metrics | typhonjs-escomplex | ^0.1.0 | Complexity analysis |
| Type System | TypeScript | ^7.0.2 | Type checking & compilation |
| Runtime | Node.js | 18+ | JavaScript execution |

---

## Future Enhancements

1. **Trend analysis**: Track quality scores over time
2. **Refactoring suggestions**: Automated recommendations (e.g., "Extract method X")
3. **Custom thresholds**: Configurable CC/MI/LCOM limits per project
4. **HTML reports**: Visual dashboards with charts
5. **CI/CD integration**: Fail builds if quality drops below threshold
6. **Cross-file analysis**: Detect coupling between modules

---

## Example Report Format

```
================================================================================
CODE QUALITY ANALYSIS - LOWEST QUALITY NODES
================================================================================

1. class: Cache
   Quality Score: 10.0/100
   Location: /libs/r-cacher/src/index.ts:156-623
   Metrics:
     - Cyclomatic Complexity: 72
     - Maintainability Index: 57.9
     - LCOM (Cohesion): 0.94
     - Halstead Volume: 12811
   Issues:
     - Extremely high complexity (CC: 72)
     - Low maintainability (MI: 57.9)
     - Very low cohesion (LCOM: 0.94)
     - Very large code volume (12811)

================================================================================
Total nodes analyzed: 237
Average quality score: 68.1/100
================================================================================
```
