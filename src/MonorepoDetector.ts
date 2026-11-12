import * as fs from 'fs';
import * as path from 'path';

export interface MonorepoInfo {
  isMonorepo: boolean;
  rootPath: string;
  subprojects: SubprojectInfo[];
}

export interface SubprojectInfo {
  name: string;
  path: string;
  hasTsconfig: boolean;
}

export class MonorepoDetector {
  /**
   * Detect if directory is a monorepo and find all TypeScript subprojects
   */
  static detect(rootPath: string): MonorepoInfo {
    // Check if root has tsconfig.json
    const rootTsconfig = path.join(rootPath, 'tsconfig.json');
    const hasRootTsconfig = fs.existsSync(rootTsconfig);

    if (hasRootTsconfig) {
      // Standard single project
      return {
        isMonorepo: false,
        rootPath,
        subprojects: [{
          name: path.basename(rootPath),
          path: rootPath,
          hasTsconfig: true
        }]
      };
    }

    // Look for tsconfig.json in subdirectories
    const subprojects = this.findSubprojects(rootPath);

    if (subprojects.length === 0) {
      throw new Error(
        `No tsconfig.json found in ${rootPath} or its subdirectories.\n` +
        'This tool requires a TypeScript project with tsconfig.json.\n\n' +
        'Possible solutions:\n' +
        '1. Ensure you\'re analyzing a TypeScript project\n' +
        '2. Create a tsconfig.json in the root directory\n' +
        '3. Check that the repository cloned correctly'
      );
    }

    return {
      isMonorepo: true,
      rootPath,
      subprojects
    };
  }

  /**
   * Find all subdirectories with tsconfig.json
   */
  private static findSubprojects(rootPath: string): SubprojectInfo[] {
    const subprojects: SubprojectInfo[] = [];
    // Prioritize backend/server over client/frontend
    const commonDirs = [
      'server', 'backend', 'api',
      'client', 'frontend', 'web', 'app',
      'services', 'packages', 'apps', 'libs', 'modules'
    ];

    // Check common monorepo directories
    for (const dir of commonDirs) {
      const dirPath = path.join(rootPath, dir);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const tsconfigPath = path.join(dirPath, 'tsconfig.json');
        if (fs.existsSync(tsconfigPath)) {
          subprojects.push({
            name: dir,
            path: dirPath,
            hasTsconfig: true
          });
        }
      }
    }

    // Also check if services/libs contain subdirectories with tsconfig
    const servicesDirs = ['services', 'packages', 'apps', 'libs'];
    for (const servicesDir of servicesDirs) {
      const servicesDirPath = path.join(rootPath, servicesDir);
      if (fs.existsSync(servicesDirPath) && fs.statSync(servicesDirPath).isDirectory()) {
        const subdirs = fs.readdirSync(servicesDirPath);
        for (const subdir of subdirs) {
          const subdirPath = path.join(servicesDirPath, subdir);
          if (fs.statSync(subdirPath).isDirectory()) {
            const tsconfigPath = path.join(subdirPath, 'tsconfig.json');
            if (fs.existsSync(tsconfigPath)) {
              subprojects.push({
                name: `${servicesDir}/${subdir}`,
                path: subdirPath,
                hasTsconfig: true
              });
            }
          }
        }
      }
    }

    return subprojects;
  }

  /**
   * Format monorepo detection result for display
   */
  static formatInfo(info: MonorepoInfo): string {
    if (!info.isMonorepo) {
      return `Single TypeScript project detected at: ${info.rootPath}`;
    }

    const lines: string[] = [];
    lines.push(`Monorepo detected with ${info.subprojects.length} TypeScript project(s):`);
    info.subprojects.forEach((sub, idx) => {
      lines.push(`  ${idx + 1}. ${sub.name}`);
    });

    return lines.join('\n');
  }
}
