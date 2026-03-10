/**
 * Diagram Intermediate Representation (IR)
 *
 * Universal structure decoupled from any specific diagram format.
 * Collectors produce DiagramIR, renderers consume it to generate
 * Mermaid, Graphviz DOT, or D2 output.
 */

// -- Field Mapping (dataFlowLevel=3) ----------------------------------------

export interface FieldMapping {
  sourceParam: string;
  sourceField?: string | undefined;
  targetField: string;
  operation?: "spread" | "assign" | "destructure" | "transform" | undefined;
}

// -- Data Annotations on Edges ----------------------------------------------

export interface DataAnnotation {
  inputTypes: string[];
  outputType?: string | undefined;
  transformation?: string | undefined;
  sourceFields?: string[] | undefined;
  hasConditionalLogic: boolean;
  conditionalHint?: string | undefined;
}

// -- Nodes ------------------------------------------------------------------

export interface DiagramNode {
  id: string;
  label: string;
  type: string;
  filePath?: string | undefined;
  parentId?: string | undefined;
  inputTypes: string[];
  outputType?: string | undefined;
  hasTransformation: boolean;
  fieldMappings: FieldMapping[];
  modifiers: string[];
  complexityScore?: number | undefined;
}

// -- Edges ------------------------------------------------------------------

export type EdgeStyle = "solid" | "dashed" | "dotted";

export interface DiagramEdge {
  fromId: string;
  toId: string;
  type: string;
  label?: string | undefined;
  style: EdgeStyle;
  dataAnnotation?: DataAnnotation | undefined;
}

// -- Groups -----------------------------------------------------------------

export interface DiagramGroup {
  id: string;
  label: string;
  parentId?: string | undefined;
  nodeIds: string[];
  filePath?: string | undefined;
}

// -- Diagram Types ----------------------------------------------------------

export type DiagramType = "flowchart" | "class" | "component";
export type DiagramDirection = "TD" | "LR";
export type DiagramFormat = "mermaid" | "graphviz" | "d2";

// -- IR Root ----------------------------------------------------------------

export interface DiagramIR {
  title: string;
  direction: DiagramDirection;
  diagramType: DiagramType;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    totalGroups: number;
    truncated: boolean;
    collectionTimeMs: number;
  };
}
