import { beforeEach, describe, expect, it, vi } from "vitest";
import { HelmParser } from "../helm-parser.js";

// Mock existsSync for isHelmContext tests
vi.mock("../../utils/file-ops.js", () => ({
  existsSync: vi.fn((path: string) => {
    // Simulate Chart.yaml existing at specific paths
    if (path.includes("my-chart") && path.endsWith("Chart.yaml")) return true;
    if (path.includes("helm-project") && path.endsWith("Chart.yaml")) return true;
    return false;
  }),
}));

// Mock logging
vi.mock("../../logging/index.js", () => ({
  log: { i: vi.fn(), d: vi.fn(), w: vi.fn(), e: vi.fn() },
}));

describe("HelmParser", () => {
  let parser: HelmParser;

  beforeEach(() => {
    parser = new HelmParser();
  });

  // ==========================================================================
  // 1. Chart.yaml parsing
  // ==========================================================================
  describe("Chart.yaml parsing", () => {
    const filePath = "/projects/my-chart/Chart.yaml";

    it("should extract module entity with name, version, appVersion, description", async () => {
      const content = [
        "apiVersion: v2",
        "name: my-app",
        "version: 1.2.3",
        "appVersion: 4.5.6",
        "description: A Helm chart for my application",
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities).toHaveLength(1);
      const entity = result.entities[0]!;
      expect(entity.type).toBe("module");
      expect(entity.name).toBe("my-app");
      expect(entity.metadata?.helmType).toBe("chart");
      expect(entity.metadata?.version).toBe("1.2.3");
      expect(entity.metadata?.appVersion).toBe("4.5.6");
      expect(entity.metadata?.description).toBe("A Helm chart for my application");
    });

    it("should fall back to parent directory name when name field is missing", async () => {
      const content = ["apiVersion: v2", "version: 0.1.0"].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]!.name).toBe("my-chart");
    });

    it("should extract dependencies as depends_on relationships", async () => {
      const content = [
        "apiVersion: v2",
        "name: my-app",
        "version: 1.0.0",
        "dependencies:",
        "  - name: postgresql",
        "    version: 12.1.0",
        "    repository: https://charts.bitnami.com/bitnami",
        "  - name: redis",
        "    version: 17.3.0",
        "    repository: https://charts.bitnami.com/bitnami",
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.relationships).toBeDefined();
      expect(result.relationships).toHaveLength(2);

      const pgDep = result.relationships!.find((r) => r.to === "postgresql");
      expect(pgDep).toBeDefined();
      expect(pgDep!.from).toBe("my-app");
      expect(pgDep!.type).toBe("depends_on");
      expect(pgDep!.sourceFile).toBe(filePath);
      expect(pgDep!.metadata?.helmType).toBe("chart-dependency");

      const redisDep = result.relationships!.find((r) => r.to === "redis");
      expect(redisDep).toBeDefined();
      expect(redisDep!.from).toBe("my-app");
      expect(redisDep!.type).toBe("depends_on");
    });

    it("should return undefined relationships when no dependencies exist", async () => {
      const content = ["apiVersion: v2", "name: simple-chart", "version: 0.1.0"].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.relationships).toBeUndefined();
    });
  });

  // ==========================================================================
  // 2. values.yaml parsing
  // ==========================================================================
  describe("values.yaml parsing", () => {
    const filePath = "/projects/my-chart/values.yaml";

    it("should extract top-level keys as variable entities", async () => {
      const content = [
        "replicaCount: 3",
        "image:",
        "  repository: nginx",
        "  tag: latest",
        "service:",
        "  type: ClusterIP",
        "  port: 80",
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const names = result.entities.map((e) => e.name);
      expect(names).toContain("replicaCount");
      expect(names).toContain("image");
      expect(names).toContain("service");
      // Nested keys should NOT be extracted
      expect(names).not.toContain("repository");
      expect(names).not.toContain("tag");
      expect(names).not.toContain("type");
      expect(names).not.toContain("port");
    });

    it("should set helmType to value-key in metadata", async () => {
      const content = "replicaCount: 3\n";

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]!.type).toBe("variable");
      expect(result.entities[0]!.metadata?.helmType).toBe("value-key");
    });

    it("should include valueHint in metadata when value is present on same line", async () => {
      const content = "replicaCount: 3\n";

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities[0]!.metadata?.valueHint).toBe("3");
    });

    it("should not include valueHint when value is empty", async () => {
      const content = "resources:\n  limits:\n    cpu: 100m\n";

      const result = await parser.parse(filePath, content, "test-hash");

      const resources = result.entities.find((e) => e.name === "resources");
      expect(resources).toBeDefined();
      expect(resources!.metadata?.valueHint).toBeUndefined();
    });

    it("should set correct line locations for entities", async () => {
      const content = ["first: 1", "second: 2", "third: 3"].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities[0]!.location.start.line).toBe(1);
      expect(result.entities[1]!.location.start.line).toBe(2);
      expect(result.entities[2]!.location.start.line).toBe(3);
    });
  });

  // ==========================================================================
  // 3. Named templates (define)
  // ==========================================================================
  describe("named templates (define)", () => {
    const filePath = "/projects/my-chart/templates/_helpers.tpl";

    it("should extract define blocks as function entities", async () => {
      const content = [
        '{{- define "my-chart.name" -}}',
        '{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}',
        "{{- end -}}",
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const fileEntity = result.entities[0]!;
      expect(fileEntity.type).toBe("file");
      expect(fileEntity.children).toBeDefined();

      const define = fileEntity.children!.find((c) => c.name === "my-chart.name");
      expect(define).toBeDefined();
      expect(define!.type).toBe("function");
      expect(define!.metadata?.helmType).toBe("named-template");
    });

    it("should set correct location for define entities", async () => {
      const content = ['{{- define "my-chart.labels" -}}', "app: {{ .Chart.Name }}", "{{- end -}}"].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const define = result.entities[0]!.children!.find((c) => c.name === "my-chart.labels");
      expect(define).toBeDefined();
      expect(define!.location.start.line).toBe(1);
      expect(define!.location.start.index).toBe(0);
    });

    it("should handle multiple define blocks", async () => {
      const content = [
        '{{- define "my-chart.name" -}}',
        "name-content",
        "{{- end -}}",
        "",
        '{{- define "my-chart.labels" -}}',
        "labels-content",
        "{{- end -}}",
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const defines = result.entities[0]!.children!.filter((c) => c.metadata?.helmType === "named-template");
      expect(defines).toHaveLength(2);
      expect(defines.map((d) => d.name)).toContain("my-chart.name");
      expect(defines.map((d) => d.name)).toContain("my-chart.labels");
    });

    it("should handle nested define blocks", async () => {
      const content = [
        '{{- define "outer" -}}',
        '  {{- define "inner" -}}',
        "  inner-content",
        "  {{- end -}}",
        "outer-content",
        "{{- end -}}",
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const defines = result.entities[0]!.children!.filter((c) => c.metadata?.helmType === "named-template");
      expect(defines).toHaveLength(2);
      expect(defines.map((d) => d.name)).toContain("outer");
      expect(defines.map((d) => d.name)).toContain("inner");
    });

    it("should report defineCount in file entity metadata", async () => {
      const content = [
        '{{- define "a" -}}{{- end -}}',
        '{{- define "b" -}}{{- end -}}',
        '{{- define "c" -}}{{- end -}}',
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities[0]!.metadata?.defineCount).toBe(3);
    });
  });

  // ==========================================================================
  // 4. Include/template calls
  // ==========================================================================
  describe("include/template calls", () => {
    const filePath = "/projects/my-chart/templates/deployment.yaml";

    it("should extract include calls", async () => {
      const content = [
        "metadata:",
        '  name: {{ include "my-chart.fullname" . }}',
        "  labels:",
        '    {{- include "my-chart.labels" . | nindent 4 }}',
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const fileEntity = result.entities[0]!;
      expect(fileEntity.calls).toBeDefined();
      expect(fileEntity.calls!.length).toBeGreaterThanOrEqual(2);

      const callNames = fileEntity.calls!.map((c) => c.name);
      expect(callNames).toContain("my-chart.fullname");
      expect(callNames).toContain("my-chart.labels");
    });

    it("should extract template calls", async () => {
      const content = '{{ template "my-chart.selector" . }}\n';

      const result = await parser.parse(filePath, content, "test-hash");

      const fileEntity = result.entities[0]!;
      expect(fileEntity.calls).toBeDefined();
      expect(fileEntity.calls!.some((c) => c.name === "my-chart.selector")).toBe(true);
    });

    it("should create EntityRelationships with type calls", async () => {
      const content = ['{{ include "my-chart.name" . }}', '{{ template "my-chart.labels" . }}'].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.relationships).toBeDefined();
      expect(result.relationships!.length).toBeGreaterThanOrEqual(2);

      for (const rel of result.relationships!) {
        expect(rel.type).toBe("calls");
        expect(rel.sourceFile).toBe(filePath);
        expect(rel.from).toBe("deployment.yaml");
      }

      const targets = result.relationships!.map((r) => r.to);
      expect(targets).toContain("my-chart.name");
      expect(targets).toContain("my-chart.labels");
    });

    it("should set argumentCount to 1 for include/template calls", async () => {
      const content = '{{ include "my-chart.name" . }}\n';

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities[0]!.calls![0]!.argumentCount).toBe(1);
    });

    it("should set target to helm for include/template calls", async () => {
      const content = '{{ include "my-chart.name" . }}\n';

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities[0]!.calls![0]!.target).toBe("helm");
    });
  });

  // ==========================================================================
  // 5. Value references
  // ==========================================================================
  describe("value references", () => {
    const filePath = "/projects/my-chart/templates/deployment.yaml";

    it("should extract .Values.* references", async () => {
      const content = [
        "replicas: {{ .Values.replicaCount }}",
        "image: {{ .Values.image.repository }}:{{ .Values.image.tag }}",
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const refs = result.entities[0]!.references!;
      expect(refs).toBeDefined();
      expect(refs).toContain(".Values.replicaCount");
      expect(refs).toContain(".Values.image.repository");
      expect(refs).toContain(".Values.image.tag");
    });

    it("should extract .Release.* references", async () => {
      const content = "namespace: {{ .Release.Namespace }}\nrelease: {{ .Release.Name }}\n";

      const result = await parser.parse(filePath, content, "test-hash");

      const refs = result.entities[0]!.references!;
      expect(refs).toContain(".Release.Namespace");
      expect(refs).toContain(".Release.Name");
    });

    it("should extract .Chart.* references", async () => {
      const content = "chart: {{ .Chart.Name }}-{{ .Chart.Version }}\n";

      const result = await parser.parse(filePath, content, "test-hash");

      const refs = result.entities[0]!.references!;
      expect(refs).toContain(".Chart.Name");
      expect(refs).toContain(".Chart.Version");
    });

    it("should return unique references (no duplicates)", async () => {
      const content = [
        "a: {{ .Values.replicaCount }}",
        "b: {{ .Values.replicaCount }}",
        "c: {{ .Values.replicaCount }}",
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const refs = result.entities[0]!.references!;
      const valuesRefs = refs.filter((r) => r === ".Values.replicaCount");
      expect(valuesRefs).toHaveLength(1);
    });

    it("should return undefined references when none exist", async () => {
      const content = "static: content\nno: templates\n";

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities[0]!.references).toBeUndefined();
    });
  });

  // ==========================================================================
  // 6. Control flow
  // ==========================================================================
  describe("control flow", () => {
    const filePath = "/projects/my-chart/templates/deployment.yaml";

    it("should extract if as branch type if", async () => {
      const content = ["{{- if .Values.ingress.enabled }}", "kind: Ingress", "{{- end }}"].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const cf = result.entities[0]!.controlFlow!;
      expect(cf).toBeDefined();
      expect(cf.branches.some((b) => b.type === "if")).toBe(true);

      const ifBranch = cf.branches.find((b) => b.type === "if")!;
      expect(ifBranch.condition).toBe(".Values.ingress.enabled");
    });

    it("should extract else as branch type else", async () => {
      const content = [
        "{{- if .Values.enabled }}",
        "enabled: true",
        "{{- else }}",
        "enabled: false",
        "{{- end }}",
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const cf = result.entities[0]!.controlFlow!;
      expect(cf.branches.some((b) => b.type === "else")).toBe(true);
    });

    it("should extract else if as branch type else-if", async () => {
      const content = [
        "{{- if .Values.tier }}",
        "tier: {{ .Values.tier }}",
        "{{- else if .Values.defaultTier }}",
        "tier: {{ .Values.defaultTier }}",
        "{{- end }}",
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const cf = result.entities[0]!.controlFlow!;
      expect(cf.branches.some((b) => b.type === "else-if")).toBe(true);

      const elseIfBranch = cf.branches.find((b) => b.type === "else-if")!;
      expect(elseIfBranch.condition).toBe(".Values.defaultTier");
    });

    it("should extract range as loop type for-of", async () => {
      const content = ["{{- range .Values.ingress.hosts }}", "- host: {{ .host }}", "{{- end }}"].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const cf = result.entities[0]!.controlFlow!;
      expect(cf.loops.some((l) => l.type === "for-of")).toBe(true);
    });

    it("should extract with as branch type if", async () => {
      const content = [
        "{{- with .Values.nodeSelector }}",
        "nodeSelector:",
        "  {{- toYaml . | nindent 2 }}",
        "{{- end }}",
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const cf = result.entities[0]!.controlFlow!;
      // with is mapped to an "if" branch
      const withBranch = cf.branches.find((b) => b.type === "if" && b.condition === ".Values.nodeSelector");
      expect(withBranch).toBeDefined();
    });

    it("should return undefined controlFlow when no control structures exist", async () => {
      const content = "static: content\nno: control-flow\n";

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities[0]!.controlFlow).toBeUndefined();
    });
  });

  // ==========================================================================
  // 7. Variable assignments
  // ==========================================================================
  describe("variable assignments", () => {
    const filePath = "/projects/my-chart/templates/deployment.yaml";

    it("should extract $var := expr as variable entity", async () => {
      const content = "{{- $name := default .Chart.Name .Values.nameOverride -}}\nname: {{ $name }}\n";

      const result = await parser.parse(filePath, content, "test-hash");

      const fileEntity = result.entities[0]!;
      const varEntity = fileEntity.children!.find((c) => c.name === "$name");
      expect(varEntity).toBeDefined();
      expect(varEntity!.type).toBe("variable");
      expect(varEntity!.metadata?.helmType).toBe("template-variable");
      expect(varEntity!.metadata?.expression).toBe("default .Chart.Name .Values.nameOverride");
    });

    it("should extract multiple variable assignments", async () => {
      const content = [
        "{{- $svcName := .Values.service.name -}}",
        "{{- $svcPort := .Values.service.port -}}",
        "backend:",
        "  serviceName: {{ $svcName }}",
        "  servicePort: {{ $svcPort }}",
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const vars = result.entities[0]!.children!.filter((c) => c.metadata?.helmType === "template-variable");
      expect(vars).toHaveLength(2);
      expect(vars.map((v) => v.name)).toContain("$svcName");
      expect(vars.map((v) => v.name)).toContain("$svcPort");
    });

    it("should set filePath on variable entities", async () => {
      const content = "{{- $x := .Values.foo -}}\n";

      const result = await parser.parse(filePath, content, "test-hash");

      const varEntity = result.entities[0]!.children!.find((c) => c.name === "$x");
      expect(varEntity!.filePath).toBe(filePath);
    });
  });

  // ==========================================================================
  // 8. Indent tracking
  // ==========================================================================
  describe("indent tracking", () => {
    const filePath = "/projects/my-chart/templates/deployment.yaml";

    it("should extract nindent values in metadata.indentPatterns", async () => {
      const content = ["metadata:", "  labels:", '    {{- include "my-chart.labels" . | nindent 4 }}'].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      const patterns = result.entities[0]!.metadata?.indentPatterns as Array<{
        indentFunction: string;
        indentValue: number;
      }>;
      expect(patterns).toBeDefined();

      const nindentPattern = patterns.find((p) => p.indentFunction === "nindent");
      expect(nindentPattern).toBeDefined();
      expect(nindentPattern!.indentValue).toBe(4);
    });

    it("should extract indent values", async () => {
      const content = "  {{- .Values.annotations | indent 6 }}\n";

      const result = await parser.parse(filePath, content, "test-hash");

      const patterns = result.entities[0]!.metadata?.indentPatterns as Array<{
        indentFunction: string;
        indentValue: number;
      }>;
      expect(patterns).toBeDefined();

      const indentPattern = patterns.find((p) => p.indentFunction === "indent");
      expect(indentPattern).toBeDefined();
      expect(indentPattern!.indentValue).toBe(6);
    });

    it("should capture pipeline context", async () => {
      const content = '    {{- include "my-chart.labels" . | nindent 8 }}\n';

      const result = await parser.parse(filePath, content, "test-hash");

      const patterns = result.entities[0]!.metadata?.indentPatterns as Array<{
        indentFunction: string;
        pipeline: string;
      }>;
      expect(patterns).toBeDefined();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0]!.pipeline).toContain("nindent");
    });

    it("should capture yamlContextIndent (leading whitespace)", async () => {
      const content = "      {{- toYaml .Values.resources | nindent 6 }}\n";

      const result = await parser.parse(filePath, content, "test-hash");

      const patterns = result.entities[0]!.metadata?.indentPatterns as Array<{
        yamlContextIndent: number;
      }>;
      expect(patterns).toBeDefined();
      // The toYaml|nindent pattern or nindent pattern should capture the leading spaces
      const pattern = patterns[0]!;
      expect(typeof pattern.yamlContextIndent).toBe("number");
    });

    it("should extract toYaml | nindent patterns", async () => {
      // The TOYAML_INDENT_RE regex requires toYaml directly before the pipe:
      // /toYaml\s*\|\s*n?indent\s+(\d+)/g
      const content = "    {{- . | toYaml | nindent 4 }}\n";

      const result = await parser.parse(filePath, content, "test-hash");

      const patterns = result.entities[0]!.metadata?.indentPatterns as Array<{
        indentFunction: string;
        indentValue: number;
      }>;
      expect(patterns).toBeDefined();

      const toYamlPattern = patterns.find((p) => p.indentFunction === "toYaml|nindent");
      expect(toYamlPattern).toBeDefined();
      expect(toYamlPattern!.indentValue).toBe(4);
    });

    it("should not include indentPatterns when no indent usage exists", async () => {
      const content = "static: content\nno: indents\n";

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities[0]!.metadata?.indentPatterns).toBeUndefined();
    });
  });

  // ==========================================================================
  // 9. Helm context detection
  // ==========================================================================
  describe("helm context detection (isHelmContext)", () => {
    it("should return true for files under a chart directory", () => {
      expect(parser.isHelmContext("/projects/my-chart/templates/deployment.yaml")).toBe(true);
    });

    it("should return true for files in nested directories under a chart", () => {
      expect(parser.isHelmContext("/projects/my-chart/templates/tests/test.yaml")).toBe(true);
    });

    it("should return false for files outside any chart directory", () => {
      expect(parser.isHelmContext("/projects/no-chart/deployment.yaml")).toBe(false);
    });

    it("should cache results and return consistently", () => {
      // First call
      const first = parser.isHelmContext("/projects/my-chart/templates/a.yaml");
      // Second call (should use cache)
      const second = parser.isHelmContext("/projects/my-chart/templates/b.yaml");

      expect(first).toBe(true);
      expect(second).toBe(true);
    });

    it("should reset cache on clearCache", () => {
      // Prime the cache
      parser.isHelmContext("/projects/my-chart/templates/a.yaml");

      // Clear and re-check still works
      parser.clearCache();

      // Should still work (re-checks filesystem)
      expect(parser.isHelmContext("/projects/my-chart/templates/a.yaml")).toBe(true);
    });

    it("should detect helm-project directory as helm context", () => {
      expect(parser.isHelmContext("/projects/helm-project/templates/svc.yaml")).toBe(true);
    });
  });

  // ==========================================================================
  // 10. Regular YAML bypass
  // ==========================================================================
  describe("regular YAML bypass", () => {
    it("should return false for .yaml files not in Helm context", () => {
      expect(parser.supportsFile("/projects/no-chart/config.yaml")).toBe(false);
    });

    it("should return false for .yml files not in Helm context", () => {
      expect(parser.supportsFile("/projects/no-chart/config.yml")).toBe(false);
    });
  });

  // ==========================================================================
  // 11. supportsFile
  // ==========================================================================
  describe("supportsFile", () => {
    it("should return true for .tpl files always (no context check needed)", () => {
      expect(parser.supportsFile("/anywhere/random/helpers.tpl")).toBe(true);
    });

    it("should return true for Chart.yaml in helm context", () => {
      expect(parser.supportsFile("/projects/my-chart/Chart.yaml")).toBe(true);
    });

    it("should return true for values.yaml in helm context", () => {
      expect(parser.supportsFile("/projects/my-chart/values.yaml")).toBe(true);
    });

    it("should return true for values-*.yaml in helm context", () => {
      expect(parser.supportsFile("/projects/my-chart/values-production.yaml")).toBe(true);
    });

    it("should return true for .yaml files in helm context", () => {
      expect(parser.supportsFile("/projects/my-chart/templates/deployment.yaml")).toBe(true);
    });

    it("should return false for arbitrary .yaml files outside helm context", () => {
      expect(parser.supportsFile("/projects/random/arbitrary.yaml")).toBe(false);
    });

    it("should return false for non-yaml, non-tpl files", () => {
      expect(parser.supportsFile("/projects/my-chart/README.md")).toBe(false);
      expect(parser.supportsFile("/projects/my-chart/index.ts")).toBe(false);
      expect(parser.supportsFile("/projects/my-chart/Dockerfile")).toBe(false);
    });
  });

  // ==========================================================================
  // 12. Language field
  // ==========================================================================
  describe("language field", () => {
    it("should set language to helm for Chart.yaml parse results", async () => {
      const content = "apiVersion: v2\nname: test\nversion: 0.1.0\n";
      const result = await parser.parse("/projects/my-chart/Chart.yaml", content, "test-hash");
      expect(result.language).toBe("helm");
    });

    it("should set language to helm for values.yaml parse results", async () => {
      const content = "replicaCount: 1\n";
      const result = await parser.parse("/projects/my-chart/values.yaml", content, "test-hash");
      expect(result.language).toBe("helm");
    });

    it("should set language to helm for template parse results", async () => {
      const content = '{{- define "test" -}}content{{- end -}}\n';
      const result = await parser.parse("/projects/my-chart/templates/_helpers.tpl", content, "test-hash");
      expect(result.language).toBe("helm");
    });
  });

  // ==========================================================================
  // Additional: initialize, parseIncremental, getStats
  // ==========================================================================
  describe("initialize", () => {
    it("should complete without errors", async () => {
      await expect(parser.initialize()).resolves.toBeUndefined();
    });
  });

  describe("parseIncremental", () => {
    it("should delegate to full parse and return same result structure", async () => {
      const filePath = "/projects/my-chart/templates/test.tpl";
      const content = '{{- define "test" -}}hello{{- end -}}\n';

      const fullResult = await parser.parse(filePath, content, "test-hash");
      const incrResult = await parser.parseIncremental(filePath, content, "test-hash", []);

      expect(incrResult.filePath).toBe(fullResult.filePath);
      expect(incrResult.language).toBe(fullResult.language);
      expect(incrResult.contentHash).toBe(fullResult.contentHash);
      expect(incrResult.entities).toHaveLength(fullResult.entities.length);
    });
  });

  describe("getStats", () => {
    it("should return initial stats with zero values", () => {
      const stats = parser.getStats();
      expect(stats.filesParsed).toBe(0);
      expect(stats.errorCount).toBe(0);
      expect(stats.totalParseTimeMs).toBe(0);
    });

    it("should update filesParsed after parsing", async () => {
      await parser.parse("/projects/my-chart/values.yaml", "key: value\n", "test-hash");

      const stats = parser.getStats();
      expect(stats.filesParsed).toBe(1);
    });

    it("should return a copy (not a reference to internal state)", () => {
      const stats1 = parser.getStats();
      stats1.filesParsed = 999;

      const stats2 = parser.getStats();
      expect(stats2.filesParsed).toBe(0);
    });
  });

  // ==========================================================================
  // Additional: contentHash and filePath propagation
  // ==========================================================================
  describe("result metadata", () => {
    it("should propagate contentHash to result", async () => {
      const result = await parser.parse("/projects/my-chart/values.yaml", "key: value\n", "my-content-hash");
      expect(result.contentHash).toBe("my-content-hash");
    });

    it("should propagate filePath to result", async () => {
      const fp = "/projects/my-chart/templates/service.yaml";
      const result = await parser.parse(fp, "kind: Service\n", "test-hash");
      expect(result.filePath).toBe(fp);
    });

    it("should set timestamp to a recent value", async () => {
      const before = Date.now();
      const result = await parser.parse("/projects/my-chart/values.yaml", "key: value\n", "test-hash");
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });

    it("should set parseTimeMs as a non-negative number", async () => {
      const result = await parser.parse("/projects/my-chart/values.yaml", "key: value\n", "test-hash");
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Additional: top-level file entity for templates
  // ==========================================================================
  describe("template file entity structure", () => {
    const filePath = "/projects/my-chart/templates/deployment.yaml";

    it("should create a top-level file entity with basename as name", async () => {
      const content = '{{ include "my-chart.name" . }}\n';

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]!.type).toBe("file");
      expect(result.entities[0]!.name).toBe("deployment.yaml");
    });

    it("should set helmType to template in file entity metadata", async () => {
      const content = "kind: Deployment\n";

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities[0]!.metadata?.helmType).toBe("template");
    });

    it("should set location spanning the entire file", async () => {
      const content = "line1\nline2\nline3\n";

      const result = await parser.parse(filePath, content, "test-hash");

      const loc = result.entities[0]!.location;
      expect(loc.start.line).toBe(1);
      expect(loc.start.column).toBe(0);
      expect(loc.start.index).toBe(0);
      expect(loc.end.index).toBe(content.length);
    });

    it("should set children to undefined when no defines or variables", async () => {
      const content = "static: yaml\n";

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities[0]!.children).toBeUndefined();
    });

    it("should set calls to undefined when no include/template calls", async () => {
      const content = "static: yaml\n";

      const result = await parser.parse(filePath, content, "test-hash");

      expect(result.entities[0]!.calls).toBeUndefined();
    });
  });

  // ==========================================================================
  // Complex integration scenario
  // ==========================================================================
  describe("complex template parsing", () => {
    it("should parse a realistic deployment template with all features", async () => {
      const filePath = "/projects/my-chart/templates/deployment.yaml";
      const content = [
        "apiVersion: apps/v1",
        "kind: Deployment",
        "metadata:",
        '  name: {{ include "my-chart.fullname" . }}',
        "  labels:",
        '    {{- include "my-chart.labels" . | nindent 4 }}',
        "spec:",
        "  replicas: {{ .Values.replicaCount }}",
        "  {{- if .Values.autoscaling.enabled }}",
        "  {{- else }}",
        "  replicas: {{ .Values.replicaCount }}",
        "  {{- end }}",
        "  template:",
        "    spec:",
        "      {{- with .Values.nodeSelector }}",
        "      nodeSelector:",
        "        {{- toYaml . | nindent 8 }}",
        "      {{- end }}",
        "      containers:",
        "        - name: {{ .Chart.Name }}",
        '          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"',
        "          {{- range .Values.extraEnvVars }}",
        "          - name: {{ .name }}",
        "            value: {{ .value }}",
        "          {{- end }}",
        "          {{- $port := .Values.service.port -}}",
        "          ports:",
        "            - containerPort: {{ $port }}",
      ].join("\n");

      const result = await parser.parse(filePath, content, "test-hash");

      // Language
      expect(result.language).toBe("helm");

      // File entity
      const file = result.entities[0]!;
      expect(file.type).toBe("file");

      // Calls (include)
      expect(file.calls).toBeDefined();
      const callNames = file.calls!.map((c) => c.name);
      expect(callNames).toContain("my-chart.fullname");
      expect(callNames).toContain("my-chart.labels");

      // References
      expect(file.references).toBeDefined();
      expect(file.references).toContain(".Values.replicaCount");
      expect(file.references).toContain(".Values.image.repository");
      expect(file.references).toContain(".Values.image.tag");
      expect(file.references).toContain(".Chart.Name");
      expect(file.references).toContain(".Values.service.port");

      // Control flow
      expect(file.controlFlow).toBeDefined();
      expect(file.controlFlow!.branches.some((b) => b.type === "if")).toBe(true);
      expect(file.controlFlow!.branches.some((b) => b.type === "else")).toBe(true);
      expect(file.controlFlow!.loops.some((l) => l.type === "for-of")).toBe(true);

      // Variables
      expect(file.children).toBeDefined();
      const varEntity = file.children!.find((c) => c.name === "$port");
      expect(varEntity).toBeDefined();
      expect(varEntity!.metadata?.helmType).toBe("template-variable");

      // Indent patterns
      expect(file.metadata?.indentPatterns).toBeDefined();

      // Relationships
      expect(result.relationships).toBeDefined();
      expect(result.relationships!.some((r) => r.type === "calls")).toBe(true);
    });
  });
});
