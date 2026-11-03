# Search Quality Improvement Plan

## Problems Identified

1. **No JSDoc Documentation** - Codebase has no comments
2. **Weak Semantic Annotations** - Too few domain terms extracted
3. **Code-Heavy Embeddings** - 90%+ raw TypeScript, little context
4. **Poor Keyword Detection** - Generic patterns miss business logic
5. **Low Similarity Scores** - <20% for all queries

## Solutions

### Short-term (Immediate):

#### 1. Enhanced Keyword Extraction from Code
**Problem**: Only extracting from variable names
**Solution**: Parse code for business concepts
- Extract from string literals
- Parse object properties
- Analyze function call patterns
- Detect API endpoints

#### 2. Hybrid Search (Keyword + Semantic)
**Problem**: Pure vector search fails on low-context code
**Solution**: Combine approaches
- BM25 keyword search on code/names/comments
- Vector semantic search on embeddings
- Weighted fusion (0.7 semantic + 0.3 keyword)

#### 3. Re-Ranking with Metadata
**Problem**: Results don't use available metadata
**Solution**: Post-process results
- Boost if name contains query terms
- Boost if file path matches domain
- Penalty for very high complexity (unmaintainable)
- Boost for exported/public APIs

#### 4. Better Node Serialization
**Problem**: Too much code, too little context
**Solution**: Restructure text for embedding
- Put semantic info FIRST (LLMs prioritize beginning)
- Summarize code behavior in plain English
- Add inferred purpose/description
- Truncate very long code snippets

### Medium-term:

#### 5. Code-Specific Embeddings
- Use CodeBERT/GraphCodeBERT instead of BGE-M3
- These models understand programming syntax better

#### 6. AST-Based Features
- Extract control flow patterns
- Detect design patterns from AST structure
- Analyze call graphs

#### 7. Query Expansion
- Use WordNet/knowledge graph for synonyms
- payment → transaction, billing, checkout
- cache → redis, store, memory

### Long-term:

#### 8. Fine-tune Embeddings
- Fine-tune BGE-M3 on code search tasks
- Use CodeSearchNet dataset
- Learn domain-specific embeddings

## Implementation Priority

### Phase 1 (Do Now):
1. ✅ Hybrid Search (keyword + semantic)
2. ✅ Re-ranking with metadata
3. ✅ Better node serialization

### Phase 2 (Next):
4. Enhanced keyword extraction
5. Query expansion
6. Code summarization

### Phase 3 (Later):
7. Code-specific embeddings
8. Fine-tuning
