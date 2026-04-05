using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using UltraCode.CSharp.Gpu;
using UltraCode.CSharp.Models;

namespace UltraCode.CSharp.Handlers;

/// <summary>
/// Handles "parse" and "parseBatch" requests.
/// Hybrid CPU+GPU pipeline: parallel Roslyn parsing, single-pass AST walk,
/// GPU-accelerated batch metrics (complexity, SimHash) for large batches.
/// </summary>
public sealed class ParseHandler
{
    private readonly ILogger<ParseHandler> _logger;
    private readonly GpuAccelerator _gpu;
    private readonly GpuMetricsKernel _gpuMetrics;

    public ParseHandler(ILogger<ParseHandler> logger, GpuAccelerator gpu, GpuMetricsKernel gpuMetrics)
    {
        _logger = logger;
        _gpu = gpu;
        _gpuMetrics = gpuMetrics;
    }

    /// <summary>
    /// Parse a single C# file and return entities.
    /// Single file always uses CPU path (GPU overhead not worth it).
    /// </summary>
    public async Task<object?> HandleParseAsync(AddonRequest request, CancellationToken ct)
    {
        var filePath = request.Params?.GetProperty("filePath").GetString() ?? "";
        string? content = null;
        if (request.Params?.TryGetProperty("content", out var contentEl) == true)
            content = contentEl.GetString();

        if (string.IsNullOrEmpty(content) && !string.IsNullOrEmpty(filePath))
            content = await File.ReadAllTextAsync(filePath, ct);

        if (string.IsNullOrEmpty(content))
            return new { entities = Array.Empty<ParsedEntityDto>() };

        var parseResult = ParseContentSinglePass(content, filePath);
        // For single file, compute complexity on CPU inline (already done in single-pass)
        return new { entities = parseResult.Entities };
    }

    /// <summary>
    /// Parse multiple files in batch with parallel CPU parsing and optional GPU metrics.
    /// </summary>
    public async Task<object?> HandleParseBatchAsync(AddonRequest request, CancellationToken ct)
    {
        var files = new List<(string path, string? content)>();

        if (request.Params?.TryGetProperty("files", out var filesEl) == true && filesEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var f in filesEl.EnumerateArray())
            {
                var path = f.GetProperty("filePath").GetString() ?? "";
                string? content = null;
                if (f.TryGetProperty("content", out var c))
                    content = c.GetString();
                files.Add((path, content));
            }
        }

        // Phase 1: Parallel Roslyn parsing + single-pass entity extraction
        var parseResults = new ConcurrentBag<(string path, SinglePassResult result)>();

        await Parallel.ForEachAsync(files, ct, async (file, token) =>
        {
            var text = file.content ?? (File.Exists(file.path) ? await File.ReadAllTextAsync(file.path, token) : null);
            if (text == null) return;

            var result = ParseContentSinglePass(text, file.path);
            parseResults.Add((file.path, result));
        });

        var orderedResults = parseResults.OrderBy(r => files.FindIndex(f => f.path == r.path)).ToList();

        // Phase 2: GPU batch metrics if threshold met
        if (_gpu.ShouldUseGpu(files.Count))
        {
            try
            {
                ApplyGpuMetrics(orderedResults);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[GPU] Batch metrics failed, CPU values used as fallback");
            }
        }

        var results = orderedResults.Select(r => new { filePath = r.path, entities = r.result.Entities }).ToList();
        return new { files = results };
    }

    /// <summary>
    /// Single-pass AST walk: extracts usings, namespace, entities, diagnostics, calls, and complexity in ONE traversal.
    /// </summary>
    private SinglePassResult ParseContentSinglePass(string content, string filePath)
    {
        var tree = CSharpSyntaxTree.ParseText(content, path: filePath);
        var root = tree.GetRoot();

        // Single-pass: collect everything we need from DescendantNodes
        string? fileNamespace = null;
        List<string>? usings = null;
        var typeDeclarations = new List<TypeDeclarationSyntax>();
        var enumDeclarations = new List<EnumDeclarationSyntax>();
        var delegateDeclarations = new List<DelegateDeclarationSyntax>();

        foreach (var node in root.DescendantNodes())
        {
            switch (node)
            {
                case FileScopedNamespaceDeclarationSyntax fsns:
                    fileNamespace ??= fsns.Name.ToString();
                    break;
                case NamespaceDeclarationSyntax ns:
                    fileNamespace ??= ns.Name.ToString();
                    break;
                case UsingDirectiveSyntax u:
                    usings ??= [];
                    usings.Add(u.ToString().TrimEnd(';').Trim());
                    break;
                case ClassDeclarationSyntax cls:
                    typeDeclarations.Add(cls);
                    break;
                case InterfaceDeclarationSyntax iface:
                    typeDeclarations.Add(iface);
                    break;
                case StructDeclarationSyntax strct:
                    typeDeclarations.Add(strct);
                    break;
                case RecordDeclarationSyntax rec:
                    typeDeclarations.Add(rec);
                    break;
                case EnumDeclarationSyntax enm:
                    enumDeclarations.Add(enm);
                    break;
                case DelegateDeclarationSyntax del:
                    delegateDeclarations.Add(del);
                    break;
            }
        }

        var entities = new List<ParsedEntityDto>();
        var methodNodes = new List<SyntaxNode>();
        var methodMetadataRefs = new List<EntityMetadataDto>();

        foreach (var typeDecl in typeDeclarations)
        {
            var entityType = typeDecl switch
            {
                InterfaceDeclarationSyntax => "interface",
                _ => "class",
            };
            var entity = ExtractTypeEntity(typeDecl, filePath, entityType, fileNamespace, usings, methodNodes, methodMetadataRefs);
            entities.Add(entity);
        }

        foreach (var enm in enumDeclarations)
            entities.Add(ExtractEnumEntity(enm, filePath, fileNamespace, usings));

        foreach (var del in delegateDeclarations)
            entities.Add(ExtractDelegateEntity(del, filePath, fileNamespace));

        // Get syntax diagnostics
        var diagnostics = tree.GetDiagnostics()
            .Where(d => d.Severity >= DiagnosticSeverity.Warning)
            .Select(d =>
            {
                var lineSpan = d.Location.GetLineSpan();
                return new DiagnosticDto
                {
                    Id = d.Id,
                    Message = d.GetMessage(),
                    Severity = d.Severity.ToString().ToLowerInvariant(),
                    Line = lineSpan.StartLinePosition.Line + 1,
                    Column = lineSpan.StartLinePosition.Character + 1,
                };
            })
            .ToList();

        if (diagnostics.Count > 0 && entities.Count > 0)
        {
            var meta = entities[0].Metadata ??= new EntityMetadataDto();
            meta.Diagnostics = diagnostics;
        }

        return new SinglePassResult
        {
            Entities = entities,
            MethodNodes = methodNodes,
            MethodMetadataRefs = methodMetadataRefs,
        };
    }

    private ParsedEntityDto ExtractTypeEntity(
        TypeDeclarationSyntax typeDecl, string filePath, string entityType,
        string? ns, List<string>? usings,
        List<SyntaxNode> methodNodes, List<EntityMetadataDto> methodMetadataRefs)
    {
        var lineSpan = typeDecl.GetLocation().GetLineSpan();
        var typeName = typeDecl.Identifier.Text;
        var fqn = ns != null ? $"{ns}.{typeName}" : typeName;

        var entity = new ParsedEntityDto
        {
            Id = $"{filePath}:{fqn}",
            Name = typeName,
            Type = entityType,
            FilePath = filePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            Content = typeDecl.ToString(),
            Metadata = new EntityMetadataDto
            {
                Namespace = ns,
                Fqn = fqn,
                Accessibility = GetAccessibility(typeDecl.Modifiers),
                IsStatic = typeDecl.Modifiers.Any(SyntaxKind.StaticKeyword),
                IsAbstract = typeDecl.Modifiers.Any(SyntaxKind.AbstractKeyword),
                IsSealed = typeDecl.Modifiers.Any(SyntaxKind.SealedKeyword),
                IsPartial = typeDecl.Modifiers.Any(SyntaxKind.PartialKeyword),
                Usings = usings?.Count > 0 ? usings : null,
                BaseTypes = typeDecl.BaseList?.Types.Select(t => t.ToString()).ToList(),
                TypeParameters = typeDecl.TypeParameterList?.Parameters.Select(p => p.Identifier.Text).ToList(),
                Attributes = typeDecl.AttributeLists.SelectMany(a => a.Attributes.Select(attr => attr.ToString())).ToList() is { Count: > 0 } attrs ? attrs : null,
                DocComment = ExtractDocComment(typeDecl),
            },
            Children = [],
        };

        foreach (var member in typeDecl.Members)
        {
            switch (member)
            {
                case MethodDeclarationSyntax method:
                    var methodEntity = ExtractMethodEntity(method, filePath, fqn);
                    entity.Children.Add(methodEntity);
                    // Track for GPU batch metrics
                    methodNodes.Add(method);
                    methodMetadataRefs.Add(methodEntity.Metadata!);
                    break;
                case ConstructorDeclarationSyntax ctor:
                    var ctorEntity = ExtractConstructorEntity(ctor, filePath, fqn);
                    entity.Children.Add(ctorEntity);
                    methodNodes.Add(ctor);
                    methodMetadataRefs.Add(ctorEntity.Metadata!);
                    break;
                case PropertyDeclarationSyntax prop:
                    entity.Children.Add(ExtractPropertyEntity(prop, filePath, fqn));
                    break;
                case FieldDeclarationSyntax field:
                    foreach (var variable in field.Declaration.Variables)
                        entity.Children.Add(ExtractFieldEntity(field, variable, filePath, fqn));
                    break;
                case EventDeclarationSyntax evt:
                    entity.Children.Add(ExtractEventEntity(evt, filePath, fqn));
                    break;
            }
        }

        if (entity.Children.Count == 0)
            entity.Children = null;

        return entity;
    }

    /// <summary>
    /// Apply GPU-computed metrics (complexity, SimHash) to all methods across all files.
    /// </summary>
    private void ApplyGpuMetrics(List<(string path, SinglePassResult result)> results)
    {
        // Collect all method nodes and metadata refs across all files
        var allMethodNodes = new List<SyntaxNode>();
        var allMetadataRefs = new List<EntityMetadataDto>();

        foreach (var (_, r) in results)
        {
            allMethodNodes.AddRange(r.MethodNodes);
            allMetadataRefs.AddRange(r.MethodMetadataRefs);
        }

        if (allMethodNodes.Count == 0) return;

        _logger.LogDebug("[GPU] Processing {Count} methods across {Files} files", allMethodNodes.Count, results.Count);

        // Linearize AST for GPU
        var (nodeKinds, starts, ends) = AstLinearizer.LinearizeMethods(allMethodNodes);
        var complexityKinds = AstLinearizer.GetComplexityKindsSorted();

        // GPU batch complexity
        var gpuComplexities = _gpuMetrics.BatchComplexity(nodeKinds, starts, ends, complexityKinds);
        for (int i = 0; i < allMetadataRefs.Count; i++)
            allMetadataRefs[i].Complexity = gpuComplexities[i];

        // GPU batch SimHash
        var (tokenKinds, tokenStarts, tokenEnds) = AstLinearizer.LinearizeTokens(allMethodNodes);
        var simHashes = _gpuMetrics.BatchSimHash(tokenKinds, tokenStarts, tokenEnds);
        for (int i = 0; i < allMetadataRefs.Count; i++)
            allMetadataRefs[i].SimHash = simHashes[i].ToString("X16");
    }

    private ParsedEntityDto ExtractMethodEntity(MethodDeclarationSyntax method, string filePath, string parentFqn)
    {
        var lineSpan = method.GetLocation().GetLineSpan();
        var name = method.Identifier.Text;
        var fqn = $"{parentFqn}.{name}";

        return new ParsedEntityDto
        {
            Id = $"{filePath}:{fqn}",
            Name = name,
            Type = "method",
            FilePath = filePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            Content = method.ToString(),
            ParentId = $"{filePath}:{parentFqn}",
            Metadata = new EntityMetadataDto
            {
                Fqn = fqn,
                Accessibility = GetAccessibility(method.Modifiers),
                IsStatic = method.Modifiers.Any(SyntaxKind.StaticKeyword),
                IsAsync = method.Modifiers.Any(SyntaxKind.AsyncKeyword),
                IsAbstract = method.Modifiers.Any(SyntaxKind.AbstractKeyword),
                IsVirtual = method.Modifiers.Any(SyntaxKind.VirtualKeyword),
                IsOverride = method.Modifiers.Any(SyntaxKind.OverrideKeyword),
                IsSealed = method.Modifiers.Any(SyntaxKind.SealedKeyword),
                IsPartial = method.Modifiers.Any(SyntaxKind.PartialKeyword),
                ReturnType = method.ReturnType.ToString(),
                Parameters = method.ParameterList.Parameters.Select(p => new ParameterDto
                {
                    Name = p.Identifier.Text,
                    Type = p.Type?.ToString() ?? "object",
                    IsOptional = p.Default != null,
                    DefaultValue = p.Default?.Value.ToString(),
                }).ToList(),
                TypeParameters = method.TypeParameterList?.Parameters.Select(p => p.Identifier.Text).ToList(),
                Calls = ExtractCalls(method),
                Complexity = CalculateCyclomaticComplexity(method),
                Attributes = method.AttributeLists.SelectMany(a => a.Attributes.Select(attr => attr.ToString())).ToList() is { Count: > 0 } attrs ? attrs : null,
                DocComment = ExtractDocComment(method),
                ControlFlow = ExtractControlFlow(method),
                CSharpHints = ExtractCSharpHints(method),
            },
        };
    }

    private ParsedEntityDto ExtractConstructorEntity(ConstructorDeclarationSyntax ctor, string filePath, string parentFqn)
    {
        var lineSpan = ctor.GetLocation().GetLineSpan();
        var name = ctor.Identifier.Text;
        var fqn = $"{parentFqn}..ctor";

        return new ParsedEntityDto
        {
            Id = $"{filePath}:{fqn}",
            Name = name,
            Type = "constructor",
            FilePath = filePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            Content = ctor.ToString(),
            ParentId = $"{filePath}:{parentFqn}",
            Metadata = new EntityMetadataDto
            {
                Fqn = fqn,
                Accessibility = GetAccessibility(ctor.Modifiers),
                IsStatic = ctor.Modifiers.Any(SyntaxKind.StaticKeyword),
                Parameters = ctor.ParameterList.Parameters.Select(p => new ParameterDto
                {
                    Name = p.Identifier.Text,
                    Type = p.Type?.ToString() ?? "object",
                    IsOptional = p.Default != null,
                    DefaultValue = p.Default?.Value.ToString(),
                }).ToList(),
                Calls = ExtractCalls(ctor),
                Complexity = CalculateCyclomaticComplexity(ctor),
                ControlFlow = ExtractControlFlow(ctor),
                CSharpHints = ExtractCSharpHints(ctor),
            },
        };
    }

    private ParsedEntityDto ExtractPropertyEntity(PropertyDeclarationSyntax prop, string filePath, string parentFqn)
    {
        var lineSpan = prop.GetLocation().GetLineSpan();
        var name = prop.Identifier.Text;
        var fqn = $"{parentFqn}.{name}";

        return new ParsedEntityDto
        {
            Id = $"{filePath}:{fqn}",
            Name = name,
            Type = "property",
            FilePath = filePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            Content = prop.ToString(),
            ParentId = $"{filePath}:{parentFqn}",
            Metadata = new EntityMetadataDto
            {
                Fqn = fqn,
                Accessibility = GetAccessibility(prop.Modifiers),
                IsStatic = prop.Modifiers.Any(SyntaxKind.StaticKeyword),
                IsVirtual = prop.Modifiers.Any(SyntaxKind.VirtualKeyword),
                IsOverride = prop.Modifiers.Any(SyntaxKind.OverrideKeyword),
                IsSealed = prop.Modifiers.Any(SyntaxKind.SealedKeyword),
                PropertyType = prop.Type.ToString(),
                Attributes = prop.AttributeLists.SelectMany(a => a.Attributes.Select(attr => attr.ToString())).ToList() is { Count: > 0 } attrs ? attrs : null,
            },
        };
    }

    private ParsedEntityDto ExtractFieldEntity(FieldDeclarationSyntax field, VariableDeclaratorSyntax variable, string filePath, string parentFqn)
    {
        var lineSpan = variable.GetLocation().GetLineSpan();
        var name = variable.Identifier.Text;
        var fqn = $"{parentFqn}.{name}";

        return new ParsedEntityDto
        {
            Id = $"{filePath}:{fqn}",
            Name = name,
            Type = "field",
            FilePath = filePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            Content = field.ToString(),
            ParentId = $"{filePath}:{parentFqn}",
            Metadata = new EntityMetadataDto
            {
                Fqn = fqn,
                Accessibility = GetAccessibility(field.Modifiers),
                IsStatic = field.Modifiers.Any(SyntaxKind.StaticKeyword),
                IsReadonly = field.Modifiers.Any(SyntaxKind.ReadOnlyKeyword),
                IsConst = field.Modifiers.Any(SyntaxKind.ConstKeyword),
                FieldType = field.Declaration.Type.ToString(),
            },
        };
    }

    private ParsedEntityDto ExtractEventEntity(EventDeclarationSyntax evt, string filePath, string parentFqn)
    {
        var lineSpan = evt.GetLocation().GetLineSpan();
        var name = evt.Identifier.Text;
        var fqn = $"{parentFqn}.{name}";

        return new ParsedEntityDto
        {
            Id = $"{filePath}:{fqn}",
            Name = name,
            Type = "event",
            FilePath = filePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            Content = evt.ToString(),
            ParentId = $"{filePath}:{parentFqn}",
            Metadata = new EntityMetadataDto
            {
                Fqn = fqn,
                Accessibility = GetAccessibility(evt.Modifiers),
                FieldType = evt.Type.ToString(),
            },
        };
    }

    private ParsedEntityDto ExtractEnumEntity(EnumDeclarationSyntax enm, string filePath, string? ns, List<string>? usings)
    {
        var lineSpan = enm.GetLocation().GetLineSpan();
        var name = enm.Identifier.Text;
        var fqn = ns != null ? $"{ns}.{name}" : name;

        return new ParsedEntityDto
        {
            Id = $"{filePath}:{fqn}",
            Name = name,
            Type = "enum",
            FilePath = filePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            Content = enm.ToString(),
            Metadata = new EntityMetadataDto
            {
                Namespace = ns,
                Fqn = fqn,
                Accessibility = GetAccessibility(enm.Modifiers),
                Usings = usings?.Count > 0 ? usings : null,
                Attributes = enm.AttributeLists.SelectMany(a => a.Attributes.Select(attr => attr.ToString())).ToList() is { Count: > 0 } attrs ? attrs : null,
            },
        };
    }

    private ParsedEntityDto ExtractDelegateEntity(DelegateDeclarationSyntax del, string filePath, string? ns)
    {
        var lineSpan = del.GetLocation().GetLineSpan();
        var name = del.Identifier.Text;
        var fqn = ns != null ? $"{ns}.{name}" : name;

        return new ParsedEntityDto
        {
            Id = $"{filePath}:{fqn}",
            Name = name,
            Type = "delegate",
            FilePath = filePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            Content = del.ToString(),
            Metadata = new EntityMetadataDto
            {
                Namespace = ns,
                Fqn = fqn,
                Accessibility = GetAccessibility(del.Modifiers),
                ReturnType = del.ReturnType.ToString(),
                Parameters = del.ParameterList.Parameters.Select(p => new ParameterDto
                {
                    Name = p.Identifier.Text,
                    Type = p.Type?.ToString() ?? "object",
                }).ToList(),
            },
        };
    }

    private static string GetAccessibility(SyntaxTokenList modifiers)
    {
        if (modifiers.Any(SyntaxKind.PublicKeyword)) return "public";
        if (modifiers.Any(SyntaxKind.ProtectedKeyword) && modifiers.Any(SyntaxKind.InternalKeyword)) return "protected internal";
        if (modifiers.Any(SyntaxKind.ProtectedKeyword)) return "protected";
        if (modifiers.Any(SyntaxKind.InternalKeyword)) return "internal";
        if (modifiers.Any(SyntaxKind.PrivateKeyword)) return "private";
        return "private";
    }

    private static List<CallInfoDto>? ExtractCalls(SyntaxNode node)
    {
        var invocations = node.DescendantNodes().OfType<InvocationExpressionSyntax>();
        var calls = new List<CallInfoDto>();

        foreach (var inv in invocations)
        {
            var lineSpan = inv.GetLocation().GetLineSpan();
            var conditions = ExtractEnclosingConditions(inv, node);

            switch (inv.Expression)
            {
                case MemberAccessExpressionSyntax memberAccess:
                    calls.Add(new CallInfoDto
                    {
                        Name = memberAccess.Name.Identifier.Text,
                        Receiver = memberAccess.Expression.ToString(),
                        Line = lineSpan.StartLinePosition.Line + 1,
                        Conditions = conditions,
                    });
                    break;
                case IdentifierNameSyntax identifier:
                    calls.Add(new CallInfoDto
                    {
                        Name = identifier.Identifier.Text,
                        Line = lineSpan.StartLinePosition.Line + 1,
                        Conditions = conditions,
                    });
                    break;
                default:
                    calls.Add(new CallInfoDto
                    {
                        Name = inv.Expression.ToString(),
                        Line = lineSpan.StartLinePosition.Line + 1,
                        Conditions = conditions,
                    });
                    break;
            }
        }

        return calls.Count > 0 ? calls : null;
    }

    /// <summary>
    /// Walk up the Roslyn syntax tree from an invocation, collecting enclosing
    /// if/switch/case/catch/for/while conditions. Stops at the containing method/function body.
    /// </summary>
    private static List<string>? ExtractEnclosingConditions(SyntaxNode invocation, SyntaxNode stopAt)
    {
        var conditions = new List<string>();
        const int maxConditions = 6;
        const int maxCondLen = 120;

        foreach (var ancestor in invocation.Ancestors())
        {
            if (ancestor == stopAt) break;
            if (conditions.Count >= maxConditions) break;

            switch (ancestor)
            {
                case IfStatementSyntax ifStmt:
                {
                    var condText = ifStmt.Condition.ToString();
                    if (condText.Length > maxCondLen) condText = condText[..maxCondLen] + "...";
                    // Determine if invocation is in the else branch
                    var inElse = ifStmt.Else != null && ifStmt.Else.Span.Contains(invocation.Span);
                    conditions.Add(inElse ? $"[else] if ({condText})" : $"if ({condText})");
                    break;
                }
                case SwitchStatementSyntax switchStmt:
                {
                    var expr = switchStmt.Expression.ToString();
                    if (expr.Length > maxCondLen) expr = expr[..maxCondLen] + "...";
                    conditions.Add($"switch ({expr})");
                    break;
                }
                case SwitchExpressionSyntax switchExpr:
                {
                    var expr = switchExpr.GoverningExpression.ToString();
                    if (expr.Length > maxCondLen) expr = expr[..maxCondLen] + "...";
                    conditions.Add($"switch ({expr})");
                    break;
                }
                case CaseSwitchLabelSyntax caseLabel:
                {
                    conditions.Add($"case {caseLabel.Value}");
                    break;
                }
                case CasePatternSwitchLabelSyntax patternLabel:
                {
                    var pat = patternLabel.Pattern.ToString();
                    if (pat.Length > maxCondLen) pat = pat[..maxCondLen] + "...";
                    conditions.Add($"case {pat}");
                    break;
                }
                case ForStatementSyntax forStmt:
                {
                    var cond = forStmt.Condition?.ToString() ?? "";
                    conditions.Add(cond.Length > 0 && cond.Length <= maxCondLen
                        ? $"[loop] for ({cond})"
                        : $"[loop] for :L{forStmt.GetLocation().GetLineSpan().StartLinePosition.Line + 1}");
                    break;
                }
                case ForEachStatementSyntax forEachStmt:
                {
                    var expr = forEachStmt.Expression.ToString();
                    if (expr.Length > maxCondLen) expr = expr[..maxCondLen] + "...";
                    conditions.Add($"[loop] foreach ({forEachStmt.Identifier} in {expr})");
                    break;
                }
                case WhileStatementSyntax whileStmt:
                {
                    var cond = whileStmt.Condition.ToString();
                    if (cond.Length > maxCondLen) cond = cond[..maxCondLen] + "...";
                    conditions.Add($"[loop] while ({cond})");
                    break;
                }
                case DoStatementSyntax doStmt:
                {
                    var cond = doStmt.Condition.ToString();
                    if (cond.Length > maxCondLen) cond = cond[..maxCondLen] + "...";
                    conditions.Add($"[loop] do-while ({cond})");
                    break;
                }
                case CatchClauseSyntax catchClause:
                {
                    var catchType = catchClause.Declaration?.Type.ToString() ?? "";
                    conditions.Add(catchType.Length > 0 ? $"[catch] ({catchType})" : "[catch]");
                    break;
                }
                case ConditionalExpressionSyntax ternary:
                {
                    var cond = ternary.Condition.ToString();
                    if (cond.Length > maxCondLen) cond = cond[..maxCondLen] + "...";
                    var inFalse = ternary.WhenFalse.Span.Contains(invocation.Span);
                    conditions.Add(inFalse ? $"[else] ternary ({cond})" : $"ternary ({cond})");
                    break;
                }
            }
        }

        return conditions.Count > 0 ? conditions : null;
    }

    private static int CalculateCyclomaticComplexity(SyntaxNode node)
    {
        int complexity = 1;

        foreach (var descendant in node.DescendantNodes())
        {
            switch (descendant)
            {
                case IfStatementSyntax:
                case ConditionalExpressionSyntax:
                case CaseSwitchLabelSyntax:
                case CasePatternSwitchLabelSyntax:
                case WhileStatementSyntax:
                case ForStatementSyntax:
                case ForEachStatementSyntax:
                case DoStatementSyntax:
                case CatchClauseSyntax:
                case ConditionalAccessExpressionSyntax:
                    complexity++;
                    break;
                case BinaryExpressionSyntax binary when binary.IsKind(SyntaxKind.LogicalAndExpression) || binary.IsKind(SyntaxKind.LogicalOrExpression) || binary.IsKind(SyntaxKind.CoalesceExpression):
                    complexity++;
                    break;
            }
        }

        return complexity;
    }

    /// <summary>
    /// Extract control flow information from a method/constructor body in a single pass.
    /// </summary>
    private static ControlFlowDto? ExtractControlFlow(SyntaxNode node)
    {
        List<LocationDto>? branches = null;
        List<LoopDto>? loops = null;
        List<ExceptionInfoDto>? exceptions = null;
        List<LocationDto>? returns = null;
        List<AwaitInfoDto>? awaits = null;

        foreach (var descendant in node.DescendantNodes())
        {
            switch (descendant)
            {
                case IfStatementSyntax ifStmt:
                    branches ??= [];
                    branches.Add(new LocationDto { Line = ifStmt.GetLocation().GetLineSpan().StartLinePosition.Line + 1 });
                    break;

                case SwitchStatementSyntax switchStmt:
                    branches ??= [];
                    branches.Add(new LocationDto { Line = switchStmt.GetLocation().GetLineSpan().StartLinePosition.Line + 1 });
                    break;

                case ConditionalExpressionSyntax ternary:
                    branches ??= [];
                    branches.Add(new LocationDto { Line = ternary.GetLocation().GetLineSpan().StartLinePosition.Line + 1 });
                    break;

                case ForStatementSyntax forStmt:
                    loops ??= [];
                    loops.Add(new LoopDto
                    {
                        Kind = "for",
                        Line = forStmt.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                        InnerCalls = ExtractInnerCalls(forStmt.Statement),
                    });
                    break;

                case ForEachStatementSyntax forEachStmt:
                    loops ??= [];
                    loops.Add(new LoopDto
                    {
                        Kind = "foreach",
                        Line = forEachStmt.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                        InnerCalls = ExtractInnerCalls(forEachStmt.Statement),
                    });
                    break;

                case WhileStatementSyntax whileStmt:
                    loops ??= [];
                    loops.Add(new LoopDto
                    {
                        Kind = "while",
                        Line = whileStmt.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                        InnerCalls = ExtractInnerCalls(whileStmt.Statement),
                    });
                    break;

                case DoStatementSyntax doStmt:
                    loops ??= [];
                    loops.Add(new LoopDto
                    {
                        Kind = "do",
                        Line = doStmt.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                        InnerCalls = ExtractInnerCalls(doStmt.Statement),
                    });
                    break;

                case TryStatementSyntax tryStmt:
                    foreach (var catchClause in tryStmt.Catches)
                    {
                        exceptions ??= [];
                        var catchBody = catchClause.Block;
                        var hasThrow = false;
                        var hasThrowEx = false;
                        foreach (var stmt in catchBody.DescendantNodes().OfType<ThrowStatementSyntax>())
                        {
                            if (stmt.Expression == null)
                                hasThrow = true; // bare "throw;"
                            else
                                hasThrowEx = true; // "throw ex;" or "throw new ..."
                        }

                        var statementsCount = catchBody.Statements.Count;
                        var isEmpty = statementsCount == 0 || (statementsCount == 1 && !hasThrow && !hasThrowEx);

                        exceptions.Add(new ExceptionInfoDto
                        {
                            Line = catchClause.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                            CatchType = catchClause.Declaration?.Type.ToString(),
                            HasRethrow = hasThrow,
                            IsEmpty = isEmpty,
                            HasThrowEx = hasThrowEx,
                        });
                    }
                    break;

                case ReturnStatementSyntax retStmt:
                    returns ??= [];
                    returns.Add(new LocationDto { Line = retStmt.GetLocation().GetLineSpan().StartLinePosition.Line + 1 });
                    break;

                case AwaitExpressionSyntax awaitExpr:
                    awaits ??= [];
                    var exprText = awaitExpr.Expression.ToString();
                    if (exprText.Length > 100) exprText = exprText[..100];
                    awaits.Add(new AwaitInfoDto
                    {
                        Expression = exprText,
                        Line = awaitExpr.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                    });
                    break;
            }
        }

        if (branches == null && loops == null && exceptions == null && returns == null && awaits == null)
            return null;

        return new ControlFlowDto
        {
            Branches = branches,
            Loops = loops,
            Exceptions = exceptions,
            Returns = returns,
            Awaits = awaits,
        };
    }

    /// <summary>
    /// Extract inner invocation calls from a loop body.
    /// </summary>
    private static List<string>? ExtractInnerCalls(SyntaxNode? body)
    {
        if (body == null) return null;

        var calls = new List<string>();
        foreach (var inv in body.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            var name = inv.Expression switch
            {
                MemberAccessExpressionSyntax ma => ma.Name.Identifier.Text,
                IdentifierNameSyntax id => id.Identifier.Text,
                _ => inv.Expression.ToString(),
            };
            if (!calls.Contains(name))
                calls.Add(name);
        }
        return calls.Count > 0 ? calls : null;
    }

    /// <summary>
    /// Extract C#-specific antipattern hints from a method/constructor body in a single pass.
    /// </summary>
    private static CSharpHintsDto? ExtractCSharpHints(SyntaxNode node)
    {
        int syncOverAsync = 0;
        int nullForgiving = 0;
        int lockOnThis = 0;
        int stringConcatInLoop = 0;
        int newHttpClient = 0;
        int newDisposableNoUsing = 0;
        bool hasParallelForEachAsync = false;
        int throwEx = 0;
        int emptyCatch = 0;

        // Collect loop bodies for string concat detection
        var loopBodies = new HashSet<SyntaxNode>();
        foreach (var d in node.DescendantNodes())
        {
            SyntaxNode? loopBody = d switch
            {
                ForStatementSyntax f => f.Statement,
                ForEachStatementSyntax fe => fe.Statement,
                WhileStatementSyntax w => w.Statement,
                DoStatementSyntax ds => ds.Statement,
                _ => null,
            };
            if (loopBody != null)
                loopBodies.Add(loopBody);
        }

        foreach (var descendant in node.DescendantNodes())
        {
            switch (descendant)
            {
                // sync-over-async: .Result, .Wait(), .GetAwaiter().GetResult()
                case MemberAccessExpressionSyntax memberAccess:
                    var memberName = memberAccess.Name.Identifier.Text;
                    if (memberName is "Result" or "Wait")
                        syncOverAsync++;
                    break;

                case InvocationExpressionSyntax invocation:
                {
                    var invName = invocation.Expression switch
                    {
                        MemberAccessExpressionSyntax ma => ma.Name.Identifier.Text,
                        IdentifierNameSyntax id => id.Identifier.Text,
                        _ => null,
                    };
                    if (invName == "GetAwaiter")
                        syncOverAsync++;

                    // Parallel.ForEach with async lambda
                    if (invocation.Expression is MemberAccessExpressionSyntax maParallel &&
                        maParallel.Expression.ToString() == "Parallel" &&
                        maParallel.Name.Identifier.Text == "ForEach")
                    {
                        // Check if any argument is an async lambda
                        foreach (var arg in invocation.ArgumentList.Arguments)
                        {
                            if (arg.Expression is ParenthesizedLambdaExpressionSyntax lambda && lambda.AsyncKeyword.IsKind(SyntaxKind.AsyncKeyword))
                                hasParallelForEachAsync = true;
                            else if (arg.Expression is SimpleLambdaExpressionSyntax simpleLambda && simpleLambda.AsyncKeyword.IsKind(SyntaxKind.AsyncKeyword))
                                hasParallelForEachAsync = true;
                        }
                    }
                    break;
                }

                // Null-forgiving operator (!)
                case PostfixUnaryExpressionSyntax postfix when postfix.IsKind(SyntaxKind.SuppressNullableWarningExpression):
                    nullForgiving++;
                    break;

                // lock(this) or lock(typeof(...))
                case LockStatementSyntax lockStmt:
                    if (lockStmt.Expression is ThisExpressionSyntax || lockStmt.Expression is TypeOfExpressionSyntax)
                        lockOnThis++;
                    break;

                // String += in loop body
                case AssignmentExpressionSyntax assignment when assignment.IsKind(SyntaxKind.AddAssignmentExpression):
                    // Check if inside a loop body
                    foreach (var loopBody in loopBodies)
                    {
                        if (loopBody.Span.Contains(assignment.Span))
                        {
                            // Check if left side is string-like (heuristic: identifier, not numeric)
                            var leftType = assignment.Left.ToString();
                            if (!leftType.Contains('[') && !leftType.Contains('.'))
                                stringConcatInLoop++;
                            break;
                        }
                    }
                    break;

                // new HttpClient()
                case ObjectCreationExpressionSyntax objCreation:
                {
                    var typeName = objCreation.Type.ToString();
                    if (typeName is "HttpClient")
                        newHttpClient++;

                    // IDisposable types without using — check common disposable types
                    if (IsKnownDisposableType(typeName))
                    {
                        var parent = objCreation.Parent;
                        bool hasUsing = false;
                        while (parent != null)
                        {
                            if (parent is UsingStatementSyntax || parent is LocalDeclarationStatementSyntax localDecl && localDecl.UsingKeyword.IsKind(SyntaxKind.UsingKeyword))
                            {
                                hasUsing = true;
                                break;
                            }
                            if (parent is MethodDeclarationSyntax || parent is ConstructorDeclarationSyntax)
                                break;
                            parent = parent.Parent;
                        }
                        if (!hasUsing)
                            newDisposableNoUsing++;
                    }
                    break;
                }

                // throw ex; (re-throw with variable — loses stack trace)
                case ThrowStatementSyntax throwStmt when throwStmt.Expression is IdentifierNameSyntax:
                {
                    // Check if the identifier matches a catch variable
                    var throwIdent = ((IdentifierNameSyntax)throwStmt.Expression).Identifier.Text;
                    var catchClause = throwStmt.Ancestors().OfType<CatchClauseSyntax>().FirstOrDefault();
                    if (catchClause?.Declaration?.Identifier.Text == throwIdent)
                        throwEx++;
                    break;
                }

                // Empty catch
                case CatchClauseSyntax catchClause:
                {
                    var body = catchClause.Block;
                    var hasAnyThrow = body.DescendantNodes().OfType<ThrowStatementSyntax>().Any();
                    if (body.Statements.Count == 0 || (body.Statements.Count == 1 && !hasAnyThrow))
                        emptyCatch++;
                    break;
                }
            }
        }

        if (syncOverAsync == 0 && nullForgiving == 0 && lockOnThis == 0 && stringConcatInLoop == 0 &&
            newHttpClient == 0 && newDisposableNoUsing == 0 && !hasParallelForEachAsync &&
            throwEx == 0 && emptyCatch == 0)
            return null;

        return new CSharpHintsDto
        {
            SyncOverAsyncCount = syncOverAsync,
            NullForgivingCount = nullForgiving,
            LockOnThisCount = lockOnThis,
            StringConcatInLoopCount = stringConcatInLoop,
            NewHttpClientCount = newHttpClient,
            NewDisposableNoUsingCount = newDisposableNoUsing,
            HasParallelForEachAsync = hasParallelForEachAsync,
            ThrowExCount = throwEx,
            EmptyCatchCount = emptyCatch,
        };
    }

    private static bool IsKnownDisposableType(string typeName) =>
        typeName is "HttpClient" or "SqlConnection" or "SqlCommand" or "StreamReader"
            or "StreamWriter" or "FileStream" or "MemoryStream" or "BinaryReader"
            or "BinaryWriter" or "TcpClient" or "UdpClient" or "WebClient"
            or "HttpResponseMessage" or "DbConnection" or "DbCommand"
            or "NpgsqlConnection" or "MySqlConnection";

    private static string? ExtractDocComment(SyntaxNode node)
    {
        var trivia = node.GetLeadingTrivia()
            .FirstOrDefault(t => t.IsKind(SyntaxKind.SingleLineDocumentationCommentTrivia) || t.IsKind(SyntaxKind.MultiLineDocumentationCommentTrivia));

        if (trivia == default) return null;

        var xml = trivia.ToString();
        var summaryStart = xml.IndexOf("<summary>", StringComparison.OrdinalIgnoreCase);
        var summaryEnd = xml.IndexOf("</summary>", StringComparison.OrdinalIgnoreCase);
        if (summaryStart >= 0 && summaryEnd > summaryStart)
        {
            var inner = xml[(summaryStart + 9)..summaryEnd].Trim();
            inner = string.Join(" ", inner.Split('\n').Select(l => l.Trim().TrimStart('/', ' ')));
            return string.IsNullOrWhiteSpace(inner) ? null : inner;
        }

        return null;
    }

    /// <summary>
    /// Result of single-pass parsing, including method nodes for GPU batch processing.
    /// </summary>
    private sealed class SinglePassResult
    {
        public List<ParsedEntityDto> Entities { get; init; } = [];
        public List<SyntaxNode> MethodNodes { get; init; } = [];
        public List<EntityMetadataDto> MethodMetadataRefs { get; init; } = [];
    }
}
