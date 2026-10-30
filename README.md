# PDG Vectorization with BGE-M3 and LanceDB

A TypeScript implementation for building Program Dependency Graphs (PDG) from codebases, calculating code complexity metrics, and enabling semantic code search using BGE-M3 embeddings and LanceDB vector storage.

## Features

✅ **Program Dependency Graph (PDG)** - Parse TypeScript/JavaScript codebases into structured graphs
✅ **Code Metrics** - Calculate Cyclomatic Complexity, Maintainability Index, Halstead metrics, and LCOM
✅ **Semantic Search** - Find code using natural language queries
✅ **BGE-M3 Embeddings** - 8192 token context, 1024-dim vectors, 100+ languages
✅ **LanceDB Storage** - Fast vector similarity search with ANN indexing

## Architecture

```
Codebase → PDG Builder → Metrics → Serialization → BGE-M3 Embeddings → LanceDB → Search
```

## Prerequisites

### 1. Install Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# Or download from https://ollama.com
```

### 2. Pull BGE-M3 Model

```bash
ollama pull bge-m3
```

### 3. Start Ollama Service

```bash
ollama serve
```

Keep this running in a separate terminal.

### 4. Install Node.js Dependencies

```bash
npm install
```

## Usage

### Build PDG and Vectorize Codebase

```bash
npm run vectorize
```

This will:
1. Parse the codebase and build the PDG
2. Calculate code complexity metrics
3. Generate embeddings using BGE-M3 (via Ollama)
4. Store vectors in LanceDB at `./data/pdg_vectors`

### Semantic Search Examples

The demo script includes several search examples:

```typescript
// Search for embedding-related code
await vectorizer.search('embedding generation code', 5);

// Search for graph building logic
await vectorizer.search('build dependency graph', 5);

// Search with complexity filter (only simple code)
await vectorizer.searchWithFilter(
  'process data',
  { maxComplexity: 10 },
  5
);
```

## Project Structure

```
src/
├── ProgramDependencyGraphBuilder.ts  # Main PDG builder
├── types.ts                          # Type definitions
├── vectorization/
│   ├── NodeSerializer.ts             # PDG → Rich text
│   ├── BGEM3Embedder.ts              # Ollama client
│   ├── VectorStore.ts                # LanceDB wrapper
│   └── PDGVectorizer.ts              # Main orchestrator
├── index.ts                          # PDG demo (original)
└── vectorize-demo.ts                 # Vectorization demo
```

## How It Works

### 1. PDG Construction

Parses TypeScript/JavaScript files using `ts-morph` to extract:
- Classes, methods, functions
- Control flow dependencies (if/else, loops)
- Data flow dependencies (variable usage)
- Call dependencies (function/method calls)

### 2. Code Metrics

Calculates for each class/method/function:
- **Cyclomatic Complexity (CC)** - Branching complexity
- **Maintainability Index (MI)** - Code maintainability (0-100)
- **Halstead Volume** - Code vocabulary metrics
- **LCOM** - Lack of Cohesion of Methods (for classes)

### 3. Serialization

Converts each PDG node to rich text:

```
Type: method
Name: processPayment
File: src/payment/PaymentProcessor.ts:42-68

Full Code:
async processPayment(amount: number, method: PaymentMethod) {
  // Full implementation...
}

Metrics:
- Cyclomatic Complexity: 5
- Maintainability Index: 72.50

Dependencies: validatePayment, chargeGateway
Called by: CheckoutController.checkout
```

### 4. BGE-M3 Embedding

- **Context**: 8192 tokens (handles large classes/files)
- **Dimension**: 1024-dim vectors
- **Multi-lingual**: 100+ languages
- **Via Ollama**: Local inference, no cloud APIs

### 5. LanceDB Storage

- **Apache Arrow** format for efficient columnar storage
- **IVF-PQ index** for fast approximate nearest neighbor (ANN) search
- **Metadata filtering** by complexity, maintainability, file path, etc.

### 6. Semantic Search

Query using natural language:
- "payment processing code"
- "error handling logic"
- "database connection setup"

Returns ranked results with similarity scores.

## Performance

For a medium codebase (~6,500 nodes):

| Step | Time |
|------|------|
| PDG Construction | ~5-10 sec |
| Metrics Calculation | ~1-2 min |
| Serialization | ~2 sec |
| Embedding (4x parallel) | ~3-5 min |
| LanceDB Indexing | ~10 sec |
| **Total** | **~5-8 min** |

Query time: < 100ms

## Example Output

```
=== Semantic Search Examples ===

Example 1: Search for "embedding generation code"

Found 5 results:

1. BGEM3Embedder
   File: src/vectorization/BGEM3Embedder.ts:18-130
   Similarity: 0.8742 (distance: 0.1258)
   Complexity: 3
   Code: export class BGEM3Embedder { private baseUrl: string; private model...

2. embed
   File: src/vectorization/BGEM3Embedder.ts:62-91
   Similarity: 0.8521 (distance: 0.1479)
   Complexity: 2
   Code: async embed(text: string): Promise<number[]> { try { const response...
```

## Advanced Usage

### Custom Search with Filters

```typescript
// Find low-complexity payment code
const results = await vectorizer.searchWithFilter(
  'payment processing',
  {
    maxComplexity: 10,           // Only simple code
    minMaintainability: 65,      // Well-maintained
    filePath: 'payment'          // In payment-related files
  },
  10
);
```

### Load Existing Database

```typescript
// Skip vectorization if already done
const vectorizer = new PDGVectorizer();
await vectorizer.loadExisting();

// Search immediately
const results = await vectorizer.search('authentication logic');
```

## Troubleshooting

### Error: "Ollama service not responding"

Make sure Ollama is running:
```bash
ollama serve
```

### Error: "BGE-M3 model not found"

Pull the model:
```bash
ollama pull bge-m3
```

### Error: "Cannot connect to Ollama"

Check Ollama is accessible:
```bash
curl http://localhost:11434/api/tags
```

## Configuration

### Custom Ollama URL

```typescript
const vectorizer = new PDGVectorizer(
  'http://custom-host:11434',  // Ollama URL
  'bge-m3',                    // Model name
  './custom/db/path'           // LanceDB path
);
```

### Adjust Batch Size

```typescript
// In BGEM3Embedder.ts, modify:
await this.embedder.embedBatch(texts, {
  batchSize: 8,  // Increase for faster processing (if GPU available)
  onProgress: (current, total) => { ... }
});
```

## License

ISC

## Tech Stack

- **ts-morph** - TypeScript AST parsing
- **typhonjs-escomplex** - Code complexity metrics
- **Ollama** - Local LLM/embedding inference
- **BGE-M3** - BAAI embedding model (8192 context)
- **LanceDB** - Vector database (Apache Arrow)
