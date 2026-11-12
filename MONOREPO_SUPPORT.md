# Monorepo Support

## Problem

When analyzing a Git repository with a monorepo structure (no `tsconfig.json` in root), the system would fail with:

```
FileNotFoundError: File not found: /path/to/repo/tsconfig.json
```

## Solution

Added `MonorepoDetector` class that:

1. Checks if root has `tsconfig.json` (single project)
2. If not, searches for TypeScript subprojects in common directories
3. Analyzes the first suitable subproject (prioritizing backend/server)

## Supported Structures

### Single Project
```
repo/
├── tsconfig.json  ← Found, analyzed directly
├── src/
└── package.json
```

### Monorepo (Client/Server)
```
repo/
├── client/
│   ├── tsconfig.json  ← Found
│   └── src/
├── server/
│   ├── tsconfig.json  ← Found (prioritized)
│   └── src/
└── package.json
```

### Monorepo (Services)
```
repo/
├── services/
│   ├── gateway/
│   │   ├── tsconfig.json  ← Found
│   │   └── src/
│   └── scheduler/
│       ├── tsconfig.json  ← Found
│       └── src/
└── package.json
```

## Detection Priority

The detector searches in this order:

1. **Backend/Server** (prioritized):
   - `server/`, `backend/`, `api/`

2. **Frontend/Client**:
   - `client/`, `frontend/`, `web/`, `app/`

3. **Monorepo patterns**:
   - `services/*`, `packages/*`, `apps/*`, `libs/*`, `modules/*`

## Behavior

### demo.ts
- Detects monorepo structure
- Shows all subprojects found
- Analyzes **ALL subprojects** and combines results
- Prefixes node IDs with subproject name to avoid conflicts
- Displays combined statistics and quality report

**Example Output**:
```
Monorepo detected with 2 TypeScript project(s):
  1. server
  2. client

Building Program Dependency Graphs for all subprojects...

📦 Analyzing: server
   Path: cb_root/photos-portal/server
   ✓ Nodes: 36
   ✓ Edges: 37
   ✓ Functions: 13

📦 Analyzing: client
   Path: cb_root/photos-portal/client
   ✓ Nodes: 71
   ✓ Edges: 83
   ✓ Functions: 8

Combining results from all subprojects...
Combined: 107 nodes, 120 edges
```

### analyze-randevu.ts
- Template for analyzing **all subprojects** in a monorepo
- Similar to demo.ts but with customizable analysis logic
- Combines results from all services/libs
- Generates unified quality report

## Error Handling

If no `tsconfig.json` found anywhere:

```
❌ Error: No tsconfig.json found in /path/to/repo or its subdirectories.
This tool requires a TypeScript project with tsconfig.json.

Possible solutions:
1. Ensure you're analyzing a TypeScript project
2. Create a tsconfig.json in the root directory
3. Check that the repository cloned correctly
```

## Example: photos-portal

```
photos-portal/
├── client/
│   ├── tsconfig.json  (React, noEmit: true)
│   └── src/
├── server/
│   ├── tsconfig.json  (Node.js backend)
│   └── src/
└── package.json
```

**Detection**:
1. No `tsconfig.json` in root → monorepo
2. Found: `server/tsconfig.json` and `client/tsconfig.json`
3. Prioritizes `server` (backend)
4. Analyzes `server/` subproject

## Implementation

### MonorepoDetector Class

```typescript
class MonorepoDetector {
  static detect(rootPath: string): MonorepoInfo {
    // Check root for tsconfig.json
    if (fs.existsSync(path.join(rootPath, 'tsconfig.json'))) {
      return single project
    }

    // Search subdirectories
    const subprojects = findSubprojects(rootPath);

    if (subprojects.length === 0) {
      throw error
    }

    return monorepo with subprojects
  }
}
```

### Integration in demo.ts

```typescript
// Detect monorepo
const monorepoInfo = MonorepoDetector.detect(projectPath);
console.log(MonorepoDetector.formatInfo(monorepoInfo));

// Use first subproject
const analysisPath = monorepoInfo.subprojects[0].path;

// Build PDG from subproject
const builder = new ProgramDependencyGraphBuilder(analysisPath);
```

## Future Enhancements

- [x] Analyze all subprojects and combine results ✅ IMPLEMENTED
- [ ] Allow user to select which subproject to analyze
- [ ] Support for workspaces (`pnpm-workspace.yaml`, `lerna.json`)

## Summary

✅ **Automatic monorepo detection**
✅ **Analyzes ALL subprojects and combines results**
✅ **Prioritizes backend/server over client/frontend**
✅ **Clear error messages if no TypeScript project found**
✅ **Works with both single projects and monorepos**
✅ **Supports arrow functions and function expressions**
✅ **Works without node_modules installed (skips dependency resolution)**
✅ **Backward compatible with existing behavior**

The system now handles both single projects and monorepos seamlessly!
