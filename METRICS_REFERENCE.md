# Code Quality Metrics - Quick Reference Guide

## Overview

This guide provides expected values and quality ranges for all code metrics used in the analysis system.

---

## 1. Cyclomatic Complexity (CC)

### Definition
Number of **independent execution paths** through code. Counts decision points: `if`, `else`, `while`, `for`, `case`, `&&`, `||`, `?:`, `catch`.

### Formula
```
CC = E - N + 2P

Where:
  E = edges in control flow graph
  N = nodes in control flow graph
  P = connected components (usually 1)
```

**Simplified**: `CC = 1 + (number of decision points)`

### Quality Ranges

| Range | Quality | Risk Level | Testing Effort | Description |
|-------|---------|------------|----------------|-------------|
| **1-10** | ✅ Excellent | Low | 1-10 tests | Simple, easy to test and maintain |
| **11-20** | ⚠️ Moderate | Medium | 11-20 tests | Acceptable complexity, watch carefully |
| **21-50** | 🔶 High | High | 21-50 tests | Complex, difficult to test thoroughly |
| **51-100** | 🔴 Very High | Critical | 51-100 tests | Nearly impossible to test fully |
| **100+** | 💀 Extreme | Untestable | 100+ tests | Auto-generated or pathological code |

### Examples

```typescript
// CC = 1 (no branches)
function add(a: number, b: number): number {
  return a + b;
}

// CC = 2 (one if)
function isPositive(n: number): boolean {
  if (n > 0) return true;
  return false;
}

// CC = 4 (three if statements)
function getGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  return 'F';
}

// CC = 7 (multiple decision points)
function processPayment(amount: number, method: string): boolean {
  if (amount <= 0) return false;           // +1
  if (!method) return false;               // +1

  if (method === 'credit') {               // +1
    return chargeCreditCard(amount);
  } else if (method === 'debit') {         // +1
    return chargeDebitCard(amount);
  } else if (method === 'paypal') {        // +1
    return chargePayPal(amount);
  }

  return false;
}
```

### Industry Standards

| Organization | Recommended Max CC |
|--------------|-------------------|
| NIST (National Institute of Standards) | 10 |
| SEI (Software Engineering Institute) | 10-15 |
| Microsoft | 15 |
| Sonar (Default) | 10 |

### Red Flags
- CC > 20: **Should be refactored**
- CC > 50: **Must be refactored immediately**
- CC > 100: **Likely auto-generated or legacy nightmare**

---

## 2. Maintainability Index (MI)

### Definition
A **composite metric** (0-100 scale) combining Halstead Volume, Cyclomatic Complexity, and Lines of Code to assess how easy code is to maintain.

### Formula
```
MI = max(0, 171 - 5.2×ln(HalsteadVolume) - 0.23×CC - 16.2×ln(LOC))

Where:
  HalsteadVolume = measure of code size/complexity
  CC = Cyclomatic Complexity
  LOC = Lines of Code
```

**Note**: Some tools use variations that scale to 0-100 range.

### Quality Ranges

| Range | Quality | Maintainability | Action Required | Typical Code |
|-------|---------|-----------------|-----------------|--------------|
| **85-100** | ✅ Excellent | Highly maintainable | None | Small, focused methods with clear logic |
| **65-85** | ⚠️ Good | Moderately maintainable | Monitor | Standard business logic, some complexity |
| **40-65** | 🔶 Low | Difficult to maintain | Consider refactoring | Large methods, high complexity |
| **20-40** | 🔴 Very Low | Hard to change safely | Refactor soon | God classes, tangled logic |
| **0-20** | 💀 Critical | Nearly unmaintainable | Refactor immediately | Legacy code, generated code |

### Interpretation

**High MI (85-100)**:
- Easy for new developers to understand
- Low risk when making changes
- Bugs are easy to locate and fix

**Medium MI (65-85)**:
- Requires some effort to understand
- Moderate risk when changing
- Most production code falls here

**Low MI (40-65)**:
- Requires significant effort to understand
- High risk of breaking things when changing
- Should be scheduled for refactoring

**Very Low MI (< 40)**:
- Difficult to understand even for experienced devs
- Very high risk when changing
- Often has hidden bugs
- Immediate refactoring priority

### Examples

```typescript
// MI ≈ 95 (Excellent)
function calculateTotal(price: number, quantity: number): number {
  return price * quantity;
}

// MI ≈ 75 (Good)
function validateUser(user: User): boolean {
  if (!user) return false;
  if (!user.email) return false;
  if (!user.name) return false;
  if (user.age < 18) return false;
  return true;
}

// MI ≈ 55 (Low) - 50 lines, CC=12
function processOrder(order: Order): Result {
  // Lots of validation
  // Multiple branches
  // Complex calculations
  // Database calls
  // Error handling
  // Logging
  // ... 40+ lines of mixed logic
}

// MI ≈ 30 (Very Low) - 200 lines, CC=45
class OrderProcessor {
  // God class with 20+ methods
  // High coupling
  // Mixed responsibilities
  // Complex state management
}
```

### Factors That Lower MI
1. **High CC**: Many decision points
2. **Large Halstead Volume**: Complex operations
3. **High LOC**: Long methods/classes
4. **Poor structure**: Mixed abstraction levels

---

## 3. LCOM (Lack of Cohesion of Methods)

### Definition
Measures how **tightly related** methods in a class are. High LCOM indicates a class is doing multiple unrelated things.

### Henderson-Sellers Formula
```
LCOM = (M - ΣMF/F) / (M - 1)

Where:
  M = number of methods in class
  F = number of instance fields (variables)
  MF = number of methods that access each field
  ΣMF = sum of all methods accessing all fields
```

**Result**: Value from 0.0 (perfect cohesion) to 1.0 (no cohesion)

### Quality Ranges

| Range | Quality | Cohesion Level | Action | Meaning |
|-------|---------|----------------|--------|---------|
| **0.0-0.3** | ✅ Excellent | High cohesion | None | Methods work together, share state |
| **0.3-0.5** | ⚠️ Good | Moderate cohesion | Monitor | Class has focused purpose |
| **0.5-0.7** | 🔶 Moderate | Low cohesion | Consider splitting | Class does 2-3 things |
| **0.7-0.9** | 🔴 Low | Very low cohesion | Should split | Multiple responsibilities |
| **0.9-1.0** | 💀 Critical | No cohesion | Must split | God class anti-pattern |

### Examples

```typescript
// LCOM ≈ 0.0 (Perfect cohesion)
class Circle {
  private radius: number;  // Used by ALL methods

  getArea(): number {
    return Math.PI * this.radius * this.radius;
  }

  getCircumference(): number {
    return 2 * Math.PI * this.radius;
  }

  getDiameter(): number {
    return 2 * this.radius;
  }
}
// All 3 methods use the 1 field → LCOM = 0


// LCOM ≈ 0.2 (Excellent cohesion)
class User {
  private name: string;
  private email: string;
  private age: number;

  getFullName(): string {
    return this.name;  // Uses name
  }

  getContactInfo(): string {
    return `${this.name} <${this.email}>`;  // Uses name, email
  }

  isAdult(): boolean {
    return this.age >= 18;  // Uses age
  }
}
// Most methods share most fields → Low LCOM


// LCOM ≈ 0.8 (Very low cohesion - SPLIT THIS)
class UserOrderManager {
  // User-related fields
  private userName: string;
  private userEmail: string;

  // Order-related fields
  private orderId: string;
  private orderTotal: number;

  // User methods (only use user fields)
  getUserInfo() { return {name: this.userName, email: this.userEmail}; }
  updateEmail(email: string) { this.userEmail = email; }

  // Order methods (only use order fields)
  getOrderTotal() { return this.orderTotal; }
  setOrderTotal(total: number) { this.orderTotal = total; }
}
// Two separate groups that don't share fields → High LCOM → SPLIT!


// LCOM ≈ 0.95 (Critical - God class)
class Cache {
  private redisProxy: RedisProxy;
  private ttl: number;
  private keys: RedisKeys;
  private env: string;

  // Session methods (use redisProxy, env, ttl)
  setSession() { ... }
  getSession() { ... }
  deleteSession() { ... }

  // Lock methods (use redisProxy, env only)
  lockFlow() { ... }
  unlockFlow() { ... }

  // Event methods (use redisProxy, env, keys)
  pushEvent() { ... }
  publishEvent() { ... }

  // MP key methods (use redisProxy, env only)
  setMPKey() { ... }
  getMPKey() { ... }

  // ... 20+ more methods
}
// Many groups of methods that barely share state → LCOM ≈ 0.95
```

### What LCOM Tells You

| LCOM | Interpretation | Refactoring |
|------|----------------|-------------|
| < 0.3 | Class is well-designed, focused | Keep as is ✅ |
| 0.3-0.5 | Class is doing 2 related things | Consider splitting if large |
| 0.5-0.7 | Class has multiple responsibilities | Should split into 2-3 classes |
| 0.7-0.9 | God class, methods don't relate | Must split into multiple classes |
| > 0.9 | Extreme god class | Immediate refactoring priority |

### Why High LCOM Is Bad

1. **Conceptual confusion**: What is this class for?
2. **Hard to reuse**: Can't use one feature without bringing all features
3. **Testing complexity**: Need to mock/setup entire class for one method
4. **Change risk**: Modifying one feature might break another
5. **Naming difficulty**: Can't find a name that describes everything

---

## 4. Halstead Volume

### Definition
Measures code **size and complexity** based on the vocabulary (unique operators/operands) and length (total uses).

### Formula
```
vocabulary (n) = n1 + n2
  where n1 = number of unique operators
        n2 = number of unique operands

length (N) = N1 + N2
  where N1 = total occurrences of operators
        N2 = total occurrences of operands

volume (V) = N × log₂(n)
```

### What Counts as Operators/Operands

**Operators** (n1):
- Keywords: `if`, `else`, `for`, `while`, `return`, `async`, `await`
- Operators: `+`, `-`, `*`, `/`, `=`, `==`, `===`, `&&`, `||`
- Punctuation: `()`, `{}`, `[]`, `.`, `,`, `;`

**Operands** (n2):
- Variables: `user`, `total`, `result`
- Constants: `0`, `1`, `"hello"`, `true`, `null`
- Field accesses: `this.name`, `obj.prop`
- Function names: `calculate`, `process`

### Quality Ranges

| Range | Quality | Size | Typical Code | Action |
|-------|---------|------|--------------|--------|
| **0-500** | ✅ Excellent | Small | Single-purpose methods | None |
| **500-1000** | ⚠️ Good | Moderate | Standard business logic | Monitor |
| **1000-2000** | 🔶 Moderate | Large | Complex algorithms | Consider refactoring |
| **2000-5000** | 🔴 High | Very large | God methods, big classes | Should refactor |
| **5000+** | 💀 Extreme | Massive | God classes, generated code | Must refactor |

### Examples

```typescript
// Volume ≈ 150 (Excellent)
function add(a: number, b: number): number {
  return a + b;
}
// Operators: function, :, number, return, +
// Operands: add, a, b
// Volume = small


// Volume ≈ 800 (Good)
function calculateDiscount(price: number, quantity: number): number {
  const baseDiscount = 0.1;
  const volumeDiscount = quantity > 10 ? 0.05 : 0;
  const totalDiscount = baseDiscount + volumeDiscount;

  return price * quantity * (1 - totalDiscount);
}
// More operators and operands → moderate volume


// Volume ≈ 3500 (High)
class OrderProcessor {
  // 200 lines of code
  // 50+ variables
  // 30+ method calls
  // Complex business logic
  // Multiple branches
}
// Huge vocabulary and length → high volume


// Volume ≈ 12,811 (Extreme - Cache class)
class Cache {
  // 467 lines
  // 27 methods
  // Hundreds of variables
  // Many string templates
  // Tons of method calls
}
```

### Interpretation

**Volume < 1000**:
- Easy to comprehend in single reading
- Fits in working memory
- Low bug probability

**Volume 1000-2000**:
- Takes effort to understand
- May need multiple readings
- Moderate bug probability

**Volume 2000-5000**:
- Difficult to understand fully
- Requires significant study time
- High bug probability

**Volume > 5000**:
- Very difficult to comprehend
- Often contains hidden bugs
- Should be split into smaller pieces

### Why High Volume Is Bad

1. **Cognitive overload**: Too much to keep in mind
2. **Comprehension time**: Takes long to understand
3. **Error probability**: More code = more bugs
4. **Maintenance difficulty**: Hard to modify safely

---

## Metric Interactions

### How Metrics Relate

```
High CC → Usually leads to → High Volume
High CC → Usually leads to → Low MI
High LCOM → Indicates → Multiple responsibilities → High CC
High Volume → Usually leads to → Low MI

Low MI = Combined effect of High CC + High Volume + High LOC
```

### Common Patterns

| Pattern | CC | MI | LCOM | Volume | Diagnosis |
|---------|----|----|------|--------|-----------|
| **Simple method** | 1-5 | 85-100 | N/A | 100-500 | ✅ Well-designed |
| **Complex method** | 20-30 | 50-65 | N/A | 1000-2000 | 🔶 Needs refactoring |
| **Focused class** | 10-20 | 70-85 | 0.2-0.4 | 1000-2000 | ⚠️ Good design |
| **God class** | 50+ | 40-60 | 0.8+ | 5000+ | 💀 Must refactor |
| **Generated code** | 100+ | 20-40 | N/A | 10000+ | 🤖 Auto-generated |

---

## Quality Score Algorithm

Our system combines all metrics into a single 0-100 quality score:

```typescript
function calculateQualityScore(node: PDGNode): number {
  let score = 100;

  // 1. Cyclomatic Complexity penalty
  if (cc > 50) score -= 40;
  else if (cc > 20) score -= 25;
  else if (cc > 10) score -= 15;

  // 2. Maintainability Index adjustment
  if (mi < 40) score -= 30;
  else if (mi < 65) score -= 15;
  else if (mi > 85) score += 10;

  // 3. LCOM penalty (classes only)
  if (nodeType === CLASS && lcom > 0.8) score -= 20;
  else if (nodeType === CLASS && lcom > 0.6) score -= 10;

  // 4. Halstead Volume penalty
  if (volume > 2000) score -= 15;
  else if (volume > 1000) score -= 10;

  return Math.max(0, Math.min(100, score));
}
```

### Score Interpretation

| Score | Quality | Action | Meaning |
|-------|---------|--------|---------|
| **85-100** | ✅ Excellent | None | Well-designed, maintainable code |
| **65-85** | ⚠️ Good | Monitor | Acceptable quality, watch for degradation |
| **40-65** | 🔶 Moderate | Plan refactoring | Technical debt building up |
| **20-40** | 🔴 Poor | Refactor soon | High maintenance cost |
| **0-20** | 💀 Critical | Refactor immediately | Major technical debt |

---

## Industry Benchmarks

### Typical Ranges for Production Code

| Metric | Typical Range | Red Flag |
|--------|---------------|----------|
| **Average CC per method** | 3-8 | > 15 |
| **Average MI per class** | 60-80 | < 50 |
| **Average LCOM per class** | 0.3-0.5 | > 0.7 |
| **Average Volume per class** | 1000-3000 | > 5000 |

### Research-Based Guidelines

**NASA Studies** (1990s):
- CC > 10: Increased bug probability
- CC > 15: Testing becomes difficult
- CC > 50: Unmaintainable

**Microsoft Research** (2000s):
- MI < 65: Higher bug density
- LCOM > 0.8: Frequent changes

**Industry Standards** (Current):
- Most projects: Average CC = 5-7
- Well-maintained projects: Average MI = 70-75
- Modern OOP: Average LCOM = 0.3-0.5

---

## Quick Decision Guide

### When to Refactor?

| Metric | Threshold | Severity | Priority |
|--------|-----------|----------|----------|
| CC > 50 | Critical | 🚨 Immediate | Refactor now |
| CC > 20 | High | ⚠️ High | Plan refactoring |
| MI < 40 | Critical | 🚨 Immediate | Refactor now |
| MI < 65 | Low | 🔶 Medium | Monitor closely |
| LCOM > 0.8 | Critical | 🚨 Immediate | Split class now |
| LCOM > 0.6 | Moderate | 🔶 Medium | Consider splitting |
| Volume > 5000 | Critical | 🚨 Immediate | Split code now |
| Volume > 2000 | High | ⚠️ High | Plan refactoring |

---

## Further Reading

- **Cyclomatic Complexity**: McCabe, T. (1976). "A Complexity Measure"
- **Maintainability Index**: Coleman et al. (1994). "Using Metrics to Evaluate Software System Maintainability"
- **LCOM**: Chidamber & Kemerer (1994). "A Metrics Suite for Object Oriented Design"
- **Halstead Metrics**: Halstead, M. (1977). "Elements of Software Science"
