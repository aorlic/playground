declare module 'typhonjs-escomplex' {
  export interface HalsteadMetrics {
    volume?: number;
    difficulty?: number;
    effort?: number;
    bugs?: number;
    time?: number;
  }

  export interface SLOCMetrics {
    physical?: number;
    logical?: number;
  }

  export interface AggregateMetrics {
    cyclomatic?: number;
    cyclomaticDensity?: number;
    halstead?: HalsteadMetrics;
    sloc?: SLOCMetrics;
  }

  export interface AnalysisResult {
    aggregate?: AggregateMetrics;
    maintainability?: number;
    methods?: any[];
    classes?: any[];
  }

  export interface AnalysisOptions {
    loc?: boolean;
    newmi?: boolean;
  }

  export function analyzeModule(source: string, options?: AnalysisOptions): AnalysisResult;
  export function analyzeModuleAST(ast: any, options?: AnalysisOptions): AnalysisResult;
}
