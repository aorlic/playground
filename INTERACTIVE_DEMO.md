# Interactive Demo - Test Coverage Analysis

## Overview

The enhanced demo now provides **interactive test coverage analysis** for low-quality nodes. After viewing the quality report, you can select any node by its ID to see detailed test coverage information.

## Features

### 1. Quality Analysis with Node IDs

The report now displays Node IDs for easy reference:

```
================================================================================
CODE QUALITY ANALYSIS - LOWEST QUALITY NODES
================================================================================

1. class: ProgramDependencyGraphBuilder
   Node ID: node_1                    ← NEW: Node ID for selection
   Quality Score: 20.0/100
   Location: /src/ProgramDependencyGraphBuilder.ts:18-609
   Metrics:
     - Cyclomatic Complexity: 93
     - Maintainability Index: 58.2
     - LCOM (Cohesion): 0.71
     - Halstead Volume: 14606
```

### 2. Interactive Node Selection

After the report, you're prompted to select a node:

```
Would you like to analyze test coverage for a specific node?
Enter a Node ID from the report above, or press Enter to exit.

Node ID: _
```

### 3. Test Coverage Analysis

When you enter a Node ID (e.g., `node_1`), the system analyzes:

- **Test file discovery**: Searches for test files using common patterns
- **Test count estimation**: Counts test cases mentioning the node
- **Coverage calculation**: Compares existing tests vs. required tests (based on CC)
- **Status assessment**: none / poor / partial / good / excellent
- **Recommendations**: Actionable advice for improving coverage

### Example Output

```
================================================================================
TEST COVERAGE ANALYSIS
================================================================================

Node: class - ProgramDependencyGraphBuilder
Node ID: node_1
Location: /src/ProgramDependencyGraphBuilder.ts:18-609

Coverage Metrics:
  Cyclomatic Complexity: 93
  Required Test Cases: 47 (for branch coverage)
  Estimated Existing Tests: 5
  Missing Tests: 42

Coverage Estimate: 10.6% [███░░░░░░░░░░░░░░░░░░░░░░░░░░░]
Status: 🔴 POOR

Test Files Found:
  📄 src/ProgramDependencyGraphBuilder.test.ts

Recommendations:
  📊 Add 42 more test case(s) for better coverage
  🔴 Extremely high complexity (CC: 93) - Consider refactoring before adding tests
  💡 Split into smaller methods to make testing easier
  ⚠️  Low maintainability (MI: 58.2) - Tests will be harder to write
  💡 Consider refactoring to improve testability
  🔴 Low cohesion (LCOM: 0.71) - Split class before testing
  💡 Each split class will be easier to test

================================================================================

Analyze another node? Enter Node ID or press Enter to exit.

Node ID: _
```

## How It Works

### Test File Discovery

The system searches for test files using these patterns:

```
1. Same directory:
   - <filename>.test.ts
   - <filename>.test.js
   - <filename>.spec.ts
   - <filename>.spec.js

2. __tests__ subdirectory:
   - __tests__/<filename>.test.ts
   - __tests__/<filename>.test.js

3. Project root test directory:
   - tests/<filename>.test.ts
   - test/<filename>.test.ts

4. Mirrored structure:
   - tests/<path>/<filename>.test.ts
   - test/<path>/<filename>.test.ts
```

### Test Count Estimation

The analyzer counts test cases by searching for:

1. **Specific mentions** of the node name in test descriptions:
   ```typescript
   it('should build ProgramDependencyGraphBuilder correctly', ...)
   describe('ProgramDependencyGraphBuilder', ...)
   ```

2. **All tests in file** (conservative fallback):
   - If no specific mentions found, assumes 30% of tests relate to the node

### Required Tests Calculation

Based on **Cyclomatic Complexity (CC)**:

| CC Range | Required Tests | Coverage Goal |
|----------|----------------|---------------|
| 1-20 | CC × 100% | Full branch coverage |
| 21-50 | CC × 75% | Most important paths |
| 51+ | CC × 50% | Critical paths only |

**Example**:
- CC = 93 → Required = 93 × 0.5 = 47 tests
- CC = 15 → Required = 15 × 1.0 = 15 tests
- CC = 5 → Required = 5 × 1.0 = 5 tests

### Coverage Status

| Coverage % | Status | Icon |
|------------|--------|------|
| 0% | None | ❌ |
| 1-29% | Poor | 🔴 |
| 30-59% | Partial | 🟡 |
| 60-89% | Good | 🟢 |
| 90-100% | Excellent | ✨ |

### Recommendations Logic

The system provides context-aware recommendations:

**No tests (0%)**:
- ⚠️  Create basic test file first
- 📝 Start with 5 essential test cases
- 🔹 Focus on constructor/main methods

**Insufficient tests**:
- 📊 Add N more test cases
- 🎯 Prioritize critical paths
- 🔹 Cover all decision branches

**High complexity (CC > 50)**:
- 🔴 Consider refactoring before testing
- 💡 Split into smaller methods

**Low maintainability (MI < 65)**:
- ⚠️  Tests will be harder to write
- 💡 Refactor to improve testability

**Low cohesion (LCOM > 0.7)**:
- 🔴 Split class before testing
- 💡 Each split class easier to test

**Good coverage (90%+)**:
- ✅ Good coverage achieved
- 🔍 Consider mutation testing

## Usage

### Run Interactive Demo

```bash
npm run demo
```

### Example Session

```bash
$ npm run demo

=== Code Quality Analysis Demo ===

Analyzing project at: /Users/aleks/Dev/casper/playground

Building Program Dependency Graph...

PDG Statistics:
  Total Nodes: 246
  Total Edges: 636
  Classes: 2
  Methods: 25
  Functions: 4

================================================================================
CODE QUALITY ANALYSIS - LOWEST QUALITY NODES
================================================================================

1. class: ProgramDependencyGraphBuilder
   Node ID: node_1
   Quality Score: 20.0/100
   ...

2. class: QualityAnalyzer
   Node ID: node_2
   Quality Score: 65.0/100
   ...

================================================================================

Would you like to analyze test coverage for a specific node?
Enter a Node ID from the report above, or press Enter to exit.

Node ID: node_1

🔍 Analyzing test coverage...

================================================================================
TEST COVERAGE ANALYSIS
================================================================================
...
[coverage report displayed]
...

Analyze another node? Enter Node ID or press Enter to exit.

Node ID: node_2

🔍 Analyzing test coverage...
...
[another coverage report]
...

Analyze another node? Enter Node ID or press Enter to exit.

Node ID: [press Enter]

Exiting...
```

## Architecture

### Components

```
demo.ts
  ↓
  ├─→ ProgramDependencyGraphBuilder (builds PDG)
  ├─→ QualityAnalyzer (scores nodes, generates report with Node IDs)
  └─→ TestCoverageAnalyzer (analyzes test coverage)
       ↓
       ├─→ findTestFiles() (discovers test files)
       ├─→ estimateTestCount() (counts test cases)
       ├─→ calculateRequiredTests() (based on CC)
       └─→ formatReport() (generates coverage report)
```

### Data Flow

```
User Input (Node ID)
  ↓
PDG.nodes.get(nodeId) → PDGNode
  ↓
TestCoverageAnalyzer.analyzeNode(node, pdg)
  ↓
TestCoverageInfo
  {
    nodeId, nodeName, location,
    hasTests, testFiles,
    estimatedTestCount, requiredTests,
    coverageEstimate, coverageStatus,
    recommendations
  }
  ↓
formatReport(coverage) → String
  ↓
console.log() → User sees coverage analysis
```

## Limitations

### Test Discovery

- **Pattern-based**: Only finds files matching common patterns
- **No AST analysis**: Doesn't parse test files to understand actual coverage
- **Heuristic counts**: Test count is estimated, not precise

### Coverage Calculation

- **Static analysis only**: No runtime execution or instrumentation
- **Estimation-based**: Uses CC as proxy for required tests
- **Conservative**: May overestimate required tests for complex code

### Recommendations

- **General guidance**: Not specific to your testing framework
- **No mutation testing**: Can't verify test quality
- **No integration testing**: Focuses on unit tests only

## Future Enhancements

### Potential Improvements

1. **AST-based test parsing**: Parse test files to accurately count test cases
2. **Framework detection**: Detect Jest/Mocha/Vitest and provide specific advice
3. **Coverage tool integration**: Parse `coverage.json` for actual coverage data
4. **Test generation**: Auto-generate test stubs for uncovered branches
5. **Mutation testing**: Suggest mutation testing tools for well-covered code
6. **Priority ranking**: Score nodes by "fixing priority" (quality × impact)
7. **Batch analysis**: Generate coverage reports for all low-quality nodes at once
8. **CI/CD integration**: Block deploys if critical nodes lack coverage

## Tips

### Finding Node IDs

Node IDs are shown in the quality report. They follow the pattern:
- `node_1`, `node_2`, `node_3`, etc. (auto-generated sequential IDs)

### Creating Test Files

To improve coverage, create test files matching these patterns:

**Option 1: Co-located tests**
```
src/
  MyClass.ts
  MyClass.test.ts  ← Easiest to find
```

**Option 2: __tests__ directory**
```
src/
  MyClass.ts
  __tests__/
    MyClass.test.ts
```

**Option 3: Separate test directory**
```
src/
  MyClass.ts
test/
  MyClass.test.ts
```

### Writing Effective Tests

For high-CC nodes, focus on:

1. **Happy path**: Main success scenario
2. **Error cases**: Each branch that throws errors
3. **Edge cases**: Boundary conditions
4. **Integration**: How it works with dependencies

### When to Refactor Before Testing

Consider refactoring first if:
- CC > 50 (extremely high complexity)
- MI < 40 (very low maintainability)
- LCOM > 0.8 (god class)

Refactoring makes tests:
- Easier to write
- Easier to understand
- More maintainable
- More effective

## Example: Improving ProgramDependencyGraphBuilder

Based on the analysis (CC: 93, MI: 58.2, LCOM: 0.71):

### Step 1: Refactor First
```typescript
// Before: God class with CC=93
class ProgramDependencyGraphBuilder {
  build() { /* 500 lines */ }
}

// After: Split responsibilities
class ASTParser { /* CC=10 */ }
class MetricsCalculator { /* CC=8 */ }
class GraphBuilder { /* CC=12 */ }
class PDGAssembler { /* CC=5 */ }
```

### Step 2: Write Focused Tests
```typescript
// Much easier to test!
describe('ASTParser', () => {
  it('should parse classes', ...)      // CC=10 → 10 tests needed
  it('should parse methods', ...)
  // ... 8 more tests
});

describe('MetricsCalculator', () => {
  it('should calculate CC', ...)       // CC=8 → 8 tests needed
  it('should calculate MI', ...)
  // ... 6 more tests
});
```

### Result
- Original: 1 class, CC=93, 47 tests needed, 0% coverage
- Refactored: 4 classes, CC≈9 each, 35 tests needed, easier to achieve 100%

## Summary

The interactive demo extends the quality analysis with:

✅ **Node IDs in reports** - Easy identification of problematic nodes
✅ **Interactive selection** - User-driven exploration of code quality
✅ **Test coverage analysis** - Understand testing gaps
✅ **Smart recommendations** - Context-aware guidance
✅ **Visual feedback** - Progress bars and status indicators
✅ **Iterative workflow** - Analyze multiple nodes in one session

This creates a complete workflow:
1. **Identify** low-quality nodes (quality report)
2. **Understand** testing gaps (coverage analysis)
3. **Act** on recommendations (refactor or test)
4. **Verify** improvements (re-run analysis)
