using System.Text.Json.Serialization;

namespace UltraCode.CSharp.Models;

/// <summary>
/// DTO compatible with ParsedEntity from ultrascript-tools-mcp (src/types/parser.ts).
/// Represents a parsed code entity (class, method, property, field, enum, interface).
/// </summary>
public sealed class ParsedEntityDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = ""; // class, method, property, field, enum, interface, constructor, event, delegate

    [JsonPropertyName("filePath")]
    public string FilePath { get; set; } = "";

    [JsonPropertyName("startLine")]
    public int StartLine { get; set; }

    [JsonPropertyName("endLine")]
    public int EndLine { get; set; }

    [JsonPropertyName("content")]
    public string Content { get; set; } = "";

    [JsonPropertyName("language")]
    public string Language { get; set; } = "csharp";

    [JsonPropertyName("parentId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ParentId { get; set; }

    [JsonPropertyName("metadata")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public EntityMetadataDto? Metadata { get; set; }

    [JsonPropertyName("children")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<ParsedEntityDto>? Children { get; set; }
}

/// <summary>
/// Rich metadata for C# entities — enriched beyond what generic parsers provide.
/// </summary>
public sealed class EntityMetadataDto
{
    [JsonPropertyName("namespace")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Namespace { get; set; }

    [JsonPropertyName("fqn")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Fqn { get; set; }

    [JsonPropertyName("accessibility")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Accessibility { get; set; } // public, private, protected, internal

    [JsonPropertyName("isStatic")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsStatic { get; set; }

    [JsonPropertyName("isAsync")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsAsync { get; set; }

    [JsonPropertyName("isAbstract")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsAbstract { get; set; }

    [JsonPropertyName("isReadonly")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsReadonly { get; set; }

    [JsonPropertyName("isConst")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsConst { get; set; }

    [JsonPropertyName("isVirtual")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsVirtual { get; set; }

    [JsonPropertyName("isOverride")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsOverride { get; set; }

    [JsonPropertyName("isSealed")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsSealed { get; set; }

    [JsonPropertyName("isPartial")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsPartial { get; set; }

    [JsonPropertyName("returnType")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ReturnType { get; set; }

    [JsonPropertyName("parameters")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<ParameterDto>? Parameters { get; set; }

    [JsonPropertyName("baseTypes")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<string>? BaseTypes { get; set; }

    [JsonPropertyName("interfaces")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<string>? Interfaces { get; set; }

    [JsonPropertyName("usings")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<string>? Usings { get; set; }

    [JsonPropertyName("attributes")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<string>? Attributes { get; set; }

    [JsonPropertyName("typeParameters")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<string>? TypeParameters { get; set; }

    [JsonPropertyName("fieldType")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? FieldType { get; set; }

    [JsonPropertyName("propertyType")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? PropertyType { get; set; }

    [JsonPropertyName("calls")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<CallInfoDto>? Calls { get; set; }

    [JsonPropertyName("diagnostics")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<DiagnosticDto>? Diagnostics { get; set; }

    [JsonPropertyName("complexity")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public int Complexity { get; set; }

    [JsonPropertyName("simHash")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SimHash { get; set; }

    [JsonPropertyName("docComment")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DocComment { get; set; }

    [JsonPropertyName("controlFlow")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ControlFlowDto? ControlFlow { get; set; }

    [JsonPropertyName("csharpHints")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public CSharpHintsDto? CSharpHints { get; set; }
}

public sealed class ParameterDto
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("isOptional")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsOptional { get; set; }

    [JsonPropertyName("defaultValue")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DefaultValue { get; set; }
}

public sealed class CallInfoDto
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("receiver")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Receiver { get; set; }

    [JsonPropertyName("receiverType")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ReceiverType { get; set; }

    [JsonPropertyName("line")]
    public int Line { get; set; }
}

public sealed class DiagnosticDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("message")]
    public string Message { get; set; } = "";

    [JsonPropertyName("severity")]
    public string Severity { get; set; } = ""; // error, warning, info, hidden

    [JsonPropertyName("line")]
    public int Line { get; set; }

    [JsonPropertyName("column")]
    public int Column { get; set; }
}

public sealed class ControlFlowDto
{
    [JsonPropertyName("branches")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<LocationDto>? Branches { get; set; }

    [JsonPropertyName("loops")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<LoopDto>? Loops { get; set; }

    [JsonPropertyName("exceptions")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<ExceptionInfoDto>? Exceptions { get; set; }

    [JsonPropertyName("returns")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<LocationDto>? Returns { get; set; }

    [JsonPropertyName("awaits")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<AwaitInfoDto>? Awaits { get; set; }
}

public sealed class LoopDto
{
    [JsonPropertyName("kind")]
    public string Kind { get; set; } = "";

    [JsonPropertyName("line")]
    public int Line { get; set; }

    [JsonPropertyName("innerCalls")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<string>? InnerCalls { get; set; }
}

public sealed class ExceptionInfoDto
{
    [JsonPropertyName("line")]
    public int Line { get; set; }

    [JsonPropertyName("catchType")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CatchType { get; set; }

    [JsonPropertyName("hasRethrow")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool HasRethrow { get; set; }

    [JsonPropertyName("isEmpty")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsEmpty { get; set; }

    [JsonPropertyName("hasThrowEx")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool HasThrowEx { get; set; }
}

public sealed class AwaitInfoDto
{
    [JsonPropertyName("expression")]
    public string Expression { get; set; } = "";

    [JsonPropertyName("line")]
    public int Line { get; set; }
}

public sealed class LocationDto
{
    [JsonPropertyName("line")]
    public int Line { get; set; }
}

public sealed class CSharpHintsDto
{
    [JsonPropertyName("syncOverAsyncCount")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public int SyncOverAsyncCount { get; set; }

    [JsonPropertyName("nullForgivingCount")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public int NullForgivingCount { get; set; }

    [JsonPropertyName("lockOnThisCount")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public int LockOnThisCount { get; set; }

    [JsonPropertyName("stringConcatInLoopCount")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public int StringConcatInLoopCount { get; set; }

    [JsonPropertyName("newHttpClientCount")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public int NewHttpClientCount { get; set; }

    [JsonPropertyName("newDisposableNoUsingCount")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public int NewDisposableNoUsingCount { get; set; }

    [JsonPropertyName("hasParallelForEachAsync")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool HasParallelForEachAsync { get; set; }

    [JsonPropertyName("throwExCount")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public int ThrowExCount { get; set; }

    [JsonPropertyName("emptyCatchCount")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public int EmptyCatchCount { get; set; }
}
