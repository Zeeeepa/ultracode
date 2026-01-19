package ultrascript

import mu.KotlinLogging
import org.jetbrains.kotlin.cli.common.CLIConfigurationKeys
import org.jetbrains.kotlin.cli.common.messages.MessageCollector
import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment
import org.jetbrains.kotlin.com.intellij.openapi.Disposable
import org.jetbrains.kotlin.com.intellij.openapi.util.Disposer
import org.jetbrains.kotlin.com.intellij.psi.PsiElement
import org.jetbrains.kotlin.config.CompilerConfiguration
import org.jetbrains.kotlin.psi.*
import ultrascript.types.*

private val logger = KotlinLogging.logger {}

/**
 * K2 Parser using Kotlin PSI
 *
 * Uses embedded Kotlin compiler's PSI (Program Structure Interface) for parsing.
 * This provides accurate AST extraction without needing full K2 Analysis API setup.
 */
class K2Parser {
    private var rootDisposable: Disposable? = null
    private var environment: KotlinCoreEnvironment? = null
    private var psiFileFactory: KtPsiFactory? = null

    fun initialize() {
        logger.info { "Initializing K2 Parser..." }

        rootDisposable = Disposer.newDisposable("K2Parser")

        val configuration = CompilerConfiguration().apply {
            put(CLIConfigurationKeys.MESSAGE_COLLECTOR_KEY, MessageCollector.NONE)
        }

        environment = KotlinCoreEnvironment.createForProduction(
            rootDisposable!!,
            configuration,
            EnvironmentConfigFiles.JVM_CONFIG_FILES
        )

        psiFileFactory = KtPsiFactory(environment!!.project)

        logger.info { "K2 Parser initialized" }
    }

    fun dispose() {
        rootDisposable?.let { Disposer.dispose(it) }
        rootDisposable = null
        environment = null
        psiFileFactory = null
    }

    fun parse(filePath: String, content: String): ParseResult {
        val factory = psiFileFactory ?: throw IllegalStateException("Parser not initialized")

        val ktFile = factory.createFile(filePath, content)

        val entities = mutableListOf<ParsedEntity>()
        val relationships = mutableListOf<EntityRelationship>()
        val callGraph = mutableListOf<CallEdge>()

        // Extract package
        ktFile.packageDirective?.let { pkg ->
            val packageName = pkg.fqName.asString()
            if (packageName.isNotEmpty()) {
                entities.add(
                    ParsedEntity(
                        name = packageName,
                        type = "module",
                        filePath = filePath,
                        location = getLocation(pkg, content)
                    )
                )
            }
        }

        // Extract imports
        ktFile.importDirectives.forEach { import ->
            val importPath = import.importedFqName?.asString() ?: return@forEach
            entities.add(
                ParsedEntity(
                    name = importPath,
                    type = "import",
                    filePath = filePath,
                    location = getLocation(import, content),
                    modifiers = if (import.aliasName != null) listOf("aliased") else null
                )
            )
            relationships.add(
                EntityRelationship(
                    from = filePath,
                    to = importPath,
                    type = "imports"
                )
            )
        }

        // Process top-level declarations
        ktFile.declarations.forEach { declaration ->
            processDeclaration(declaration, filePath, content, entities, relationships, callGraph, null)
        }

        return ParseResult(
            id = "",
            success = true,
            entities = entities,
            relationships = relationships,
            callGraph = callGraph
        )
    }

    private fun processDeclaration(
        declaration: KtDeclaration,
        filePath: String,
        content: String,
        entities: MutableList<ParsedEntity>,
        relationships: MutableList<EntityRelationship>,
        callGraph: MutableList<CallEdge>,
        parentName: String?
    ) {
        when (declaration) {
            is KtClass -> processClass(declaration, filePath, content, entities, relationships, callGraph, parentName)
            is KtObjectDeclaration -> processObject(declaration, filePath, content, entities, relationships, callGraph, parentName)
            is KtNamedFunction -> processFunction(declaration, filePath, content, entities, relationships, callGraph, parentName)
            is KtProperty -> processProperty(declaration, filePath, content, entities, relationships, parentName)
            is KtTypeAlias -> processTypeAlias(declaration, filePath, content, entities)
        }
    }

    private fun processClass(
        ktClass: KtClass,
        filePath: String,
        content: String,
        entities: MutableList<ParsedEntity>,
        relationships: MutableList<EntityRelationship>,
        callGraph: MutableList<CallEdge>,
        parentName: String?
    ) {
        val className = ktClass.name ?: return
        val fullName = if (parentName != null) "$parentName.$className" else className

        val type = when {
            ktClass.isInterface() -> "interface"
            ktClass.isEnum() -> "enum"
            ktClass.isAnnotation() -> "interface"
            else -> "class"
        }

        val modifiers = extractModifiers(ktClass)

        // Extract super types
        val superTypes = ktClass.superTypeListEntries.mapNotNull { entry ->
            when (entry) {
                is KtSuperTypeCallEntry -> entry.typeReference?.text?.substringBefore("<")
                is KtSuperTypeEntry -> entry.typeReference?.text?.substringBefore("<")
                else -> null
            }
        }

        // Extract primary constructor parameters
        val parameters = ktClass.primaryConstructorParameters.map { param ->
            Parameter(
                name = param.name ?: "",
                type = param.typeReference?.text,
                optional = param.hasDefaultValue(),
                defaultValue = param.defaultValue?.text
            )
        }

        val children = mutableListOf<ParsedEntity>()

        // Process members
        ktClass.declarations.forEach { member ->
            processDeclaration(member, filePath, content, children, relationships, callGraph, fullName)
        }

        // Extract enum entries
        if (ktClass.isEnum()) {
            ktClass.declarations.filterIsInstance<KtEnumEntry>().forEach { entry ->
                children.add(
                    ParsedEntity(
                        name = entry.name ?: "",
                        type = "enum_variant",
                        filePath = filePath,
                        location = getLocation(entry, content)
                    )
                )
            }
        }

        entities.add(
            ParsedEntity(
                name = fullName,
                type = type,
                filePath = filePath,
                location = getLocation(ktClass, content),
                modifiers = modifiers.ifEmpty { null },
                parameters = parameters.ifEmpty { null },
                superTypes = superTypes.ifEmpty { null },
                documentation = ktClass.docComment?.text,
                children = children.ifEmpty { null }
            )
        )

        // Create inheritance relationships
        superTypes.forEach { superType ->
            val relType = if (ktClass.isInterface()) "inherits" else {
                // First super type with () is a class, others are interfaces
                if (ktClass.superTypeListEntries.any { it is KtSuperTypeCallEntry && it.typeReference?.text?.startsWith(superType) == true }) {
                    "inherits"
                } else {
                    "implements"
                }
            }
            relationships.add(
                EntityRelationship(
                    from = fullName,
                    to = superType,
                    type = relType
                )
            )
        }
    }

    private fun processObject(
        ktObject: KtObjectDeclaration,
        filePath: String,
        content: String,
        entities: MutableList<ParsedEntity>,
        relationships: MutableList<EntityRelationship>,
        callGraph: MutableList<CallEdge>,
        parentName: String?
    ) {
        val objectName = ktObject.name ?: return
        val fullName = if (parentName != null) "$parentName.$objectName" else objectName

        val modifiers = extractModifiers(ktObject).toMutableList()
        if (ktObject.isCompanion()) {
            modifiers.add("companion")
        }

        val superTypes = ktObject.superTypeListEntries.mapNotNull { entry ->
            entry.typeReference?.text?.substringBefore("<")
        }

        val children = mutableListOf<ParsedEntity>()
        ktObject.declarations.forEach { member ->
            processDeclaration(member, filePath, content, children, relationships, callGraph, fullName)
        }

        entities.add(
            ParsedEntity(
                name = fullName,
                type = "class",
                filePath = filePath,
                location = getLocation(ktObject, content),
                modifiers = modifiers.ifEmpty { null },
                superTypes = superTypes.ifEmpty { null },
                documentation = ktObject.docComment?.text,
                children = children.ifEmpty { null }
            )
        )

        // Inheritance relationships
        superTypes.forEach { superType ->
            relationships.add(
                EntityRelationship(
                    from = fullName,
                    to = superType,
                    type = if (superTypes.indexOf(superType) == 0) "inherits" else "implements"
                )
            )
        }
    }

    private fun processFunction(
        ktFunction: KtNamedFunction,
        filePath: String,
        content: String,
        entities: MutableList<ParsedEntity>,
        relationships: MutableList<EntityRelationship>,
        callGraph: MutableList<CallEdge>,
        parentName: String?
    ) {
        val functionName = ktFunction.name ?: return
        val receiverType = ktFunction.receiverTypeReference?.text
        val displayName = if (receiverType != null) "$receiverType.$functionName" else functionName
        val fullName = if (parentName != null) "$parentName.$functionName" else displayName

        val modifiers = extractModifiers(ktFunction)
        val isSuspend = ktFunction.hasModifier(org.jetbrains.kotlin.lexer.KtTokens.SUSPEND_KEYWORD)

        val parameters = ktFunction.valueParameters.map { param ->
            Parameter(
                name = param.name ?: "",
                type = param.typeReference?.text,
                optional = param.hasDefaultValue(),
                defaultValue = param.defaultValue?.text
            )
        }

        entities.add(
            ParsedEntity(
                name = fullName,
                type = if (isSuspend) "async_function" else if (parentName != null) "method" else "function",
                filePath = filePath,
                location = getLocation(ktFunction, content),
                modifiers = modifiers.ifEmpty { null },
                parameters = parameters.ifEmpty { null },
                returnType = ktFunction.typeReference?.text,
                documentation = ktFunction.docComment?.text
            )
        )

        // Extract call graph from function body
        ktFunction.bodyExpression?.let { body ->
            extractCalls(body, fullName, callGraph, content)
        }
    }

    private fun processProperty(
        ktProperty: KtProperty,
        filePath: String,
        content: String,
        entities: MutableList<ParsedEntity>,
        relationships: MutableList<EntityRelationship>,
        parentName: String?
    ) {
        val propertyName = ktProperty.name ?: return
        val receiverType = ktProperty.receiverTypeReference?.text
        val displayName = if (receiverType != null) "$receiverType.$propertyName" else propertyName
        val fullName = if (parentName != null) "$parentName.$propertyName" else displayName

        val modifiers = extractModifiers(ktProperty).toMutableList()
        if (ktProperty.isVar) modifiers.add("var") else modifiers.add("val")

        val type = when {
            ktProperty.hasModifier(org.jetbrains.kotlin.lexer.KtTokens.CONST_KEYWORD) -> "constant"
            !ktProperty.isVar -> "constant"
            else -> "property"
        }

        entities.add(
            ParsedEntity(
                name = fullName,
                type = type,
                filePath = filePath,
                location = getLocation(ktProperty, content),
                modifiers = modifiers.ifEmpty { null },
                returnType = ktProperty.typeReference?.text,
                documentation = ktProperty.docComment?.text
            )
        )

        // Create type reference relationship
        ktProperty.typeReference?.text?.let { typeText ->
            val baseType = typeText.substringBefore("<").substringBefore("?")
            if (baseType.isNotEmpty() && !isPrimitive(baseType)) {
                relationships.add(
                    EntityRelationship(
                        from = fullName,
                        to = baseType,
                        type = "references",
                        metadata = mapOf("referenceKind" to "field")
                    )
                )
            }
        }
    }

    private fun processTypeAlias(
        ktTypeAlias: KtTypeAlias,
        filePath: String,
        content: String,
        entities: MutableList<ParsedEntity>
    ) {
        val aliasName = ktTypeAlias.name ?: return
        val aliasedType = ktTypeAlias.getTypeReference()?.text

        entities.add(
            ParsedEntity(
                name = aliasName,
                type = "type",
                filePath = filePath,
                location = getLocation(ktTypeAlias, content),
                returnType = aliasedType,
                documentation = ktTypeAlias.docComment?.text
            )
        )
    }

    private fun extractCalls(
        body: PsiElement,
        fromFunction: String,
        callGraph: MutableList<CallEdge>,
        content: String
    ) {
        body.accept(object : KtTreeVisitorVoid() {
            override fun visitCallExpression(expression: KtCallExpression) {
                val callee = expression.calleeExpression
                val calleeName = when (callee) {
                    is KtNameReferenceExpression -> callee.getReferencedName()
                    is KtDotQualifiedExpression -> callee.selectorExpression?.text
                    else -> callee?.text
                }

                if (calleeName != null && !isKotlinKeyword(calleeName)) {
                    val line = content.substring(0, expression.textOffset).count { it == '\n' } + 1
                    callGraph.add(
                        CallEdge(
                            from = fromFunction,
                            to = calleeName,
                            line = line
                        )
                    )
                }

                super.visitCallExpression(expression)
            }
        })
    }

    private fun extractModifiers(declaration: KtModifierListOwner): List<String> {
        val modifiers = mutableListOf<String>()

        declaration.modifierList?.let { modifierList ->
            val tokens = listOf(
                org.jetbrains.kotlin.lexer.KtTokens.PUBLIC_KEYWORD to "public",
                org.jetbrains.kotlin.lexer.KtTokens.PRIVATE_KEYWORD to "private",
                org.jetbrains.kotlin.lexer.KtTokens.PROTECTED_KEYWORD to "protected",
                org.jetbrains.kotlin.lexer.KtTokens.INTERNAL_KEYWORD to "internal",
                org.jetbrains.kotlin.lexer.KtTokens.ABSTRACT_KEYWORD to "abstract",
                org.jetbrains.kotlin.lexer.KtTokens.OPEN_KEYWORD to "open",
                org.jetbrains.kotlin.lexer.KtTokens.FINAL_KEYWORD to "final",
                org.jetbrains.kotlin.lexer.KtTokens.SEALED_KEYWORD to "sealed",
                org.jetbrains.kotlin.lexer.KtTokens.DATA_KEYWORD to "data",
                org.jetbrains.kotlin.lexer.KtTokens.INNER_KEYWORD to "inner",
                org.jetbrains.kotlin.lexer.KtTokens.INLINE_KEYWORD to "inline",
                org.jetbrains.kotlin.lexer.KtTokens.VALUE_KEYWORD to "value",
                org.jetbrains.kotlin.lexer.KtTokens.SUSPEND_KEYWORD to "suspend",
                org.jetbrains.kotlin.lexer.KtTokens.OVERRIDE_KEYWORD to "override",
                org.jetbrains.kotlin.lexer.KtTokens.EXTERNAL_KEYWORD to "external",
                org.jetbrains.kotlin.lexer.KtTokens.OPERATOR_KEYWORD to "operator",
                org.jetbrains.kotlin.lexer.KtTokens.INFIX_KEYWORD to "infix",
                org.jetbrains.kotlin.lexer.KtTokens.TAILREC_KEYWORD to "tailrec",
                org.jetbrains.kotlin.lexer.KtTokens.CONST_KEYWORD to "const",
                org.jetbrains.kotlin.lexer.KtTokens.LATEINIT_KEYWORD to "lateinit",
                org.jetbrains.kotlin.lexer.KtTokens.ACTUAL_KEYWORD to "actual",
                org.jetbrains.kotlin.lexer.KtTokens.EXPECT_KEYWORD to "expect"
            )

            for ((token, name) in tokens) {
                if (modifierList.hasModifier(token)) {
                    modifiers.add(name)
                }
            }
        }

        return modifiers
    }

    private fun getLocation(element: PsiElement, content: String): Location {
        val startOffset = element.textOffset
        val endOffset = startOffset + element.textLength

        // Calculate line and column
        var startLine = 1
        var startColumn = 0
        for (i in 0 until startOffset) {
            if (i < content.length && content[i] == '\n') {
                startLine++
                startColumn = 0
            } else {
                startColumn++
            }
        }

        var endLine = startLine
        var endColumn = startColumn
        for (i in startOffset until endOffset) {
            if (i < content.length && content[i] == '\n') {
                endLine++
                endColumn = 0
            } else {
                endColumn++
            }
        }

        return Location(
            start = Position(startLine, startColumn, startOffset),
            end = Position(endLine, endColumn, endOffset)
        )
    }

    private fun isPrimitive(type: String): Boolean {
        return type in setOf(
            "Int", "Long", "Short", "Byte", "Float", "Double", "Boolean", "Char",
            "String", "Unit", "Nothing", "Any", "Number"
        )
    }

    private fun isKotlinKeyword(name: String): Boolean {
        return name in setOf(
            "if", "else", "when", "for", "while", "do", "try", "catch", "finally",
            "throw", "return", "break", "continue", "class", "interface", "object",
            "fun", "val", "var", "is", "in", "as", "true", "false", "null",
            "this", "super", "it", "constructor", "init", "get", "set", "by",
            "where", "import", "package", "typeof", "suspend", "inline"
        )
    }
}
