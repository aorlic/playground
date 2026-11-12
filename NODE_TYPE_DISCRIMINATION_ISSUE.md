# Node Type Discrimination Issue

## Problem Summary

The current quality evaluation algorithm **treats all node types equally**, applying the same mathematical formula regardless of whether a node is a complex function or a simple variable declaration. This results in **meaningless results** where trivial variable declarations appear as "lowest quality" nodes.

---

## Node Types in the System

The PDG (Program Dependency Graph) recognizes 6 node types:

```typescript
export enum PDGNodeType {
  CLASS = 'class',                    // Object-oriented classes
  METHOD = 'method',                  // Class member methods
  FUNCTION = 'function',              // Standalone functions, arrow functions
  STATEMENT = 'statement',            // Individual statements (assignments, returns)
  VARIABLE_DECLARATION = 'variable_declaration',  // const/let/var declarations
  PARAMETER = 'parameter',            // Function parameters
}
```

### Node Type Characteristics:

| Type | Complexity | Should Evaluate? | Has Metrics? | Example |
|------|------------|------------------|--------------|---------|
| **CLASS** | High | ✅ Yes | ✅ Yes (+ LCOM) | `class UserService { ... }` |
| **METHOD** | High | ✅ Yes | ✅ Yes | `async getUser(id) { ... }` |
| **FUNCTION** | High | ✅ Yes | ✅ Yes | `export const uploadPhoto = async (req, res) => { ... }` |
| **STATEMENT** | Low | ❌ No (skipped) | ❌ No | `return result;` |
| **VARIABLE_DECLARATION** | **Low** | **❌ Should Skip** | **❌ Usually No** | `const client = pool.connect();` |
| **PARAMETER** | None | ❌ No | ❌ No | `(req: Request, res: Response)` |

---

## Current Behavior: No Type Discrimination

### Code Analysis

**Location**: [QualityAnalyzer.ts:77-92](src/QualityAnalyzer.ts#L77-L92)

```typescript
analyzeQuality(pdg: ProgramDependencyGraph): NodeQuality[] {
  const results: NodeQuality[] = [];

  pdg.nodes.forEach((node) => {
    // Only skips STATEMENT nodes
    if (node.type === PDGNodeType.STATEMENT) return;  // ✅

    // ❌ PROBLEM: Treats all other types equally
    const qualityScore = this.calculateQualityScore(node);
    const issues = this.getIssues(node);

    results.push({
      node,
      qualityScore,
      issues
    });
  });

  return results.sort((a, b) => a.qualityScore - b.qualityScore);
}
```

**What gets evaluated**:
- ✅ CLASS nodes
- ✅ METHOD nodes
- ✅ FUNCTION nodes
- ⚠️ **VARIABLE_DECLARATION nodes** (shouldn't be evaluated)
- ⚠️ **PARAMETER nodes** (if they exist)

### Scoring Formula (Same for All Types)

**Location**: [QualityAnalyzer.ts:14-69](src/QualityAnalyzer.ts#L14-L69)

```typescript
calculateQualityScore(node: PDGNode): number {
  const metrics = node.metadata?.metrics;
  if (!metrics) return 50;  // ❌ Default for nodes without metrics

  let score = 100;

  // Cyclomatic Complexity penalty
  const cc = metrics.cyclomaticComplexity || 1;
  if (cc > 50) score -= 40;
  else if (cc > 20) score -= 25;
  else if (cc > 10) score -= 15;

  // Maintainability Index penalty
  const mi = metrics.maintainabilityIndex || 70;
  if (mi < 40) score -= 30;
  else if (mi < 65) score -= 15;
  else if (mi > 85) score += 10;

  // LCOM penalty - ✅ ONLY type-specific logic
  if (node.type === PDGNodeType.CLASS && metrics.lcom !== undefined) {
    const lcom = metrics.lcom;
    if (lcom > 0.8) score -= 20;
    else if (lcom > 0.6) score -= 10;
  }

  // Halstead Volume penalty
  const volume = metrics.halsteadVolume || 0;
  if (volume > 2000) score -= 15;
  else if (volume > 1000) score -= 10;

  return Math.max(0, Math.min(100, score));
}
```

**Only one type-specific check**: LCOM for classes (line 47)

**Everything else**: Same penalties for all types

---

## Real-World Impact

### Actual Results from Demo

```
================================================================================
CODE QUALITY ANALYSIS - LOWEST QUALITY NODES
================================================================================

1. variable_declaration: client
   Node ID: server_node_3
   Quality Score: 50.0/100
   Location: .../database.ts:11-11

2. variable_declaration: allowedTypes
   Node ID: server_node_30
   Quality Score: 50.0/100
   Location: .../upload.ts:22-22

3. variable_declaration: extname
   Node ID: server_node_31
   Quality Score: 50.0/100
   Location: .../upload.ts:23-23

4. variable_declaration: mimetype
   Node ID: server_node_32
   Quality Score: 50.0/100
   Location: .../upload.ts:24-24

5. variable_declaration: [user, setUser]
   Node ID: client_node_1
   Quality Score: 50.0/100
   Location: .../App.tsx:14-14
```

### What These Actually Are

**1. `client` - Simple async call**
```typescript
export const client = await pool.connect();
```
- Not a function, just a variable assignment
- No complexity to evaluate
- Score: 50 (no metrics available)

**2. `allowedTypes` - Regex constant**
```typescript
const allowedTypes = /jpeg|jpg|png|gif|webp/;
```
- Simple regex pattern
- No logic, no branches
- Score: 50 (no metrics available)

**3-4. `extname`, `mimetype` - Boolean expressions**
```typescript
const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
const mimetype = allowedTypes.test(file.mimetype);
```
- Single-line expressions
- No complexity
- Score: 50 (no metrics available)

**5. `[user, setUser]` - React hook destructuring**
```typescript
const [user, setUser] = useState(null);
```
- React state declaration
- Zero complexity
- Score: 50 (no metrics available)

### The Actual Complex Functions (Hidden)

These should be at the top but aren't:

```typescript
// CC: 8, MI: 58, Volume: 450
export const uploadPhoto = async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
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

**Actual score**: ~85 (has metrics, proper complexity)
**Listed position**: Not in top 5 (bumped out by trivial variables)

---

## Why This Happens

### 1. Variable Declarations Get Default Score

```typescript
if (!metrics) return 50;  // Default neutral score
```

**Problem**: Variable declarations rarely have calculable metrics because:
- escomplex expects complete functions/classes
- Single-line expressions don't have meaningful CC or MI
- The system doesn't try to calculate metrics for trivial nodes

### 2. No Filtering by Type

```typescript
pdg.nodes.forEach((node) => {
  if (node.type === PDGNodeType.STATEMENT) return;  // ✅ Skips statements
  // ❌ Missing: if (node.type === PDGNodeType.VARIABLE_DECLARATION) return;
});
```

**Missing filter**: Should skip VARIABLE_DECLARATION like it skips STATEMENT

### 3. Default Score (50) Appears "Worse" Than Good Functions

```typescript
// High-quality function
calculateMetrics() → CC: 3, MI: 92, Volume: 120
calculateQualityScore() → 100 - 0 + 10 = 110 → clamped to 100

// Moderate-quality function
uploadPhoto() → CC: 8, MI: 58, Volume: 450
calculateQualityScore() → 100 - 0 - 15 - 0 = 85

// Trivial variable
const client = pool.connect();
calculateMetrics() → undefined (can't analyze)
calculateQualityScore() → 50 (default)
```

**Result**: Variables (50) < Moderate functions (85) < Good functions (100)

So variables incorrectly appear as "lowest quality"!

---

## Mathematical Formula Application by Type

### Current Implementation

**Same formula for all types**:

```
score = 100
score -= CC_penalty(cc)
score -= MI_penalty(mi)
score -= Volume_penalty(volume)
if (type == CLASS) score -= LCOM_penalty(lcom)  // ✅ Only type-specific logic
return clamp(score, 0, 100)
```

**Applied to**:
- ✅ CLASS → Makes sense
- ✅ METHOD → Makes sense
- ✅ FUNCTION → Makes sense
- ❌ VARIABLE_DECLARATION → Doesn't make sense (trivial code)

### How Metrics Are Calculated

**For each node type**, the system calls:

```typescript
const metrics = this.calculateMetrics(astNode);
```

**What gets calculated**:

| Type | CC | MI | Volume | LCOM | Result |
|------|----|----|--------|------|--------|
| CLASS | ✅ | ✅ | ✅ | ✅ | Full metrics |
| METHOD | ✅ | ✅ | ✅ | ❌ | Full metrics |
| FUNCTION | ✅ | ✅ | ✅ | ❌ | Full metrics |
| VARIABLE_DECLARATION | ❌ | ❌ | ❌ | ❌ | **undefined** → score 50 |

**Why variable declarations fail**:
- escomplex.analyzeModule() expects complete functions or classes
- Single expressions like `const x = foo.bar()` don't have:
  - Cyclomatic complexity (no branches)
  - Maintainability index (not meaningful for one line)
  - Significant Halstead volume (too small)

---

## Proposed Solutions

### Solution 1: Filter Out Variable Declarations ✅ **Recommended**

**Simplest fix**: Treat VARIABLE_DECLARATION like STATEMENT (skip evaluation)

```typescript
pdg.nodes.forEach((node) => {
  // Skip non-evaluable node types
  if (node.type === PDGNodeType.STATEMENT ||
      node.type === PDGNodeType.VARIABLE_DECLARATION ||
      node.type === PDGNodeType.PARAMETER) {
    return;
  }

  const qualityScore = this.calculateQualityScore(node);
  // ...
});
```

**Pros**:
- ✅ Simple, one-line fix
- ✅ Variable declarations aren't meant to have "quality"
- ✅ Focus on actual functions/methods/classes
- ✅ Aligns with semantic meaning (variables aren't logic)

**Cons**:
- ⚠️ Loses visibility into arrow function variables

**Caveat**: Arrow functions stored as variables (e.g., `const foo = () => {}`) are marked as FUNCTION, not VARIABLE_DECLARATION, so they'll still be evaluated correctly.

---

### Solution 2: Type-Specific Scoring Formulas ⚙️ **More Complex**

Apply different scoring logic based on node type:

```typescript
calculateQualityScore(node: PDGNode): number {
  switch (node.type) {
    case PDGNodeType.CLASS:
      return this.scoreClass(node);

    case PDGNodeType.METHOD:
    case PDGNodeType.FUNCTION:
      return this.scoreFunction(node);

    case PDGNodeType.VARIABLE_DECLARATION:
      return this.scoreVariable(node);  // Different thresholds

    default:
      return 50;
  }
}

private scoreClass(node: PDGNode): number {
  // Standard penalties: CC, MI, Volume, LCOM
}

private scoreFunction(node: PDGNode): number {
  // Standard penalties: CC, MI, Volume
}

private scoreVariable(node: PDGNode): number {
  // Relaxed thresholds or skip entirely
  // Only flag if extremely complex (e.g., huge object literals)
  const volume = node.metadata?.metrics?.halsteadVolume || 0;
  if (volume > 5000) return 30;  // Massive object literal
  return 100;  // Otherwise ignore
}
```

**Pros**:
- ✅ More nuanced analysis
- ✅ Could detect complex object literals or config objects
- ✅ Extensible for future node types

**Cons**:
- ❌ More complex code
- ❌ Harder to maintain
- ❌ Unclear what thresholds make sense for variables

---

### Solution 3: Only Evaluate Nodes with Metrics 📊 **Middle Ground**

Skip any node without calculable metrics:

```typescript
pdg.nodes.forEach((node) => {
  if (node.type === PDGNodeType.STATEMENT) return;

  // Skip nodes without metrics
  if (!node.metadata?.metrics) return;  // ← New check

  const qualityScore = this.calculateQualityScore(node);
  // ...
});
```

**Pros**:
- ✅ Simple check
- ✅ Automatically excludes variable declarations (no metrics)
- ✅ Automatically excludes any other non-evaluable nodes

**Cons**:
- ⚠️ Could hide real functions that failed metric calculation
- ⚠️ Less explicit about what's being filtered

---

### Solution 4: Distinguish Arrow Function Variables 🎯 **Most Precise**

Separate "function-like" variable declarations from "data" variables:

```typescript
const isFunctionVariable = (node: PDGNode): boolean => {
  if (node.type !== PDGNodeType.VARIABLE_DECLARATION) return false;

  // Check if it has function-like characteristics
  return node.metadata?.metrics?.cyclomaticComplexity !== undefined ||
         node.metadata?.isAsync === true ||
         node.metadata?.parameters?.length > 0;
};

pdg.nodes.forEach((node) => {
  if (node.type === PDGNodeType.STATEMENT) return;

  // Skip data-only variable declarations
  if (node.type === PDGNodeType.VARIABLE_DECLARATION && !isFunctionVariable(node)) {
    return;
  }

  const qualityScore = this.calculateQualityScore(node);
  // ...
});
```

**Pros**:
- ✅ Evaluates `const handler = async (req, res) => { ... }` (function-like)
- ✅ Skips `const config = { ... }` (data-like)
- ✅ Most semantically correct

**Cons**:
- ❌ More complex logic
- ⚠️ Arrow functions are already marked as FUNCTION type, so this might be redundant

---

## Recommendation

**Use Solution 1** (Filter Out Variable Declarations):

```typescript
// QualityAnalyzer.ts:77-80
pdg.nodes.forEach((node) => {
  // Skip non-evaluable node types
  if (node.type === PDGNodeType.STATEMENT ||
      node.type === PDGNodeType.VARIABLE_DECLARATION) {
    return;
  }
  // ... rest of analysis
});
```

**Rationale**:
1. **Simplest** - One-line change
2. **Correct semantics** - Variables aren't "logic" to evaluate
3. **No loss of functionality** - Arrow functions are already typed as FUNCTION
4. **Aligns with existing design** - STATEMENT is already skipped for similar reasons

---

## Summary

### Current Behavior

**All node types** (except STATEMENT) are evaluated using the **same mathematical formula**:

```
Quality Score = 100
                - CC_penalty(cc)
                - MI_penalty(mi)
                - Volume_penalty(volume)
                - LCOM_penalty(lcom)  // Only for CLASS
```

**Node types evaluated**:
- ✅ CLASS (makes sense)
- ✅ METHOD (makes sense)
- ✅ FUNCTION (makes sense)
- ❌ **VARIABLE_DECLARATION** (doesn't make sense)

**Result**: Trivial variable declarations appear as "lowest quality" because they get the default score (50) when metrics can't be calculated.

### Proposed Fix

**Skip VARIABLE_DECLARATION** nodes entirely:

```typescript
if (node.type === PDGNodeType.STATEMENT ||
    node.type === PDGNodeType.VARIABLE_DECLARATION) {
  return;  // Skip evaluation
}
```

This focuses the quality analysis on **actual code logic** (functions, methods, classes) rather than data declarations.
