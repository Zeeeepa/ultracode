package ultrascript.types

import kotlinx.serialization.Serializable

@Serializable
data class Command(
    val id: String,
    val type: String, // "parse" or "shutdown"
    val filePath: String? = null,
    val content: String? = null
)

@Serializable
data class ParseResult(
    val id: String,
    val success: Boolean,
    val entities: List<ParsedEntity> = emptyList(),
    val relationships: List<EntityRelationship> = emptyList(),
    val callGraph: List<CallEdge> = emptyList(),
    val error: String? = null
)

@Serializable
data class ParsedEntity(
    val name: String,
    val type: String, // "class", "interface", "function", "property", "enum", "object", "method", "field", "import", "module"
    val filePath: String,
    val location: Location,
    val modifiers: List<String>? = null,
    val parameters: List<Parameter>? = null,
    val returnType: String? = null,
    val superTypes: List<String>? = null,
    val documentation: String? = null,
    val children: List<ParsedEntity>? = null
)

@Serializable
data class Location(
    val start: Position,
    val end: Position
)

@Serializable
data class Position(
    val line: Int,
    val column: Int,
    val index: Int
)

@Serializable
data class Parameter(
    val name: String,
    val type: String? = null,
    val optional: Boolean = false,
    val defaultValue: String? = null
)

@Serializable
data class EntityRelationship(
    val from: String,
    val to: String,
    val type: String, // "imports", "inherits", "implements", "contains", "calls", "references"
    val metadata: Map<String, String>? = null
)

@Serializable
data class CallEdge(
    val from: String?,
    val to: String?,
    val line: Int
)
