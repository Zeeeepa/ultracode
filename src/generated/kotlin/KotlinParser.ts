// Generated from D:/github/ultrascript-tools-mcp/grammar/kotlin/grammar/KotlinParser.g4 by ANTLR 4.13.1
// @ts-nocheck - Auto-generated code

import * as antlr from "antlr4ng";

import type { KotlinParserListener } from "./KotlinParserListener.js";
import type { KotlinParserVisitor } from "./KotlinParserVisitor.js";

// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;

export class KotlinParser extends antlr.Parser {
  public static readonly ShebangLine = 1;
  public static readonly DelimitedComment = 2;
  public static readonly LineComment = 3;
  public static readonly WS = 4;
  public static readonly NL = 5;
  public static readonly RESERVED = 6;
  public static readonly DOT = 7;
  public static readonly COMMA = 8;
  public static readonly LPAREN = 9;
  public static readonly RPAREN = 10;
  public static readonly LSQUARE = 11;
  public static readonly RSQUARE = 12;
  public static readonly LCURL = 13;
  public static readonly RCURL = 14;
  public static readonly MULT = 15;
  public static readonly MOD = 16;
  public static readonly DIV = 17;
  public static readonly ADD = 18;
  public static readonly SUB = 19;
  public static readonly INCR = 20;
  public static readonly DECR = 21;
  public static readonly CONJ = 22;
  public static readonly DISJ = 23;
  public static readonly EXCL_WS = 24;
  public static readonly EXCL_NO_WS = 25;
  public static readonly COLON = 26;
  public static readonly SEMICOLON = 27;
  public static readonly ASSIGNMENT = 28;
  public static readonly ADD_ASSIGNMENT = 29;
  public static readonly SUB_ASSIGNMENT = 30;
  public static readonly MULT_ASSIGNMENT = 31;
  public static readonly DIV_ASSIGNMENT = 32;
  public static readonly MOD_ASSIGNMENT = 33;
  public static readonly ARROW = 34;
  public static readonly DOUBLE_ARROW = 35;
  public static readonly RANGE = 36;
  public static readonly RANGE_UNTIL = 37;
  public static readonly COLONCOLON = 38;
  public static readonly DOUBLE_SEMICOLON = 39;
  public static readonly HASH = 40;
  public static readonly AT_NO_WS = 41;
  public static readonly AT_POST_WS = 42;
  public static readonly AT_PRE_WS = 43;
  public static readonly AT_BOTH_WS = 44;
  public static readonly QUEST_WS = 45;
  public static readonly QUEST_NO_WS = 46;
  public static readonly LANGLE = 47;
  public static readonly RANGLE = 48;
  public static readonly LE = 49;
  public static readonly GE = 50;
  public static readonly EXCL_EQ = 51;
  public static readonly EXCL_EQEQ = 52;
  public static readonly AS_SAFE = 53;
  public static readonly EQEQ = 54;
  public static readonly EQEQEQ = 55;
  public static readonly SINGLE_QUOTE = 56;
  public static readonly AMP = 57;
  public static readonly RETURN_AT = 58;
  public static readonly CONTINUE_AT = 59;
  public static readonly BREAK_AT = 60;
  public static readonly THIS_AT = 61;
  public static readonly SUPER_AT = 62;
  public static readonly FILE = 63;
  public static readonly FIELD = 64;
  public static readonly PROPERTY = 65;
  public static readonly GET = 66;
  public static readonly SET = 67;
  public static readonly RECEIVER = 68;
  public static readonly PARAM = 69;
  public static readonly SETPARAM = 70;
  public static readonly DELEGATE = 71;
  public static readonly PACKAGE = 72;
  public static readonly IMPORT = 73;
  public static readonly CLASS = 74;
  public static readonly INTERFACE = 75;
  public static readonly FUN = 76;
  public static readonly OBJECT = 77;
  public static readonly VAL = 78;
  public static readonly VAR = 79;
  public static readonly TYPE_ALIAS = 80;
  public static readonly CONSTRUCTOR = 81;
  public static readonly BY = 82;
  public static readonly COMPANION = 83;
  public static readonly INIT = 84;
  public static readonly THIS = 85;
  public static readonly SUPER = 86;
  public static readonly TYPEOF = 87;
  public static readonly WHERE = 88;
  public static readonly IF = 89;
  public static readonly ELSE = 90;
  public static readonly WHEN = 91;
  public static readonly TRY = 92;
  public static readonly CATCH = 93;
  public static readonly FINALLY = 94;
  public static readonly FOR = 95;
  public static readonly DO = 96;
  public static readonly WHILE = 97;
  public static readonly THROW = 98;
  public static readonly RETURN = 99;
  public static readonly CONTINUE = 100;
  public static readonly BREAK = 101;
  public static readonly AS = 102;
  public static readonly IS = 103;
  public static readonly IN = 104;
  public static readonly NOT_IS = 105;
  public static readonly NOT_IN = 106;
  public static readonly OUT = 107;
  public static readonly DYNAMIC = 108;
  public static readonly PUBLIC = 109;
  public static readonly PRIVATE = 110;
  public static readonly PROTECTED = 111;
  public static readonly INTERNAL = 112;
  public static readonly ENUM = 113;
  public static readonly SEALED = 114;
  public static readonly ANNOTATION = 115;
  public static readonly DATA = 116;
  public static readonly INNER = 117;
  public static readonly VALUE = 118;
  public static readonly TAILREC = 119;
  public static readonly OPERATOR = 120;
  public static readonly INLINE = 121;
  public static readonly INFIX = 122;
  public static readonly EXTERNAL = 123;
  public static readonly SUSPEND = 124;
  public static readonly OVERRIDE = 125;
  public static readonly ABSTRACT = 126;
  public static readonly FINAL = 127;
  public static readonly OPEN = 128;
  public static readonly CONST = 129;
  public static readonly LATEINIT = 130;
  public static readonly VARARG = 131;
  public static readonly NOINLINE = 132;
  public static readonly CROSSINLINE = 133;
  public static readonly REIFIED = 134;
  public static readonly EXPECT = 135;
  public static readonly ACTUAL = 136;
  public static readonly RealLiteral = 137;
  public static readonly FloatLiteral = 138;
  public static readonly DoubleLiteral = 139;
  public static readonly IntegerLiteral = 140;
  public static readonly HexLiteral = 141;
  public static readonly BinLiteral = 142;
  public static readonly UnsignedLiteral = 143;
  public static readonly LongLiteral = 144;
  public static readonly BooleanLiteral = 145;
  public static readonly NullLiteral = 146;
  public static readonly CharacterLiteral = 147;
  public static readonly Identifier = 148;
  public static readonly IdentifierOrSoftKey = 149;
  public static readonly FieldIdentifier = 150;
  public static readonly QUOTE_OPEN = 151;
  public static readonly TRIPLE_QUOTE_OPEN = 152;
  public static readonly UNICODE_CLASS_LL = 153;
  public static readonly UNICODE_CLASS_LM = 154;
  public static readonly UNICODE_CLASS_LO = 155;
  public static readonly UNICODE_CLASS_LT = 156;
  public static readonly UNICODE_CLASS_LU = 157;
  public static readonly UNICODE_CLASS_ND = 158;
  public static readonly UNICODE_CLASS_NL = 159;
  public static readonly QUOTE_CLOSE = 160;
  public static readonly LineStrRef = 161;
  public static readonly LineStrText = 162;
  public static readonly LineStrEscapedChar = 163;
  public static readonly LineStrExprStart = 164;
  public static readonly TRIPLE_QUOTE_CLOSE = 165;
  public static readonly MultiLineStringQuote = 166;
  public static readonly MultiLineStrRef = 167;
  public static readonly MultiLineStrText = 168;
  public static readonly MultiLineStrExprStart = 169;
  public static readonly Inside_Comment = 170;
  public static readonly Inside_WS = 171;
  public static readonly Inside_NL = 172;
  public static readonly ErrorCharacter = 173;
  public static readonly RULE_kotlinFile = 0;
  public static readonly RULE_script = 1;
  public static readonly RULE_shebangLine = 2;
  public static readonly RULE_fileAnnotation = 3;
  public static readonly RULE_packageHeader = 4;
  public static readonly RULE_importList = 5;
  public static readonly RULE_importHeader = 6;
  public static readonly RULE_importAlias = 7;
  public static readonly RULE_topLevelObject = 8;
  public static readonly RULE_typeAlias = 9;
  public static readonly RULE_declaration = 10;
  public static readonly RULE_classDeclaration = 11;
  public static readonly RULE_primaryConstructor = 12;
  public static readonly RULE_classBody = 13;
  public static readonly RULE_classParameters = 14;
  public static readonly RULE_classParameter = 15;
  public static readonly RULE_delegationSpecifiers = 16;
  public static readonly RULE_delegationSpecifier = 17;
  public static readonly RULE_constructorInvocation = 18;
  public static readonly RULE_annotatedDelegationSpecifier = 19;
  public static readonly RULE_explicitDelegation = 20;
  public static readonly RULE_typeParameters = 21;
  public static readonly RULE_typeParameter = 22;
  public static readonly RULE_typeConstraints = 23;
  public static readonly RULE_typeConstraint = 24;
  public static readonly RULE_classMemberDeclarations = 25;
  public static readonly RULE_classMemberDeclaration = 26;
  public static readonly RULE_anonymousInitializer = 27;
  public static readonly RULE_companionObject = 28;
  public static readonly RULE_functionValueParameters = 29;
  public static readonly RULE_functionValueParameter = 30;
  public static readonly RULE_functionDeclaration = 31;
  public static readonly RULE_functionBody = 32;
  public static readonly RULE_variableDeclaration = 33;
  public static readonly RULE_multiVariableDeclaration = 34;
  public static readonly RULE_propertyDeclaration = 35;
  public static readonly RULE_propertyDelegate = 36;
  public static readonly RULE_getter = 37;
  public static readonly RULE_setter = 38;
  public static readonly RULE_parametersWithOptionalType = 39;
  public static readonly RULE_functionValueParameterWithOptionalType = 40;
  public static readonly RULE_parameterWithOptionalType = 41;
  public static readonly RULE_parameter = 42;
  public static readonly RULE_objectDeclaration = 43;
  public static readonly RULE_secondaryConstructor = 44;
  public static readonly RULE_constructorDelegationCall = 45;
  public static readonly RULE_enumClassBody = 46;
  public static readonly RULE_enumEntries = 47;
  public static readonly RULE_enumEntry = 48;
  public static readonly RULE_type = 49;
  public static readonly RULE_typeReference = 50;
  public static readonly RULE_nullableType = 51;
  public static readonly RULE_quest = 52;
  public static readonly RULE_userType = 53;
  public static readonly RULE_simpleUserType = 54;
  public static readonly RULE_typeProjection = 55;
  public static readonly RULE_typeProjectionModifiers = 56;
  public static readonly RULE_typeProjectionModifier = 57;
  public static readonly RULE_functionType = 58;
  public static readonly RULE_functionTypeParameters = 59;
  public static readonly RULE_parenthesizedType = 60;
  public static readonly RULE_receiverType = 61;
  public static readonly RULE_parenthesizedUserType = 62;
  public static readonly RULE_definitelyNonNullableType = 63;
  public static readonly RULE_statements = 64;
  public static readonly RULE_statement = 65;
  public static readonly RULE_label = 66;
  public static readonly RULE_controlStructureBody = 67;
  public static readonly RULE_block = 68;
  public static readonly RULE_loopStatement = 69;
  public static readonly RULE_forStatement = 70;
  public static readonly RULE_whileStatement = 71;
  public static readonly RULE_doWhileStatement = 72;
  public static readonly RULE_assignment = 73;
  public static readonly RULE_semi = 74;
  public static readonly RULE_semis = 75;
  public static readonly RULE_expression = 76;
  public static readonly RULE_disjunction = 77;
  public static readonly RULE_conjunction = 78;
  public static readonly RULE_equality = 79;
  public static readonly RULE_comparison = 80;
  public static readonly RULE_genericCallLikeComparison = 81;
  public static readonly RULE_infixOperation = 82;
  public static readonly RULE_elvisExpression = 83;
  public static readonly RULE_elvis = 84;
  public static readonly RULE_infixFunctionCall = 85;
  public static readonly RULE_rangeExpression = 86;
  public static readonly RULE_additiveExpression = 87;
  public static readonly RULE_multiplicativeExpression = 88;
  public static readonly RULE_asExpression = 89;
  public static readonly RULE_prefixUnaryExpression = 90;
  public static readonly RULE_unaryPrefix = 91;
  public static readonly RULE_postfixUnaryExpression = 92;
  public static readonly RULE_postfixUnarySuffix = 93;
  public static readonly RULE_directlyAssignableExpression = 94;
  public static readonly RULE_parenthesizedDirectlyAssignableExpression = 95;
  public static readonly RULE_assignableExpression = 96;
  public static readonly RULE_parenthesizedAssignableExpression = 97;
  public static readonly RULE_assignableSuffix = 98;
  public static readonly RULE_indexingSuffix = 99;
  public static readonly RULE_navigationSuffix = 100;
  public static readonly RULE_callSuffix = 101;
  public static readonly RULE_annotatedLambda = 102;
  public static readonly RULE_typeArguments = 103;
  public static readonly RULE_valueArguments = 104;
  public static readonly RULE_valueArgument = 105;
  public static readonly RULE_primaryExpression = 106;
  public static readonly RULE_parenthesizedExpression = 107;
  public static readonly RULE_collectionLiteral = 108;
  public static readonly RULE_literalConstant = 109;
  public static readonly RULE_stringLiteral = 110;
  public static readonly RULE_lineStringLiteral = 111;
  public static readonly RULE_multiLineStringLiteral = 112;
  public static readonly RULE_lineStringContent = 113;
  public static readonly RULE_lineStringExpression = 114;
  public static readonly RULE_multiLineStringContent = 115;
  public static readonly RULE_multiLineStringExpression = 116;
  public static readonly RULE_lambdaLiteral = 117;
  public static readonly RULE_lambdaParameters = 118;
  public static readonly RULE_lambdaParameter = 119;
  public static readonly RULE_anonymousFunction = 120;
  public static readonly RULE_functionLiteral = 121;
  public static readonly RULE_objectLiteral = 122;
  public static readonly RULE_thisExpression = 123;
  public static readonly RULE_superExpression = 124;
  public static readonly RULE_ifExpression = 125;
  public static readonly RULE_whenSubject = 126;
  public static readonly RULE_whenExpression = 127;
  public static readonly RULE_whenEntry = 128;
  public static readonly RULE_whenCondition = 129;
  public static readonly RULE_rangeTest = 130;
  public static readonly RULE_typeTest = 131;
  public static readonly RULE_tryExpression = 132;
  public static readonly RULE_catchBlock = 133;
  public static readonly RULE_finallyBlock = 134;
  public static readonly RULE_jumpExpression = 135;
  public static readonly RULE_callableReference = 136;
  public static readonly RULE_assignmentAndOperator = 137;
  public static readonly RULE_equalityOperator = 138;
  public static readonly RULE_comparisonOperator = 139;
  public static readonly RULE_inOperator = 140;
  public static readonly RULE_isOperator = 141;
  public static readonly RULE_additiveOperator = 142;
  public static readonly RULE_multiplicativeOperator = 143;
  public static readonly RULE_asOperator = 144;
  public static readonly RULE_prefixUnaryOperator = 145;
  public static readonly RULE_postfixUnaryOperator = 146;
  public static readonly RULE_excl = 147;
  public static readonly RULE_memberAccessOperator = 148;
  public static readonly RULE_safeNav = 149;
  public static readonly RULE_modifiers = 150;
  public static readonly RULE_parameterModifiers = 151;
  public static readonly RULE_modifier = 152;
  public static readonly RULE_typeModifiers = 153;
  public static readonly RULE_typeModifier = 154;
  public static readonly RULE_classModifier = 155;
  public static readonly RULE_memberModifier = 156;
  public static readonly RULE_visibilityModifier = 157;
  public static readonly RULE_varianceModifier = 158;
  public static readonly RULE_typeParameterModifiers = 159;
  public static readonly RULE_typeParameterModifier = 160;
  public static readonly RULE_functionModifier = 161;
  public static readonly RULE_propertyModifier = 162;
  public static readonly RULE_inheritanceModifier = 163;
  public static readonly RULE_parameterModifier = 164;
  public static readonly RULE_reificationModifier = 165;
  public static readonly RULE_platformModifier = 166;
  public static readonly RULE_annotation = 167;
  public static readonly RULE_singleAnnotation = 168;
  public static readonly RULE_multiAnnotation = 169;
  public static readonly RULE_annotationUseSiteTarget = 170;
  public static readonly RULE_unescapedAnnotation = 171;
  public static readonly RULE_simpleIdentifier = 172;
  public static readonly RULE_identifier = 173;

  public static readonly literalNames = [
    null,
    null,
    null,
    null,
    null,
    null,
    "'...'",
    "'.'",
    "','",
    "'('",
    "')'",
    "'['",
    "']'",
    "'{'",
    "'}'",
    "'*'",
    "'%'",
    "'/'",
    "'+'",
    "'-'",
    "'++'",
    "'--'",
    "'&&'",
    "'||'",
    null,
    "'!'",
    "':'",
    "';'",
    "'='",
    "'+='",
    "'-='",
    "'*='",
    "'/='",
    "'%='",
    "'->'",
    "'=>'",
    "'..'",
    "'..<'",
    "'::'",
    "';;'",
    "'#'",
    "'@'",
    null,
    null,
    null,
    null,
    "'?'",
    "'<'",
    "'>'",
    "'<='",
    "'>='",
    "'!='",
    "'!=='",
    "'as?'",
    "'=='",
    "'==='",
    "'''",
    "'&'",
    null,
    null,
    null,
    null,
    null,
    "'file'",
    "'field'",
    "'property'",
    "'get'",
    "'set'",
    "'receiver'",
    "'param'",
    "'setparam'",
    "'delegate'",
    "'package'",
    "'import'",
    "'class'",
    "'interface'",
    "'fun'",
    "'object'",
    "'val'",
    "'var'",
    "'typealias'",
    "'constructor'",
    "'by'",
    "'companion'",
    "'init'",
    "'this'",
    "'super'",
    "'typeof'",
    "'where'",
    "'if'",
    "'else'",
    "'when'",
    "'try'",
    "'catch'",
    "'finally'",
    "'for'",
    "'do'",
    "'while'",
    "'throw'",
    "'return'",
    "'continue'",
    "'break'",
    "'as'",
    "'is'",
    "'in'",
    null,
    null,
    "'out'",
    "'dynamic'",
    "'public'",
    "'private'",
    "'protected'",
    "'internal'",
    "'enum'",
    "'sealed'",
    "'annotation'",
    "'data'",
    "'inner'",
    "'value'",
    "'tailrec'",
    "'operator'",
    "'inline'",
    "'infix'",
    "'external'",
    "'suspend'",
    "'override'",
    "'abstract'",
    "'final'",
    "'open'",
    "'const'",
    "'lateinit'",
    "'vararg'",
    "'noinline'",
    "'crossinline'",
    "'reified'",
    "'expect'",
    "'actual'",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "'null'",
    null,
    null,
    null,
    null,
    null,
    '\'"""\'',
  ];

  public static readonly symbolicNames = [
    null,
    "ShebangLine",
    "DelimitedComment",
    "LineComment",
    "WS",
    "NL",
    "RESERVED",
    "DOT",
    "COMMA",
    "LPAREN",
    "RPAREN",
    "LSQUARE",
    "RSQUARE",
    "LCURL",
    "RCURL",
    "MULT",
    "MOD",
    "DIV",
    "ADD",
    "SUB",
    "INCR",
    "DECR",
    "CONJ",
    "DISJ",
    "EXCL_WS",
    "EXCL_NO_WS",
    "COLON",
    "SEMICOLON",
    "ASSIGNMENT",
    "ADD_ASSIGNMENT",
    "SUB_ASSIGNMENT",
    "MULT_ASSIGNMENT",
    "DIV_ASSIGNMENT",
    "MOD_ASSIGNMENT",
    "ARROW",
    "DOUBLE_ARROW",
    "RANGE",
    "RANGE_UNTIL",
    "COLONCOLON",
    "DOUBLE_SEMICOLON",
    "HASH",
    "AT_NO_WS",
    "AT_POST_WS",
    "AT_PRE_WS",
    "AT_BOTH_WS",
    "QUEST_WS",
    "QUEST_NO_WS",
    "LANGLE",
    "RANGLE",
    "LE",
    "GE",
    "EXCL_EQ",
    "EXCL_EQEQ",
    "AS_SAFE",
    "EQEQ",
    "EQEQEQ",
    "SINGLE_QUOTE",
    "AMP",
    "RETURN_AT",
    "CONTINUE_AT",
    "BREAK_AT",
    "THIS_AT",
    "SUPER_AT",
    "FILE",
    "FIELD",
    "PROPERTY",
    "GET",
    "SET",
    "RECEIVER",
    "PARAM",
    "SETPARAM",
    "DELEGATE",
    "PACKAGE",
    "IMPORT",
    "CLASS",
    "INTERFACE",
    "FUN",
    "OBJECT",
    "VAL",
    "VAR",
    "TYPE_ALIAS",
    "CONSTRUCTOR",
    "BY",
    "COMPANION",
    "INIT",
    "THIS",
    "SUPER",
    "TYPEOF",
    "WHERE",
    "IF",
    "ELSE",
    "WHEN",
    "TRY",
    "CATCH",
    "FINALLY",
    "FOR",
    "DO",
    "WHILE",
    "THROW",
    "RETURN",
    "CONTINUE",
    "BREAK",
    "AS",
    "IS",
    "IN",
    "NOT_IS",
    "NOT_IN",
    "OUT",
    "DYNAMIC",
    "PUBLIC",
    "PRIVATE",
    "PROTECTED",
    "INTERNAL",
    "ENUM",
    "SEALED",
    "ANNOTATION",
    "DATA",
    "INNER",
    "VALUE",
    "TAILREC",
    "OPERATOR",
    "INLINE",
    "INFIX",
    "EXTERNAL",
    "SUSPEND",
    "OVERRIDE",
    "ABSTRACT",
    "FINAL",
    "OPEN",
    "CONST",
    "LATEINIT",
    "VARARG",
    "NOINLINE",
    "CROSSINLINE",
    "REIFIED",
    "EXPECT",
    "ACTUAL",
    "RealLiteral",
    "FloatLiteral",
    "DoubleLiteral",
    "IntegerLiteral",
    "HexLiteral",
    "BinLiteral",
    "UnsignedLiteral",
    "LongLiteral",
    "BooleanLiteral",
    "NullLiteral",
    "CharacterLiteral",
    "Identifier",
    "IdentifierOrSoftKey",
    "FieldIdentifier",
    "QUOTE_OPEN",
    "TRIPLE_QUOTE_OPEN",
    "UNICODE_CLASS_LL",
    "UNICODE_CLASS_LM",
    "UNICODE_CLASS_LO",
    "UNICODE_CLASS_LT",
    "UNICODE_CLASS_LU",
    "UNICODE_CLASS_ND",
    "UNICODE_CLASS_NL",
    "QUOTE_CLOSE",
    "LineStrRef",
    "LineStrText",
    "LineStrEscapedChar",
    "LineStrExprStart",
    "TRIPLE_QUOTE_CLOSE",
    "MultiLineStringQuote",
    "MultiLineStrRef",
    "MultiLineStrText",
    "MultiLineStrExprStart",
    "Inside_Comment",
    "Inside_WS",
    "Inside_NL",
    "ErrorCharacter",
  ];
  public static readonly ruleNames = [
    "kotlinFile",
    "script",
    "shebangLine",
    "fileAnnotation",
    "packageHeader",
    "importList",
    "importHeader",
    "importAlias",
    "topLevelObject",
    "typeAlias",
    "declaration",
    "classDeclaration",
    "primaryConstructor",
    "classBody",
    "classParameters",
    "classParameter",
    "delegationSpecifiers",
    "delegationSpecifier",
    "constructorInvocation",
    "annotatedDelegationSpecifier",
    "explicitDelegation",
    "typeParameters",
    "typeParameter",
    "typeConstraints",
    "typeConstraint",
    "classMemberDeclarations",
    "classMemberDeclaration",
    "anonymousInitializer",
    "companionObject",
    "functionValueParameters",
    "functionValueParameter",
    "functionDeclaration",
    "functionBody",
    "variableDeclaration",
    "multiVariableDeclaration",
    "propertyDeclaration",
    "propertyDelegate",
    "getter",
    "setter",
    "parametersWithOptionalType",
    "functionValueParameterWithOptionalType",
    "parameterWithOptionalType",
    "parameter",
    "objectDeclaration",
    "secondaryConstructor",
    "constructorDelegationCall",
    "enumClassBody",
    "enumEntries",
    "enumEntry",
    "type",
    "typeReference",
    "nullableType",
    "quest",
    "userType",
    "simpleUserType",
    "typeProjection",
    "typeProjectionModifiers",
    "typeProjectionModifier",
    "functionType",
    "functionTypeParameters",
    "parenthesizedType",
    "receiverType",
    "parenthesizedUserType",
    "definitelyNonNullableType",
    "statements",
    "statement",
    "label",
    "controlStructureBody",
    "block",
    "loopStatement",
    "forStatement",
    "whileStatement",
    "doWhileStatement",
    "assignment",
    "semi",
    "semis",
    "expression",
    "disjunction",
    "conjunction",
    "equality",
    "comparison",
    "genericCallLikeComparison",
    "infixOperation",
    "elvisExpression",
    "elvis",
    "infixFunctionCall",
    "rangeExpression",
    "additiveExpression",
    "multiplicativeExpression",
    "asExpression",
    "prefixUnaryExpression",
    "unaryPrefix",
    "postfixUnaryExpression",
    "postfixUnarySuffix",
    "directlyAssignableExpression",
    "parenthesizedDirectlyAssignableExpression",
    "assignableExpression",
    "parenthesizedAssignableExpression",
    "assignableSuffix",
    "indexingSuffix",
    "navigationSuffix",
    "callSuffix",
    "annotatedLambda",
    "typeArguments",
    "valueArguments",
    "valueArgument",
    "primaryExpression",
    "parenthesizedExpression",
    "collectionLiteral",
    "literalConstant",
    "stringLiteral",
    "lineStringLiteral",
    "multiLineStringLiteral",
    "lineStringContent",
    "lineStringExpression",
    "multiLineStringContent",
    "multiLineStringExpression",
    "lambdaLiteral",
    "lambdaParameters",
    "lambdaParameter",
    "anonymousFunction",
    "functionLiteral",
    "objectLiteral",
    "thisExpression",
    "superExpression",
    "ifExpression",
    "whenSubject",
    "whenExpression",
    "whenEntry",
    "whenCondition",
    "rangeTest",
    "typeTest",
    "tryExpression",
    "catchBlock",
    "finallyBlock",
    "jumpExpression",
    "callableReference",
    "assignmentAndOperator",
    "equalityOperator",
    "comparisonOperator",
    "inOperator",
    "isOperator",
    "additiveOperator",
    "multiplicativeOperator",
    "asOperator",
    "prefixUnaryOperator",
    "postfixUnaryOperator",
    "excl",
    "memberAccessOperator",
    "safeNav",
    "modifiers",
    "parameterModifiers",
    "modifier",
    "typeModifiers",
    "typeModifier",
    "classModifier",
    "memberModifier",
    "visibilityModifier",
    "varianceModifier",
    "typeParameterModifiers",
    "typeParameterModifier",
    "functionModifier",
    "propertyModifier",
    "inheritanceModifier",
    "parameterModifier",
    "reificationModifier",
    "platformModifier",
    "annotation",
    "singleAnnotation",
    "multiAnnotation",
    "annotationUseSiteTarget",
    "unescapedAnnotation",
    "simpleIdentifier",
    "identifier",
  ];

  public get grammarFileName(): string {
    return "KotlinParser.g4";
  }
  public get literalNames(): (string | null)[] {
    return KotlinParser.literalNames;
  }
  public get symbolicNames(): (string | null)[] {
    return KotlinParser.symbolicNames;
  }
  public get ruleNames(): string[] {
    return KotlinParser.ruleNames;
  }
  public get serializedATN(): number[] {
    return KotlinParser._serializedATN;
  }

  protected createFailedPredicateException(predicate?: string, message?: string): antlr.FailedPredicateException {
    return new antlr.FailedPredicateException(this, predicate, message);
  }

  public constructor(input: antlr.TokenStream) {
    super(input);
    this.interpreter = new antlr.ParserATNSimulator(
      this,
      KotlinParser._ATN,
      KotlinParser.decisionsToDFA,
      new antlr.PredictionContextCache(),
    );
  }
  public kotlinFile(): KotlinFileContext {
    const localContext = new KotlinFileContext(this.context, this.state);
    this.enterRule(localContext, 0, KotlinParser.RULE_kotlinFile);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 349;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 1) {
        this.state = 348;
        this.shebangLine();
      }

      this.state = 354;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 351;
        this.match(KotlinParser.NL);
        this.state = 356;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 360;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 2, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 357;
          this.fileAnnotation();
        }
        this.state = 362;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 2, this.context);
      }
      this.state = 363;
      this.packageHeader();
      this.state = 364;
      this.importList();
      this.state = 368;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (
        _la === 41 ||
        _la === 43 ||
        (((_la - 74) & ~0x1f) === 0 && ((1 << (_la - 74)) & 127) !== 0) ||
        (((_la - 109) & ~0x1f) === 0 && ((1 << (_la - 109)) & 234881023) !== 0)
      ) {
        this.state = 365;
        this.topLevelObject();
        this.state = 370;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 371;
      this.match(KotlinParser.EOF);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public script(): ScriptContext {
    const localContext = new ScriptContext(this.context, this.state);
    this.enterRule(localContext, 2, KotlinParser.RULE_script);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 374;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 1) {
        this.state = 373;
        this.shebangLine();
      }

      this.state = 379;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 5, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 376;
          this.match(KotlinParser.NL);
        }
        this.state = 381;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 5, this.context);
      }
      this.state = 385;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 6, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 382;
          this.fileAnnotation();
        }
        this.state = 387;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 6, this.context);
      }
      this.state = 388;
      this.packageHeader();
      this.state = 389;
      this.importList();
      this.state = 395;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (
        ((_la & ~0x1f) === 0 && ((1 << _la) & 54274592) !== 0) ||
        (((_la - 38) & ~0x1f) === 0 && ((1 << (_la - 38)) & 4293918761) !== 0) ||
        (((_la - 70) & ~0x1f) === 0 && ((1 << (_la - 70)) & 4293787643) !== 0) ||
        (((_la - 107) & ~0x1f) === 0 && ((1 << (_la - 107)) & 2147483647) !== 0) ||
        (((_la - 140) & ~0x1f) === 0 && ((1 << (_la - 140)) & 6655) !== 0)
      ) {
        this.state = 390;
        this.statement();
        this.state = 391;
        this.semi();
        this.state = 397;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 398;
      this.match(KotlinParser.EOF);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public shebangLine(): ShebangLineContext {
    const localContext = new ShebangLineContext(this.context, this.state);
    this.enterRule(localContext, 4, KotlinParser.RULE_shebangLine);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 400;
      this.match(KotlinParser.ShebangLine);
      this.state = 402;
      this.errorHandler.sync(this);
      alternative = 1;
      do {
        switch (alternative) {
          case 1:
            {
              this.state = 401;
              this.match(KotlinParser.NL);
            }
            break;
          default:
            throw new antlr.NoViableAltException(this);
        }
        this.state = 404;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 8, this.context);
      } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public fileAnnotation(): FileAnnotationContext {
    const localContext = new FileAnnotationContext(this.context, this.state);
    this.enterRule(localContext, 6, KotlinParser.RULE_fileAnnotation);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 406;
      _la = this.tokenStream.LA(1);
      if (!(_la === 41 || _la === 43)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
      this.state = 407;
      this.match(KotlinParser.FILE);
      this.state = 411;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 408;
        this.match(KotlinParser.NL);
        this.state = 413;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 414;
      this.match(KotlinParser.COLON);
      this.state = 418;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 415;
        this.match(KotlinParser.NL);
        this.state = 420;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 430;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.LSQUARE:
          {
            this.state = 421;
            this.match(KotlinParser.LSQUARE);
            this.state = 423;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            do {
              this.state = 422;
              this.unescapedAnnotation();
              this.state = 425;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            } while (
              (((_la - 63) & ~0x1f) === 0 && ((1 << (_la - 63)) & 3258713599) !== 0) ||
              (((_la - 107) & ~0x1f) === 0 && ((1 << (_la - 107)) & 1073741823) !== 0) ||
              _la === 148
            );
            this.state = 427;
            this.match(KotlinParser.RSQUARE);
          }
          break;
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.WHERE:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.Identifier:
          {
            this.state = 429;
            this.unescapedAnnotation();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
      this.state = 435;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 13, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 432;
          this.match(KotlinParser.NL);
        }
        this.state = 437;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 13, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public packageHeader(): PackageHeaderContext {
    const localContext = new PackageHeaderContext(this.context, this.state);
    this.enterRule(localContext, 8, KotlinParser.RULE_packageHeader);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 443;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 72) {
        this.state = 438;
        this.match(KotlinParser.PACKAGE);
        this.state = 439;
        this.identifier();
        this.state = 441;
        this.errorHandler.sync(this);
        switch (this.interpreter.adaptivePredict(this.tokenStream, 14, this.context)) {
          case 1:
            {
              this.state = 440;
              this.semi();
            }
            break;
        }
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public importList(): ImportListContext {
    const localContext = new ImportListContext(this.context, this.state);
    this.enterRule(localContext, 10, KotlinParser.RULE_importList);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 448;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 16, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 445;
          this.importHeader();
        }
        this.state = 450;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 16, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public importHeader(): ImportHeaderContext {
    const localContext = new ImportHeaderContext(this.context, this.state);
    this.enterRule(localContext, 12, KotlinParser.RULE_importHeader);
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 451;
      this.match(KotlinParser.IMPORT);
      this.state = 452;
      this.identifier();
      this.state = 456;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.DOT:
          {
            this.state = 453;
            this.match(KotlinParser.DOT);
            this.state = 454;
            this.match(KotlinParser.MULT);
          }
          break;
        case KotlinParser.AS:
          {
            this.state = 455;
            this.importAlias();
          }
          break;
        case KotlinParser.EOF:
        case KotlinParser.NL:
        case KotlinParser.LPAREN:
        case KotlinParser.LSQUARE:
        case KotlinParser.LCURL:
        case KotlinParser.ADD:
        case KotlinParser.SUB:
        case KotlinParser.INCR:
        case KotlinParser.DECR:
        case KotlinParser.EXCL_WS:
        case KotlinParser.EXCL_NO_WS:
        case KotlinParser.SEMICOLON:
        case KotlinParser.COLONCOLON:
        case KotlinParser.AT_NO_WS:
        case KotlinParser.AT_PRE_WS:
        case KotlinParser.RETURN_AT:
        case KotlinParser.CONTINUE_AT:
        case KotlinParser.BREAK_AT:
        case KotlinParser.THIS_AT:
        case KotlinParser.SUPER_AT:
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CLASS:
        case KotlinParser.INTERFACE:
        case KotlinParser.FUN:
        case KotlinParser.OBJECT:
        case KotlinParser.VAL:
        case KotlinParser.VAR:
        case KotlinParser.TYPE_ALIAS:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.THIS:
        case KotlinParser.SUPER:
        case KotlinParser.WHERE:
        case KotlinParser.IF:
        case KotlinParser.WHEN:
        case KotlinParser.TRY:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.FOR:
        case KotlinParser.DO:
        case KotlinParser.WHILE:
        case KotlinParser.THROW:
        case KotlinParser.RETURN:
        case KotlinParser.CONTINUE:
        case KotlinParser.BREAK:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.RealLiteral:
        case KotlinParser.IntegerLiteral:
        case KotlinParser.HexLiteral:
        case KotlinParser.BinLiteral:
        case KotlinParser.UnsignedLiteral:
        case KotlinParser.LongLiteral:
        case KotlinParser.BooleanLiteral:
        case KotlinParser.NullLiteral:
        case KotlinParser.CharacterLiteral:
        case KotlinParser.Identifier:
        case KotlinParser.QUOTE_OPEN:
        case KotlinParser.TRIPLE_QUOTE_OPEN:
          break;
        default:
          break;
      }
      this.state = 459;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 18, this.context)) {
        case 1:
          {
            this.state = 458;
            this.semi();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public importAlias(): ImportAliasContext {
    const localContext = new ImportAliasContext(this.context, this.state);
    this.enterRule(localContext, 14, KotlinParser.RULE_importAlias);
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 461;
      this.match(KotlinParser.AS);
      this.state = 462;
      this.simpleIdentifier();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public topLevelObject(): TopLevelObjectContext {
    const localContext = new TopLevelObjectContext(this.context, this.state);
    this.enterRule(localContext, 16, KotlinParser.RULE_topLevelObject);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 464;
      this.declaration();
      this.state = 466;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 5 || _la === 27) {
        this.state = 465;
        this.semis();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeAlias(): TypeAliasContext {
    const localContext = new TypeAliasContext(this.context, this.state);
    this.enterRule(localContext, 18, KotlinParser.RULE_typeAlias);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 469;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 41 || _la === 43 || (((_la - 109) & ~0x1f) === 0 && ((1 << (_la - 109)) & 234881023) !== 0)) {
        this.state = 468;
        this.modifiers();
      }

      this.state = 471;
      this.match(KotlinParser.TYPE_ALIAS);
      this.state = 475;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 472;
        this.match(KotlinParser.NL);
        this.state = 477;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 478;
      this.simpleIdentifier();
      this.state = 486;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 23, this.context)) {
        case 1:
          {
            this.state = 482;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 479;
              this.match(KotlinParser.NL);
              this.state = 484;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 485;
            this.typeParameters();
          }
          break;
      }
      this.state = 491;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 488;
        this.match(KotlinParser.NL);
        this.state = 493;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 494;
      this.match(KotlinParser.ASSIGNMENT);
      this.state = 498;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 495;
        this.match(KotlinParser.NL);
        this.state = 500;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 501;
      this.type_();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public declaration(): DeclarationContext {
    const localContext = new DeclarationContext(this.context, this.state);
    this.enterRule(localContext, 20, KotlinParser.RULE_declaration);
    try {
      this.state = 508;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 26, this.context)) {
        case 1:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 503;
            this.classDeclaration();
          }
          break;
        case 2:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 504;
            this.objectDeclaration();
          }
          break;
        case 3:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 505;
            this.functionDeclaration();
          }
          break;
        case 4:
          this.enterOuterAlt(localContext, 4);
          {
            this.state = 506;
            this.propertyDeclaration();
          }
          break;
        case 5:
          this.enterOuterAlt(localContext, 5);
          {
            this.state = 507;
            this.typeAlias();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public classDeclaration(): ClassDeclarationContext {
    const localContext = new ClassDeclarationContext(this.context, this.state);
    this.enterRule(localContext, 22, KotlinParser.RULE_classDeclaration);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 511;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 41 || _la === 43 || (((_la - 109) & ~0x1f) === 0 && ((1 << (_la - 109)) & 234881023) !== 0)) {
        this.state = 510;
        this.modifiers();
      }

      this.state = 524;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.CLASS:
          {
            this.state = 513;
            this.match(KotlinParser.CLASS);
          }
          break;
        case KotlinParser.INTERFACE:
        case KotlinParser.FUN:
          {
            this.state = 521;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 76) {
              this.state = 514;
              this.match(KotlinParser.FUN);
              this.state = 518;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
              while (_la === 5) {
                this.state = 515;
                this.match(KotlinParser.NL);
                this.state = 520;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
              }
            }

            this.state = 523;
            this.match(KotlinParser.INTERFACE);
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
      this.state = 529;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 526;
        this.match(KotlinParser.NL);
        this.state = 531;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 532;
      this.simpleIdentifier();
      this.state = 540;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 33, this.context)) {
        case 1:
          {
            this.state = 536;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 533;
              this.match(KotlinParser.NL);
              this.state = 538;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 539;
            this.typeParameters();
          }
          break;
      }
      this.state = 549;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 35, this.context)) {
        case 1:
          {
            this.state = 545;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 542;
              this.match(KotlinParser.NL);
              this.state = 547;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 548;
            this.primaryConstructor();
          }
          break;
      }
      this.state = 565;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 38, this.context)) {
        case 1:
          {
            this.state = 554;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 551;
              this.match(KotlinParser.NL);
              this.state = 556;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 557;
            this.match(KotlinParser.COLON);
            this.state = 561;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 37, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 558;
                this.match(KotlinParser.NL);
              }
              this.state = 563;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 37, this.context);
            }
            this.state = 564;
            this.delegationSpecifiers();
          }
          break;
      }
      this.state = 574;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 40, this.context)) {
        case 1:
          {
            this.state = 570;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 567;
              this.match(KotlinParser.NL);
              this.state = 572;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 573;
            this.typeConstraints();
          }
          break;
      }
      this.state = 590;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 43, this.context)) {
        case 1:
          {
            this.state = 579;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 576;
              this.match(KotlinParser.NL);
              this.state = 581;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 582;
            this.classBody();
          }
          break;
        case 2:
          {
            this.state = 586;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 583;
              this.match(KotlinParser.NL);
              this.state = 588;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 589;
            this.enumClassBody();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public primaryConstructor(): PrimaryConstructorContext {
    const localContext = new PrimaryConstructorContext(this.context, this.state);
    this.enterRule(localContext, 24, KotlinParser.RULE_primaryConstructor);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 602;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (
        _la === 41 ||
        _la === 43 ||
        (((_la - 81) & ~0x1f) === 0 && ((1 << (_la - 81)) & 4026531841) !== 0) ||
        (((_la - 113) & ~0x1f) === 0 && ((1 << (_la - 113)) & 14680063) !== 0)
      ) {
        this.state = 593;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
        if (_la === 41 || _la === 43 || (((_la - 109) & ~0x1f) === 0 && ((1 << (_la - 109)) & 234881023) !== 0)) {
          this.state = 592;
          this.modifiers();
        }

        this.state = 595;
        this.match(KotlinParser.CONSTRUCTOR);
        this.state = 599;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
        while (_la === 5) {
          this.state = 596;
          this.match(KotlinParser.NL);
          this.state = 601;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
        }
      }

      this.state = 604;
      this.classParameters();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public classBody(): ClassBodyContext {
    const localContext = new ClassBodyContext(this.context, this.state);
    this.enterRule(localContext, 26, KotlinParser.RULE_classBody);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 606;
      this.match(KotlinParser.LCURL);
      this.state = 610;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 47, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 607;
          this.match(KotlinParser.NL);
        }
        this.state = 612;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 47, this.context);
      }
      this.state = 613;
      this.classMemberDeclarations();
      this.state = 617;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 614;
        this.match(KotlinParser.NL);
        this.state = 619;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 620;
      this.match(KotlinParser.RCURL);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public classParameters(): ClassParametersContext {
    const localContext = new ClassParametersContext(this.context, this.state);
    this.enterRule(localContext, 28, KotlinParser.RULE_classParameters);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 622;
      this.match(KotlinParser.LPAREN);
      this.state = 626;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 49, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 623;
          this.match(KotlinParser.NL);
        }
        this.state = 628;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 49, this.context);
      }
      this.state = 658;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 55, this.context)) {
        case 1:
          {
            this.state = 629;
            this.classParameter();
            this.state = 646;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 52, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 633;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 5) {
                  this.state = 630;
                  this.match(KotlinParser.NL);
                  this.state = 635;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                }
                this.state = 636;
                this.match(KotlinParser.COMMA);
                this.state = 640;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 51, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                  if (alternative === 1) {
                    this.state = 637;
                    this.match(KotlinParser.NL);
                  }
                  this.state = 642;
                  this.errorHandler.sync(this);
                  alternative = this.interpreter.adaptivePredict(this.tokenStream, 51, this.context);
                }
                this.state = 643;
                this.classParameter();
              }
              this.state = 648;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 52, this.context);
            }
            this.state = 656;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 54, this.context)) {
              case 1:
                {
                  this.state = 652;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  while (_la === 5) {
                    this.state = 649;
                    this.match(KotlinParser.NL);
                    this.state = 654;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                  }
                  this.state = 655;
                  this.match(KotlinParser.COMMA);
                }
                break;
            }
          }
          break;
      }
      this.state = 663;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 660;
        this.match(KotlinParser.NL);
        this.state = 665;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 666;
      this.match(KotlinParser.RPAREN);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public classParameter(): ClassParameterContext {
    const localContext = new ClassParameterContext(this.context, this.state);
    this.enterRule(localContext, 30, KotlinParser.RULE_classParameter);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 669;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 57, this.context)) {
        case 1:
          {
            this.state = 668;
            this.modifiers();
          }
          break;
      }
      this.state = 672;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 78 || _la === 79) {
        this.state = 671;
        _la = this.tokenStream.LA(1);
        if (!(_la === 78 || _la === 79)) {
          this.errorHandler.recoverInline(this);
        } else {
          this.errorHandler.reportMatch(this);
          this.consume();
        }
      }

      this.state = 677;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 674;
        this.match(KotlinParser.NL);
        this.state = 679;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 680;
      this.simpleIdentifier();
      this.state = 681;
      this.match(KotlinParser.COLON);
      this.state = 685;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 682;
        this.match(KotlinParser.NL);
        this.state = 687;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 688;
      this.type_();
      this.state = 703;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 63, this.context)) {
        case 1:
          {
            this.state = 692;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 689;
              this.match(KotlinParser.NL);
              this.state = 694;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 695;
            this.match(KotlinParser.ASSIGNMENT);
            this.state = 699;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 62, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 696;
                this.match(KotlinParser.NL);
              }
              this.state = 701;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 62, this.context);
            }
            this.state = 702;
            this.expression();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public delegationSpecifiers(): DelegationSpecifiersContext {
    const localContext = new DelegationSpecifiersContext(this.context, this.state);
    this.enterRule(localContext, 32, KotlinParser.RULE_delegationSpecifiers);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 705;
      this.annotatedDelegationSpecifier();
      this.state = 722;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 66, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 709;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 706;
            this.match(KotlinParser.NL);
            this.state = 711;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 712;
          this.match(KotlinParser.COMMA);
          this.state = 716;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 65, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 713;
              this.match(KotlinParser.NL);
            }
            this.state = 718;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 65, this.context);
          }
          this.state = 719;
          this.annotatedDelegationSpecifier();
        }
        this.state = 724;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 66, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public delegationSpecifier(): DelegationSpecifierContext {
    const localContext = new DelegationSpecifierContext(this.context, this.state);
    this.enterRule(localContext, 34, KotlinParser.RULE_delegationSpecifier);
    let _la: number;
    try {
      this.state = 737;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 68, this.context)) {
        case 1:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 725;
            this.constructorInvocation();
          }
          break;
        case 2:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 726;
            this.explicitDelegation();
          }
          break;
        case 3:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 727;
            this.userType();
          }
          break;
        case 4:
          this.enterOuterAlt(localContext, 4);
          {
            this.state = 728;
            this.functionType();
          }
          break;
        case 5:
          this.enterOuterAlt(localContext, 5);
          {
            this.state = 729;
            this.match(KotlinParser.SUSPEND);
            this.state = 733;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 730;
              this.match(KotlinParser.NL);
              this.state = 735;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 736;
            this.functionType();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public constructorInvocation(): ConstructorInvocationContext {
    const localContext = new ConstructorInvocationContext(this.context, this.state);
    this.enterRule(localContext, 36, KotlinParser.RULE_constructorInvocation);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 739;
      this.userType();
      this.state = 743;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 740;
        this.match(KotlinParser.NL);
        this.state = 745;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 746;
      this.valueArguments();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public annotatedDelegationSpecifier(): AnnotatedDelegationSpecifierContext {
    const localContext = new AnnotatedDelegationSpecifierContext(this.context, this.state);
    this.enterRule(localContext, 38, KotlinParser.RULE_annotatedDelegationSpecifier);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 751;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 70, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 748;
          this.annotation();
        }
        this.state = 753;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 70, this.context);
      }
      this.state = 757;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 754;
        this.match(KotlinParser.NL);
        this.state = 759;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 760;
      this.delegationSpecifier();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public explicitDelegation(): ExplicitDelegationContext {
    const localContext = new ExplicitDelegationContext(this.context, this.state);
    this.enterRule(localContext, 40, KotlinParser.RULE_explicitDelegation);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 764;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 72, this.context)) {
        case 1:
          {
            this.state = 762;
            this.userType();
          }
          break;
        case 2:
          {
            this.state = 763;
            this.functionType();
          }
          break;
      }
      this.state = 769;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 766;
        this.match(KotlinParser.NL);
        this.state = 771;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 772;
      this.match(KotlinParser.BY);
      this.state = 776;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 74, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 773;
          this.match(KotlinParser.NL);
        }
        this.state = 778;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 74, this.context);
      }
      this.state = 779;
      this.expression();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeParameters(): TypeParametersContext {
    const localContext = new TypeParametersContext(this.context, this.state);
    this.enterRule(localContext, 42, KotlinParser.RULE_typeParameters);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 781;
      this.match(KotlinParser.LANGLE);
      this.state = 785;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 75, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 782;
          this.match(KotlinParser.NL);
        }
        this.state = 787;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 75, this.context);
      }
      this.state = 788;
      this.typeParameter();
      this.state = 805;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 78, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 792;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 789;
            this.match(KotlinParser.NL);
            this.state = 794;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 795;
          this.match(KotlinParser.COMMA);
          this.state = 799;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 77, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 796;
              this.match(KotlinParser.NL);
            }
            this.state = 801;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 77, this.context);
          }
          this.state = 802;
          this.typeParameter();
        }
        this.state = 807;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 78, this.context);
      }
      this.state = 815;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 80, this.context)) {
        case 1:
          {
            this.state = 811;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 808;
              this.match(KotlinParser.NL);
              this.state = 813;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 814;
            this.match(KotlinParser.COMMA);
          }
          break;
      }
      this.state = 820;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 817;
        this.match(KotlinParser.NL);
        this.state = 822;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 823;
      this.match(KotlinParser.RANGLE);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeParameter(): TypeParameterContext {
    const localContext = new TypeParameterContext(this.context, this.state);
    this.enterRule(localContext, 44, KotlinParser.RULE_typeParameter);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 826;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 82, this.context)) {
        case 1:
          {
            this.state = 825;
            this.typeParameterModifiers();
          }
          break;
      }
      this.state = 831;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 828;
        this.match(KotlinParser.NL);
        this.state = 833;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 834;
      this.simpleIdentifier();
      this.state = 849;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 86, this.context)) {
        case 1:
          {
            this.state = 838;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 835;
              this.match(KotlinParser.NL);
              this.state = 840;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 841;
            this.match(KotlinParser.COLON);
            this.state = 845;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 842;
              this.match(KotlinParser.NL);
              this.state = 847;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 848;
            this.type_();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeConstraints(): TypeConstraintsContext {
    const localContext = new TypeConstraintsContext(this.context, this.state);
    this.enterRule(localContext, 46, KotlinParser.RULE_typeConstraints);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 851;
      this.match(KotlinParser.WHERE);
      this.state = 855;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 852;
        this.match(KotlinParser.NL);
        this.state = 857;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 858;
      this.typeConstraint();
      this.state = 875;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 90, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 862;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 859;
            this.match(KotlinParser.NL);
            this.state = 864;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 865;
          this.match(KotlinParser.COMMA);
          this.state = 869;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 866;
            this.match(KotlinParser.NL);
            this.state = 871;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 872;
          this.typeConstraint();
        }
        this.state = 877;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 90, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeConstraint(): TypeConstraintContext {
    const localContext = new TypeConstraintContext(this.context, this.state);
    this.enterRule(localContext, 48, KotlinParser.RULE_typeConstraint);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 881;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 41 || _la === 43) {
        this.state = 878;
        this.annotation();
        this.state = 883;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 884;
      this.simpleIdentifier();
      this.state = 888;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 885;
        this.match(KotlinParser.NL);
        this.state = 890;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 891;
      this.match(KotlinParser.COLON);
      this.state = 895;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 892;
        this.match(KotlinParser.NL);
        this.state = 897;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 898;
      this.type_();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public classMemberDeclarations(): ClassMemberDeclarationsContext {
    const localContext = new ClassMemberDeclarationsContext(this.context, this.state);
    this.enterRule(localContext, 50, KotlinParser.RULE_classMemberDeclarations);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 906;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (
        _la === 41 ||
        _la === 43 ||
        (((_la - 74) & ~0x1f) === 0 && ((1 << (_la - 74)) & 1791) !== 0) ||
        (((_la - 109) & ~0x1f) === 0 && ((1 << (_la - 109)) & 234881023) !== 0)
      ) {
        this.state = 900;
        this.classMemberDeclaration();
        this.state = 902;
        this.errorHandler.sync(this);
        switch (this.interpreter.adaptivePredict(this.tokenStream, 94, this.context)) {
          case 1:
            {
              this.state = 901;
              this.semis();
            }
            break;
        }
        this.state = 908;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public classMemberDeclaration(): ClassMemberDeclarationContext {
    const localContext = new ClassMemberDeclarationContext(this.context, this.state);
    this.enterRule(localContext, 52, KotlinParser.RULE_classMemberDeclaration);
    try {
      this.state = 913;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 96, this.context)) {
        case 1:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 909;
            this.declaration();
          }
          break;
        case 2:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 910;
            this.companionObject();
          }
          break;
        case 3:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 911;
            this.anonymousInitializer();
          }
          break;
        case 4:
          this.enterOuterAlt(localContext, 4);
          {
            this.state = 912;
            this.secondaryConstructor();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public anonymousInitializer(): AnonymousInitializerContext {
    const localContext = new AnonymousInitializerContext(this.context, this.state);
    this.enterRule(localContext, 54, KotlinParser.RULE_anonymousInitializer);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 915;
      this.match(KotlinParser.INIT);
      this.state = 919;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 916;
        this.match(KotlinParser.NL);
        this.state = 921;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 922;
      this.block();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public companionObject(): CompanionObjectContext {
    const localContext = new CompanionObjectContext(this.context, this.state);
    this.enterRule(localContext, 56, KotlinParser.RULE_companionObject);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 925;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 41 || _la === 43 || (((_la - 109) & ~0x1f) === 0 && ((1 << (_la - 109)) & 234881023) !== 0)) {
        this.state = 924;
        this.modifiers();
      }

      this.state = 927;
      this.match(KotlinParser.COMPANION);
      this.state = 931;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 99, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 928;
          this.match(KotlinParser.NL);
        }
        this.state = 933;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 99, this.context);
      }
      this.state = 935;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 116) {
        this.state = 934;
        this.match(KotlinParser.DATA);
      }

      this.state = 940;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 937;
        this.match(KotlinParser.NL);
        this.state = 942;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 943;
      this.match(KotlinParser.OBJECT);
      this.state = 951;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 103, this.context)) {
        case 1:
          {
            this.state = 947;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 944;
              this.match(KotlinParser.NL);
              this.state = 949;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 950;
            this.simpleIdentifier();
          }
          break;
      }
      this.state = 967;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 106, this.context)) {
        case 1:
          {
            this.state = 956;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 953;
              this.match(KotlinParser.NL);
              this.state = 958;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 959;
            this.match(KotlinParser.COLON);
            this.state = 963;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 105, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 960;
                this.match(KotlinParser.NL);
              }
              this.state = 965;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 105, this.context);
            }
            this.state = 966;
            this.delegationSpecifiers();
          }
          break;
      }
      this.state = 976;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 108, this.context)) {
        case 1:
          {
            this.state = 972;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 969;
              this.match(KotlinParser.NL);
              this.state = 974;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 975;
            this.classBody();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public functionValueParameters(): FunctionValueParametersContext {
    const localContext = new FunctionValueParametersContext(this.context, this.state);
    this.enterRule(localContext, 58, KotlinParser.RULE_functionValueParameters);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 978;
      this.match(KotlinParser.LPAREN);
      this.state = 982;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 109, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 979;
          this.match(KotlinParser.NL);
        }
        this.state = 984;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 109, this.context);
      }
      this.state = 1014;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (
        (((_la - 41) & ~0x1f) === 0 && ((1 << (_la - 41)) & 2143289349) !== 0) ||
        (((_la - 73) & ~0x1f) === 0 && ((1 << (_la - 73)) & 3182337) !== 0) ||
        (((_la - 107) & ~0x1f) === 0 && ((1 << (_la - 107)) & 1073741823) !== 0) ||
        _la === 148
      ) {
        this.state = 985;
        this.functionValueParameter();
        this.state = 1002;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 112, this.context);
        while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
          if (alternative === 1) {
            this.state = 989;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 986;
              this.match(KotlinParser.NL);
              this.state = 991;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 992;
            this.match(KotlinParser.COMMA);
            this.state = 996;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 993;
              this.match(KotlinParser.NL);
              this.state = 998;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 999;
            this.functionValueParameter();
          }
          this.state = 1004;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 112, this.context);
        }
        this.state = 1012;
        this.errorHandler.sync(this);
        switch (this.interpreter.adaptivePredict(this.tokenStream, 114, this.context)) {
          case 1:
            {
              this.state = 1008;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
              while (_la === 5) {
                this.state = 1005;
                this.match(KotlinParser.NL);
                this.state = 1010;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
              }
              this.state = 1011;
              this.match(KotlinParser.COMMA);
            }
            break;
        }
      }

      this.state = 1019;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1016;
        this.match(KotlinParser.NL);
        this.state = 1021;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1022;
      this.match(KotlinParser.RPAREN);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public functionValueParameter(): FunctionValueParameterContext {
    const localContext = new FunctionValueParameterContext(this.context, this.state);
    this.enterRule(localContext, 60, KotlinParser.RULE_functionValueParameter);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1025;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 117, this.context)) {
        case 1:
          {
            this.state = 1024;
            this.parameterModifiers();
          }
          break;
      }
      this.state = 1027;
      this.parameter();
      this.state = 1042;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 120, this.context)) {
        case 1:
          {
            this.state = 1031;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1028;
              this.match(KotlinParser.NL);
              this.state = 1033;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1034;
            this.match(KotlinParser.ASSIGNMENT);
            this.state = 1038;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 119, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 1035;
                this.match(KotlinParser.NL);
              }
              this.state = 1040;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 119, this.context);
            }
            this.state = 1041;
            this.expression();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public functionDeclaration(): FunctionDeclarationContext {
    const localContext = new FunctionDeclarationContext(this.context, this.state);
    this.enterRule(localContext, 62, KotlinParser.RULE_functionDeclaration);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1045;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 41 || _la === 43 || (((_la - 109) & ~0x1f) === 0 && ((1 << (_la - 109)) & 234881023) !== 0)) {
        this.state = 1044;
        this.modifiers();
      }

      this.state = 1047;
      this.match(KotlinParser.FUN);
      this.state = 1055;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 123, this.context)) {
        case 1:
          {
            this.state = 1051;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1048;
              this.match(KotlinParser.NL);
              this.state = 1053;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1054;
            this.typeParameters();
          }
          break;
      }
      this.state = 1072;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 126, this.context)) {
        case 1:
          {
            this.state = 1060;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1057;
              this.match(KotlinParser.NL);
              this.state = 1062;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1063;
            this.receiverType();
            this.state = 1067;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1064;
              this.match(KotlinParser.NL);
              this.state = 1069;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1070;
            this.match(KotlinParser.DOT);
          }
          break;
      }
      this.state = 1077;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1074;
        this.match(KotlinParser.NL);
        this.state = 1079;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1080;
      this.simpleIdentifier();
      this.state = 1084;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1081;
        this.match(KotlinParser.NL);
        this.state = 1086;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1087;
      this.functionValueParameters();
      this.state = 1102;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 131, this.context)) {
        case 1:
          {
            this.state = 1091;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1088;
              this.match(KotlinParser.NL);
              this.state = 1093;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1094;
            this.match(KotlinParser.COLON);
            this.state = 1098;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1095;
              this.match(KotlinParser.NL);
              this.state = 1100;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1101;
            this.type_();
          }
          break;
      }
      this.state = 1111;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 133, this.context)) {
        case 1:
          {
            this.state = 1107;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1104;
              this.match(KotlinParser.NL);
              this.state = 1109;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1110;
            this.typeConstraints();
          }
          break;
      }
      this.state = 1120;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 135, this.context)) {
        case 1:
          {
            this.state = 1116;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1113;
              this.match(KotlinParser.NL);
              this.state = 1118;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1119;
            this.functionBody();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public functionBody(): FunctionBodyContext {
    const localContext = new FunctionBodyContext(this.context, this.state);
    this.enterRule(localContext, 64, KotlinParser.RULE_functionBody);
    try {
      let alternative: number;
      this.state = 1131;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.LCURL:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 1122;
            this.block();
          }
          break;
        case KotlinParser.ASSIGNMENT:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 1123;
            this.match(KotlinParser.ASSIGNMENT);
            this.state = 1127;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 136, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 1124;
                this.match(KotlinParser.NL);
              }
              this.state = 1129;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 136, this.context);
            }
            this.state = 1130;
            this.expression();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public variableDeclaration(): VariableDeclarationContext {
    const localContext = new VariableDeclarationContext(this.context, this.state);
    this.enterRule(localContext, 66, KotlinParser.RULE_variableDeclaration);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1136;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 41 || _la === 43) {
        this.state = 1133;
        this.annotation();
        this.state = 1138;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1142;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1139;
        this.match(KotlinParser.NL);
        this.state = 1144;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1145;
      this.simpleIdentifier();
      this.state = 1160;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 142, this.context)) {
        case 1:
          {
            this.state = 1149;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1146;
              this.match(KotlinParser.NL);
              this.state = 1151;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1152;
            this.match(KotlinParser.COLON);
            this.state = 1156;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1153;
              this.match(KotlinParser.NL);
              this.state = 1158;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1159;
            this.type_();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public multiVariableDeclaration(): MultiVariableDeclarationContext {
    const localContext = new MultiVariableDeclarationContext(this.context, this.state);
    this.enterRule(localContext, 68, KotlinParser.RULE_multiVariableDeclaration);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1162;
      this.match(KotlinParser.LPAREN);
      this.state = 1166;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 143, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1163;
          this.match(KotlinParser.NL);
        }
        this.state = 1168;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 143, this.context);
      }
      this.state = 1169;
      this.variableDeclaration();
      this.state = 1186;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 146, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1173;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 1170;
            this.match(KotlinParser.NL);
            this.state = 1175;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 1176;
          this.match(KotlinParser.COMMA);
          this.state = 1180;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 145, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 1177;
              this.match(KotlinParser.NL);
            }
            this.state = 1182;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 145, this.context);
          }
          this.state = 1183;
          this.variableDeclaration();
        }
        this.state = 1188;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 146, this.context);
      }
      this.state = 1196;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 148, this.context)) {
        case 1:
          {
            this.state = 1192;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1189;
              this.match(KotlinParser.NL);
              this.state = 1194;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1195;
            this.match(KotlinParser.COMMA);
          }
          break;
      }
      this.state = 1201;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1198;
        this.match(KotlinParser.NL);
        this.state = 1203;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1204;
      this.match(KotlinParser.RPAREN);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public propertyDeclaration(): PropertyDeclarationContext {
    const localContext = new PropertyDeclarationContext(this.context, this.state);
    this.enterRule(localContext, 70, KotlinParser.RULE_propertyDeclaration);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1207;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 41 || _la === 43 || (((_la - 109) & ~0x1f) === 0 && ((1 << (_la - 109)) & 234881023) !== 0)) {
        this.state = 1206;
        this.modifiers();
      }

      this.state = 1209;
      _la = this.tokenStream.LA(1);
      if (!(_la === 78 || _la === 79)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
      this.state = 1217;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 152, this.context)) {
        case 1:
          {
            this.state = 1213;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1210;
              this.match(KotlinParser.NL);
              this.state = 1215;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1216;
            this.typeParameters();
          }
          break;
      }
      this.state = 1234;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 155, this.context)) {
        case 1:
          {
            this.state = 1222;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1219;
              this.match(KotlinParser.NL);
              this.state = 1224;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1225;
            this.receiverType();
            this.state = 1229;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1226;
              this.match(KotlinParser.NL);
              this.state = 1231;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1232;
            this.match(KotlinParser.DOT);
          }
          break;
      }
      this.state = 1239;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 156, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1236;
          this.match(KotlinParser.NL);
        }
        this.state = 1241;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 156, this.context);
      }
      this.state = 1244;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.LPAREN:
          {
            this.state = 1242;
            this.multiVariableDeclaration();
          }
          break;
        case KotlinParser.NL:
        case KotlinParser.AT_NO_WS:
        case KotlinParser.AT_PRE_WS:
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.WHERE:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.Identifier:
          {
            this.state = 1243;
            this.variableDeclaration();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
      this.state = 1253;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 159, this.context)) {
        case 1:
          {
            this.state = 1249;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1246;
              this.match(KotlinParser.NL);
              this.state = 1251;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1252;
            this.typeConstraints();
          }
          break;
      }
      this.state = 1272;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 163, this.context)) {
        case 1:
          {
            this.state = 1258;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1255;
              this.match(KotlinParser.NL);
              this.state = 1260;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1270;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
              case KotlinParser.ASSIGNMENT:
                {
                  this.state = 1261;
                  this.match(KotlinParser.ASSIGNMENT);
                  this.state = 1265;
                  this.errorHandler.sync(this);
                  alternative = this.interpreter.adaptivePredict(this.tokenStream, 161, this.context);
                  while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                      this.state = 1262;
                      this.match(KotlinParser.NL);
                    }
                    this.state = 1267;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 161, this.context);
                  }
                  this.state = 1268;
                  this.expression();
                }
                break;
              case KotlinParser.BY:
                {
                  this.state = 1269;
                  this.propertyDelegate();
                }
                break;
              default:
                throw new antlr.NoViableAltException(this);
            }
          }
          break;
      }
      this.state = 1281;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 165, this.context)) {
        case 1:
          {
            this.state = 1277;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1274;
              this.match(KotlinParser.NL);
              this.state = 1279;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1280;
            this.match(KotlinParser.SEMICOLON);
          }
          break;
      }
      this.state = 1286;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 166, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1283;
          this.match(KotlinParser.NL);
        }
        this.state = 1288;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 166, this.context);
      }
      this.state = 1319;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 175, this.context)) {
        case 1:
          {
            this.state = 1290;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 167, this.context)) {
              case 1:
                {
                  this.state = 1289;
                  this.getter();
                }
                break;
            }
            this.state = 1302;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 170, this.context)) {
              case 1:
                {
                  this.state = 1295;
                  this.errorHandler.sync(this);
                  alternative = this.interpreter.adaptivePredict(this.tokenStream, 168, this.context);
                  while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                      this.state = 1292;
                      this.match(KotlinParser.NL);
                    }
                    this.state = 1297;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 168, this.context);
                  }
                  this.state = 1299;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  if (_la === 5 || _la === 27) {
                    this.state = 1298;
                    this.semi();
                  }

                  this.state = 1301;
                  this.setter();
                }
                break;
            }
          }
          break;
        case 2:
          {
            this.state = 1305;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 171, this.context)) {
              case 1:
                {
                  this.state = 1304;
                  this.setter();
                }
                break;
            }
            this.state = 1317;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 174, this.context)) {
              case 1:
                {
                  this.state = 1310;
                  this.errorHandler.sync(this);
                  alternative = this.interpreter.adaptivePredict(this.tokenStream, 172, this.context);
                  while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                      this.state = 1307;
                      this.match(KotlinParser.NL);
                    }
                    this.state = 1312;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 172, this.context);
                  }
                  this.state = 1314;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  if (_la === 5 || _la === 27) {
                    this.state = 1313;
                    this.semi();
                  }

                  this.state = 1316;
                  this.getter();
                }
                break;
            }
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public propertyDelegate(): PropertyDelegateContext {
    const localContext = new PropertyDelegateContext(this.context, this.state);
    this.enterRule(localContext, 72, KotlinParser.RULE_propertyDelegate);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1321;
      this.match(KotlinParser.BY);
      this.state = 1325;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 176, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1322;
          this.match(KotlinParser.NL);
        }
        this.state = 1327;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 176, this.context);
      }
      this.state = 1328;
      this.expression();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public getter(): GetterContext {
    const localContext = new GetterContext(this.context, this.state);
    this.enterRule(localContext, 74, KotlinParser.RULE_getter);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1331;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 41 || _la === 43 || (((_la - 109) & ~0x1f) === 0 && ((1 << (_la - 109)) & 234881023) !== 0)) {
        this.state = 1330;
        this.modifiers();
      }

      this.state = 1333;
      this.match(KotlinParser.GET);
      this.state = 1371;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 184, this.context)) {
        case 1:
          {
            this.state = 1337;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1334;
              this.match(KotlinParser.NL);
              this.state = 1339;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1340;
            this.match(KotlinParser.LPAREN);
            this.state = 1344;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1341;
              this.match(KotlinParser.NL);
              this.state = 1346;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1347;
            this.match(KotlinParser.RPAREN);
            this.state = 1362;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 182, this.context)) {
              case 1:
                {
                  this.state = 1351;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  while (_la === 5) {
                    this.state = 1348;
                    this.match(KotlinParser.NL);
                    this.state = 1353;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                  }
                  this.state = 1354;
                  this.match(KotlinParser.COLON);
                  this.state = 1358;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  while (_la === 5) {
                    this.state = 1355;
                    this.match(KotlinParser.NL);
                    this.state = 1360;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                  }
                  this.state = 1361;
                  this.type_();
                }
                break;
            }
            this.state = 1367;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1364;
              this.match(KotlinParser.NL);
              this.state = 1369;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1370;
            this.functionBody();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public setter(): SetterContext {
    const localContext = new SetterContext(this.context, this.state);
    this.enterRule(localContext, 76, KotlinParser.RULE_setter);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1374;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 41 || _la === 43 || (((_la - 109) & ~0x1f) === 0 && ((1 << (_la - 109)) & 234881023) !== 0)) {
        this.state = 1373;
        this.modifiers();
      }

      this.state = 1376;
      this.match(KotlinParser.SET);
      this.state = 1431;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 195, this.context)) {
        case 1:
          {
            this.state = 1380;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1377;
              this.match(KotlinParser.NL);
              this.state = 1382;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1383;
            this.match(KotlinParser.LPAREN);
            this.state = 1387;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1384;
              this.match(KotlinParser.NL);
              this.state = 1389;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1390;
            this.functionValueParameterWithOptionalType();
            this.state = 1398;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 189, this.context)) {
              case 1:
                {
                  this.state = 1394;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  while (_la === 5) {
                    this.state = 1391;
                    this.match(KotlinParser.NL);
                    this.state = 1396;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                  }
                  this.state = 1397;
                  this.match(KotlinParser.COMMA);
                }
                break;
            }
            this.state = 1403;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1400;
              this.match(KotlinParser.NL);
              this.state = 1405;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1406;
            this.match(KotlinParser.RPAREN);
            this.state = 1421;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 193, this.context)) {
              case 1:
                {
                  this.state = 1410;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  while (_la === 5) {
                    this.state = 1407;
                    this.match(KotlinParser.NL);
                    this.state = 1412;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                  }
                  this.state = 1413;
                  this.match(KotlinParser.COLON);
                  this.state = 1417;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  while (_la === 5) {
                    this.state = 1414;
                    this.match(KotlinParser.NL);
                    this.state = 1419;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                  }
                  this.state = 1420;
                  this.type_();
                }
                break;
            }
            this.state = 1426;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1423;
              this.match(KotlinParser.NL);
              this.state = 1428;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1429;
            this.functionBody();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public parametersWithOptionalType(): ParametersWithOptionalTypeContext {
    const localContext = new ParametersWithOptionalTypeContext(this.context, this.state);
    this.enterRule(localContext, 78, KotlinParser.RULE_parametersWithOptionalType);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1433;
      this.match(KotlinParser.LPAREN);
      this.state = 1437;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 196, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1434;
          this.match(KotlinParser.NL);
        }
        this.state = 1439;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 196, this.context);
      }
      this.state = 1469;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (
        (((_la - 41) & ~0x1f) === 0 && ((1 << (_la - 41)) & 2143289349) !== 0) ||
        (((_la - 73) & ~0x1f) === 0 && ((1 << (_la - 73)) & 3182337) !== 0) ||
        (((_la - 107) & ~0x1f) === 0 && ((1 << (_la - 107)) & 1073741823) !== 0) ||
        _la === 148
      ) {
        this.state = 1440;
        this.functionValueParameterWithOptionalType();
        this.state = 1457;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 199, this.context);
        while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
          if (alternative === 1) {
            this.state = 1444;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1441;
              this.match(KotlinParser.NL);
              this.state = 1446;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1447;
            this.match(KotlinParser.COMMA);
            this.state = 1451;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1448;
              this.match(KotlinParser.NL);
              this.state = 1453;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1454;
            this.functionValueParameterWithOptionalType();
          }
          this.state = 1459;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 199, this.context);
        }
        this.state = 1467;
        this.errorHandler.sync(this);
        switch (this.interpreter.adaptivePredict(this.tokenStream, 201, this.context)) {
          case 1:
            {
              this.state = 1463;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
              while (_la === 5) {
                this.state = 1460;
                this.match(KotlinParser.NL);
                this.state = 1465;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
              }
              this.state = 1466;
              this.match(KotlinParser.COMMA);
            }
            break;
        }
      }

      this.state = 1474;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1471;
        this.match(KotlinParser.NL);
        this.state = 1476;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1477;
      this.match(KotlinParser.RPAREN);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public functionValueParameterWithOptionalType(): FunctionValueParameterWithOptionalTypeContext {
    const localContext = new FunctionValueParameterWithOptionalTypeContext(this.context, this.state);
    this.enterRule(localContext, 80, KotlinParser.RULE_functionValueParameterWithOptionalType);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1480;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 204, this.context)) {
        case 1:
          {
            this.state = 1479;
            this.parameterModifiers();
          }
          break;
      }
      this.state = 1482;
      this.parameterWithOptionalType();
      this.state = 1497;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 207, this.context)) {
        case 1:
          {
            this.state = 1486;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1483;
              this.match(KotlinParser.NL);
              this.state = 1488;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1489;
            this.match(KotlinParser.ASSIGNMENT);
            this.state = 1493;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 206, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 1490;
                this.match(KotlinParser.NL);
              }
              this.state = 1495;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 206, this.context);
            }
            this.state = 1496;
            this.expression();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public parameterWithOptionalType(): ParameterWithOptionalTypeContext {
    const localContext = new ParameterWithOptionalTypeContext(this.context, this.state);
    this.enterRule(localContext, 82, KotlinParser.RULE_parameterWithOptionalType);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1499;
      this.simpleIdentifier();
      this.state = 1503;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 208, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1500;
          this.match(KotlinParser.NL);
        }
        this.state = 1505;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 208, this.context);
      }
      this.state = 1514;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 26) {
        this.state = 1506;
        this.match(KotlinParser.COLON);
        this.state = 1510;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
        while (_la === 5) {
          this.state = 1507;
          this.match(KotlinParser.NL);
          this.state = 1512;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
        }
        this.state = 1513;
        this.type_();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public parameter(): ParameterContext {
    const localContext = new ParameterContext(this.context, this.state);
    this.enterRule(localContext, 84, KotlinParser.RULE_parameter);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1516;
      this.simpleIdentifier();
      this.state = 1520;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1517;
        this.match(KotlinParser.NL);
        this.state = 1522;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1523;
      this.match(KotlinParser.COLON);
      this.state = 1527;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1524;
        this.match(KotlinParser.NL);
        this.state = 1529;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1530;
      this.type_();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public objectDeclaration(): ObjectDeclarationContext {
    const localContext = new ObjectDeclarationContext(this.context, this.state);
    this.enterRule(localContext, 86, KotlinParser.RULE_objectDeclaration);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1533;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 41 || _la === 43 || (((_la - 109) & ~0x1f) === 0 && ((1 << (_la - 109)) & 234881023) !== 0)) {
        this.state = 1532;
        this.modifiers();
      }

      this.state = 1535;
      this.match(KotlinParser.OBJECT);
      this.state = 1539;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1536;
        this.match(KotlinParser.NL);
        this.state = 1541;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1542;
      this.simpleIdentifier();
      this.state = 1557;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 217, this.context)) {
        case 1:
          {
            this.state = 1546;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1543;
              this.match(KotlinParser.NL);
              this.state = 1548;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1549;
            this.match(KotlinParser.COLON);
            this.state = 1553;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 216, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 1550;
                this.match(KotlinParser.NL);
              }
              this.state = 1555;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 216, this.context);
            }
            this.state = 1556;
            this.delegationSpecifiers();
          }
          break;
      }
      this.state = 1566;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 219, this.context)) {
        case 1:
          {
            this.state = 1562;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1559;
              this.match(KotlinParser.NL);
              this.state = 1564;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1565;
            this.classBody();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public secondaryConstructor(): SecondaryConstructorContext {
    const localContext = new SecondaryConstructorContext(this.context, this.state);
    this.enterRule(localContext, 88, KotlinParser.RULE_secondaryConstructor);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1569;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 41 || _la === 43 || (((_la - 109) & ~0x1f) === 0 && ((1 << (_la - 109)) & 234881023) !== 0)) {
        this.state = 1568;
        this.modifiers();
      }

      this.state = 1571;
      this.match(KotlinParser.CONSTRUCTOR);
      this.state = 1575;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1572;
        this.match(KotlinParser.NL);
        this.state = 1577;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1578;
      this.functionValueParameters();
      this.state = 1593;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 224, this.context)) {
        case 1:
          {
            this.state = 1582;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1579;
              this.match(KotlinParser.NL);
              this.state = 1584;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1585;
            this.match(KotlinParser.COLON);
            this.state = 1589;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1586;
              this.match(KotlinParser.NL);
              this.state = 1591;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1592;
            this.constructorDelegationCall();
          }
          break;
      }
      this.state = 1598;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 225, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1595;
          this.match(KotlinParser.NL);
        }
        this.state = 1600;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 225, this.context);
      }
      this.state = 1602;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 13) {
        this.state = 1601;
        this.block();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public constructorDelegationCall(): ConstructorDelegationCallContext {
    const localContext = new ConstructorDelegationCallContext(this.context, this.state);
    this.enterRule(localContext, 90, KotlinParser.RULE_constructorDelegationCall);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1604;
      _la = this.tokenStream.LA(1);
      if (!(_la === 85 || _la === 86)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
      this.state = 1608;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1605;
        this.match(KotlinParser.NL);
        this.state = 1610;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1611;
      this.valueArguments();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public enumClassBody(): EnumClassBodyContext {
    const localContext = new EnumClassBodyContext(this.context, this.state);
    this.enterRule(localContext, 92, KotlinParser.RULE_enumClassBody);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1613;
      this.match(KotlinParser.LCURL);
      this.state = 1617;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 228, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1614;
          this.match(KotlinParser.NL);
        }
        this.state = 1619;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 228, this.context);
      }
      this.state = 1621;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (
        (((_la - 41) & ~0x1f) === 0 && ((1 << (_la - 41)) & 2143289349) !== 0) ||
        (((_la - 73) & ~0x1f) === 0 && ((1 << (_la - 73)) & 3182337) !== 0) ||
        (((_la - 107) & ~0x1f) === 0 && ((1 << (_la - 107)) & 1073741823) !== 0) ||
        _la === 148
      ) {
        this.state = 1620;
        this.enumEntries();
      }

      this.state = 1637;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 232, this.context)) {
        case 1:
          {
            this.state = 1626;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1623;
              this.match(KotlinParser.NL);
              this.state = 1628;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1629;
            this.match(KotlinParser.SEMICOLON);
            this.state = 1633;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 231, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 1630;
                this.match(KotlinParser.NL);
              }
              this.state = 1635;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 231, this.context);
            }
            this.state = 1636;
            this.classMemberDeclarations();
          }
          break;
      }
      this.state = 1642;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1639;
        this.match(KotlinParser.NL);
        this.state = 1644;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1645;
      this.match(KotlinParser.RCURL);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public enumEntries(): EnumEntriesContext {
    const localContext = new EnumEntriesContext(this.context, this.state);
    this.enterRule(localContext, 94, KotlinParser.RULE_enumEntries);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1647;
      this.enumEntry();
      this.state = 1664;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 236, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1651;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 1648;
            this.match(KotlinParser.NL);
            this.state = 1653;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 1654;
          this.match(KotlinParser.COMMA);
          this.state = 1658;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 1655;
            this.match(KotlinParser.NL);
            this.state = 1660;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 1661;
          this.enumEntry();
        }
        this.state = 1666;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 236, this.context);
      }
      this.state = 1670;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 237, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1667;
          this.match(KotlinParser.NL);
        }
        this.state = 1672;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 237, this.context);
      }
      this.state = 1674;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 8) {
        this.state = 1673;
        this.match(KotlinParser.COMMA);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public enumEntry(): EnumEntryContext {
    const localContext = new EnumEntryContext(this.context, this.state);
    this.enterRule(localContext, 96, KotlinParser.RULE_enumEntry);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1683;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 240, this.context)) {
        case 1:
          {
            this.state = 1676;
            this.modifiers();
            this.state = 1680;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1677;
              this.match(KotlinParser.NL);
              this.state = 1682;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
          }
          break;
      }
      this.state = 1685;
      this.simpleIdentifier();
      this.state = 1693;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 242, this.context)) {
        case 1:
          {
            this.state = 1689;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1686;
              this.match(KotlinParser.NL);
              this.state = 1691;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1692;
            this.valueArguments();
          }
          break;
      }
      this.state = 1702;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 244, this.context)) {
        case 1:
          {
            this.state = 1698;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1695;
              this.match(KotlinParser.NL);
              this.state = 1700;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1701;
            this.classBody();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public type_(): TypeContext {
    const localContext = new TypeContext(this.context, this.state);
    this.enterRule(localContext, 98, KotlinParser.RULE_type);
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1705;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 245, this.context)) {
        case 1:
          {
            this.state = 1704;
            this.typeModifiers();
          }
          break;
      }
      this.state = 1712;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 246, this.context)) {
        case 1:
          {
            this.state = 1707;
            this.functionType();
          }
          break;
        case 2:
          {
            this.state = 1708;
            this.parenthesizedType();
          }
          break;
        case 3:
          {
            this.state = 1709;
            this.nullableType();
          }
          break;
        case 4:
          {
            this.state = 1710;
            this.typeReference();
          }
          break;
        case 5:
          {
            this.state = 1711;
            this.definitelyNonNullableType();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeReference(): TypeReferenceContext {
    const localContext = new TypeReferenceContext(this.context, this.state);
    this.enterRule(localContext, 100, KotlinParser.RULE_typeReference);
    try {
      this.state = 1716;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 247, this.context)) {
        case 1:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 1714;
            this.userType();
          }
          break;
        case 2:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 1715;
            this.match(KotlinParser.DYNAMIC);
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public nullableType(): NullableTypeContext {
    const localContext = new NullableTypeContext(this.context, this.state);
    this.enterRule(localContext, 102, KotlinParser.RULE_nullableType);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1720;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.WHERE:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.Identifier:
          {
            this.state = 1718;
            this.typeReference();
          }
          break;
        case KotlinParser.LPAREN:
          {
            this.state = 1719;
            this.parenthesizedType();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
      this.state = 1725;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1722;
        this.match(KotlinParser.NL);
        this.state = 1727;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1729;
      this.errorHandler.sync(this);
      alternative = 1;
      do {
        switch (alternative) {
          case 1:
            {
              this.state = 1728;
              this.quest();
            }
            break;
          default:
            throw new antlr.NoViableAltException(this);
        }
        this.state = 1731;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 250, this.context);
      } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public quest(): QuestContext {
    const localContext = new QuestContext(this.context, this.state);
    this.enterRule(localContext, 104, KotlinParser.RULE_quest);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1733;
      _la = this.tokenStream.LA(1);
      if (!(_la === 45 || _la === 46)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public userType(): UserTypeContext {
    const localContext = new UserTypeContext(this.context, this.state);
    this.enterRule(localContext, 106, KotlinParser.RULE_userType);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1735;
      this.simpleUserType();
      this.state = 1752;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 253, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1739;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 1736;
            this.match(KotlinParser.NL);
            this.state = 1741;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 1742;
          this.match(KotlinParser.DOT);
          this.state = 1746;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 1743;
            this.match(KotlinParser.NL);
            this.state = 1748;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 1749;
          this.simpleUserType();
        }
        this.state = 1754;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 253, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public simpleUserType(): SimpleUserTypeContext {
    const localContext = new SimpleUserTypeContext(this.context, this.state);
    this.enterRule(localContext, 108, KotlinParser.RULE_simpleUserType);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1755;
      this.simpleIdentifier();
      this.state = 1763;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 255, this.context)) {
        case 1:
          {
            this.state = 1759;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1756;
              this.match(KotlinParser.NL);
              this.state = 1761;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1762;
            this.typeArguments();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeProjection(): TypeProjectionContext {
    const localContext = new TypeProjectionContext(this.context, this.state);
    this.enterRule(localContext, 110, KotlinParser.RULE_typeProjection);
    try {
      this.state = 1770;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.LPAREN:
        case KotlinParser.AT_NO_WS:
        case KotlinParser.AT_PRE_WS:
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.WHERE:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.IN:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.Identifier:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 1766;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 256, this.context)) {
              case 1:
                {
                  this.state = 1765;
                  this.typeProjectionModifiers();
                }
                break;
            }
            this.state = 1768;
            this.type_();
          }
          break;
        case KotlinParser.MULT:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 1769;
            this.match(KotlinParser.MULT);
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeProjectionModifiers(): TypeProjectionModifiersContext {
    const localContext = new TypeProjectionModifiersContext(this.context, this.state);
    this.enterRule(localContext, 112, KotlinParser.RULE_typeProjectionModifiers);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1773;
      this.errorHandler.sync(this);
      alternative = 1;
      do {
        switch (alternative) {
          case 1:
            {
              this.state = 1772;
              this.typeProjectionModifier();
            }
            break;
          default:
            throw new antlr.NoViableAltException(this);
        }
        this.state = 1775;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 258, this.context);
      } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeProjectionModifier(): TypeProjectionModifierContext {
    const localContext = new TypeProjectionModifierContext(this.context, this.state);
    this.enterRule(localContext, 114, KotlinParser.RULE_typeProjectionModifier);
    let _la: number;
    try {
      this.state = 1785;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.IN:
        case KotlinParser.OUT:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 1777;
            this.varianceModifier();
            this.state = 1781;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1778;
              this.match(KotlinParser.NL);
              this.state = 1783;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
          }
          break;
        case KotlinParser.AT_NO_WS:
        case KotlinParser.AT_PRE_WS:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 1784;
            this.annotation();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public functionType(): FunctionTypeContext {
    const localContext = new FunctionTypeContext(this.context, this.state);
    this.enterRule(localContext, 116, KotlinParser.RULE_functionType);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1801;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 263, this.context)) {
        case 1:
          {
            this.state = 1787;
            this.receiverType();
            this.state = 1791;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1788;
              this.match(KotlinParser.NL);
              this.state = 1793;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1794;
            this.match(KotlinParser.DOT);
            this.state = 1798;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1795;
              this.match(KotlinParser.NL);
              this.state = 1800;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
          }
          break;
      }
      this.state = 1803;
      this.functionTypeParameters();
      this.state = 1807;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1804;
        this.match(KotlinParser.NL);
        this.state = 1809;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1810;
      this.match(KotlinParser.ARROW);
      this.state = 1814;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1811;
        this.match(KotlinParser.NL);
        this.state = 1816;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1817;
      this.type_();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public functionTypeParameters(): FunctionTypeParametersContext {
    const localContext = new FunctionTypeParametersContext(this.context, this.state);
    this.enterRule(localContext, 118, KotlinParser.RULE_functionTypeParameters);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1819;
      this.match(KotlinParser.LPAREN);
      this.state = 1823;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 266, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1820;
          this.match(KotlinParser.NL);
        }
        this.state = 1825;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 266, this.context);
      }
      this.state = 1828;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 267, this.context)) {
        case 1:
          {
            this.state = 1826;
            this.parameter();
          }
          break;
        case 2:
          {
            this.state = 1827;
            this.type_();
          }
          break;
      }
      this.state = 1849;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 271, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1833;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 1830;
            this.match(KotlinParser.NL);
            this.state = 1835;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 1836;
          this.match(KotlinParser.COMMA);
          this.state = 1840;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 1837;
            this.match(KotlinParser.NL);
            this.state = 1842;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 1845;
          this.errorHandler.sync(this);
          switch (this.interpreter.adaptivePredict(this.tokenStream, 270, this.context)) {
            case 1:
              {
                this.state = 1843;
                this.parameter();
              }
              break;
            case 2:
              {
                this.state = 1844;
                this.type_();
              }
              break;
          }
        }
        this.state = 1851;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 271, this.context);
      }
      this.state = 1859;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 273, this.context)) {
        case 1:
          {
            this.state = 1855;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 1852;
              this.match(KotlinParser.NL);
              this.state = 1857;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 1858;
            this.match(KotlinParser.COMMA);
          }
          break;
      }
      this.state = 1864;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1861;
        this.match(KotlinParser.NL);
        this.state = 1866;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1867;
      this.match(KotlinParser.RPAREN);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public parenthesizedType(): ParenthesizedTypeContext {
    const localContext = new ParenthesizedTypeContext(this.context, this.state);
    this.enterRule(localContext, 120, KotlinParser.RULE_parenthesizedType);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1869;
      this.match(KotlinParser.LPAREN);
      this.state = 1873;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1870;
        this.match(KotlinParser.NL);
        this.state = 1875;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1876;
      this.type_();
      this.state = 1880;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1877;
        this.match(KotlinParser.NL);
        this.state = 1882;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1883;
      this.match(KotlinParser.RPAREN);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public receiverType(): ReceiverTypeContext {
    const localContext = new ReceiverTypeContext(this.context, this.state);
    this.enterRule(localContext, 122, KotlinParser.RULE_receiverType);
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1886;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 277, this.context)) {
        case 1:
          {
            this.state = 1885;
            this.typeModifiers();
          }
          break;
      }
      this.state = 1891;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 278, this.context)) {
        case 1:
          {
            this.state = 1888;
            this.parenthesizedType();
          }
          break;
        case 2:
          {
            this.state = 1889;
            this.nullableType();
          }
          break;
        case 3:
          {
            this.state = 1890;
            this.typeReference();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public parenthesizedUserType(): ParenthesizedUserTypeContext {
    const localContext = new ParenthesizedUserTypeContext(this.context, this.state);
    this.enterRule(localContext, 124, KotlinParser.RULE_parenthesizedUserType);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1893;
      this.match(KotlinParser.LPAREN);
      this.state = 1897;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1894;
        this.match(KotlinParser.NL);
        this.state = 1899;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1902;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.WHERE:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.Identifier:
          {
            this.state = 1900;
            this.userType();
          }
          break;
        case KotlinParser.LPAREN:
          {
            this.state = 1901;
            this.parenthesizedUserType();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
      this.state = 1907;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1904;
        this.match(KotlinParser.NL);
        this.state = 1909;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1910;
      this.match(KotlinParser.RPAREN);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public definitelyNonNullableType(): DefinitelyNonNullableTypeContext {
    const localContext = new DefinitelyNonNullableTypeContext(this.context, this.state);
    this.enterRule(localContext, 126, KotlinParser.RULE_definitelyNonNullableType);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 1913;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 282, this.context)) {
        case 1:
          {
            this.state = 1912;
            this.typeModifiers();
          }
          break;
      }
      this.state = 1917;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.WHERE:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.Identifier:
          {
            this.state = 1915;
            this.userType();
          }
          break;
        case KotlinParser.LPAREN:
          {
            this.state = 1916;
            this.parenthesizedUserType();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
      this.state = 1922;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1919;
        this.match(KotlinParser.NL);
        this.state = 1924;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1925;
      this.match(KotlinParser.AMP);
      this.state = 1929;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1926;
        this.match(KotlinParser.NL);
        this.state = 1931;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1933;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 286, this.context)) {
        case 1:
          {
            this.state = 1932;
            this.typeModifiers();
          }
          break;
      }
      this.state = 1937;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.WHERE:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.Identifier:
          {
            this.state = 1935;
            this.userType();
          }
          break;
        case KotlinParser.LPAREN:
          {
            this.state = 1936;
            this.parenthesizedUserType();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public statements(): StatementsContext {
    const localContext = new StatementsContext(this.context, this.state);
    this.enterRule(localContext, 128, KotlinParser.RULE_statements);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1948;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 289, this.context)) {
        case 1:
          {
            this.state = 1939;
            this.statement();
            this.state = 1945;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 288, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 1940;
                this.semis();
                this.state = 1941;
                this.statement();
              }
              this.state = 1947;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 288, this.context);
            }
          }
          break;
      }
      this.state = 1951;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 290, this.context)) {
        case 1:
          {
            this.state = 1950;
            this.semis();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public statement(): StatementContext {
    const localContext = new StatementContext(this.context, this.state);
    this.enterRule(localContext, 130, KotlinParser.RULE_statement);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1957;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 292, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1955;
          this.errorHandler.sync(this);
          switch (this.tokenStream.LA(1)) {
            case KotlinParser.FILE:
            case KotlinParser.FIELD:
            case KotlinParser.PROPERTY:
            case KotlinParser.GET:
            case KotlinParser.SET:
            case KotlinParser.RECEIVER:
            case KotlinParser.PARAM:
            case KotlinParser.SETPARAM:
            case KotlinParser.DELEGATE:
            case KotlinParser.IMPORT:
            case KotlinParser.CONSTRUCTOR:
            case KotlinParser.BY:
            case KotlinParser.COMPANION:
            case KotlinParser.INIT:
            case KotlinParser.WHERE:
            case KotlinParser.CATCH:
            case KotlinParser.FINALLY:
            case KotlinParser.OUT:
            case KotlinParser.DYNAMIC:
            case KotlinParser.PUBLIC:
            case KotlinParser.PRIVATE:
            case KotlinParser.PROTECTED:
            case KotlinParser.INTERNAL:
            case KotlinParser.ENUM:
            case KotlinParser.SEALED:
            case KotlinParser.ANNOTATION:
            case KotlinParser.DATA:
            case KotlinParser.INNER:
            case KotlinParser.VALUE:
            case KotlinParser.TAILREC:
            case KotlinParser.OPERATOR:
            case KotlinParser.INLINE:
            case KotlinParser.INFIX:
            case KotlinParser.EXTERNAL:
            case KotlinParser.SUSPEND:
            case KotlinParser.OVERRIDE:
            case KotlinParser.ABSTRACT:
            case KotlinParser.FINAL:
            case KotlinParser.OPEN:
            case KotlinParser.CONST:
            case KotlinParser.LATEINIT:
            case KotlinParser.VARARG:
            case KotlinParser.NOINLINE:
            case KotlinParser.CROSSINLINE:
            case KotlinParser.REIFIED:
            case KotlinParser.EXPECT:
            case KotlinParser.ACTUAL:
            case KotlinParser.Identifier:
              {
                this.state = 1953;
                this.label();
              }
              break;
            case KotlinParser.AT_NO_WS:
            case KotlinParser.AT_PRE_WS:
              {
                this.state = 1954;
                this.annotation();
              }
              break;
            default:
              throw new antlr.NoViableAltException(this);
          }
        }
        this.state = 1959;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 292, this.context);
      }
      this.state = 1964;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 293, this.context)) {
        case 1:
          {
            this.state = 1960;
            this.declaration();
          }
          break;
        case 2:
          {
            this.state = 1961;
            this.assignment();
          }
          break;
        case 3:
          {
            this.state = 1962;
            this.loopStatement();
          }
          break;
        case 4:
          {
            this.state = 1963;
            this.expression();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public label(): LabelContext {
    const localContext = new LabelContext(this.context, this.state);
    this.enterRule(localContext, 132, KotlinParser.RULE_label);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1966;
      this.simpleIdentifier();
      this.state = 1967;
      _la = this.tokenStream.LA(1);
      if (!(_la === 41 || _la === 42)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
      this.state = 1971;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 294, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1968;
          this.match(KotlinParser.NL);
        }
        this.state = 1973;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 294, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public controlStructureBody(): ControlStructureBodyContext {
    const localContext = new ControlStructureBodyContext(this.context, this.state);
    this.enterRule(localContext, 134, KotlinParser.RULE_controlStructureBody);
    try {
      this.state = 1976;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 295, this.context)) {
        case 1:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 1974;
            this.block();
          }
          break;
        case 2:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 1975;
            this.statement();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public block(): BlockContext {
    const localContext = new BlockContext(this.context, this.state);
    this.enterRule(localContext, 136, KotlinParser.RULE_block);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1978;
      this.match(KotlinParser.LCURL);
      this.state = 1982;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 296, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 1979;
          this.match(KotlinParser.NL);
        }
        this.state = 1984;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 296, this.context);
      }
      this.state = 1985;
      this.statements();
      this.state = 1989;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 1986;
        this.match(KotlinParser.NL);
        this.state = 1991;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 1992;
      this.match(KotlinParser.RCURL);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public loopStatement(): LoopStatementContext {
    const localContext = new LoopStatementContext(this.context, this.state);
    this.enterRule(localContext, 138, KotlinParser.RULE_loopStatement);
    try {
      this.state = 1997;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.FOR:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 1994;
            this.forStatement();
          }
          break;
        case KotlinParser.WHILE:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 1995;
            this.whileStatement();
          }
          break;
        case KotlinParser.DO:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 1996;
            this.doWhileStatement();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public forStatement(): ForStatementContext {
    const localContext = new ForStatementContext(this.context, this.state);
    this.enterRule(localContext, 140, KotlinParser.RULE_forStatement);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 1999;
      this.match(KotlinParser.FOR);
      this.state = 2003;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2000;
        this.match(KotlinParser.NL);
        this.state = 2005;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2006;
      this.match(KotlinParser.LPAREN);
      this.state = 2010;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 300, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2007;
          this.annotation();
        }
        this.state = 2012;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 300, this.context);
      }
      this.state = 2015;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.NL:
        case KotlinParser.AT_NO_WS:
        case KotlinParser.AT_PRE_WS:
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.WHERE:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.Identifier:
          {
            this.state = 2013;
            this.variableDeclaration();
          }
          break;
        case KotlinParser.LPAREN:
          {
            this.state = 2014;
            this.multiVariableDeclaration();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
      this.state = 2017;
      this.match(KotlinParser.IN);
      this.state = 2018;
      this.expression();
      this.state = 2019;
      this.match(KotlinParser.RPAREN);
      this.state = 2023;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 302, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2020;
          this.match(KotlinParser.NL);
        }
        this.state = 2025;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 302, this.context);
      }
      this.state = 2027;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 303, this.context)) {
        case 1:
          {
            this.state = 2026;
            this.controlStructureBody();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public whileStatement(): WhileStatementContext {
    const localContext = new WhileStatementContext(this.context, this.state);
    this.enterRule(localContext, 142, KotlinParser.RULE_whileStatement);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2029;
      this.match(KotlinParser.WHILE);
      this.state = 2033;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2030;
        this.match(KotlinParser.NL);
        this.state = 2035;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2036;
      this.match(KotlinParser.LPAREN);
      this.state = 2037;
      this.expression();
      this.state = 2038;
      this.match(KotlinParser.RPAREN);
      this.state = 2042;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 305, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2039;
          this.match(KotlinParser.NL);
        }
        this.state = 2044;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 305, this.context);
      }
      this.state = 2047;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.NL:
        case KotlinParser.LPAREN:
        case KotlinParser.LSQUARE:
        case KotlinParser.LCURL:
        case KotlinParser.ADD:
        case KotlinParser.SUB:
        case KotlinParser.INCR:
        case KotlinParser.DECR:
        case KotlinParser.EXCL_WS:
        case KotlinParser.EXCL_NO_WS:
        case KotlinParser.COLONCOLON:
        case KotlinParser.AT_NO_WS:
        case KotlinParser.AT_PRE_WS:
        case KotlinParser.RETURN_AT:
        case KotlinParser.CONTINUE_AT:
        case KotlinParser.BREAK_AT:
        case KotlinParser.THIS_AT:
        case KotlinParser.SUPER_AT:
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CLASS:
        case KotlinParser.INTERFACE:
        case KotlinParser.FUN:
        case KotlinParser.OBJECT:
        case KotlinParser.VAL:
        case KotlinParser.VAR:
        case KotlinParser.TYPE_ALIAS:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.THIS:
        case KotlinParser.SUPER:
        case KotlinParser.WHERE:
        case KotlinParser.IF:
        case KotlinParser.WHEN:
        case KotlinParser.TRY:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.FOR:
        case KotlinParser.DO:
        case KotlinParser.WHILE:
        case KotlinParser.THROW:
        case KotlinParser.RETURN:
        case KotlinParser.CONTINUE:
        case KotlinParser.BREAK:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.RealLiteral:
        case KotlinParser.IntegerLiteral:
        case KotlinParser.HexLiteral:
        case KotlinParser.BinLiteral:
        case KotlinParser.UnsignedLiteral:
        case KotlinParser.LongLiteral:
        case KotlinParser.BooleanLiteral:
        case KotlinParser.NullLiteral:
        case KotlinParser.CharacterLiteral:
        case KotlinParser.Identifier:
        case KotlinParser.QUOTE_OPEN:
        case KotlinParser.TRIPLE_QUOTE_OPEN:
          {
            this.state = 2045;
            this.controlStructureBody();
          }
          break;
        case KotlinParser.SEMICOLON:
          {
            this.state = 2046;
            this.match(KotlinParser.SEMICOLON);
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public doWhileStatement(): DoWhileStatementContext {
    const localContext = new DoWhileStatementContext(this.context, this.state);
    this.enterRule(localContext, 144, KotlinParser.RULE_doWhileStatement);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2049;
      this.match(KotlinParser.DO);
      this.state = 2053;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 307, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2050;
          this.match(KotlinParser.NL);
        }
        this.state = 2055;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 307, this.context);
      }
      this.state = 2057;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 308, this.context)) {
        case 1:
          {
            this.state = 2056;
            this.controlStructureBody();
          }
          break;
      }
      this.state = 2062;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2059;
        this.match(KotlinParser.NL);
        this.state = 2064;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2065;
      this.match(KotlinParser.WHILE);
      this.state = 2069;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2066;
        this.match(KotlinParser.NL);
        this.state = 2071;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2072;
      this.match(KotlinParser.LPAREN);
      this.state = 2073;
      this.expression();
      this.state = 2074;
      this.match(KotlinParser.RPAREN);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public assignment(): AssignmentContext {
    const localContext = new AssignmentContext(this.context, this.state);
    this.enterRule(localContext, 146, KotlinParser.RULE_assignment);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2082;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 311, this.context)) {
        case 1:
          {
            this.state = 2076;
            this.directlyAssignableExpression();
            this.state = 2077;
            this.match(KotlinParser.ASSIGNMENT);
          }
          break;
        case 2:
          {
            this.state = 2079;
            this.assignableExpression();
            this.state = 2080;
            this.assignmentAndOperator();
          }
          break;
      }
      this.state = 2087;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 312, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2084;
          this.match(KotlinParser.NL);
        }
        this.state = 2089;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 312, this.context);
      }
      this.state = 2090;
      this.expression();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public semi(): SemiContext {
    const localContext = new SemiContext(this.context, this.state);
    this.enterRule(localContext, 148, KotlinParser.RULE_semi);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2092;
      _la = this.tokenStream.LA(1);
      if (!(_la === 5 || _la === 27)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
      this.state = 2096;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 313, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2093;
          this.match(KotlinParser.NL);
        }
        this.state = 2098;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 313, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public semis(): SemisContext {
    const localContext = new SemisContext(this.context, this.state);
    this.enterRule(localContext, 150, KotlinParser.RULE_semis);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2100;
      this.errorHandler.sync(this);
      alternative = 1;
      do {
        switch (alternative) {
          case 1:
            {
              this.state = 2099;
              _la = this.tokenStream.LA(1);
              if (!(_la === 5 || _la === 27)) {
                this.errorHandler.recoverInline(this);
              } else {
                this.errorHandler.reportMatch(this);
                this.consume();
              }
            }
            break;
          default:
            throw new antlr.NoViableAltException(this);
        }
        this.state = 2102;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 314, this.context);
      } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public expression(): ExpressionContext {
    const localContext = new ExpressionContext(this.context, this.state);
    this.enterRule(localContext, 152, KotlinParser.RULE_expression);
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 2104;
      this.disjunction();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public disjunction(): DisjunctionContext {
    const localContext = new DisjunctionContext(this.context, this.state);
    this.enterRule(localContext, 154, KotlinParser.RULE_disjunction);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2106;
      this.conjunction();
      this.state = 2123;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 317, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2110;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 2107;
            this.match(KotlinParser.NL);
            this.state = 2112;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 2113;
          this.match(KotlinParser.DISJ);
          this.state = 2117;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 316, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 2114;
              this.match(KotlinParser.NL);
            }
            this.state = 2119;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 316, this.context);
          }
          this.state = 2120;
          this.conjunction();
        }
        this.state = 2125;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 317, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public conjunction(): ConjunctionContext {
    const localContext = new ConjunctionContext(this.context, this.state);
    this.enterRule(localContext, 156, KotlinParser.RULE_conjunction);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2126;
      this.equality();
      this.state = 2143;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 320, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2130;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 2127;
            this.match(KotlinParser.NL);
            this.state = 2132;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 2133;
          this.match(KotlinParser.CONJ);
          this.state = 2137;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 319, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 2134;
              this.match(KotlinParser.NL);
            }
            this.state = 2139;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 319, this.context);
          }
          this.state = 2140;
          this.equality();
        }
        this.state = 2145;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 320, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public equality(): EqualityContext {
    const localContext = new EqualityContext(this.context, this.state);
    this.enterRule(localContext, 158, KotlinParser.RULE_equality);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2146;
      this.comparison();
      this.state = 2158;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 322, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2147;
          this.equalityOperator();
          this.state = 2151;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 321, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 2148;
              this.match(KotlinParser.NL);
            }
            this.state = 2153;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 321, this.context);
          }
          this.state = 2154;
          this.comparison();
        }
        this.state = 2160;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 322, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public comparison(): ComparisonContext {
    const localContext = new ComparisonContext(this.context, this.state);
    this.enterRule(localContext, 160, KotlinParser.RULE_comparison);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2161;
      this.genericCallLikeComparison();
      this.state = 2173;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 324, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2162;
          this.comparisonOperator();
          this.state = 2166;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 323, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 2163;
              this.match(KotlinParser.NL);
            }
            this.state = 2168;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 323, this.context);
          }
          this.state = 2169;
          this.genericCallLikeComparison();
        }
        this.state = 2175;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 324, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public genericCallLikeComparison(): GenericCallLikeComparisonContext {
    const localContext = new GenericCallLikeComparisonContext(this.context, this.state);
    this.enterRule(localContext, 162, KotlinParser.RULE_genericCallLikeComparison);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2176;
      this.infixOperation();
      this.state = 2180;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 325, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2177;
          this.callSuffix();
        }
        this.state = 2182;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 325, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public infixOperation(): InfixOperationContext {
    const localContext = new InfixOperationContext(this.context, this.state);
    this.enterRule(localContext, 164, KotlinParser.RULE_infixOperation);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2183;
      this.elvisExpression();
      this.state = 2204;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 329, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2202;
          this.errorHandler.sync(this);
          switch (this.tokenStream.LA(1)) {
            case KotlinParser.IN:
            case KotlinParser.NOT_IN:
              {
                this.state = 2184;
                this.inOperator();
                this.state = 2188;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 326, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                  if (alternative === 1) {
                    this.state = 2185;
                    this.match(KotlinParser.NL);
                  }
                  this.state = 2190;
                  this.errorHandler.sync(this);
                  alternative = this.interpreter.adaptivePredict(this.tokenStream, 326, this.context);
                }
                this.state = 2191;
                this.elvisExpression();
              }
              break;
            case KotlinParser.IS:
            case KotlinParser.NOT_IS:
              {
                this.state = 2193;
                this.isOperator();
                this.state = 2197;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 5) {
                  this.state = 2194;
                  this.match(KotlinParser.NL);
                  this.state = 2199;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                }
                this.state = 2200;
                this.type_();
              }
              break;
            default:
              throw new antlr.NoViableAltException(this);
          }
        }
        this.state = 2206;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 329, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public elvisExpression(): ElvisExpressionContext {
    const localContext = new ElvisExpressionContext(this.context, this.state);
    this.enterRule(localContext, 166, KotlinParser.RULE_elvisExpression);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2207;
      this.infixFunctionCall();
      this.state = 2225;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 332, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2211;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 2208;
            this.match(KotlinParser.NL);
            this.state = 2213;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 2214;
          this.elvis();
          this.state = 2218;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 331, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 2215;
              this.match(KotlinParser.NL);
            }
            this.state = 2220;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 331, this.context);
          }
          this.state = 2221;
          this.infixFunctionCall();
        }
        this.state = 2227;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 332, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public elvis(): ElvisContext {
    const localContext = new ElvisContext(this.context, this.state);
    this.enterRule(localContext, 168, KotlinParser.RULE_elvis);
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 2228;
      this.match(KotlinParser.QUEST_NO_WS);
      this.state = 2229;
      this.match(KotlinParser.COLON);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public infixFunctionCall(): InfixFunctionCallContext {
    const localContext = new InfixFunctionCallContext(this.context, this.state);
    this.enterRule(localContext, 170, KotlinParser.RULE_infixFunctionCall);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2231;
      this.rangeExpression();
      this.state = 2243;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 334, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2232;
          this.simpleIdentifier();
          this.state = 2236;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 333, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 2233;
              this.match(KotlinParser.NL);
            }
            this.state = 2238;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 333, this.context);
          }
          this.state = 2239;
          this.rangeExpression();
        }
        this.state = 2245;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 334, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public rangeExpression(): RangeExpressionContext {
    const localContext = new RangeExpressionContext(this.context, this.state);
    this.enterRule(localContext, 172, KotlinParser.RULE_rangeExpression);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2246;
      this.additiveExpression();
      this.state = 2257;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 336, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2247;
          _la = this.tokenStream.LA(1);
          if (!(_la === 36 || _la === 37)) {
            this.errorHandler.recoverInline(this);
          } else {
            this.errorHandler.reportMatch(this);
            this.consume();
          }
          this.state = 2251;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 335, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 2248;
              this.match(KotlinParser.NL);
            }
            this.state = 2253;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 335, this.context);
          }
          this.state = 2254;
          this.additiveExpression();
        }
        this.state = 2259;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 336, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public additiveExpression(): AdditiveExpressionContext {
    const localContext = new AdditiveExpressionContext(this.context, this.state);
    this.enterRule(localContext, 174, KotlinParser.RULE_additiveExpression);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2260;
      this.multiplicativeExpression();
      this.state = 2272;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 338, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2261;
          this.additiveOperator();
          this.state = 2265;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 337, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 2262;
              this.match(KotlinParser.NL);
            }
            this.state = 2267;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 337, this.context);
          }
          this.state = 2268;
          this.multiplicativeExpression();
        }
        this.state = 2274;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 338, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public multiplicativeExpression(): MultiplicativeExpressionContext {
    const localContext = new MultiplicativeExpressionContext(this.context, this.state);
    this.enterRule(localContext, 176, KotlinParser.RULE_multiplicativeExpression);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2275;
      this.asExpression();
      this.state = 2287;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 340, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2276;
          this.multiplicativeOperator();
          this.state = 2280;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 339, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 2277;
              this.match(KotlinParser.NL);
            }
            this.state = 2282;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 339, this.context);
          }
          this.state = 2283;
          this.asExpression();
        }
        this.state = 2289;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 340, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public asExpression(): AsExpressionContext {
    const localContext = new AsExpressionContext(this.context, this.state);
    this.enterRule(localContext, 178, KotlinParser.RULE_asExpression);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2290;
      this.prefixUnaryExpression();
      this.state = 2308;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 343, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2294;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 2291;
            this.match(KotlinParser.NL);
            this.state = 2296;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 2297;
          this.asOperator();
          this.state = 2301;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 2298;
            this.match(KotlinParser.NL);
            this.state = 2303;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 2304;
          this.type_();
        }
        this.state = 2310;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 343, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public prefixUnaryExpression(): PrefixUnaryExpressionContext {
    const localContext = new PrefixUnaryExpressionContext(this.context, this.state);
    this.enterRule(localContext, 180, KotlinParser.RULE_prefixUnaryExpression);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2314;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 344, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2311;
          this.unaryPrefix();
        }
        this.state = 2316;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 344, this.context);
      }
      this.state = 2317;
      this.postfixUnaryExpression();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public unaryPrefix(): UnaryPrefixContext {
    const localContext = new UnaryPrefixContext(this.context, this.state);
    this.enterRule(localContext, 182, KotlinParser.RULE_unaryPrefix);
    try {
      let alternative: number;
      this.state = 2328;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.AT_NO_WS:
        case KotlinParser.AT_PRE_WS:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 2319;
            this.annotation();
          }
          break;
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.WHERE:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.Identifier:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 2320;
            this.label();
          }
          break;
        case KotlinParser.ADD:
        case KotlinParser.SUB:
        case KotlinParser.INCR:
        case KotlinParser.DECR:
        case KotlinParser.EXCL_WS:
        case KotlinParser.EXCL_NO_WS:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 2321;
            this.prefixUnaryOperator();
            this.state = 2325;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 345, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 2322;
                this.match(KotlinParser.NL);
              }
              this.state = 2327;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 345, this.context);
            }
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public postfixUnaryExpression(): PostfixUnaryExpressionContext {
    const localContext = new PostfixUnaryExpressionContext(this.context, this.state);
    this.enterRule(localContext, 184, KotlinParser.RULE_postfixUnaryExpression);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2330;
      this.primaryExpression();
      this.state = 2334;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 347, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2331;
          this.postfixUnarySuffix();
        }
        this.state = 2336;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 347, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public postfixUnarySuffix(): PostfixUnarySuffixContext {
    const localContext = new PostfixUnarySuffixContext(this.context, this.state);
    this.enterRule(localContext, 186, KotlinParser.RULE_postfixUnarySuffix);
    try {
      this.state = 2342;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 348, this.context)) {
        case 1:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 2337;
            this.postfixUnaryOperator();
          }
          break;
        case 2:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 2338;
            this.typeArguments();
          }
          break;
        case 3:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 2339;
            this.callSuffix();
          }
          break;
        case 4:
          this.enterOuterAlt(localContext, 4);
          {
            this.state = 2340;
            this.indexingSuffix();
          }
          break;
        case 5:
          this.enterOuterAlt(localContext, 5);
          {
            this.state = 2341;
            this.navigationSuffix();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public directlyAssignableExpression(): DirectlyAssignableExpressionContext {
    const localContext = new DirectlyAssignableExpressionContext(this.context, this.state);
    this.enterRule(localContext, 188, KotlinParser.RULE_directlyAssignableExpression);
    try {
      this.state = 2349;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 349, this.context)) {
        case 1:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 2344;
            this.postfixUnaryExpression();
            this.state = 2345;
            this.assignableSuffix();
          }
          break;
        case 2:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 2347;
            this.simpleIdentifier();
          }
          break;
        case 3:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 2348;
            this.parenthesizedDirectlyAssignableExpression();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public parenthesizedDirectlyAssignableExpression(): ParenthesizedDirectlyAssignableExpressionContext {
    const localContext = new ParenthesizedDirectlyAssignableExpressionContext(this.context, this.state);
    this.enterRule(localContext, 190, KotlinParser.RULE_parenthesizedDirectlyAssignableExpression);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2351;
      this.match(KotlinParser.LPAREN);
      this.state = 2355;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 350, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2352;
          this.match(KotlinParser.NL);
        }
        this.state = 2357;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 350, this.context);
      }
      this.state = 2358;
      this.directlyAssignableExpression();
      this.state = 2362;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2359;
        this.match(KotlinParser.NL);
        this.state = 2364;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2365;
      this.match(KotlinParser.RPAREN);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public assignableExpression(): AssignableExpressionContext {
    const localContext = new AssignableExpressionContext(this.context, this.state);
    this.enterRule(localContext, 192, KotlinParser.RULE_assignableExpression);
    try {
      this.state = 2369;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 352, this.context)) {
        case 1:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 2367;
            this.prefixUnaryExpression();
          }
          break;
        case 2:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 2368;
            this.parenthesizedAssignableExpression();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public parenthesizedAssignableExpression(): ParenthesizedAssignableExpressionContext {
    const localContext = new ParenthesizedAssignableExpressionContext(this.context, this.state);
    this.enterRule(localContext, 194, KotlinParser.RULE_parenthesizedAssignableExpression);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2371;
      this.match(KotlinParser.LPAREN);
      this.state = 2375;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 353, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2372;
          this.match(KotlinParser.NL);
        }
        this.state = 2377;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 353, this.context);
      }
      this.state = 2378;
      this.assignableExpression();
      this.state = 2382;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2379;
        this.match(KotlinParser.NL);
        this.state = 2384;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2385;
      this.match(KotlinParser.RPAREN);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public assignableSuffix(): AssignableSuffixContext {
    const localContext = new AssignableSuffixContext(this.context, this.state);
    this.enterRule(localContext, 196, KotlinParser.RULE_assignableSuffix);
    try {
      this.state = 2390;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.LANGLE:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 2387;
            this.typeArguments();
          }
          break;
        case KotlinParser.LSQUARE:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 2388;
            this.indexingSuffix();
          }
          break;
        case KotlinParser.NL:
        case KotlinParser.DOT:
        case KotlinParser.COLONCOLON:
        case KotlinParser.QUEST_NO_WS:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 2389;
            this.navigationSuffix();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public indexingSuffix(): IndexingSuffixContext {
    const localContext = new IndexingSuffixContext(this.context, this.state);
    this.enterRule(localContext, 198, KotlinParser.RULE_indexingSuffix);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2392;
      this.match(KotlinParser.LSQUARE);
      this.state = 2396;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 356, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2393;
          this.match(KotlinParser.NL);
        }
        this.state = 2398;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 356, this.context);
      }
      this.state = 2399;
      this.expression();
      this.state = 2416;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 359, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2403;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 2400;
            this.match(KotlinParser.NL);
            this.state = 2405;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 2406;
          this.match(KotlinParser.COMMA);
          this.state = 2410;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 358, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 2407;
              this.match(KotlinParser.NL);
            }
            this.state = 2412;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 358, this.context);
          }
          this.state = 2413;
          this.expression();
        }
        this.state = 2418;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 359, this.context);
      }
      this.state = 2426;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 361, this.context)) {
        case 1:
          {
            this.state = 2422;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2419;
              this.match(KotlinParser.NL);
              this.state = 2424;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2425;
            this.match(KotlinParser.COMMA);
          }
          break;
      }
      this.state = 2431;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2428;
        this.match(KotlinParser.NL);
        this.state = 2433;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2434;
      this.match(KotlinParser.RSQUARE);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public navigationSuffix(): NavigationSuffixContext {
    const localContext = new NavigationSuffixContext(this.context, this.state);
    this.enterRule(localContext, 200, KotlinParser.RULE_navigationSuffix);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 2436;
      this.memberAccessOperator();
      this.state = 2440;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2437;
        this.match(KotlinParser.NL);
        this.state = 2442;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2446;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.WHERE:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.Identifier:
          {
            this.state = 2443;
            this.simpleIdentifier();
          }
          break;
        case KotlinParser.LPAREN:
          {
            this.state = 2444;
            this.parenthesizedExpression();
          }
          break;
        case KotlinParser.CLASS:
          {
            this.state = 2445;
            this.match(KotlinParser.CLASS);
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public callSuffix(): CallSuffixContext {
    const localContext = new CallSuffixContext(this.context, this.state);
    this.enterRule(localContext, 202, KotlinParser.RULE_callSuffix);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 2449;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 47) {
        this.state = 2448;
        this.typeArguments();
      }

      this.state = 2456;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 367, this.context)) {
        case 1:
          {
            this.state = 2452;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 9) {
              this.state = 2451;
              this.valueArguments();
            }

            this.state = 2454;
            this.annotatedLambda();
          }
          break;
        case 2:
          {
            this.state = 2455;
            this.valueArguments();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public annotatedLambda(): AnnotatedLambdaContext {
    const localContext = new AnnotatedLambdaContext(this.context, this.state);
    this.enterRule(localContext, 204, KotlinParser.RULE_annotatedLambda);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 2461;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 41 || _la === 43) {
        this.state = 2458;
        this.annotation();
        this.state = 2463;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2465;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (
        (((_la - 63) & ~0x1f) === 0 && ((1 << (_la - 63)) & 3258713599) !== 0) ||
        (((_la - 107) & ~0x1f) === 0 && ((1 << (_la - 107)) & 1073741823) !== 0) ||
        _la === 148
      ) {
        this.state = 2464;
        this.label();
      }

      this.state = 2470;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2467;
        this.match(KotlinParser.NL);
        this.state = 2472;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2473;
      this.lambdaLiteral();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeArguments(): TypeArgumentsContext {
    const localContext = new TypeArgumentsContext(this.context, this.state);
    this.enterRule(localContext, 206, KotlinParser.RULE_typeArguments);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2475;
      this.match(KotlinParser.LANGLE);
      this.state = 2479;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2476;
        this.match(KotlinParser.NL);
        this.state = 2481;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2482;
      this.typeProjection();
      this.state = 2499;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 374, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2486;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 2483;
            this.match(KotlinParser.NL);
            this.state = 2488;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 2489;
          this.match(KotlinParser.COMMA);
          this.state = 2493;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 2490;
            this.match(KotlinParser.NL);
            this.state = 2495;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 2496;
          this.typeProjection();
        }
        this.state = 2501;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 374, this.context);
      }
      this.state = 2509;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 376, this.context)) {
        case 1:
          {
            this.state = 2505;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2502;
              this.match(KotlinParser.NL);
              this.state = 2507;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2508;
            this.match(KotlinParser.COMMA);
          }
          break;
      }
      this.state = 2514;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2511;
        this.match(KotlinParser.NL);
        this.state = 2516;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2517;
      this.match(KotlinParser.RANGLE);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public valueArguments(): ValueArgumentsContext {
    const localContext = new ValueArgumentsContext(this.context, this.state);
    this.enterRule(localContext, 208, KotlinParser.RULE_valueArguments);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2519;
      this.match(KotlinParser.LPAREN);
      this.state = 2523;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 378, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2520;
          this.match(KotlinParser.NL);
        }
        this.state = 2525;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 378, this.context);
      }
      this.state = 2561;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (
        ((_la & ~0x1f) === 0 && ((1 << _la) & 54307360) !== 0) ||
        (((_la - 38) & ~0x1f) === 0 && ((1 << (_la - 38)) & 4293918761) !== 0) ||
        (((_la - 70) & ~0x1f) === 0 && ((1 << (_la - 70)) & 4058904779) !== 0) ||
        (((_la - 107) & ~0x1f) === 0 && ((1 << (_la - 107)) & 2147483647) !== 0) ||
        (((_la - 140) & ~0x1f) === 0 && ((1 << (_la - 140)) & 6655) !== 0)
      ) {
        this.state = 2526;
        this.valueArgument();
        this.state = 2543;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 381, this.context);
        while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
          if (alternative === 1) {
            this.state = 2530;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2527;
              this.match(KotlinParser.NL);
              this.state = 2532;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2533;
            this.match(KotlinParser.COMMA);
            this.state = 2537;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 380, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 2534;
                this.match(KotlinParser.NL);
              }
              this.state = 2539;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 380, this.context);
            }
            this.state = 2540;
            this.valueArgument();
          }
          this.state = 2545;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 381, this.context);
        }
        this.state = 2553;
        this.errorHandler.sync(this);
        switch (this.interpreter.adaptivePredict(this.tokenStream, 383, this.context)) {
          case 1:
            {
              this.state = 2549;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
              while (_la === 5) {
                this.state = 2546;
                this.match(KotlinParser.NL);
                this.state = 2551;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
              }
              this.state = 2552;
              this.match(KotlinParser.COMMA);
            }
            break;
        }
        this.state = 2558;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
        while (_la === 5) {
          this.state = 2555;
          this.match(KotlinParser.NL);
          this.state = 2560;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
        }
      }

      this.state = 2563;
      this.match(KotlinParser.RPAREN);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public valueArgument(): ValueArgumentContext {
    const localContext = new ValueArgumentContext(this.context, this.state);
    this.enterRule(localContext, 210, KotlinParser.RULE_valueArgument);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2566;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 386, this.context)) {
        case 1:
          {
            this.state = 2565;
            this.annotation();
          }
          break;
      }
      this.state = 2571;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 387, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2568;
          this.match(KotlinParser.NL);
        }
        this.state = 2573;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 387, this.context);
      }
      this.state = 2588;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 390, this.context)) {
        case 1:
          {
            this.state = 2574;
            this.simpleIdentifier();
            this.state = 2578;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2575;
              this.match(KotlinParser.NL);
              this.state = 2580;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2581;
            this.match(KotlinParser.ASSIGNMENT);
            this.state = 2585;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 389, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 2582;
                this.match(KotlinParser.NL);
              }
              this.state = 2587;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 389, this.context);
            }
          }
          break;
      }
      this.state = 2591;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 15) {
        this.state = 2590;
        this.match(KotlinParser.MULT);
      }

      this.state = 2596;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 392, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2593;
          this.match(KotlinParser.NL);
        }
        this.state = 2598;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 392, this.context);
      }
      this.state = 2599;
      this.expression();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public primaryExpression(): PrimaryExpressionContext {
    const localContext = new PrimaryExpressionContext(this.context, this.state);
    this.enterRule(localContext, 212, KotlinParser.RULE_primaryExpression);
    try {
      this.state = 2615;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 393, this.context)) {
        case 1:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 2601;
            this.parenthesizedExpression();
          }
          break;
        case 2:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 2602;
            this.simpleIdentifier();
          }
          break;
        case 3:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 2603;
            this.literalConstant();
          }
          break;
        case 4:
          this.enterOuterAlt(localContext, 4);
          {
            this.state = 2604;
            this.stringLiteral();
          }
          break;
        case 5:
          this.enterOuterAlt(localContext, 5);
          {
            this.state = 2605;
            this.callableReference();
          }
          break;
        case 6:
          this.enterOuterAlt(localContext, 6);
          {
            this.state = 2606;
            this.functionLiteral();
          }
          break;
        case 7:
          this.enterOuterAlt(localContext, 7);
          {
            this.state = 2607;
            this.objectLiteral();
          }
          break;
        case 8:
          this.enterOuterAlt(localContext, 8);
          {
            this.state = 2608;
            this.collectionLiteral();
          }
          break;
        case 9:
          this.enterOuterAlt(localContext, 9);
          {
            this.state = 2609;
            this.thisExpression();
          }
          break;
        case 10:
          this.enterOuterAlt(localContext, 10);
          {
            this.state = 2610;
            this.superExpression();
          }
          break;
        case 11:
          this.enterOuterAlt(localContext, 11);
          {
            this.state = 2611;
            this.ifExpression();
          }
          break;
        case 12:
          this.enterOuterAlt(localContext, 12);
          {
            this.state = 2612;
            this.whenExpression();
          }
          break;
        case 13:
          this.enterOuterAlt(localContext, 13);
          {
            this.state = 2613;
            this.tryExpression();
          }
          break;
        case 14:
          this.enterOuterAlt(localContext, 14);
          {
            this.state = 2614;
            this.jumpExpression();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public parenthesizedExpression(): ParenthesizedExpressionContext {
    const localContext = new ParenthesizedExpressionContext(this.context, this.state);
    this.enterRule(localContext, 214, KotlinParser.RULE_parenthesizedExpression);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2617;
      this.match(KotlinParser.LPAREN);
      this.state = 2621;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 394, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2618;
          this.match(KotlinParser.NL);
        }
        this.state = 2623;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 394, this.context);
      }
      this.state = 2624;
      this.expression();
      this.state = 2628;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2625;
        this.match(KotlinParser.NL);
        this.state = 2630;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2631;
      this.match(KotlinParser.RPAREN);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public collectionLiteral(): CollectionLiteralContext {
    const localContext = new CollectionLiteralContext(this.context, this.state);
    this.enterRule(localContext, 216, KotlinParser.RULE_collectionLiteral);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2633;
      this.match(KotlinParser.LSQUARE);
      this.state = 2637;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 396, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2634;
          this.match(KotlinParser.NL);
        }
        this.state = 2639;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 396, this.context);
      }
      this.state = 2675;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (
        ((_la & ~0x1f) === 0 && ((1 << _la) & 54274592) !== 0) ||
        (((_la - 38) & ~0x1f) === 0 && ((1 << (_la - 38)) & 4293918761) !== 0) ||
        (((_la - 70) & ~0x1f) === 0 && ((1 << (_la - 70)) & 4058904779) !== 0) ||
        (((_la - 107) & ~0x1f) === 0 && ((1 << (_la - 107)) & 2147483647) !== 0) ||
        (((_la - 140) & ~0x1f) === 0 && ((1 << (_la - 140)) & 6655) !== 0)
      ) {
        this.state = 2640;
        this.expression();
        this.state = 2657;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 399, this.context);
        while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
          if (alternative === 1) {
            this.state = 2644;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2641;
              this.match(KotlinParser.NL);
              this.state = 2646;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2647;
            this.match(KotlinParser.COMMA);
            this.state = 2651;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 398, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 2648;
                this.match(KotlinParser.NL);
              }
              this.state = 2653;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 398, this.context);
            }
            this.state = 2654;
            this.expression();
          }
          this.state = 2659;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 399, this.context);
        }
        this.state = 2667;
        this.errorHandler.sync(this);
        switch (this.interpreter.adaptivePredict(this.tokenStream, 401, this.context)) {
          case 1:
            {
              this.state = 2663;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
              while (_la === 5) {
                this.state = 2660;
                this.match(KotlinParser.NL);
                this.state = 2665;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
              }
              this.state = 2666;
              this.match(KotlinParser.COMMA);
            }
            break;
        }
        this.state = 2672;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
        while (_la === 5) {
          this.state = 2669;
          this.match(KotlinParser.NL);
          this.state = 2674;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
        }
      }

      this.state = 2677;
      this.match(KotlinParser.RSQUARE);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public literalConstant(): LiteralConstantContext {
    const localContext = new LiteralConstantContext(this.context, this.state);
    this.enterRule(localContext, 218, KotlinParser.RULE_literalConstant);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 2679;
      _la = this.tokenStream.LA(1);
      if (!(((_la - 137) & ~0x1f) === 0 && ((1 << (_la - 137)) & 2041) !== 0)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public stringLiteral(): StringLiteralContext {
    const localContext = new StringLiteralContext(this.context, this.state);
    this.enterRule(localContext, 220, KotlinParser.RULE_stringLiteral);
    try {
      this.state = 2683;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.QUOTE_OPEN:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 2681;
            this.lineStringLiteral();
          }
          break;
        case KotlinParser.TRIPLE_QUOTE_OPEN:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 2682;
            this.multiLineStringLiteral();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public lineStringLiteral(): LineStringLiteralContext {
    const localContext = new LineStringLiteralContext(this.context, this.state);
    this.enterRule(localContext, 222, KotlinParser.RULE_lineStringLiteral);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 2685;
      this.match(KotlinParser.QUOTE_OPEN);
      this.state = 2690;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (((_la - 161) & ~0x1f) === 0 && ((1 << (_la - 161)) & 15) !== 0) {
        this.state = 2688;
        this.errorHandler.sync(this);
        switch (this.tokenStream.LA(1)) {
          case KotlinParser.LineStrRef:
          case KotlinParser.LineStrText:
          case KotlinParser.LineStrEscapedChar:
            {
              this.state = 2686;
              this.lineStringContent();
            }
            break;
          case KotlinParser.LineStrExprStart:
            {
              this.state = 2687;
              this.lineStringExpression();
            }
            break;
          default:
            throw new antlr.NoViableAltException(this);
        }
        this.state = 2692;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2693;
      this.match(KotlinParser.QUOTE_CLOSE);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public multiLineStringLiteral(): MultiLineStringLiteralContext {
    const localContext = new MultiLineStringLiteralContext(this.context, this.state);
    this.enterRule(localContext, 224, KotlinParser.RULE_multiLineStringLiteral);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 2695;
      this.match(KotlinParser.TRIPLE_QUOTE_OPEN);
      this.state = 2701;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (((_la - 166) & ~0x1f) === 0 && ((1 << (_la - 166)) & 15) !== 0) {
        this.state = 2699;
        this.errorHandler.sync(this);
        switch (this.interpreter.adaptivePredict(this.tokenStream, 407, this.context)) {
          case 1:
            {
              this.state = 2696;
              this.multiLineStringContent();
            }
            break;
          case 2:
            {
              this.state = 2697;
              this.multiLineStringExpression();
            }
            break;
          case 3:
            {
              this.state = 2698;
              this.match(KotlinParser.MultiLineStringQuote);
            }
            break;
        }
        this.state = 2703;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2704;
      this.match(KotlinParser.TRIPLE_QUOTE_CLOSE);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public lineStringContent(): LineStringContentContext {
    const localContext = new LineStringContentContext(this.context, this.state);
    this.enterRule(localContext, 226, KotlinParser.RULE_lineStringContent);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 2706;
      _la = this.tokenStream.LA(1);
      if (!(((_la - 161) & ~0x1f) === 0 && ((1 << (_la - 161)) & 7) !== 0)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public lineStringExpression(): LineStringExpressionContext {
    const localContext = new LineStringExpressionContext(this.context, this.state);
    this.enterRule(localContext, 228, KotlinParser.RULE_lineStringExpression);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2708;
      this.match(KotlinParser.LineStrExprStart);
      this.state = 2712;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 409, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2709;
          this.match(KotlinParser.NL);
        }
        this.state = 2714;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 409, this.context);
      }
      this.state = 2715;
      this.expression();
      this.state = 2719;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2716;
        this.match(KotlinParser.NL);
        this.state = 2721;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2722;
      this.match(KotlinParser.RCURL);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public multiLineStringContent(): MultiLineStringContentContext {
    const localContext = new MultiLineStringContentContext(this.context, this.state);
    this.enterRule(localContext, 230, KotlinParser.RULE_multiLineStringContent);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 2724;
      _la = this.tokenStream.LA(1);
      if (!(((_la - 166) & ~0x1f) === 0 && ((1 << (_la - 166)) & 7) !== 0)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public multiLineStringExpression(): MultiLineStringExpressionContext {
    const localContext = new MultiLineStringExpressionContext(this.context, this.state);
    this.enterRule(localContext, 232, KotlinParser.RULE_multiLineStringExpression);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2726;
      this.match(KotlinParser.MultiLineStrExprStart);
      this.state = 2730;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 411, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2727;
          this.match(KotlinParser.NL);
        }
        this.state = 2732;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 411, this.context);
      }
      this.state = 2733;
      this.expression();
      this.state = 2737;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2734;
        this.match(KotlinParser.NL);
        this.state = 2739;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2740;
      this.match(KotlinParser.RCURL);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public lambdaLiteral(): LambdaLiteralContext {
    const localContext = new LambdaLiteralContext(this.context, this.state);
    this.enterRule(localContext, 234, KotlinParser.RULE_lambdaLiteral);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2742;
      this.match(KotlinParser.LCURL);
      this.state = 2746;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 413, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2743;
          this.match(KotlinParser.NL);
        }
        this.state = 2748;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 413, this.context);
      }
      this.state = 2765;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 417, this.context)) {
        case 1:
          {
            this.state = 2750;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 414, this.context)) {
              case 1:
                {
                  this.state = 2749;
                  this.lambdaParameters();
                }
                break;
            }
            this.state = 2755;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2752;
              this.match(KotlinParser.NL);
              this.state = 2757;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2758;
            this.match(KotlinParser.ARROW);
            this.state = 2762;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 416, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 2759;
                this.match(KotlinParser.NL);
              }
              this.state = 2764;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 416, this.context);
            }
          }
          break;
      }
      this.state = 2767;
      this.statements();
      this.state = 2771;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2768;
        this.match(KotlinParser.NL);
        this.state = 2773;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2774;
      this.match(KotlinParser.RCURL);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public lambdaParameters(): LambdaParametersContext {
    const localContext = new LambdaParametersContext(this.context, this.state);
    this.enterRule(localContext, 236, KotlinParser.RULE_lambdaParameters);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2776;
      this.lambdaParameter();
      this.state = 2793;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 421, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2780;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 2777;
            this.match(KotlinParser.NL);
            this.state = 2782;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 2783;
          this.match(KotlinParser.COMMA);
          this.state = 2787;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 420, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 2784;
              this.match(KotlinParser.NL);
            }
            this.state = 2789;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 420, this.context);
          }
          this.state = 2790;
          this.lambdaParameter();
        }
        this.state = 2795;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 421, this.context);
      }
      this.state = 2803;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 423, this.context)) {
        case 1:
          {
            this.state = 2799;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2796;
              this.match(KotlinParser.NL);
              this.state = 2801;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2802;
            this.match(KotlinParser.COMMA);
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public lambdaParameter(): LambdaParameterContext {
    const localContext = new LambdaParameterContext(this.context, this.state);
    this.enterRule(localContext, 238, KotlinParser.RULE_lambdaParameter);
    let _la: number;
    try {
      this.state = 2823;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.NL:
        case KotlinParser.AT_NO_WS:
        case KotlinParser.AT_PRE_WS:
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.WHERE:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.Identifier:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 2805;
            this.variableDeclaration();
          }
          break;
        case KotlinParser.LPAREN:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 2806;
            this.multiVariableDeclaration();
            this.state = 2821;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 426, this.context)) {
              case 1:
                {
                  this.state = 2810;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  while (_la === 5) {
                    this.state = 2807;
                    this.match(KotlinParser.NL);
                    this.state = 2812;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                  }
                  this.state = 2813;
                  this.match(KotlinParser.COLON);
                  this.state = 2817;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  while (_la === 5) {
                    this.state = 2814;
                    this.match(KotlinParser.NL);
                    this.state = 2819;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                  }
                  this.state = 2820;
                  this.type_();
                }
                break;
            }
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public anonymousFunction(): AnonymousFunctionContext {
    const localContext = new AnonymousFunctionContext(this.context, this.state);
    this.enterRule(localContext, 240, KotlinParser.RULE_anonymousFunction);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 2826;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 124) {
        this.state = 2825;
        this.match(KotlinParser.SUSPEND);
      }

      this.state = 2831;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2828;
        this.match(KotlinParser.NL);
        this.state = 2833;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2834;
      this.match(KotlinParser.FUN);
      this.state = 2850;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 432, this.context)) {
        case 1:
          {
            this.state = 2838;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2835;
              this.match(KotlinParser.NL);
              this.state = 2840;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2841;
            this.type_();
            this.state = 2845;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2842;
              this.match(KotlinParser.NL);
              this.state = 2847;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2848;
            this.match(KotlinParser.DOT);
          }
          break;
      }
      this.state = 2855;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2852;
        this.match(KotlinParser.NL);
        this.state = 2857;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2858;
      this.parametersWithOptionalType();
      this.state = 2873;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 436, this.context)) {
        case 1:
          {
            this.state = 2862;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2859;
              this.match(KotlinParser.NL);
              this.state = 2864;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2865;
            this.match(KotlinParser.COLON);
            this.state = 2869;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2866;
              this.match(KotlinParser.NL);
              this.state = 2871;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2872;
            this.type_();
          }
          break;
      }
      this.state = 2882;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 438, this.context)) {
        case 1:
          {
            this.state = 2878;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2875;
              this.match(KotlinParser.NL);
              this.state = 2880;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2881;
            this.typeConstraints();
          }
          break;
      }
      this.state = 2891;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 440, this.context)) {
        case 1:
          {
            this.state = 2887;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2884;
              this.match(KotlinParser.NL);
              this.state = 2889;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2890;
            this.functionBody();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public functionLiteral(): FunctionLiteralContext {
    const localContext = new FunctionLiteralContext(this.context, this.state);
    this.enterRule(localContext, 242, KotlinParser.RULE_functionLiteral);
    try {
      this.state = 2895;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.LCURL:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 2893;
            this.lambdaLiteral();
          }
          break;
        case KotlinParser.NL:
        case KotlinParser.FUN:
        case KotlinParser.SUSPEND:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 2894;
            this.anonymousFunction();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public objectLiteral(): ObjectLiteralContext {
    const localContext = new ObjectLiteralContext(this.context, this.state);
    this.enterRule(localContext, 244, KotlinParser.RULE_objectLiteral);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2898;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 116) {
        this.state = 2897;
        this.match(KotlinParser.DATA);
      }

      this.state = 2903;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2900;
        this.match(KotlinParser.NL);
        this.state = 2905;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2906;
      this.match(KotlinParser.OBJECT);
      this.state = 2927;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 447, this.context)) {
        case 1:
          {
            this.state = 2910;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2907;
              this.match(KotlinParser.NL);
              this.state = 2912;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2913;
            this.match(KotlinParser.COLON);
            this.state = 2917;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 445, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 2914;
                this.match(KotlinParser.NL);
              }
              this.state = 2919;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 445, this.context);
            }
            this.state = 2920;
            this.delegationSpecifiers();
            this.state = 2924;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 446, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 2921;
                this.match(KotlinParser.NL);
              }
              this.state = 2926;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 446, this.context);
            }
          }
          break;
      }
      this.state = 2936;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 449, this.context)) {
        case 1:
          {
            this.state = 2932;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 2929;
              this.match(KotlinParser.NL);
              this.state = 2934;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 2935;
            this.classBody();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public thisExpression(): ThisExpressionContext {
    const localContext = new ThisExpressionContext(this.context, this.state);
    this.enterRule(localContext, 246, KotlinParser.RULE_thisExpression);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 2938;
      _la = this.tokenStream.LA(1);
      if (!(_la === 61 || _la === 85)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public superExpression(): SuperExpressionContext {
    const localContext = new SuperExpressionContext(this.context, this.state);
    this.enterRule(localContext, 248, KotlinParser.RULE_superExpression);
    let _la: number;
    try {
      this.state = 2964;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.SUPER:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 2940;
            this.match(KotlinParser.SUPER);
            this.state = 2957;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 452, this.context)) {
              case 1:
                {
                  this.state = 2941;
                  this.match(KotlinParser.LANGLE);
                  this.state = 2945;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  while (_la === 5) {
                    this.state = 2942;
                    this.match(KotlinParser.NL);
                    this.state = 2947;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                  }
                  this.state = 2948;
                  this.type_();
                  this.state = 2952;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  while (_la === 5) {
                    this.state = 2949;
                    this.match(KotlinParser.NL);
                    this.state = 2954;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                  }
                  this.state = 2955;
                  this.match(KotlinParser.RANGLE);
                }
                break;
            }
            this.state = 2961;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 453, this.context)) {
              case 1:
                {
                  this.state = 2959;
                  this.match(KotlinParser.AT_NO_WS);
                  this.state = 2960;
                  this.simpleIdentifier();
                }
                break;
            }
          }
          break;
        case KotlinParser.SUPER_AT:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 2963;
            this.match(KotlinParser.SUPER_AT);
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public ifExpression(): IfExpressionContext {
    const localContext = new IfExpressionContext(this.context, this.state);
    this.enterRule(localContext, 250, KotlinParser.RULE_ifExpression);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 2966;
      this.match(KotlinParser.IF);
      this.state = 2970;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2967;
        this.match(KotlinParser.NL);
        this.state = 2972;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2973;
      this.match(KotlinParser.LPAREN);
      this.state = 2977;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 456, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2974;
          this.match(KotlinParser.NL);
        }
        this.state = 2979;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 456, this.context);
      }
      this.state = 2980;
      this.expression();
      this.state = 2984;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 2981;
        this.match(KotlinParser.NL);
        this.state = 2986;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 2987;
      this.match(KotlinParser.RPAREN);
      this.state = 2991;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 458, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 2988;
          this.match(KotlinParser.NL);
        }
        this.state = 2993;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 458, this.context);
      }
      this.state = 3025;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 465, this.context)) {
        case 1:
          {
            this.state = 2994;
            this.controlStructureBody();
          }
          break;
        case 2:
          {
            this.state = 2996;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 459, this.context)) {
              case 1:
                {
                  this.state = 2995;
                  this.controlStructureBody();
                }
                break;
            }
            this.state = 3001;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 460, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 2998;
                this.match(KotlinParser.NL);
              }
              this.state = 3003;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 460, this.context);
            }
            this.state = 3005;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 27) {
              this.state = 3004;
              this.match(KotlinParser.SEMICOLON);
            }

            this.state = 3010;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 3007;
              this.match(KotlinParser.NL);
              this.state = 3012;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 3013;
            this.match(KotlinParser.ELSE);
            this.state = 3017;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 463, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 3014;
                this.match(KotlinParser.NL);
              }
              this.state = 3019;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 463, this.context);
            }
            this.state = 3022;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
              case KotlinParser.NL:
              case KotlinParser.LPAREN:
              case KotlinParser.LSQUARE:
              case KotlinParser.LCURL:
              case KotlinParser.ADD:
              case KotlinParser.SUB:
              case KotlinParser.INCR:
              case KotlinParser.DECR:
              case KotlinParser.EXCL_WS:
              case KotlinParser.EXCL_NO_WS:
              case KotlinParser.COLONCOLON:
              case KotlinParser.AT_NO_WS:
              case KotlinParser.AT_PRE_WS:
              case KotlinParser.RETURN_AT:
              case KotlinParser.CONTINUE_AT:
              case KotlinParser.BREAK_AT:
              case KotlinParser.THIS_AT:
              case KotlinParser.SUPER_AT:
              case KotlinParser.FILE:
              case KotlinParser.FIELD:
              case KotlinParser.PROPERTY:
              case KotlinParser.GET:
              case KotlinParser.SET:
              case KotlinParser.RECEIVER:
              case KotlinParser.PARAM:
              case KotlinParser.SETPARAM:
              case KotlinParser.DELEGATE:
              case KotlinParser.IMPORT:
              case KotlinParser.CLASS:
              case KotlinParser.INTERFACE:
              case KotlinParser.FUN:
              case KotlinParser.OBJECT:
              case KotlinParser.VAL:
              case KotlinParser.VAR:
              case KotlinParser.TYPE_ALIAS:
              case KotlinParser.CONSTRUCTOR:
              case KotlinParser.BY:
              case KotlinParser.COMPANION:
              case KotlinParser.INIT:
              case KotlinParser.THIS:
              case KotlinParser.SUPER:
              case KotlinParser.WHERE:
              case KotlinParser.IF:
              case KotlinParser.WHEN:
              case KotlinParser.TRY:
              case KotlinParser.CATCH:
              case KotlinParser.FINALLY:
              case KotlinParser.FOR:
              case KotlinParser.DO:
              case KotlinParser.WHILE:
              case KotlinParser.THROW:
              case KotlinParser.RETURN:
              case KotlinParser.CONTINUE:
              case KotlinParser.BREAK:
              case KotlinParser.OUT:
              case KotlinParser.DYNAMIC:
              case KotlinParser.PUBLIC:
              case KotlinParser.PRIVATE:
              case KotlinParser.PROTECTED:
              case KotlinParser.INTERNAL:
              case KotlinParser.ENUM:
              case KotlinParser.SEALED:
              case KotlinParser.ANNOTATION:
              case KotlinParser.DATA:
              case KotlinParser.INNER:
              case KotlinParser.VALUE:
              case KotlinParser.TAILREC:
              case KotlinParser.OPERATOR:
              case KotlinParser.INLINE:
              case KotlinParser.INFIX:
              case KotlinParser.EXTERNAL:
              case KotlinParser.SUSPEND:
              case KotlinParser.OVERRIDE:
              case KotlinParser.ABSTRACT:
              case KotlinParser.FINAL:
              case KotlinParser.OPEN:
              case KotlinParser.CONST:
              case KotlinParser.LATEINIT:
              case KotlinParser.VARARG:
              case KotlinParser.NOINLINE:
              case KotlinParser.CROSSINLINE:
              case KotlinParser.REIFIED:
              case KotlinParser.EXPECT:
              case KotlinParser.ACTUAL:
              case KotlinParser.RealLiteral:
              case KotlinParser.IntegerLiteral:
              case KotlinParser.HexLiteral:
              case KotlinParser.BinLiteral:
              case KotlinParser.UnsignedLiteral:
              case KotlinParser.LongLiteral:
              case KotlinParser.BooleanLiteral:
              case KotlinParser.NullLiteral:
              case KotlinParser.CharacterLiteral:
              case KotlinParser.Identifier:
              case KotlinParser.QUOTE_OPEN:
              case KotlinParser.TRIPLE_QUOTE_OPEN:
                {
                  this.state = 3020;
                  this.controlStructureBody();
                }
                break;
              case KotlinParser.SEMICOLON:
                {
                  this.state = 3021;
                  this.match(KotlinParser.SEMICOLON);
                }
                break;
              default:
                throw new antlr.NoViableAltException(this);
            }
          }
          break;
        case 3:
          {
            this.state = 3024;
            this.match(KotlinParser.SEMICOLON);
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public whenSubject(): WhenSubjectContext {
    const localContext = new WhenSubjectContext(this.context, this.state);
    this.enterRule(localContext, 252, KotlinParser.RULE_whenSubject);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 3027;
      this.match(KotlinParser.LPAREN);
      this.state = 3061;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 471, this.context)) {
        case 1:
          {
            this.state = 3031;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 41 || _la === 43) {
              this.state = 3028;
              this.annotation();
              this.state = 3033;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 3037;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 3034;
              this.match(KotlinParser.NL);
              this.state = 3039;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 3040;
            this.match(KotlinParser.VAL);
            this.state = 3044;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 468, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 3041;
                this.match(KotlinParser.NL);
              }
              this.state = 3046;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 468, this.context);
            }
            this.state = 3047;
            this.variableDeclaration();
            this.state = 3051;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 3048;
              this.match(KotlinParser.NL);
              this.state = 3053;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 3054;
            this.match(KotlinParser.ASSIGNMENT);
            this.state = 3058;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 470, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 3055;
                this.match(KotlinParser.NL);
              }
              this.state = 3060;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 470, this.context);
            }
          }
          break;
      }
      this.state = 3063;
      this.expression();
      this.state = 3064;
      this.match(KotlinParser.RPAREN);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public whenExpression(): WhenExpressionContext {
    const localContext = new WhenExpressionContext(this.context, this.state);
    this.enterRule(localContext, 254, KotlinParser.RULE_whenExpression);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 3066;
      this.match(KotlinParser.WHEN);
      this.state = 3070;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 472, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 3067;
          this.match(KotlinParser.NL);
        }
        this.state = 3072;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 472, this.context);
      }
      this.state = 3074;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 9) {
        this.state = 3073;
        this.whenSubject();
      }

      this.state = 3079;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 3076;
        this.match(KotlinParser.NL);
        this.state = 3081;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 3082;
      this.match(KotlinParser.LCURL);
      this.state = 3086;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 475, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 3083;
          this.match(KotlinParser.NL);
        }
        this.state = 3088;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 475, this.context);
      }
      this.state = 3098;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 477, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 3089;
          this.whenEntry();
          this.state = 3093;
          this.errorHandler.sync(this);
          alternative = this.interpreter.adaptivePredict(this.tokenStream, 476, this.context);
          while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
            if (alternative === 1) {
              this.state = 3090;
              this.match(KotlinParser.NL);
            }
            this.state = 3095;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 476, this.context);
          }
        }
        this.state = 3100;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 477, this.context);
      }
      this.state = 3104;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 3101;
        this.match(KotlinParser.NL);
        this.state = 3106;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 3107;
      this.match(KotlinParser.RCURL);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public whenEntry(): WhenEntryContext {
    const localContext = new WhenEntryContext(this.context, this.state);
    this.enterRule(localContext, 256, KotlinParser.RULE_whenEntry);
    let _la: number;
    try {
      let alternative: number;
      this.state = 3173;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.NL:
        case KotlinParser.LPAREN:
        case KotlinParser.LSQUARE:
        case KotlinParser.LCURL:
        case KotlinParser.ADD:
        case KotlinParser.SUB:
        case KotlinParser.INCR:
        case KotlinParser.DECR:
        case KotlinParser.EXCL_WS:
        case KotlinParser.EXCL_NO_WS:
        case KotlinParser.COLONCOLON:
        case KotlinParser.AT_NO_WS:
        case KotlinParser.AT_PRE_WS:
        case KotlinParser.RETURN_AT:
        case KotlinParser.CONTINUE_AT:
        case KotlinParser.BREAK_AT:
        case KotlinParser.THIS_AT:
        case KotlinParser.SUPER_AT:
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.FUN:
        case KotlinParser.OBJECT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.THIS:
        case KotlinParser.SUPER:
        case KotlinParser.WHERE:
        case KotlinParser.IF:
        case KotlinParser.WHEN:
        case KotlinParser.TRY:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.THROW:
        case KotlinParser.RETURN:
        case KotlinParser.CONTINUE:
        case KotlinParser.BREAK:
        case KotlinParser.IS:
        case KotlinParser.IN:
        case KotlinParser.NOT_IS:
        case KotlinParser.NOT_IN:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.RealLiteral:
        case KotlinParser.IntegerLiteral:
        case KotlinParser.HexLiteral:
        case KotlinParser.BinLiteral:
        case KotlinParser.UnsignedLiteral:
        case KotlinParser.LongLiteral:
        case KotlinParser.BooleanLiteral:
        case KotlinParser.NullLiteral:
        case KotlinParser.CharacterLiteral:
        case KotlinParser.Identifier:
        case KotlinParser.QUOTE_OPEN:
        case KotlinParser.TRIPLE_QUOTE_OPEN:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 3109;
            this.whenCondition();
            this.state = 3126;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 481, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 3113;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 5) {
                  this.state = 3110;
                  this.match(KotlinParser.NL);
                  this.state = 3115;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                }
                this.state = 3116;
                this.match(KotlinParser.COMMA);
                this.state = 3120;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 480, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                  if (alternative === 1) {
                    this.state = 3117;
                    this.match(KotlinParser.NL);
                  }
                  this.state = 3122;
                  this.errorHandler.sync(this);
                  alternative = this.interpreter.adaptivePredict(this.tokenStream, 480, this.context);
                }
                this.state = 3123;
                this.whenCondition();
              }
              this.state = 3128;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 481, this.context);
            }
            this.state = 3136;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 483, this.context)) {
              case 1:
                {
                  this.state = 3132;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  while (_la === 5) {
                    this.state = 3129;
                    this.match(KotlinParser.NL);
                    this.state = 3134;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                  }
                  this.state = 3135;
                  this.match(KotlinParser.COMMA);
                }
                break;
            }
            this.state = 3141;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 3138;
              this.match(KotlinParser.NL);
              this.state = 3143;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 3144;
            this.match(KotlinParser.ARROW);
            this.state = 3148;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 485, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 3145;
                this.match(KotlinParser.NL);
              }
              this.state = 3150;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 485, this.context);
            }
            this.state = 3151;
            this.controlStructureBody();
            this.state = 3153;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 486, this.context)) {
              case 1:
                {
                  this.state = 3152;
                  this.semi();
                }
                break;
            }
          }
          break;
        case KotlinParser.ELSE:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 3155;
            this.match(KotlinParser.ELSE);
            this.state = 3159;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 3156;
              this.match(KotlinParser.NL);
              this.state = 3161;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 3162;
            this.match(KotlinParser.ARROW);
            this.state = 3166;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 488, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 3163;
                this.match(KotlinParser.NL);
              }
              this.state = 3168;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 488, this.context);
            }
            this.state = 3169;
            this.controlStructureBody();
            this.state = 3171;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 489, this.context)) {
              case 1:
                {
                  this.state = 3170;
                  this.semi();
                }
                break;
            }
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public whenCondition(): WhenConditionContext {
    const localContext = new WhenConditionContext(this.context, this.state);
    this.enterRule(localContext, 258, KotlinParser.RULE_whenCondition);
    try {
      this.state = 3178;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.NL:
        case KotlinParser.LPAREN:
        case KotlinParser.LSQUARE:
        case KotlinParser.LCURL:
        case KotlinParser.ADD:
        case KotlinParser.SUB:
        case KotlinParser.INCR:
        case KotlinParser.DECR:
        case KotlinParser.EXCL_WS:
        case KotlinParser.EXCL_NO_WS:
        case KotlinParser.COLONCOLON:
        case KotlinParser.AT_NO_WS:
        case KotlinParser.AT_PRE_WS:
        case KotlinParser.RETURN_AT:
        case KotlinParser.CONTINUE_AT:
        case KotlinParser.BREAK_AT:
        case KotlinParser.THIS_AT:
        case KotlinParser.SUPER_AT:
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.FUN:
        case KotlinParser.OBJECT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.THIS:
        case KotlinParser.SUPER:
        case KotlinParser.WHERE:
        case KotlinParser.IF:
        case KotlinParser.WHEN:
        case KotlinParser.TRY:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.THROW:
        case KotlinParser.RETURN:
        case KotlinParser.CONTINUE:
        case KotlinParser.BREAK:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.RealLiteral:
        case KotlinParser.IntegerLiteral:
        case KotlinParser.HexLiteral:
        case KotlinParser.BinLiteral:
        case KotlinParser.UnsignedLiteral:
        case KotlinParser.LongLiteral:
        case KotlinParser.BooleanLiteral:
        case KotlinParser.NullLiteral:
        case KotlinParser.CharacterLiteral:
        case KotlinParser.Identifier:
        case KotlinParser.QUOTE_OPEN:
        case KotlinParser.TRIPLE_QUOTE_OPEN:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 3175;
            this.expression();
          }
          break;
        case KotlinParser.IN:
        case KotlinParser.NOT_IN:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 3176;
            this.rangeTest();
          }
          break;
        case KotlinParser.IS:
        case KotlinParser.NOT_IS:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 3177;
            this.typeTest();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public rangeTest(): RangeTestContext {
    const localContext = new RangeTestContext(this.context, this.state);
    this.enterRule(localContext, 260, KotlinParser.RULE_rangeTest);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 3180;
      this.inOperator();
      this.state = 3184;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 492, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 3181;
          this.match(KotlinParser.NL);
        }
        this.state = 3186;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 492, this.context);
      }
      this.state = 3187;
      this.expression();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeTest(): TypeTestContext {
    const localContext = new TypeTestContext(this.context, this.state);
    this.enterRule(localContext, 262, KotlinParser.RULE_typeTest);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3189;
      this.isOperator();
      this.state = 3193;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 3190;
        this.match(KotlinParser.NL);
        this.state = 3195;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 3196;
      this.type_();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public tryExpression(): TryExpressionContext {
    const localContext = new TryExpressionContext(this.context, this.state);
    this.enterRule(localContext, 264, KotlinParser.RULE_tryExpression);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 3198;
      this.match(KotlinParser.TRY);
      this.state = 3202;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 3199;
        this.match(KotlinParser.NL);
        this.state = 3204;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 3205;
      this.block();
      this.state = 3233;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 500, this.context)) {
        case 1:
          {
            this.state = 3213;
            this.errorHandler.sync(this);
            alternative = 1;
            do {
              switch (alternative) {
                case 1:
                  {
                    this.state = 3209;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 5) {
                      this.state = 3206;
                      this.match(KotlinParser.NL);
                      this.state = 3211;
                      this.errorHandler.sync(this);
                      _la = this.tokenStream.LA(1);
                    }
                    this.state = 3212;
                    this.catchBlock();
                  }
                  break;
                default:
                  throw new antlr.NoViableAltException(this);
              }
              this.state = 3215;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 496, this.context);
            } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
            this.state = 3224;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 498, this.context)) {
              case 1:
                {
                  this.state = 3220;
                  this.errorHandler.sync(this);
                  _la = this.tokenStream.LA(1);
                  while (_la === 5) {
                    this.state = 3217;
                    this.match(KotlinParser.NL);
                    this.state = 3222;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                  }
                  this.state = 3223;
                  this.finallyBlock();
                }
                break;
            }
          }
          break;
        case 2:
          {
            this.state = 3229;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 3226;
              this.match(KotlinParser.NL);
              this.state = 3231;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 3232;
            this.finallyBlock();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public catchBlock(): CatchBlockContext {
    const localContext = new CatchBlockContext(this.context, this.state);
    this.enterRule(localContext, 266, KotlinParser.RULE_catchBlock);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3235;
      this.match(KotlinParser.CATCH);
      this.state = 3239;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 3236;
        this.match(KotlinParser.NL);
        this.state = 3241;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 3242;
      this.match(KotlinParser.LPAREN);
      this.state = 3246;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 41 || _la === 43) {
        this.state = 3243;
        this.annotation();
        this.state = 3248;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 3249;
      this.simpleIdentifier();
      this.state = 3250;
      this.match(KotlinParser.COLON);
      this.state = 3251;
      this.type_();
      this.state = 3259;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (_la === 5 || _la === 8) {
        this.state = 3255;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
        while (_la === 5) {
          this.state = 3252;
          this.match(KotlinParser.NL);
          this.state = 3257;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
        }
        this.state = 3258;
        this.match(KotlinParser.COMMA);
      }

      this.state = 3261;
      this.match(KotlinParser.RPAREN);
      this.state = 3265;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 3262;
        this.match(KotlinParser.NL);
        this.state = 3267;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 3268;
      this.block();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public finallyBlock(): FinallyBlockContext {
    const localContext = new FinallyBlockContext(this.context, this.state);
    this.enterRule(localContext, 268, KotlinParser.RULE_finallyBlock);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3270;
      this.match(KotlinParser.FINALLY);
      this.state = 3274;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 3271;
        this.match(KotlinParser.NL);
        this.state = 3276;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 3277;
      this.block();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public jumpExpression(): JumpExpressionContext {
    const localContext = new JumpExpressionContext(this.context, this.state);
    this.enterRule(localContext, 270, KotlinParser.RULE_jumpExpression);
    let _la: number;
    try {
      let alternative: number;
      this.state = 3295;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.THROW:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 3279;
            this.match(KotlinParser.THROW);
            this.state = 3283;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 507, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 3280;
                this.match(KotlinParser.NL);
              }
              this.state = 3285;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 507, this.context);
            }
            this.state = 3286;
            this.expression();
          }
          break;
        case KotlinParser.RETURN_AT:
        case KotlinParser.RETURN:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 3287;
            _la = this.tokenStream.LA(1);
            if (!(_la === 58 || _la === 99)) {
              this.errorHandler.recoverInline(this);
            } else {
              this.errorHandler.reportMatch(this);
              this.consume();
            }
            this.state = 3289;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 508, this.context)) {
              case 1:
                {
                  this.state = 3288;
                  this.expression();
                }
                break;
            }
          }
          break;
        case KotlinParser.CONTINUE:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 3291;
            this.match(KotlinParser.CONTINUE);
          }
          break;
        case KotlinParser.CONTINUE_AT:
          this.enterOuterAlt(localContext, 4);
          {
            this.state = 3292;
            this.match(KotlinParser.CONTINUE_AT);
          }
          break;
        case KotlinParser.BREAK:
          this.enterOuterAlt(localContext, 5);
          {
            this.state = 3293;
            this.match(KotlinParser.BREAK);
          }
          break;
        case KotlinParser.BREAK_AT:
          this.enterOuterAlt(localContext, 6);
          {
            this.state = 3294;
            this.match(KotlinParser.BREAK_AT);
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public callableReference(): CallableReferenceContext {
    const localContext = new CallableReferenceContext(this.context, this.state);
    this.enterRule(localContext, 272, KotlinParser.RULE_callableReference);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3298;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      if (
        _la === 9 ||
        (((_la - 41) & ~0x1f) === 0 && ((1 << (_la - 41)) & 2143289349) !== 0) ||
        (((_la - 73) & ~0x1f) === 0 && ((1 << (_la - 73)) & 3182337) !== 0) ||
        (((_la - 107) & ~0x1f) === 0 && ((1 << (_la - 107)) & 1073741823) !== 0) ||
        _la === 148
      ) {
        this.state = 3297;
        this.receiverType();
      }

      this.state = 3300;
      this.match(KotlinParser.COLONCOLON);
      this.state = 3304;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 3301;
        this.match(KotlinParser.NL);
        this.state = 3306;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 3309;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.FILE:
        case KotlinParser.FIELD:
        case KotlinParser.PROPERTY:
        case KotlinParser.GET:
        case KotlinParser.SET:
        case KotlinParser.RECEIVER:
        case KotlinParser.PARAM:
        case KotlinParser.SETPARAM:
        case KotlinParser.DELEGATE:
        case KotlinParser.IMPORT:
        case KotlinParser.CONSTRUCTOR:
        case KotlinParser.BY:
        case KotlinParser.COMPANION:
        case KotlinParser.INIT:
        case KotlinParser.WHERE:
        case KotlinParser.CATCH:
        case KotlinParser.FINALLY:
        case KotlinParser.OUT:
        case KotlinParser.DYNAMIC:
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
        case KotlinParser.OVERRIDE:
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
        case KotlinParser.CONST:
        case KotlinParser.LATEINIT:
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
        case KotlinParser.REIFIED:
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
        case KotlinParser.Identifier:
          {
            this.state = 3307;
            this.simpleIdentifier();
          }
          break;
        case KotlinParser.CLASS:
          {
            this.state = 3308;
            this.match(KotlinParser.CLASS);
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public assignmentAndOperator(): AssignmentAndOperatorContext {
    const localContext = new AssignmentAndOperatorContext(this.context, this.state);
    this.enterRule(localContext, 274, KotlinParser.RULE_assignmentAndOperator);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3311;
      _la = this.tokenStream.LA(1);
      if (!(((_la - 29) & ~0x1f) === 0 && ((1 << (_la - 29)) & 31) !== 0)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public equalityOperator(): EqualityOperatorContext {
    const localContext = new EqualityOperatorContext(this.context, this.state);
    this.enterRule(localContext, 276, KotlinParser.RULE_equalityOperator);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3313;
      _la = this.tokenStream.LA(1);
      if (!(((_la - 51) & ~0x1f) === 0 && ((1 << (_la - 51)) & 27) !== 0)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public comparisonOperator(): ComparisonOperatorContext {
    const localContext = new ComparisonOperatorContext(this.context, this.state);
    this.enterRule(localContext, 278, KotlinParser.RULE_comparisonOperator);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3315;
      _la = this.tokenStream.LA(1);
      if (!(((_la - 47) & ~0x1f) === 0 && ((1 << (_la - 47)) & 15) !== 0)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public inOperator(): InOperatorContext {
    const localContext = new InOperatorContext(this.context, this.state);
    this.enterRule(localContext, 280, KotlinParser.RULE_inOperator);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3317;
      _la = this.tokenStream.LA(1);
      if (!(_la === 104 || _la === 106)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public isOperator(): IsOperatorContext {
    const localContext = new IsOperatorContext(this.context, this.state);
    this.enterRule(localContext, 282, KotlinParser.RULE_isOperator);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3319;
      _la = this.tokenStream.LA(1);
      if (!(_la === 103 || _la === 105)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public additiveOperator(): AdditiveOperatorContext {
    const localContext = new AdditiveOperatorContext(this.context, this.state);
    this.enterRule(localContext, 284, KotlinParser.RULE_additiveOperator);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3321;
      _la = this.tokenStream.LA(1);
      if (!(_la === 18 || _la === 19)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public multiplicativeOperator(): MultiplicativeOperatorContext {
    const localContext = new MultiplicativeOperatorContext(this.context, this.state);
    this.enterRule(localContext, 286, KotlinParser.RULE_multiplicativeOperator);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3323;
      _la = this.tokenStream.LA(1);
      if (!((_la & ~0x1f) === 0 && ((1 << _la) & 229376) !== 0)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public asOperator(): AsOperatorContext {
    const localContext = new AsOperatorContext(this.context, this.state);
    this.enterRule(localContext, 288, KotlinParser.RULE_asOperator);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3325;
      _la = this.tokenStream.LA(1);
      if (!(_la === 53 || _la === 102)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public prefixUnaryOperator(): PrefixUnaryOperatorContext {
    const localContext = new PrefixUnaryOperatorContext(this.context, this.state);
    this.enterRule(localContext, 290, KotlinParser.RULE_prefixUnaryOperator);
    try {
      this.state = 3332;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.INCR:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 3327;
            this.match(KotlinParser.INCR);
          }
          break;
        case KotlinParser.DECR:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 3328;
            this.match(KotlinParser.DECR);
          }
          break;
        case KotlinParser.SUB:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 3329;
            this.match(KotlinParser.SUB);
          }
          break;
        case KotlinParser.ADD:
          this.enterOuterAlt(localContext, 4);
          {
            this.state = 3330;
            this.match(KotlinParser.ADD);
          }
          break;
        case KotlinParser.EXCL_WS:
        case KotlinParser.EXCL_NO_WS:
          this.enterOuterAlt(localContext, 5);
          {
            this.state = 3331;
            this.excl();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public postfixUnaryOperator(): PostfixUnaryOperatorContext {
    const localContext = new PostfixUnaryOperatorContext(this.context, this.state);
    this.enterRule(localContext, 292, KotlinParser.RULE_postfixUnaryOperator);
    try {
      this.state = 3338;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.INCR:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 3334;
            this.match(KotlinParser.INCR);
          }
          break;
        case KotlinParser.DECR:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 3335;
            this.match(KotlinParser.DECR);
          }
          break;
        case KotlinParser.EXCL_NO_WS:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 3336;
            this.match(KotlinParser.EXCL_NO_WS);
            this.state = 3337;
            this.excl();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public excl(): ExclContext {
    const localContext = new ExclContext(this.context, this.state);
    this.enterRule(localContext, 294, KotlinParser.RULE_excl);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3340;
      _la = this.tokenStream.LA(1);
      if (!(_la === 24 || _la === 25)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public memberAccessOperator(): MemberAccessOperatorContext {
    const localContext = new MemberAccessOperatorContext(this.context, this.state);
    this.enterRule(localContext, 296, KotlinParser.RULE_memberAccessOperator);
    let _la: number;
    try {
      this.state = 3357;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 517, this.context)) {
        case 1:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 3345;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 3342;
              this.match(KotlinParser.NL);
              this.state = 3347;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 3348;
            this.match(KotlinParser.DOT);
          }
          break;
        case 2:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 3352;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 3349;
              this.match(KotlinParser.NL);
              this.state = 3354;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
            this.state = 3355;
            this.safeNav();
          }
          break;
        case 3:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 3356;
            this.match(KotlinParser.COLONCOLON);
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public safeNav(): SafeNavContext {
    const localContext = new SafeNavContext(this.context, this.state);
    this.enterRule(localContext, 298, KotlinParser.RULE_safeNav);
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3359;
      this.match(KotlinParser.QUEST_NO_WS);
      this.state = 3360;
      this.match(KotlinParser.DOT);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public modifiers(): ModifiersContext {
    const localContext = new ModifiersContext(this.context, this.state);
    this.enterRule(localContext, 300, KotlinParser.RULE_modifiers);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 3364;
      this.errorHandler.sync(this);
      alternative = 1;
      do {
        switch (alternative) {
          case 1:
            {
              this.state = 3364;
              this.errorHandler.sync(this);
              switch (this.tokenStream.LA(1)) {
                case KotlinParser.AT_NO_WS:
                case KotlinParser.AT_PRE_WS:
                  {
                    this.state = 3362;
                    this.annotation();
                  }
                  break;
                case KotlinParser.PUBLIC:
                case KotlinParser.PRIVATE:
                case KotlinParser.PROTECTED:
                case KotlinParser.INTERNAL:
                case KotlinParser.ENUM:
                case KotlinParser.SEALED:
                case KotlinParser.ANNOTATION:
                case KotlinParser.DATA:
                case KotlinParser.INNER:
                case KotlinParser.VALUE:
                case KotlinParser.TAILREC:
                case KotlinParser.OPERATOR:
                case KotlinParser.INLINE:
                case KotlinParser.INFIX:
                case KotlinParser.EXTERNAL:
                case KotlinParser.SUSPEND:
                case KotlinParser.OVERRIDE:
                case KotlinParser.ABSTRACT:
                case KotlinParser.FINAL:
                case KotlinParser.OPEN:
                case KotlinParser.CONST:
                case KotlinParser.LATEINIT:
                case KotlinParser.VARARG:
                case KotlinParser.NOINLINE:
                case KotlinParser.CROSSINLINE:
                case KotlinParser.EXPECT:
                case KotlinParser.ACTUAL:
                  {
                    this.state = 3363;
                    this.modifier();
                  }
                  break;
                default:
                  throw new antlr.NoViableAltException(this);
              }
            }
            break;
          default:
            throw new antlr.NoViableAltException(this);
        }
        this.state = 3366;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 519, this.context);
      } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public parameterModifiers(): ParameterModifiersContext {
    const localContext = new ParameterModifiersContext(this.context, this.state);
    this.enterRule(localContext, 302, KotlinParser.RULE_parameterModifiers);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 3370;
      this.errorHandler.sync(this);
      alternative = 1;
      do {
        switch (alternative) {
          case 1:
            {
              this.state = 3370;
              this.errorHandler.sync(this);
              switch (this.tokenStream.LA(1)) {
                case KotlinParser.AT_NO_WS:
                case KotlinParser.AT_PRE_WS:
                  {
                    this.state = 3368;
                    this.annotation();
                  }
                  break;
                case KotlinParser.VARARG:
                case KotlinParser.NOINLINE:
                case KotlinParser.CROSSINLINE:
                  {
                    this.state = 3369;
                    this.parameterModifier();
                  }
                  break;
                default:
                  throw new antlr.NoViableAltException(this);
              }
            }
            break;
          default:
            throw new antlr.NoViableAltException(this);
        }
        this.state = 3372;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 521, this.context);
      } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public modifier(): ModifierContext {
    const localContext = new ModifierContext(this.context, this.state);
    this.enterRule(localContext, 304, KotlinParser.RULE_modifier);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 3382;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.ENUM:
        case KotlinParser.SEALED:
        case KotlinParser.ANNOTATION:
        case KotlinParser.DATA:
        case KotlinParser.INNER:
        case KotlinParser.VALUE:
          {
            this.state = 3374;
            this.classModifier();
          }
          break;
        case KotlinParser.OVERRIDE:
        case KotlinParser.LATEINIT:
          {
            this.state = 3375;
            this.memberModifier();
          }
          break;
        case KotlinParser.PUBLIC:
        case KotlinParser.PRIVATE:
        case KotlinParser.PROTECTED:
        case KotlinParser.INTERNAL:
          {
            this.state = 3376;
            this.visibilityModifier();
          }
          break;
        case KotlinParser.TAILREC:
        case KotlinParser.OPERATOR:
        case KotlinParser.INLINE:
        case KotlinParser.INFIX:
        case KotlinParser.EXTERNAL:
        case KotlinParser.SUSPEND:
          {
            this.state = 3377;
            this.functionModifier();
          }
          break;
        case KotlinParser.CONST:
          {
            this.state = 3378;
            this.propertyModifier();
          }
          break;
        case KotlinParser.ABSTRACT:
        case KotlinParser.FINAL:
        case KotlinParser.OPEN:
          {
            this.state = 3379;
            this.inheritanceModifier();
          }
          break;
        case KotlinParser.VARARG:
        case KotlinParser.NOINLINE:
        case KotlinParser.CROSSINLINE:
          {
            this.state = 3380;
            this.parameterModifier();
          }
          break;
        case KotlinParser.EXPECT:
        case KotlinParser.ACTUAL:
          {
            this.state = 3381;
            this.platformModifier();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
      this.state = 3387;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 523, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 3384;
          this.match(KotlinParser.NL);
        }
        this.state = 3389;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 523, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeModifiers(): TypeModifiersContext {
    const localContext = new TypeModifiersContext(this.context, this.state);
    this.enterRule(localContext, 306, KotlinParser.RULE_typeModifiers);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 3391;
      this.errorHandler.sync(this);
      alternative = 1;
      do {
        switch (alternative) {
          case 1:
            {
              this.state = 3390;
              this.typeModifier();
            }
            break;
          default:
            throw new antlr.NoViableAltException(this);
        }
        this.state = 3393;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 524, this.context);
      } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeModifier(): TypeModifierContext {
    const localContext = new TypeModifierContext(this.context, this.state);
    this.enterRule(localContext, 308, KotlinParser.RULE_typeModifier);
    let _la: number;
    try {
      this.state = 3403;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.AT_NO_WS:
        case KotlinParser.AT_PRE_WS:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 3395;
            this.annotation();
          }
          break;
        case KotlinParser.SUSPEND:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 3396;
            this.match(KotlinParser.SUSPEND);
            this.state = 3400;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 3397;
              this.match(KotlinParser.NL);
              this.state = 3402;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public classModifier(): ClassModifierContext {
    const localContext = new ClassModifierContext(this.context, this.state);
    this.enterRule(localContext, 310, KotlinParser.RULE_classModifier);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3405;
      _la = this.tokenStream.LA(1);
      if (!(((_la - 113) & ~0x1f) === 0 && ((1 << (_la - 113)) & 63) !== 0)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public memberModifier(): MemberModifierContext {
    const localContext = new MemberModifierContext(this.context, this.state);
    this.enterRule(localContext, 312, KotlinParser.RULE_memberModifier);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3407;
      _la = this.tokenStream.LA(1);
      if (!(_la === 125 || _la === 130)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public visibilityModifier(): VisibilityModifierContext {
    const localContext = new VisibilityModifierContext(this.context, this.state);
    this.enterRule(localContext, 314, KotlinParser.RULE_visibilityModifier);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3409;
      _la = this.tokenStream.LA(1);
      if (!(((_la - 109) & ~0x1f) === 0 && ((1 << (_la - 109)) & 15) !== 0)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public varianceModifier(): VarianceModifierContext {
    const localContext = new VarianceModifierContext(this.context, this.state);
    this.enterRule(localContext, 316, KotlinParser.RULE_varianceModifier);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3411;
      _la = this.tokenStream.LA(1);
      if (!(_la === 104 || _la === 107)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeParameterModifiers(): TypeParameterModifiersContext {
    const localContext = new TypeParameterModifiersContext(this.context, this.state);
    this.enterRule(localContext, 318, KotlinParser.RULE_typeParameterModifiers);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 3414;
      this.errorHandler.sync(this);
      alternative = 1;
      do {
        switch (alternative) {
          case 1:
            {
              this.state = 3413;
              this.typeParameterModifier();
            }
            break;
          default:
            throw new antlr.NoViableAltException(this);
        }
        this.state = 3416;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 527, this.context);
      } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public typeParameterModifier(): TypeParameterModifierContext {
    const localContext = new TypeParameterModifierContext(this.context, this.state);
    this.enterRule(localContext, 320, KotlinParser.RULE_typeParameterModifier);
    try {
      let alternative: number;
      this.state = 3433;
      this.errorHandler.sync(this);
      switch (this.tokenStream.LA(1)) {
        case KotlinParser.REIFIED:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 3418;
            this.reificationModifier();
            this.state = 3422;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 528, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 3419;
                this.match(KotlinParser.NL);
              }
              this.state = 3424;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 528, this.context);
            }
          }
          break;
        case KotlinParser.IN:
        case KotlinParser.OUT:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 3425;
            this.varianceModifier();
            this.state = 3429;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 529, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
              if (alternative === 1) {
                this.state = 3426;
                this.match(KotlinParser.NL);
              }
              this.state = 3431;
              this.errorHandler.sync(this);
              alternative = this.interpreter.adaptivePredict(this.tokenStream, 529, this.context);
            }
          }
          break;
        case KotlinParser.AT_NO_WS:
        case KotlinParser.AT_PRE_WS:
          this.enterOuterAlt(localContext, 3);
          {
            this.state = 3432;
            this.annotation();
          }
          break;
        default:
          throw new antlr.NoViableAltException(this);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public functionModifier(): FunctionModifierContext {
    const localContext = new FunctionModifierContext(this.context, this.state);
    this.enterRule(localContext, 322, KotlinParser.RULE_functionModifier);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3435;
      _la = this.tokenStream.LA(1);
      if (!(((_la - 119) & ~0x1f) === 0 && ((1 << (_la - 119)) & 63) !== 0)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public propertyModifier(): PropertyModifierContext {
    const localContext = new PropertyModifierContext(this.context, this.state);
    this.enterRule(localContext, 324, KotlinParser.RULE_propertyModifier);
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3437;
      this.match(KotlinParser.CONST);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public inheritanceModifier(): InheritanceModifierContext {
    const localContext = new InheritanceModifierContext(this.context, this.state);
    this.enterRule(localContext, 326, KotlinParser.RULE_inheritanceModifier);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3439;
      _la = this.tokenStream.LA(1);
      if (!(((_la - 126) & ~0x1f) === 0 && ((1 << (_la - 126)) & 7) !== 0)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public parameterModifier(): ParameterModifierContext {
    const localContext = new ParameterModifierContext(this.context, this.state);
    this.enterRule(localContext, 328, KotlinParser.RULE_parameterModifier);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3441;
      _la = this.tokenStream.LA(1);
      if (!(((_la - 131) & ~0x1f) === 0 && ((1 << (_la - 131)) & 7) !== 0)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public reificationModifier(): ReificationModifierContext {
    const localContext = new ReificationModifierContext(this.context, this.state);
    this.enterRule(localContext, 330, KotlinParser.RULE_reificationModifier);
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3443;
      this.match(KotlinParser.REIFIED);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public platformModifier(): PlatformModifierContext {
    const localContext = new PlatformModifierContext(this.context, this.state);
    this.enterRule(localContext, 332, KotlinParser.RULE_platformModifier);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3445;
      _la = this.tokenStream.LA(1);
      if (!(_la === 135 || _la === 136)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public annotation(): AnnotationContext {
    const localContext = new AnnotationContext(this.context, this.state);
    this.enterRule(localContext, 334, KotlinParser.RULE_annotation);
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 3449;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 531, this.context)) {
        case 1:
          {
            this.state = 3447;
            this.singleAnnotation();
          }
          break;
        case 2:
          {
            this.state = 3448;
            this.multiAnnotation();
          }
          break;
      }
      this.state = 3454;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 532, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 3451;
          this.match(KotlinParser.NL);
        }
        this.state = 3456;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 532, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public singleAnnotation(): SingleAnnotationContext {
    const localContext = new SingleAnnotationContext(this.context, this.state);
    this.enterRule(localContext, 336, KotlinParser.RULE_singleAnnotation);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3466;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 534, this.context)) {
        case 1:
          {
            this.state = 3457;
            this.annotationUseSiteTarget();
            this.state = 3461;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 3458;
              this.match(KotlinParser.NL);
              this.state = 3463;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
          }
          break;
        case 2:
          {
            this.state = 3464;
            this.match(KotlinParser.AT_NO_WS);
          }
          break;
        case 3:
          {
            this.state = 3465;
            this.match(KotlinParser.AT_PRE_WS);
          }
          break;
      }
      this.state = 3468;
      this.unescapedAnnotation();
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public multiAnnotation(): MultiAnnotationContext {
    const localContext = new MultiAnnotationContext(this.context, this.state);
    this.enterRule(localContext, 338, KotlinParser.RULE_multiAnnotation);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3479;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 536, this.context)) {
        case 1:
          {
            this.state = 3470;
            this.annotationUseSiteTarget();
            this.state = 3474;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 5) {
              this.state = 3471;
              this.match(KotlinParser.NL);
              this.state = 3476;
              this.errorHandler.sync(this);
              _la = this.tokenStream.LA(1);
            }
          }
          break;
        case 2:
          {
            this.state = 3477;
            this.match(KotlinParser.AT_NO_WS);
          }
          break;
        case 3:
          {
            this.state = 3478;
            this.match(KotlinParser.AT_PRE_WS);
          }
          break;
      }
      this.state = 3481;
      this.match(KotlinParser.LSQUARE);
      this.state = 3483;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      do {
        this.state = 3482;
        this.unescapedAnnotation();
        this.state = 3485;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      } while (
        (((_la - 63) & ~0x1f) === 0 && ((1 << (_la - 63)) & 3258713599) !== 0) ||
        (((_la - 107) & ~0x1f) === 0 && ((1 << (_la - 107)) & 1073741823) !== 0) ||
        _la === 148
      );
      this.state = 3487;
      this.match(KotlinParser.RSQUARE);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public annotationUseSiteTarget(): AnnotationUseSiteTargetContext {
    const localContext = new AnnotationUseSiteTargetContext(this.context, this.state);
    this.enterRule(localContext, 340, KotlinParser.RULE_annotationUseSiteTarget);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3489;
      _la = this.tokenStream.LA(1);
      if (!(_la === 41 || _la === 43)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
      this.state = 3490;
      _la = this.tokenStream.LA(1);
      if (!(((_la - 64) & ~0x1f) === 0 && ((1 << (_la - 64)) & 255) !== 0)) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
      this.state = 3494;
      this.errorHandler.sync(this);
      _la = this.tokenStream.LA(1);
      while (_la === 5) {
        this.state = 3491;
        this.match(KotlinParser.NL);
        this.state = 3496;
        this.errorHandler.sync(this);
        _la = this.tokenStream.LA(1);
      }
      this.state = 3497;
      this.match(KotlinParser.COLON);
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public unescapedAnnotation(): UnescapedAnnotationContext {
    const localContext = new UnescapedAnnotationContext(this.context, this.state);
    this.enterRule(localContext, 342, KotlinParser.RULE_unescapedAnnotation);
    try {
      this.state = 3501;
      this.errorHandler.sync(this);
      switch (this.interpreter.adaptivePredict(this.tokenStream, 539, this.context)) {
        case 1:
          this.enterOuterAlt(localContext, 1);
          {
            this.state = 3499;
            this.constructorInvocation();
          }
          break;
        case 2:
          this.enterOuterAlt(localContext, 2);
          {
            this.state = 3500;
            this.userType();
          }
          break;
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public simpleIdentifier(): SimpleIdentifierContext {
    const localContext = new SimpleIdentifierContext(this.context, this.state);
    this.enterRule(localContext, 344, KotlinParser.RULE_simpleIdentifier);
    let _la: number;
    try {
      this.enterOuterAlt(localContext, 1);
      this.state = 3503;
      _la = this.tokenStream.LA(1);
      if (
        !(
          (((_la - 63) & ~0x1f) === 0 && ((1 << (_la - 63)) & 3258713599) !== 0) ||
          (((_la - 107) & ~0x1f) === 0 && ((1 << (_la - 107)) & 1073741823) !== 0) ||
          _la === 148
        )
      ) {
        this.errorHandler.recoverInline(this);
      } else {
        this.errorHandler.reportMatch(this);
        this.consume();
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }
  public identifier(): IdentifierContext {
    const localContext = new IdentifierContext(this.context, this.state);
    this.enterRule(localContext, 346, KotlinParser.RULE_identifier);
    let _la: number;
    try {
      let alternative: number;
      this.enterOuterAlt(localContext, 1);
      this.state = 3505;
      this.simpleIdentifier();
      this.state = 3516;
      this.errorHandler.sync(this);
      alternative = this.interpreter.adaptivePredict(this.tokenStream, 541, this.context);
      while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
        if (alternative === 1) {
          this.state = 3509;
          this.errorHandler.sync(this);
          _la = this.tokenStream.LA(1);
          while (_la === 5) {
            this.state = 3506;
            this.match(KotlinParser.NL);
            this.state = 3511;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
          }
          this.state = 3512;
          this.match(KotlinParser.DOT);
          this.state = 3513;
          this.simpleIdentifier();
        }
        this.state = 3518;
        this.errorHandler.sync(this);
        alternative = this.interpreter.adaptivePredict(this.tokenStream, 541, this.context);
      }
    } catch (re) {
      if (re instanceof antlr.RecognitionException) {
        this.errorHandler.reportError(this, re);
        this.errorHandler.recover(this, re);
      } else {
        throw re;
      }
    } finally {
      this.exitRule();
    }
    return localContext;
  }

  public static readonly _serializedATN: number[] = [
    4, 1, 173, 3520, 2, 0, 7, 0, 2, 1, 7, 1, 2, 2, 7, 2, 2, 3, 7, 3, 2, 4, 7, 4, 2, 5, 7, 5, 2, 6, 7, 6, 2, 7, 7, 7, 2,
    8, 7, 8, 2, 9, 7, 9, 2, 10, 7, 10, 2, 11, 7, 11, 2, 12, 7, 12, 2, 13, 7, 13, 2, 14, 7, 14, 2, 15, 7, 15, 2, 16, 7,
    16, 2, 17, 7, 17, 2, 18, 7, 18, 2, 19, 7, 19, 2, 20, 7, 20, 2, 21, 7, 21, 2, 22, 7, 22, 2, 23, 7, 23, 2, 24, 7, 24,
    2, 25, 7, 25, 2, 26, 7, 26, 2, 27, 7, 27, 2, 28, 7, 28, 2, 29, 7, 29, 2, 30, 7, 30, 2, 31, 7, 31, 2, 32, 7, 32, 2,
    33, 7, 33, 2, 34, 7, 34, 2, 35, 7, 35, 2, 36, 7, 36, 2, 37, 7, 37, 2, 38, 7, 38, 2, 39, 7, 39, 2, 40, 7, 40, 2, 41,
    7, 41, 2, 42, 7, 42, 2, 43, 7, 43, 2, 44, 7, 44, 2, 45, 7, 45, 2, 46, 7, 46, 2, 47, 7, 47, 2, 48, 7, 48, 2, 49, 7,
    49, 2, 50, 7, 50, 2, 51, 7, 51, 2, 52, 7, 52, 2, 53, 7, 53, 2, 54, 7, 54, 2, 55, 7, 55, 2, 56, 7, 56, 2, 57, 7, 57,
    2, 58, 7, 58, 2, 59, 7, 59, 2, 60, 7, 60, 2, 61, 7, 61, 2, 62, 7, 62, 2, 63, 7, 63, 2, 64, 7, 64, 2, 65, 7, 65, 2,
    66, 7, 66, 2, 67, 7, 67, 2, 68, 7, 68, 2, 69, 7, 69, 2, 70, 7, 70, 2, 71, 7, 71, 2, 72, 7, 72, 2, 73, 7, 73, 2, 74,
    7, 74, 2, 75, 7, 75, 2, 76, 7, 76, 2, 77, 7, 77, 2, 78, 7, 78, 2, 79, 7, 79, 2, 80, 7, 80, 2, 81, 7, 81, 2, 82, 7,
    82, 2, 83, 7, 83, 2, 84, 7, 84, 2, 85, 7, 85, 2, 86, 7, 86, 2, 87, 7, 87, 2, 88, 7, 88, 2, 89, 7, 89, 2, 90, 7, 90,
    2, 91, 7, 91, 2, 92, 7, 92, 2, 93, 7, 93, 2, 94, 7, 94, 2, 95, 7, 95, 2, 96, 7, 96, 2, 97, 7, 97, 2, 98, 7, 98, 2,
    99, 7, 99, 2, 100, 7, 100, 2, 101, 7, 101, 2, 102, 7, 102, 2, 103, 7, 103, 2, 104, 7, 104, 2, 105, 7, 105, 2, 106,
    7, 106, 2, 107, 7, 107, 2, 108, 7, 108, 2, 109, 7, 109, 2, 110, 7, 110, 2, 111, 7, 111, 2, 112, 7, 112, 2, 113, 7,
    113, 2, 114, 7, 114, 2, 115, 7, 115, 2, 116, 7, 116, 2, 117, 7, 117, 2, 118, 7, 118, 2, 119, 7, 119, 2, 120, 7, 120,
    2, 121, 7, 121, 2, 122, 7, 122, 2, 123, 7, 123, 2, 124, 7, 124, 2, 125, 7, 125, 2, 126, 7, 126, 2, 127, 7, 127, 2,
    128, 7, 128, 2, 129, 7, 129, 2, 130, 7, 130, 2, 131, 7, 131, 2, 132, 7, 132, 2, 133, 7, 133, 2, 134, 7, 134, 2, 135,
    7, 135, 2, 136, 7, 136, 2, 137, 7, 137, 2, 138, 7, 138, 2, 139, 7, 139, 2, 140, 7, 140, 2, 141, 7, 141, 2, 142, 7,
    142, 2, 143, 7, 143, 2, 144, 7, 144, 2, 145, 7, 145, 2, 146, 7, 146, 2, 147, 7, 147, 2, 148, 7, 148, 2, 149, 7, 149,
    2, 150, 7, 150, 2, 151, 7, 151, 2, 152, 7, 152, 2, 153, 7, 153, 2, 154, 7, 154, 2, 155, 7, 155, 2, 156, 7, 156, 2,
    157, 7, 157, 2, 158, 7, 158, 2, 159, 7, 159, 2, 160, 7, 160, 2, 161, 7, 161, 2, 162, 7, 162, 2, 163, 7, 163, 2, 164,
    7, 164, 2, 165, 7, 165, 2, 166, 7, 166, 2, 167, 7, 167, 2, 168, 7, 168, 2, 169, 7, 169, 2, 170, 7, 170, 2, 171, 7,
    171, 2, 172, 7, 172, 2, 173, 7, 173, 1, 0, 3, 0, 350, 8, 0, 1, 0, 5, 0, 353, 8, 0, 10, 0, 12, 0, 356, 9, 0, 1, 0, 5,
    0, 359, 8, 0, 10, 0, 12, 0, 362, 9, 0, 1, 0, 1, 0, 1, 0, 5, 0, 367, 8, 0, 10, 0, 12, 0, 370, 9, 0, 1, 0, 1, 0, 1, 1,
    3, 1, 375, 8, 1, 1, 1, 5, 1, 378, 8, 1, 10, 1, 12, 1, 381, 9, 1, 1, 1, 5, 1, 384, 8, 1, 10, 1, 12, 1, 387, 9, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 1, 394, 8, 1, 10, 1, 12, 1, 397, 9, 1, 1, 1, 1, 1, 1, 2, 1, 2, 4, 2, 403, 8, 2, 11, 2,
    12, 2, 404, 1, 3, 1, 3, 1, 3, 5, 3, 410, 8, 3, 10, 3, 12, 3, 413, 9, 3, 1, 3, 1, 3, 5, 3, 417, 8, 3, 10, 3, 12, 3,
    420, 9, 3, 1, 3, 1, 3, 4, 3, 424, 8, 3, 11, 3, 12, 3, 425, 1, 3, 1, 3, 1, 3, 3, 3, 431, 8, 3, 1, 3, 5, 3, 434, 8, 3,
    10, 3, 12, 3, 437, 9, 3, 1, 4, 1, 4, 1, 4, 3, 4, 442, 8, 4, 3, 4, 444, 8, 4, 1, 5, 5, 5, 447, 8, 5, 10, 5, 12, 5,
    450, 9, 5, 1, 6, 1, 6, 1, 6, 1, 6, 1, 6, 3, 6, 457, 8, 6, 1, 6, 3, 6, 460, 8, 6, 1, 7, 1, 7, 1, 7, 1, 8, 1, 8, 3, 8,
    467, 8, 8, 1, 9, 3, 9, 470, 8, 9, 1, 9, 1, 9, 5, 9, 474, 8, 9, 10, 9, 12, 9, 477, 9, 9, 1, 9, 1, 9, 5, 9, 481, 8, 9,
    10, 9, 12, 9, 484, 9, 9, 1, 9, 3, 9, 487, 8, 9, 1, 9, 5, 9, 490, 8, 9, 10, 9, 12, 9, 493, 9, 9, 1, 9, 1, 9, 5, 9,
    497, 8, 9, 10, 9, 12, 9, 500, 9, 9, 1, 9, 1, 9, 1, 10, 1, 10, 1, 10, 1, 10, 1, 10, 3, 10, 509, 8, 10, 1, 11, 3, 11,
    512, 8, 11, 1, 11, 1, 11, 1, 11, 5, 11, 517, 8, 11, 10, 11, 12, 11, 520, 9, 11, 3, 11, 522, 8, 11, 1, 11, 3, 11,
    525, 8, 11, 1, 11, 5, 11, 528, 8, 11, 10, 11, 12, 11, 531, 9, 11, 1, 11, 1, 11, 5, 11, 535, 8, 11, 10, 11, 12, 11,
    538, 9, 11, 1, 11, 3, 11, 541, 8, 11, 1, 11, 5, 11, 544, 8, 11, 10, 11, 12, 11, 547, 9, 11, 1, 11, 3, 11, 550, 8,
    11, 1, 11, 5, 11, 553, 8, 11, 10, 11, 12, 11, 556, 9, 11, 1, 11, 1, 11, 5, 11, 560, 8, 11, 10, 11, 12, 11, 563, 9,
    11, 1, 11, 3, 11, 566, 8, 11, 1, 11, 5, 11, 569, 8, 11, 10, 11, 12, 11, 572, 9, 11, 1, 11, 3, 11, 575, 8, 11, 1, 11,
    5, 11, 578, 8, 11, 10, 11, 12, 11, 581, 9, 11, 1, 11, 1, 11, 5, 11, 585, 8, 11, 10, 11, 12, 11, 588, 9, 11, 1, 11,
    3, 11, 591, 8, 11, 1, 12, 3, 12, 594, 8, 12, 1, 12, 1, 12, 5, 12, 598, 8, 12, 10, 12, 12, 12, 601, 9, 12, 3, 12,
    603, 8, 12, 1, 12, 1, 12, 1, 13, 1, 13, 5, 13, 609, 8, 13, 10, 13, 12, 13, 612, 9, 13, 1, 13, 1, 13, 5, 13, 616, 8,
    13, 10, 13, 12, 13, 619, 9, 13, 1, 13, 1, 13, 1, 14, 1, 14, 5, 14, 625, 8, 14, 10, 14, 12, 14, 628, 9, 14, 1, 14, 1,
    14, 5, 14, 632, 8, 14, 10, 14, 12, 14, 635, 9, 14, 1, 14, 1, 14, 5, 14, 639, 8, 14, 10, 14, 12, 14, 642, 9, 14, 1,
    14, 5, 14, 645, 8, 14, 10, 14, 12, 14, 648, 9, 14, 1, 14, 5, 14, 651, 8, 14, 10, 14, 12, 14, 654, 9, 14, 1, 14, 3,
    14, 657, 8, 14, 3, 14, 659, 8, 14, 1, 14, 5, 14, 662, 8, 14, 10, 14, 12, 14, 665, 9, 14, 1, 14, 1, 14, 1, 15, 3, 15,
    670, 8, 15, 1, 15, 3, 15, 673, 8, 15, 1, 15, 5, 15, 676, 8, 15, 10, 15, 12, 15, 679, 9, 15, 1, 15, 1, 15, 1, 15, 5,
    15, 684, 8, 15, 10, 15, 12, 15, 687, 9, 15, 1, 15, 1, 15, 5, 15, 691, 8, 15, 10, 15, 12, 15, 694, 9, 15, 1, 15, 1,
    15, 5, 15, 698, 8, 15, 10, 15, 12, 15, 701, 9, 15, 1, 15, 3, 15, 704, 8, 15, 1, 16, 1, 16, 5, 16, 708, 8, 16, 10,
    16, 12, 16, 711, 9, 16, 1, 16, 1, 16, 5, 16, 715, 8, 16, 10, 16, 12, 16, 718, 9, 16, 1, 16, 5, 16, 721, 8, 16, 10,
    16, 12, 16, 724, 9, 16, 1, 17, 1, 17, 1, 17, 1, 17, 1, 17, 1, 17, 5, 17, 732, 8, 17, 10, 17, 12, 17, 735, 9, 17, 1,
    17, 3, 17, 738, 8, 17, 1, 18, 1, 18, 5, 18, 742, 8, 18, 10, 18, 12, 18, 745, 9, 18, 1, 18, 1, 18, 1, 19, 5, 19, 750,
    8, 19, 10, 19, 12, 19, 753, 9, 19, 1, 19, 5, 19, 756, 8, 19, 10, 19, 12, 19, 759, 9, 19, 1, 19, 1, 19, 1, 20, 1, 20,
    3, 20, 765, 8, 20, 1, 20, 5, 20, 768, 8, 20, 10, 20, 12, 20, 771, 9, 20, 1, 20, 1, 20, 5, 20, 775, 8, 20, 10, 20,
    12, 20, 778, 9, 20, 1, 20, 1, 20, 1, 21, 1, 21, 5, 21, 784, 8, 21, 10, 21, 12, 21, 787, 9, 21, 1, 21, 1, 21, 5, 21,
    791, 8, 21, 10, 21, 12, 21, 794, 9, 21, 1, 21, 1, 21, 5, 21, 798, 8, 21, 10, 21, 12, 21, 801, 9, 21, 1, 21, 5, 21,
    804, 8, 21, 10, 21, 12, 21, 807, 9, 21, 1, 21, 5, 21, 810, 8, 21, 10, 21, 12, 21, 813, 9, 21, 1, 21, 3, 21, 816, 8,
    21, 1, 21, 5, 21, 819, 8, 21, 10, 21, 12, 21, 822, 9, 21, 1, 21, 1, 21, 1, 22, 3, 22, 827, 8, 22, 1, 22, 5, 22, 830,
    8, 22, 10, 22, 12, 22, 833, 9, 22, 1, 22, 1, 22, 5, 22, 837, 8, 22, 10, 22, 12, 22, 840, 9, 22, 1, 22, 1, 22, 5, 22,
    844, 8, 22, 10, 22, 12, 22, 847, 9, 22, 1, 22, 3, 22, 850, 8, 22, 1, 23, 1, 23, 5, 23, 854, 8, 23, 10, 23, 12, 23,
    857, 9, 23, 1, 23, 1, 23, 5, 23, 861, 8, 23, 10, 23, 12, 23, 864, 9, 23, 1, 23, 1, 23, 5, 23, 868, 8, 23, 10, 23,
    12, 23, 871, 9, 23, 1, 23, 5, 23, 874, 8, 23, 10, 23, 12, 23, 877, 9, 23, 1, 24, 5, 24, 880, 8, 24, 10, 24, 12, 24,
    883, 9, 24, 1, 24, 1, 24, 5, 24, 887, 8, 24, 10, 24, 12, 24, 890, 9, 24, 1, 24, 1, 24, 5, 24, 894, 8, 24, 10, 24,
    12, 24, 897, 9, 24, 1, 24, 1, 24, 1, 25, 1, 25, 3, 25, 903, 8, 25, 5, 25, 905, 8, 25, 10, 25, 12, 25, 908, 9, 25, 1,
    26, 1, 26, 1, 26, 1, 26, 3, 26, 914, 8, 26, 1, 27, 1, 27, 5, 27, 918, 8, 27, 10, 27, 12, 27, 921, 9, 27, 1, 27, 1,
    27, 1, 28, 3, 28, 926, 8, 28, 1, 28, 1, 28, 5, 28, 930, 8, 28, 10, 28, 12, 28, 933, 9, 28, 1, 28, 3, 28, 936, 8, 28,
    1, 28, 5, 28, 939, 8, 28, 10, 28, 12, 28, 942, 9, 28, 1, 28, 1, 28, 5, 28, 946, 8, 28, 10, 28, 12, 28, 949, 9, 28,
    1, 28, 3, 28, 952, 8, 28, 1, 28, 5, 28, 955, 8, 28, 10, 28, 12, 28, 958, 9, 28, 1, 28, 1, 28, 5, 28, 962, 8, 28, 10,
    28, 12, 28, 965, 9, 28, 1, 28, 3, 28, 968, 8, 28, 1, 28, 5, 28, 971, 8, 28, 10, 28, 12, 28, 974, 9, 28, 1, 28, 3,
    28, 977, 8, 28, 1, 29, 1, 29, 5, 29, 981, 8, 29, 10, 29, 12, 29, 984, 9, 29, 1, 29, 1, 29, 5, 29, 988, 8, 29, 10,
    29, 12, 29, 991, 9, 29, 1, 29, 1, 29, 5, 29, 995, 8, 29, 10, 29, 12, 29, 998, 9, 29, 1, 29, 5, 29, 1001, 8, 29, 10,
    29, 12, 29, 1004, 9, 29, 1, 29, 5, 29, 1007, 8, 29, 10, 29, 12, 29, 1010, 9, 29, 1, 29, 3, 29, 1013, 8, 29, 3, 29,
    1015, 8, 29, 1, 29, 5, 29, 1018, 8, 29, 10, 29, 12, 29, 1021, 9, 29, 1, 29, 1, 29, 1, 30, 3, 30, 1026, 8, 30, 1, 30,
    1, 30, 5, 30, 1030, 8, 30, 10, 30, 12, 30, 1033, 9, 30, 1, 30, 1, 30, 5, 30, 1037, 8, 30, 10, 30, 12, 30, 1040, 9,
    30, 1, 30, 3, 30, 1043, 8, 30, 1, 31, 3, 31, 1046, 8, 31, 1, 31, 1, 31, 5, 31, 1050, 8, 31, 10, 31, 12, 31, 1053, 9,
    31, 1, 31, 3, 31, 1056, 8, 31, 1, 31, 5, 31, 1059, 8, 31, 10, 31, 12, 31, 1062, 9, 31, 1, 31, 1, 31, 5, 31, 1066, 8,
    31, 10, 31, 12, 31, 1069, 9, 31, 1, 31, 1, 31, 3, 31, 1073, 8, 31, 1, 31, 5, 31, 1076, 8, 31, 10, 31, 12, 31, 1079,
    9, 31, 1, 31, 1, 31, 5, 31, 1083, 8, 31, 10, 31, 12, 31, 1086, 9, 31, 1, 31, 1, 31, 5, 31, 1090, 8, 31, 10, 31, 12,
    31, 1093, 9, 31, 1, 31, 1, 31, 5, 31, 1097, 8, 31, 10, 31, 12, 31, 1100, 9, 31, 1, 31, 3, 31, 1103, 8, 31, 1, 31, 5,
    31, 1106, 8, 31, 10, 31, 12, 31, 1109, 9, 31, 1, 31, 3, 31, 1112, 8, 31, 1, 31, 5, 31, 1115, 8, 31, 10, 31, 12, 31,
    1118, 9, 31, 1, 31, 3, 31, 1121, 8, 31, 1, 32, 1, 32, 1, 32, 5, 32, 1126, 8, 32, 10, 32, 12, 32, 1129, 9, 32, 1, 32,
    3, 32, 1132, 8, 32, 1, 33, 5, 33, 1135, 8, 33, 10, 33, 12, 33, 1138, 9, 33, 1, 33, 5, 33, 1141, 8, 33, 10, 33, 12,
    33, 1144, 9, 33, 1, 33, 1, 33, 5, 33, 1148, 8, 33, 10, 33, 12, 33, 1151, 9, 33, 1, 33, 1, 33, 5, 33, 1155, 8, 33,
    10, 33, 12, 33, 1158, 9, 33, 1, 33, 3, 33, 1161, 8, 33, 1, 34, 1, 34, 5, 34, 1165, 8, 34, 10, 34, 12, 34, 1168, 9,
    34, 1, 34, 1, 34, 5, 34, 1172, 8, 34, 10, 34, 12, 34, 1175, 9, 34, 1, 34, 1, 34, 5, 34, 1179, 8, 34, 10, 34, 12, 34,
    1182, 9, 34, 1, 34, 5, 34, 1185, 8, 34, 10, 34, 12, 34, 1188, 9, 34, 1, 34, 5, 34, 1191, 8, 34, 10, 34, 12, 34,
    1194, 9, 34, 1, 34, 3, 34, 1197, 8, 34, 1, 34, 5, 34, 1200, 8, 34, 10, 34, 12, 34, 1203, 9, 34, 1, 34, 1, 34, 1, 35,
    3, 35, 1208, 8, 35, 1, 35, 1, 35, 5, 35, 1212, 8, 35, 10, 35, 12, 35, 1215, 9, 35, 1, 35, 3, 35, 1218, 8, 35, 1, 35,
    5, 35, 1221, 8, 35, 10, 35, 12, 35, 1224, 9, 35, 1, 35, 1, 35, 5, 35, 1228, 8, 35, 10, 35, 12, 35, 1231, 9, 35, 1,
    35, 1, 35, 3, 35, 1235, 8, 35, 1, 35, 5, 35, 1238, 8, 35, 10, 35, 12, 35, 1241, 9, 35, 1, 35, 1, 35, 3, 35, 1245, 8,
    35, 1, 35, 5, 35, 1248, 8, 35, 10, 35, 12, 35, 1251, 9, 35, 1, 35, 3, 35, 1254, 8, 35, 1, 35, 5, 35, 1257, 8, 35,
    10, 35, 12, 35, 1260, 9, 35, 1, 35, 1, 35, 5, 35, 1264, 8, 35, 10, 35, 12, 35, 1267, 9, 35, 1, 35, 1, 35, 3, 35,
    1271, 8, 35, 3, 35, 1273, 8, 35, 1, 35, 5, 35, 1276, 8, 35, 10, 35, 12, 35, 1279, 9, 35, 1, 35, 3, 35, 1282, 8, 35,
    1, 35, 5, 35, 1285, 8, 35, 10, 35, 12, 35, 1288, 9, 35, 1, 35, 3, 35, 1291, 8, 35, 1, 35, 5, 35, 1294, 8, 35, 10,
    35, 12, 35, 1297, 9, 35, 1, 35, 3, 35, 1300, 8, 35, 1, 35, 3, 35, 1303, 8, 35, 1, 35, 3, 35, 1306, 8, 35, 1, 35, 5,
    35, 1309, 8, 35, 10, 35, 12, 35, 1312, 9, 35, 1, 35, 3, 35, 1315, 8, 35, 1, 35, 3, 35, 1318, 8, 35, 3, 35, 1320, 8,
    35, 1, 36, 1, 36, 5, 36, 1324, 8, 36, 10, 36, 12, 36, 1327, 9, 36, 1, 36, 1, 36, 1, 37, 3, 37, 1332, 8, 37, 1, 37,
    1, 37, 5, 37, 1336, 8, 37, 10, 37, 12, 37, 1339, 9, 37, 1, 37, 1, 37, 5, 37, 1343, 8, 37, 10, 37, 12, 37, 1346, 9,
    37, 1, 37, 1, 37, 5, 37, 1350, 8, 37, 10, 37, 12, 37, 1353, 9, 37, 1, 37, 1, 37, 5, 37, 1357, 8, 37, 10, 37, 12, 37,
    1360, 9, 37, 1, 37, 3, 37, 1363, 8, 37, 1, 37, 5, 37, 1366, 8, 37, 10, 37, 12, 37, 1369, 9, 37, 1, 37, 3, 37, 1372,
    8, 37, 1, 38, 3, 38, 1375, 8, 38, 1, 38, 1, 38, 5, 38, 1379, 8, 38, 10, 38, 12, 38, 1382, 9, 38, 1, 38, 1, 38, 5,
    38, 1386, 8, 38, 10, 38, 12, 38, 1389, 9, 38, 1, 38, 1, 38, 5, 38, 1393, 8, 38, 10, 38, 12, 38, 1396, 9, 38, 1, 38,
    3, 38, 1399, 8, 38, 1, 38, 5, 38, 1402, 8, 38, 10, 38, 12, 38, 1405, 9, 38, 1, 38, 1, 38, 5, 38, 1409, 8, 38, 10,
    38, 12, 38, 1412, 9, 38, 1, 38, 1, 38, 5, 38, 1416, 8, 38, 10, 38, 12, 38, 1419, 9, 38, 1, 38, 3, 38, 1422, 8, 38,
    1, 38, 5, 38, 1425, 8, 38, 10, 38, 12, 38, 1428, 9, 38, 1, 38, 1, 38, 3, 38, 1432, 8, 38, 1, 39, 1, 39, 5, 39, 1436,
    8, 39, 10, 39, 12, 39, 1439, 9, 39, 1, 39, 1, 39, 5, 39, 1443, 8, 39, 10, 39, 12, 39, 1446, 9, 39, 1, 39, 1, 39, 5,
    39, 1450, 8, 39, 10, 39, 12, 39, 1453, 9, 39, 1, 39, 5, 39, 1456, 8, 39, 10, 39, 12, 39, 1459, 9, 39, 1, 39, 5, 39,
    1462, 8, 39, 10, 39, 12, 39, 1465, 9, 39, 1, 39, 3, 39, 1468, 8, 39, 3, 39, 1470, 8, 39, 1, 39, 5, 39, 1473, 8, 39,
    10, 39, 12, 39, 1476, 9, 39, 1, 39, 1, 39, 1, 40, 3, 40, 1481, 8, 40, 1, 40, 1, 40, 5, 40, 1485, 8, 40, 10, 40, 12,
    40, 1488, 9, 40, 1, 40, 1, 40, 5, 40, 1492, 8, 40, 10, 40, 12, 40, 1495, 9, 40, 1, 40, 3, 40, 1498, 8, 40, 1, 41, 1,
    41, 5, 41, 1502, 8, 41, 10, 41, 12, 41, 1505, 9, 41, 1, 41, 1, 41, 5, 41, 1509, 8, 41, 10, 41, 12, 41, 1512, 9, 41,
    1, 41, 3, 41, 1515, 8, 41, 1, 42, 1, 42, 5, 42, 1519, 8, 42, 10, 42, 12, 42, 1522, 9, 42, 1, 42, 1, 42, 5, 42, 1526,
    8, 42, 10, 42, 12, 42, 1529, 9, 42, 1, 42, 1, 42, 1, 43, 3, 43, 1534, 8, 43, 1, 43, 1, 43, 5, 43, 1538, 8, 43, 10,
    43, 12, 43, 1541, 9, 43, 1, 43, 1, 43, 5, 43, 1545, 8, 43, 10, 43, 12, 43, 1548, 9, 43, 1, 43, 1, 43, 5, 43, 1552,
    8, 43, 10, 43, 12, 43, 1555, 9, 43, 1, 43, 3, 43, 1558, 8, 43, 1, 43, 5, 43, 1561, 8, 43, 10, 43, 12, 43, 1564, 9,
    43, 1, 43, 3, 43, 1567, 8, 43, 1, 44, 3, 44, 1570, 8, 44, 1, 44, 1, 44, 5, 44, 1574, 8, 44, 10, 44, 12, 44, 1577, 9,
    44, 1, 44, 1, 44, 5, 44, 1581, 8, 44, 10, 44, 12, 44, 1584, 9, 44, 1, 44, 1, 44, 5, 44, 1588, 8, 44, 10, 44, 12, 44,
    1591, 9, 44, 1, 44, 3, 44, 1594, 8, 44, 1, 44, 5, 44, 1597, 8, 44, 10, 44, 12, 44, 1600, 9, 44, 1, 44, 3, 44, 1603,
    8, 44, 1, 45, 1, 45, 5, 45, 1607, 8, 45, 10, 45, 12, 45, 1610, 9, 45, 1, 45, 1, 45, 1, 46, 1, 46, 5, 46, 1616, 8,
    46, 10, 46, 12, 46, 1619, 9, 46, 1, 46, 3, 46, 1622, 8, 46, 1, 46, 5, 46, 1625, 8, 46, 10, 46, 12, 46, 1628, 9, 46,
    1, 46, 1, 46, 5, 46, 1632, 8, 46, 10, 46, 12, 46, 1635, 9, 46, 1, 46, 3, 46, 1638, 8, 46, 1, 46, 5, 46, 1641, 8, 46,
    10, 46, 12, 46, 1644, 9, 46, 1, 46, 1, 46, 1, 47, 1, 47, 5, 47, 1650, 8, 47, 10, 47, 12, 47, 1653, 9, 47, 1, 47, 1,
    47, 5, 47, 1657, 8, 47, 10, 47, 12, 47, 1660, 9, 47, 1, 47, 5, 47, 1663, 8, 47, 10, 47, 12, 47, 1666, 9, 47, 1, 47,
    5, 47, 1669, 8, 47, 10, 47, 12, 47, 1672, 9, 47, 1, 47, 3, 47, 1675, 8, 47, 1, 48, 1, 48, 5, 48, 1679, 8, 48, 10,
    48, 12, 48, 1682, 9, 48, 3, 48, 1684, 8, 48, 1, 48, 1, 48, 5, 48, 1688, 8, 48, 10, 48, 12, 48, 1691, 9, 48, 1, 48,
    3, 48, 1694, 8, 48, 1, 48, 5, 48, 1697, 8, 48, 10, 48, 12, 48, 1700, 9, 48, 1, 48, 3, 48, 1703, 8, 48, 1, 49, 3, 49,
    1706, 8, 49, 1, 49, 1, 49, 1, 49, 1, 49, 1, 49, 3, 49, 1713, 8, 49, 1, 50, 1, 50, 3, 50, 1717, 8, 50, 1, 51, 1, 51,
    3, 51, 1721, 8, 51, 1, 51, 5, 51, 1724, 8, 51, 10, 51, 12, 51, 1727, 9, 51, 1, 51, 4, 51, 1730, 8, 51, 11, 51, 12,
    51, 1731, 1, 52, 1, 52, 1, 53, 1, 53, 5, 53, 1738, 8, 53, 10, 53, 12, 53, 1741, 9, 53, 1, 53, 1, 53, 5, 53, 1745, 8,
    53, 10, 53, 12, 53, 1748, 9, 53, 1, 53, 5, 53, 1751, 8, 53, 10, 53, 12, 53, 1754, 9, 53, 1, 54, 1, 54, 5, 54, 1758,
    8, 54, 10, 54, 12, 54, 1761, 9, 54, 1, 54, 3, 54, 1764, 8, 54, 1, 55, 3, 55, 1767, 8, 55, 1, 55, 1, 55, 3, 55, 1771,
    8, 55, 1, 56, 4, 56, 1774, 8, 56, 11, 56, 12, 56, 1775, 1, 57, 1, 57, 5, 57, 1780, 8, 57, 10, 57, 12, 57, 1783, 9,
    57, 1, 57, 3, 57, 1786, 8, 57, 1, 58, 1, 58, 5, 58, 1790, 8, 58, 10, 58, 12, 58, 1793, 9, 58, 1, 58, 1, 58, 5, 58,
    1797, 8, 58, 10, 58, 12, 58, 1800, 9, 58, 3, 58, 1802, 8, 58, 1, 58, 1, 58, 5, 58, 1806, 8, 58, 10, 58, 12, 58,
    1809, 9, 58, 1, 58, 1, 58, 5, 58, 1813, 8, 58, 10, 58, 12, 58, 1816, 9, 58, 1, 58, 1, 58, 1, 59, 1, 59, 5, 59, 1822,
    8, 59, 10, 59, 12, 59, 1825, 9, 59, 1, 59, 1, 59, 3, 59, 1829, 8, 59, 1, 59, 5, 59, 1832, 8, 59, 10, 59, 12, 59,
    1835, 9, 59, 1, 59, 1, 59, 5, 59, 1839, 8, 59, 10, 59, 12, 59, 1842, 9, 59, 1, 59, 1, 59, 3, 59, 1846, 8, 59, 5, 59,
    1848, 8, 59, 10, 59, 12, 59, 1851, 9, 59, 1, 59, 5, 59, 1854, 8, 59, 10, 59, 12, 59, 1857, 9, 59, 1, 59, 3, 59,
    1860, 8, 59, 1, 59, 5, 59, 1863, 8, 59, 10, 59, 12, 59, 1866, 9, 59, 1, 59, 1, 59, 1, 60, 1, 60, 5, 60, 1872, 8, 60,
    10, 60, 12, 60, 1875, 9, 60, 1, 60, 1, 60, 5, 60, 1879, 8, 60, 10, 60, 12, 60, 1882, 9, 60, 1, 60, 1, 60, 1, 61, 3,
    61, 1887, 8, 61, 1, 61, 1, 61, 1, 61, 3, 61, 1892, 8, 61, 1, 62, 1, 62, 5, 62, 1896, 8, 62, 10, 62, 12, 62, 1899, 9,
    62, 1, 62, 1, 62, 3, 62, 1903, 8, 62, 1, 62, 5, 62, 1906, 8, 62, 10, 62, 12, 62, 1909, 9, 62, 1, 62, 1, 62, 1, 63,
    3, 63, 1914, 8, 63, 1, 63, 1, 63, 3, 63, 1918, 8, 63, 1, 63, 5, 63, 1921, 8, 63, 10, 63, 12, 63, 1924, 9, 63, 1, 63,
    1, 63, 5, 63, 1928, 8, 63, 10, 63, 12, 63, 1931, 9, 63, 1, 63, 3, 63, 1934, 8, 63, 1, 63, 1, 63, 3, 63, 1938, 8, 63,
    1, 64, 1, 64, 1, 64, 1, 64, 5, 64, 1944, 8, 64, 10, 64, 12, 64, 1947, 9, 64, 3, 64, 1949, 8, 64, 1, 64, 3, 64, 1952,
    8, 64, 1, 65, 1, 65, 5, 65, 1956, 8, 65, 10, 65, 12, 65, 1959, 9, 65, 1, 65, 1, 65, 1, 65, 1, 65, 3, 65, 1965, 8,
    65, 1, 66, 1, 66, 1, 66, 5, 66, 1970, 8, 66, 10, 66, 12, 66, 1973, 9, 66, 1, 67, 1, 67, 3, 67, 1977, 8, 67, 1, 68,
    1, 68, 5, 68, 1981, 8, 68, 10, 68, 12, 68, 1984, 9, 68, 1, 68, 1, 68, 5, 68, 1988, 8, 68, 10, 68, 12, 68, 1991, 9,
    68, 1, 68, 1, 68, 1, 69, 1, 69, 1, 69, 3, 69, 1998, 8, 69, 1, 70, 1, 70, 5, 70, 2002, 8, 70, 10, 70, 12, 70, 2005,
    9, 70, 1, 70, 1, 70, 5, 70, 2009, 8, 70, 10, 70, 12, 70, 2012, 9, 70, 1, 70, 1, 70, 3, 70, 2016, 8, 70, 1, 70, 1,
    70, 1, 70, 1, 70, 5, 70, 2022, 8, 70, 10, 70, 12, 70, 2025, 9, 70, 1, 70, 3, 70, 2028, 8, 70, 1, 71, 1, 71, 5, 71,
    2032, 8, 71, 10, 71, 12, 71, 2035, 9, 71, 1, 71, 1, 71, 1, 71, 1, 71, 5, 71, 2041, 8, 71, 10, 71, 12, 71, 2044, 9,
    71, 1, 71, 1, 71, 3, 71, 2048, 8, 71, 1, 72, 1, 72, 5, 72, 2052, 8, 72, 10, 72, 12, 72, 2055, 9, 72, 1, 72, 3, 72,
    2058, 8, 72, 1, 72, 5, 72, 2061, 8, 72, 10, 72, 12, 72, 2064, 9, 72, 1, 72, 1, 72, 5, 72, 2068, 8, 72, 10, 72, 12,
    72, 2071, 9, 72, 1, 72, 1, 72, 1, 72, 1, 72, 1, 73, 1, 73, 1, 73, 1, 73, 1, 73, 1, 73, 3, 73, 2083, 8, 73, 1, 73, 5,
    73, 2086, 8, 73, 10, 73, 12, 73, 2089, 9, 73, 1, 73, 1, 73, 1, 74, 1, 74, 5, 74, 2095, 8, 74, 10, 74, 12, 74, 2098,
    9, 74, 1, 75, 4, 75, 2101, 8, 75, 11, 75, 12, 75, 2102, 1, 76, 1, 76, 1, 77, 1, 77, 5, 77, 2109, 8, 77, 10, 77, 12,
    77, 2112, 9, 77, 1, 77, 1, 77, 5, 77, 2116, 8, 77, 10, 77, 12, 77, 2119, 9, 77, 1, 77, 5, 77, 2122, 8, 77, 10, 77,
    12, 77, 2125, 9, 77, 1, 78, 1, 78, 5, 78, 2129, 8, 78, 10, 78, 12, 78, 2132, 9, 78, 1, 78, 1, 78, 5, 78, 2136, 8,
    78, 10, 78, 12, 78, 2139, 9, 78, 1, 78, 5, 78, 2142, 8, 78, 10, 78, 12, 78, 2145, 9, 78, 1, 79, 1, 79, 1, 79, 5, 79,
    2150, 8, 79, 10, 79, 12, 79, 2153, 9, 79, 1, 79, 1, 79, 5, 79, 2157, 8, 79, 10, 79, 12, 79, 2160, 9, 79, 1, 80, 1,
    80, 1, 80, 5, 80, 2165, 8, 80, 10, 80, 12, 80, 2168, 9, 80, 1, 80, 1, 80, 5, 80, 2172, 8, 80, 10, 80, 12, 80, 2175,
    9, 80, 1, 81, 1, 81, 5, 81, 2179, 8, 81, 10, 81, 12, 81, 2182, 9, 81, 1, 82, 1, 82, 1, 82, 5, 82, 2187, 8, 82, 10,
    82, 12, 82, 2190, 9, 82, 1, 82, 1, 82, 1, 82, 1, 82, 5, 82, 2196, 8, 82, 10, 82, 12, 82, 2199, 9, 82, 1, 82, 1, 82,
    5, 82, 2203, 8, 82, 10, 82, 12, 82, 2206, 9, 82, 1, 83, 1, 83, 5, 83, 2210, 8, 83, 10, 83, 12, 83, 2213, 9, 83, 1,
    83, 1, 83, 5, 83, 2217, 8, 83, 10, 83, 12, 83, 2220, 9, 83, 1, 83, 1, 83, 5, 83, 2224, 8, 83, 10, 83, 12, 83, 2227,
    9, 83, 1, 84, 1, 84, 1, 84, 1, 85, 1, 85, 1, 85, 5, 85, 2235, 8, 85, 10, 85, 12, 85, 2238, 9, 85, 1, 85, 1, 85, 5,
    85, 2242, 8, 85, 10, 85, 12, 85, 2245, 9, 85, 1, 86, 1, 86, 1, 86, 5, 86, 2250, 8, 86, 10, 86, 12, 86, 2253, 9, 86,
    1, 86, 5, 86, 2256, 8, 86, 10, 86, 12, 86, 2259, 9, 86, 1, 87, 1, 87, 1, 87, 5, 87, 2264, 8, 87, 10, 87, 12, 87,
    2267, 9, 87, 1, 87, 1, 87, 5, 87, 2271, 8, 87, 10, 87, 12, 87, 2274, 9, 87, 1, 88, 1, 88, 1, 88, 5, 88, 2279, 8, 88,
    10, 88, 12, 88, 2282, 9, 88, 1, 88, 1, 88, 5, 88, 2286, 8, 88, 10, 88, 12, 88, 2289, 9, 88, 1, 89, 1, 89, 5, 89,
    2293, 8, 89, 10, 89, 12, 89, 2296, 9, 89, 1, 89, 1, 89, 5, 89, 2300, 8, 89, 10, 89, 12, 89, 2303, 9, 89, 1, 89, 1,
    89, 5, 89, 2307, 8, 89, 10, 89, 12, 89, 2310, 9, 89, 1, 90, 5, 90, 2313, 8, 90, 10, 90, 12, 90, 2316, 9, 90, 1, 90,
    1, 90, 1, 91, 1, 91, 1, 91, 1, 91, 5, 91, 2324, 8, 91, 10, 91, 12, 91, 2327, 9, 91, 3, 91, 2329, 8, 91, 1, 92, 1,
    92, 5, 92, 2333, 8, 92, 10, 92, 12, 92, 2336, 9, 92, 1, 93, 1, 93, 1, 93, 1, 93, 1, 93, 3, 93, 2343, 8, 93, 1, 94,
    1, 94, 1, 94, 1, 94, 1, 94, 3, 94, 2350, 8, 94, 1, 95, 1, 95, 5, 95, 2354, 8, 95, 10, 95, 12, 95, 2357, 9, 95, 1,
    95, 1, 95, 5, 95, 2361, 8, 95, 10, 95, 12, 95, 2364, 9, 95, 1, 95, 1, 95, 1, 96, 1, 96, 3, 96, 2370, 8, 96, 1, 97,
    1, 97, 5, 97, 2374, 8, 97, 10, 97, 12, 97, 2377, 9, 97, 1, 97, 1, 97, 5, 97, 2381, 8, 97, 10, 97, 12, 97, 2384, 9,
    97, 1, 97, 1, 97, 1, 98, 1, 98, 1, 98, 3, 98, 2391, 8, 98, 1, 99, 1, 99, 5, 99, 2395, 8, 99, 10, 99, 12, 99, 2398,
    9, 99, 1, 99, 1, 99, 5, 99, 2402, 8, 99, 10, 99, 12, 99, 2405, 9, 99, 1, 99, 1, 99, 5, 99, 2409, 8, 99, 10, 99, 12,
    99, 2412, 9, 99, 1, 99, 5, 99, 2415, 8, 99, 10, 99, 12, 99, 2418, 9, 99, 1, 99, 5, 99, 2421, 8, 99, 10, 99, 12, 99,
    2424, 9, 99, 1, 99, 3, 99, 2427, 8, 99, 1, 99, 5, 99, 2430, 8, 99, 10, 99, 12, 99, 2433, 9, 99, 1, 99, 1, 99, 1,
    100, 1, 100, 5, 100, 2439, 8, 100, 10, 100, 12, 100, 2442, 9, 100, 1, 100, 1, 100, 1, 100, 3, 100, 2447, 8, 100, 1,
    101, 3, 101, 2450, 8, 101, 1, 101, 3, 101, 2453, 8, 101, 1, 101, 1, 101, 3, 101, 2457, 8, 101, 1, 102, 5, 102, 2460,
    8, 102, 10, 102, 12, 102, 2463, 9, 102, 1, 102, 3, 102, 2466, 8, 102, 1, 102, 5, 102, 2469, 8, 102, 10, 102, 12,
    102, 2472, 9, 102, 1, 102, 1, 102, 1, 103, 1, 103, 5, 103, 2478, 8, 103, 10, 103, 12, 103, 2481, 9, 103, 1, 103, 1,
    103, 5, 103, 2485, 8, 103, 10, 103, 12, 103, 2488, 9, 103, 1, 103, 1, 103, 5, 103, 2492, 8, 103, 10, 103, 12, 103,
    2495, 9, 103, 1, 103, 5, 103, 2498, 8, 103, 10, 103, 12, 103, 2501, 9, 103, 1, 103, 5, 103, 2504, 8, 103, 10, 103,
    12, 103, 2507, 9, 103, 1, 103, 3, 103, 2510, 8, 103, 1, 103, 5, 103, 2513, 8, 103, 10, 103, 12, 103, 2516, 9, 103,
    1, 103, 1, 103, 1, 104, 1, 104, 5, 104, 2522, 8, 104, 10, 104, 12, 104, 2525, 9, 104, 1, 104, 1, 104, 5, 104, 2529,
    8, 104, 10, 104, 12, 104, 2532, 9, 104, 1, 104, 1, 104, 5, 104, 2536, 8, 104, 10, 104, 12, 104, 2539, 9, 104, 1,
    104, 5, 104, 2542, 8, 104, 10, 104, 12, 104, 2545, 9, 104, 1, 104, 5, 104, 2548, 8, 104, 10, 104, 12, 104, 2551, 9,
    104, 1, 104, 3, 104, 2554, 8, 104, 1, 104, 5, 104, 2557, 8, 104, 10, 104, 12, 104, 2560, 9, 104, 3, 104, 2562, 8,
    104, 1, 104, 1, 104, 1, 105, 3, 105, 2567, 8, 105, 1, 105, 5, 105, 2570, 8, 105, 10, 105, 12, 105, 2573, 9, 105, 1,
    105, 1, 105, 5, 105, 2577, 8, 105, 10, 105, 12, 105, 2580, 9, 105, 1, 105, 1, 105, 5, 105, 2584, 8, 105, 10, 105,
    12, 105, 2587, 9, 105, 3, 105, 2589, 8, 105, 1, 105, 3, 105, 2592, 8, 105, 1, 105, 5, 105, 2595, 8, 105, 10, 105,
    12, 105, 2598, 9, 105, 1, 105, 1, 105, 1, 106, 1, 106, 1, 106, 1, 106, 1, 106, 1, 106, 1, 106, 1, 106, 1, 106, 1,
    106, 1, 106, 1, 106, 1, 106, 1, 106, 3, 106, 2616, 8, 106, 1, 107, 1, 107, 5, 107, 2620, 8, 107, 10, 107, 12, 107,
    2623, 9, 107, 1, 107, 1, 107, 5, 107, 2627, 8, 107, 10, 107, 12, 107, 2630, 9, 107, 1, 107, 1, 107, 1, 108, 1, 108,
    5, 108, 2636, 8, 108, 10, 108, 12, 108, 2639, 9, 108, 1, 108, 1, 108, 5, 108, 2643, 8, 108, 10, 108, 12, 108, 2646,
    9, 108, 1, 108, 1, 108, 5, 108, 2650, 8, 108, 10, 108, 12, 108, 2653, 9, 108, 1, 108, 5, 108, 2656, 8, 108, 10, 108,
    12, 108, 2659, 9, 108, 1, 108, 5, 108, 2662, 8, 108, 10, 108, 12, 108, 2665, 9, 108, 1, 108, 3, 108, 2668, 8, 108,
    1, 108, 5, 108, 2671, 8, 108, 10, 108, 12, 108, 2674, 9, 108, 3, 108, 2676, 8, 108, 1, 108, 1, 108, 1, 109, 1, 109,
    1, 110, 1, 110, 3, 110, 2684, 8, 110, 1, 111, 1, 111, 1, 111, 5, 111, 2689, 8, 111, 10, 111, 12, 111, 2692, 9, 111,
    1, 111, 1, 111, 1, 112, 1, 112, 1, 112, 1, 112, 5, 112, 2700, 8, 112, 10, 112, 12, 112, 2703, 9, 112, 1, 112, 1,
    112, 1, 113, 1, 113, 1, 114, 1, 114, 5, 114, 2711, 8, 114, 10, 114, 12, 114, 2714, 9, 114, 1, 114, 1, 114, 5, 114,
    2718, 8, 114, 10, 114, 12, 114, 2721, 9, 114, 1, 114, 1, 114, 1, 115, 1, 115, 1, 116, 1, 116, 5, 116, 2729, 8, 116,
    10, 116, 12, 116, 2732, 9, 116, 1, 116, 1, 116, 5, 116, 2736, 8, 116, 10, 116, 12, 116, 2739, 9, 116, 1, 116, 1,
    116, 1, 117, 1, 117, 5, 117, 2745, 8, 117, 10, 117, 12, 117, 2748, 9, 117, 1, 117, 3, 117, 2751, 8, 117, 1, 117, 5,
    117, 2754, 8, 117, 10, 117, 12, 117, 2757, 9, 117, 1, 117, 1, 117, 5, 117, 2761, 8, 117, 10, 117, 12, 117, 2764, 9,
    117, 3, 117, 2766, 8, 117, 1, 117, 1, 117, 5, 117, 2770, 8, 117, 10, 117, 12, 117, 2773, 9, 117, 1, 117, 1, 117, 1,
    118, 1, 118, 5, 118, 2779, 8, 118, 10, 118, 12, 118, 2782, 9, 118, 1, 118, 1, 118, 5, 118, 2786, 8, 118, 10, 118,
    12, 118, 2789, 9, 118, 1, 118, 5, 118, 2792, 8, 118, 10, 118, 12, 118, 2795, 9, 118, 1, 118, 5, 118, 2798, 8, 118,
    10, 118, 12, 118, 2801, 9, 118, 1, 118, 3, 118, 2804, 8, 118, 1, 119, 1, 119, 1, 119, 5, 119, 2809, 8, 119, 10, 119,
    12, 119, 2812, 9, 119, 1, 119, 1, 119, 5, 119, 2816, 8, 119, 10, 119, 12, 119, 2819, 9, 119, 1, 119, 3, 119, 2822,
    8, 119, 3, 119, 2824, 8, 119, 1, 120, 3, 120, 2827, 8, 120, 1, 120, 5, 120, 2830, 8, 120, 10, 120, 12, 120, 2833, 9,
    120, 1, 120, 1, 120, 5, 120, 2837, 8, 120, 10, 120, 12, 120, 2840, 9, 120, 1, 120, 1, 120, 5, 120, 2844, 8, 120, 10,
    120, 12, 120, 2847, 9, 120, 1, 120, 1, 120, 3, 120, 2851, 8, 120, 1, 120, 5, 120, 2854, 8, 120, 10, 120, 12, 120,
    2857, 9, 120, 1, 120, 1, 120, 5, 120, 2861, 8, 120, 10, 120, 12, 120, 2864, 9, 120, 1, 120, 1, 120, 5, 120, 2868, 8,
    120, 10, 120, 12, 120, 2871, 9, 120, 1, 120, 3, 120, 2874, 8, 120, 1, 120, 5, 120, 2877, 8, 120, 10, 120, 12, 120,
    2880, 9, 120, 1, 120, 3, 120, 2883, 8, 120, 1, 120, 5, 120, 2886, 8, 120, 10, 120, 12, 120, 2889, 9, 120, 1, 120, 3,
    120, 2892, 8, 120, 1, 121, 1, 121, 3, 121, 2896, 8, 121, 1, 122, 3, 122, 2899, 8, 122, 1, 122, 5, 122, 2902, 8, 122,
    10, 122, 12, 122, 2905, 9, 122, 1, 122, 1, 122, 5, 122, 2909, 8, 122, 10, 122, 12, 122, 2912, 9, 122, 1, 122, 1,
    122, 5, 122, 2916, 8, 122, 10, 122, 12, 122, 2919, 9, 122, 1, 122, 1, 122, 5, 122, 2923, 8, 122, 10, 122, 12, 122,
    2926, 9, 122, 3, 122, 2928, 8, 122, 1, 122, 5, 122, 2931, 8, 122, 10, 122, 12, 122, 2934, 9, 122, 1, 122, 3, 122,
    2937, 8, 122, 1, 123, 1, 123, 1, 124, 1, 124, 1, 124, 5, 124, 2944, 8, 124, 10, 124, 12, 124, 2947, 9, 124, 1, 124,
    1, 124, 5, 124, 2951, 8, 124, 10, 124, 12, 124, 2954, 9, 124, 1, 124, 1, 124, 3, 124, 2958, 8, 124, 1, 124, 1, 124,
    3, 124, 2962, 8, 124, 1, 124, 3, 124, 2965, 8, 124, 1, 125, 1, 125, 5, 125, 2969, 8, 125, 10, 125, 12, 125, 2972, 9,
    125, 1, 125, 1, 125, 5, 125, 2976, 8, 125, 10, 125, 12, 125, 2979, 9, 125, 1, 125, 1, 125, 5, 125, 2983, 8, 125, 10,
    125, 12, 125, 2986, 9, 125, 1, 125, 1, 125, 5, 125, 2990, 8, 125, 10, 125, 12, 125, 2993, 9, 125, 1, 125, 1, 125, 3,
    125, 2997, 8, 125, 1, 125, 5, 125, 3000, 8, 125, 10, 125, 12, 125, 3003, 9, 125, 1, 125, 3, 125, 3006, 8, 125, 1,
    125, 5, 125, 3009, 8, 125, 10, 125, 12, 125, 3012, 9, 125, 1, 125, 1, 125, 5, 125, 3016, 8, 125, 10, 125, 12, 125,
    3019, 9, 125, 1, 125, 1, 125, 3, 125, 3023, 8, 125, 1, 125, 3, 125, 3026, 8, 125, 1, 126, 1, 126, 5, 126, 3030, 8,
    126, 10, 126, 12, 126, 3033, 9, 126, 1, 126, 5, 126, 3036, 8, 126, 10, 126, 12, 126, 3039, 9, 126, 1, 126, 1, 126,
    5, 126, 3043, 8, 126, 10, 126, 12, 126, 3046, 9, 126, 1, 126, 1, 126, 5, 126, 3050, 8, 126, 10, 126, 12, 126, 3053,
    9, 126, 1, 126, 1, 126, 5, 126, 3057, 8, 126, 10, 126, 12, 126, 3060, 9, 126, 3, 126, 3062, 8, 126, 1, 126, 1, 126,
    1, 126, 1, 127, 1, 127, 5, 127, 3069, 8, 127, 10, 127, 12, 127, 3072, 9, 127, 1, 127, 3, 127, 3075, 8, 127, 1, 127,
    5, 127, 3078, 8, 127, 10, 127, 12, 127, 3081, 9, 127, 1, 127, 1, 127, 5, 127, 3085, 8, 127, 10, 127, 12, 127, 3088,
    9, 127, 1, 127, 1, 127, 5, 127, 3092, 8, 127, 10, 127, 12, 127, 3095, 9, 127, 5, 127, 3097, 8, 127, 10, 127, 12,
    127, 3100, 9, 127, 1, 127, 5, 127, 3103, 8, 127, 10, 127, 12, 127, 3106, 9, 127, 1, 127, 1, 127, 1, 128, 1, 128, 5,
    128, 3112, 8, 128, 10, 128, 12, 128, 3115, 9, 128, 1, 128, 1, 128, 5, 128, 3119, 8, 128, 10, 128, 12, 128, 3122, 9,
    128, 1, 128, 5, 128, 3125, 8, 128, 10, 128, 12, 128, 3128, 9, 128, 1, 128, 5, 128, 3131, 8, 128, 10, 128, 12, 128,
    3134, 9, 128, 1, 128, 3, 128, 3137, 8, 128, 1, 128, 5, 128, 3140, 8, 128, 10, 128, 12, 128, 3143, 9, 128, 1, 128, 1,
    128, 5, 128, 3147, 8, 128, 10, 128, 12, 128, 3150, 9, 128, 1, 128, 1, 128, 3, 128, 3154, 8, 128, 1, 128, 1, 128, 5,
    128, 3158, 8, 128, 10, 128, 12, 128, 3161, 9, 128, 1, 128, 1, 128, 5, 128, 3165, 8, 128, 10, 128, 12, 128, 3168, 9,
    128, 1, 128, 1, 128, 3, 128, 3172, 8, 128, 3, 128, 3174, 8, 128, 1, 129, 1, 129, 1, 129, 3, 129, 3179, 8, 129, 1,
    130, 1, 130, 5, 130, 3183, 8, 130, 10, 130, 12, 130, 3186, 9, 130, 1, 130, 1, 130, 1, 131, 1, 131, 5, 131, 3192, 8,
    131, 10, 131, 12, 131, 3195, 9, 131, 1, 131, 1, 131, 1, 132, 1, 132, 5, 132, 3201, 8, 132, 10, 132, 12, 132, 3204,
    9, 132, 1, 132, 1, 132, 5, 132, 3208, 8, 132, 10, 132, 12, 132, 3211, 9, 132, 1, 132, 4, 132, 3214, 8, 132, 11, 132,
    12, 132, 3215, 1, 132, 5, 132, 3219, 8, 132, 10, 132, 12, 132, 3222, 9, 132, 1, 132, 3, 132, 3225, 8, 132, 1, 132,
    5, 132, 3228, 8, 132, 10, 132, 12, 132, 3231, 9, 132, 1, 132, 3, 132, 3234, 8, 132, 1, 133, 1, 133, 5, 133, 3238, 8,
    133, 10, 133, 12, 133, 3241, 9, 133, 1, 133, 1, 133, 5, 133, 3245, 8, 133, 10, 133, 12, 133, 3248, 9, 133, 1, 133,
    1, 133, 1, 133, 1, 133, 5, 133, 3254, 8, 133, 10, 133, 12, 133, 3257, 9, 133, 1, 133, 3, 133, 3260, 8, 133, 1, 133,
    1, 133, 5, 133, 3264, 8, 133, 10, 133, 12, 133, 3267, 9, 133, 1, 133, 1, 133, 1, 134, 1, 134, 5, 134, 3273, 8, 134,
    10, 134, 12, 134, 3276, 9, 134, 1, 134, 1, 134, 1, 135, 1, 135, 5, 135, 3282, 8, 135, 10, 135, 12, 135, 3285, 9,
    135, 1, 135, 1, 135, 1, 135, 3, 135, 3290, 8, 135, 1, 135, 1, 135, 1, 135, 1, 135, 3, 135, 3296, 8, 135, 1, 136, 3,
    136, 3299, 8, 136, 1, 136, 1, 136, 5, 136, 3303, 8, 136, 10, 136, 12, 136, 3306, 9, 136, 1, 136, 1, 136, 3, 136,
    3310, 8, 136, 1, 137, 1, 137, 1, 138, 1, 138, 1, 139, 1, 139, 1, 140, 1, 140, 1, 141, 1, 141, 1, 142, 1, 142, 1,
    143, 1, 143, 1, 144, 1, 144, 1, 145, 1, 145, 1, 145, 1, 145, 1, 145, 3, 145, 3333, 8, 145, 1, 146, 1, 146, 1, 146,
    1, 146, 3, 146, 3339, 8, 146, 1, 147, 1, 147, 1, 148, 5, 148, 3344, 8, 148, 10, 148, 12, 148, 3347, 9, 148, 1, 148,
    1, 148, 5, 148, 3351, 8, 148, 10, 148, 12, 148, 3354, 9, 148, 1, 148, 1, 148, 3, 148, 3358, 8, 148, 1, 149, 1, 149,
    1, 149, 1, 150, 1, 150, 4, 150, 3365, 8, 150, 11, 150, 12, 150, 3366, 1, 151, 1, 151, 4, 151, 3371, 8, 151, 11, 151,
    12, 151, 3372, 1, 152, 1, 152, 1, 152, 1, 152, 1, 152, 1, 152, 1, 152, 1, 152, 3, 152, 3383, 8, 152, 1, 152, 5, 152,
    3386, 8, 152, 10, 152, 12, 152, 3389, 9, 152, 1, 153, 4, 153, 3392, 8, 153, 11, 153, 12, 153, 3393, 1, 154, 1, 154,
    1, 154, 5, 154, 3399, 8, 154, 10, 154, 12, 154, 3402, 9, 154, 3, 154, 3404, 8, 154, 1, 155, 1, 155, 1, 156, 1, 156,
    1, 157, 1, 157, 1, 158, 1, 158, 1, 159, 4, 159, 3415, 8, 159, 11, 159, 12, 159, 3416, 1, 160, 1, 160, 5, 160, 3421,
    8, 160, 10, 160, 12, 160, 3424, 9, 160, 1, 160, 1, 160, 5, 160, 3428, 8, 160, 10, 160, 12, 160, 3431, 9, 160, 1,
    160, 3, 160, 3434, 8, 160, 1, 161, 1, 161, 1, 162, 1, 162, 1, 163, 1, 163, 1, 164, 1, 164, 1, 165, 1, 165, 1, 166,
    1, 166, 1, 167, 1, 167, 3, 167, 3450, 8, 167, 1, 167, 5, 167, 3453, 8, 167, 10, 167, 12, 167, 3456, 9, 167, 1, 168,
    1, 168, 5, 168, 3460, 8, 168, 10, 168, 12, 168, 3463, 9, 168, 1, 168, 1, 168, 3, 168, 3467, 8, 168, 1, 168, 1, 168,
    1, 169, 1, 169, 5, 169, 3473, 8, 169, 10, 169, 12, 169, 3476, 9, 169, 1, 169, 1, 169, 3, 169, 3480, 8, 169, 1, 169,
    1, 169, 4, 169, 3484, 8, 169, 11, 169, 12, 169, 3485, 1, 169, 1, 169, 1, 170, 1, 170, 1, 170, 5, 170, 3493, 8, 170,
    10, 170, 12, 170, 3496, 9, 170, 1, 170, 1, 170, 1, 171, 1, 171, 3, 171, 3502, 8, 171, 1, 172, 1, 172, 1, 173, 1,
    173, 5, 173, 3508, 8, 173, 10, 173, 12, 173, 3511, 9, 173, 1, 173, 1, 173, 5, 173, 3515, 8, 173, 10, 173, 12, 173,
    3518, 9, 173, 1, 173, 0, 0, 174, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42,
    44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100,
    102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128, 130, 132, 134, 136, 138, 140, 142, 144, 146,
    148, 150, 152, 154, 156, 158, 160, 162, 164, 166, 168, 170, 172, 174, 176, 178, 180, 182, 184, 186, 188, 190, 192,
    194, 196, 198, 200, 202, 204, 206, 208, 210, 212, 214, 216, 218, 220, 222, 224, 226, 228, 230, 232, 234, 236, 238,
    240, 242, 244, 246, 248, 250, 252, 254, 256, 258, 260, 262, 264, 266, 268, 270, 272, 274, 276, 278, 280, 282, 284,
    286, 288, 290, 292, 294, 296, 298, 300, 302, 304, 306, 308, 310, 312, 314, 316, 318, 320, 322, 324, 326, 328, 330,
    332, 334, 336, 338, 340, 342, 344, 346, 0, 31, 2, 0, 41, 41, 43, 43, 1, 0, 78, 79, 1, 0, 85, 86, 1, 0, 45, 46, 1, 0,
    41, 42, 2, 0, 5, 5, 27, 27, 1, 0, 36, 37, 2, 0, 137, 137, 140, 147, 1, 0, 161, 163, 1, 0, 166, 168, 2, 0, 61, 61,
    85, 85, 2, 0, 58, 58, 99, 99, 1, 0, 29, 33, 2, 0, 51, 52, 54, 55, 1, 0, 47, 50, 2, 0, 104, 104, 106, 106, 2, 0, 103,
    103, 105, 105, 1, 0, 18, 19, 1, 0, 15, 17, 2, 0, 53, 53, 102, 102, 1, 0, 24, 25, 1, 0, 113, 118, 2, 0, 125, 125,
    130, 130, 1, 0, 109, 112, 2, 0, 104, 104, 107, 107, 1, 0, 119, 124, 1, 0, 126, 128, 1, 0, 131, 133, 1, 0, 135, 136,
    1, 0, 64, 71, 7, 0, 63, 71, 73, 73, 81, 84, 88, 88, 93, 94, 107, 136, 148, 148, 3945, 0, 349, 1, 0, 0, 0, 2, 374, 1,
    0, 0, 0, 4, 400, 1, 0, 0, 0, 6, 406, 1, 0, 0, 0, 8, 443, 1, 0, 0, 0, 10, 448, 1, 0, 0, 0, 12, 451, 1, 0, 0, 0, 14,
    461, 1, 0, 0, 0, 16, 464, 1, 0, 0, 0, 18, 469, 1, 0, 0, 0, 20, 508, 1, 0, 0, 0, 22, 511, 1, 0, 0, 0, 24, 602, 1, 0,
    0, 0, 26, 606, 1, 0, 0, 0, 28, 622, 1, 0, 0, 0, 30, 669, 1, 0, 0, 0, 32, 705, 1, 0, 0, 0, 34, 737, 1, 0, 0, 0, 36,
    739, 1, 0, 0, 0, 38, 751, 1, 0, 0, 0, 40, 764, 1, 0, 0, 0, 42, 781, 1, 0, 0, 0, 44, 826, 1, 0, 0, 0, 46, 851, 1, 0,
    0, 0, 48, 881, 1, 0, 0, 0, 50, 906, 1, 0, 0, 0, 52, 913, 1, 0, 0, 0, 54, 915, 1, 0, 0, 0, 56, 925, 1, 0, 0, 0, 58,
    978, 1, 0, 0, 0, 60, 1025, 1, 0, 0, 0, 62, 1045, 1, 0, 0, 0, 64, 1131, 1, 0, 0, 0, 66, 1136, 1, 0, 0, 0, 68, 1162,
    1, 0, 0, 0, 70, 1207, 1, 0, 0, 0, 72, 1321, 1, 0, 0, 0, 74, 1331, 1, 0, 0, 0, 76, 1374, 1, 0, 0, 0, 78, 1433, 1, 0,
    0, 0, 80, 1480, 1, 0, 0, 0, 82, 1499, 1, 0, 0, 0, 84, 1516, 1, 0, 0, 0, 86, 1533, 1, 0, 0, 0, 88, 1569, 1, 0, 0, 0,
    90, 1604, 1, 0, 0, 0, 92, 1613, 1, 0, 0, 0, 94, 1647, 1, 0, 0, 0, 96, 1683, 1, 0, 0, 0, 98, 1705, 1, 0, 0, 0, 100,
    1716, 1, 0, 0, 0, 102, 1720, 1, 0, 0, 0, 104, 1733, 1, 0, 0, 0, 106, 1735, 1, 0, 0, 0, 108, 1755, 1, 0, 0, 0, 110,
    1770, 1, 0, 0, 0, 112, 1773, 1, 0, 0, 0, 114, 1785, 1, 0, 0, 0, 116, 1801, 1, 0, 0, 0, 118, 1819, 1, 0, 0, 0, 120,
    1869, 1, 0, 0, 0, 122, 1886, 1, 0, 0, 0, 124, 1893, 1, 0, 0, 0, 126, 1913, 1, 0, 0, 0, 128, 1948, 1, 0, 0, 0, 130,
    1957, 1, 0, 0, 0, 132, 1966, 1, 0, 0, 0, 134, 1976, 1, 0, 0, 0, 136, 1978, 1, 0, 0, 0, 138, 1997, 1, 0, 0, 0, 140,
    1999, 1, 0, 0, 0, 142, 2029, 1, 0, 0, 0, 144, 2049, 1, 0, 0, 0, 146, 2082, 1, 0, 0, 0, 148, 2092, 1, 0, 0, 0, 150,
    2100, 1, 0, 0, 0, 152, 2104, 1, 0, 0, 0, 154, 2106, 1, 0, 0, 0, 156, 2126, 1, 0, 0, 0, 158, 2146, 1, 0, 0, 0, 160,
    2161, 1, 0, 0, 0, 162, 2176, 1, 0, 0, 0, 164, 2183, 1, 0, 0, 0, 166, 2207, 1, 0, 0, 0, 168, 2228, 1, 0, 0, 0, 170,
    2231, 1, 0, 0, 0, 172, 2246, 1, 0, 0, 0, 174, 2260, 1, 0, 0, 0, 176, 2275, 1, 0, 0, 0, 178, 2290, 1, 0, 0, 0, 180,
    2314, 1, 0, 0, 0, 182, 2328, 1, 0, 0, 0, 184, 2330, 1, 0, 0, 0, 186, 2342, 1, 0, 0, 0, 188, 2349, 1, 0, 0, 0, 190,
    2351, 1, 0, 0, 0, 192, 2369, 1, 0, 0, 0, 194, 2371, 1, 0, 0, 0, 196, 2390, 1, 0, 0, 0, 198, 2392, 1, 0, 0, 0, 200,
    2436, 1, 0, 0, 0, 202, 2449, 1, 0, 0, 0, 204, 2461, 1, 0, 0, 0, 206, 2475, 1, 0, 0, 0, 208, 2519, 1, 0, 0, 0, 210,
    2566, 1, 0, 0, 0, 212, 2615, 1, 0, 0, 0, 214, 2617, 1, 0, 0, 0, 216, 2633, 1, 0, 0, 0, 218, 2679, 1, 0, 0, 0, 220,
    2683, 1, 0, 0, 0, 222, 2685, 1, 0, 0, 0, 224, 2695, 1, 0, 0, 0, 226, 2706, 1, 0, 0, 0, 228, 2708, 1, 0, 0, 0, 230,
    2724, 1, 0, 0, 0, 232, 2726, 1, 0, 0, 0, 234, 2742, 1, 0, 0, 0, 236, 2776, 1, 0, 0, 0, 238, 2823, 1, 0, 0, 0, 240,
    2826, 1, 0, 0, 0, 242, 2895, 1, 0, 0, 0, 244, 2898, 1, 0, 0, 0, 246, 2938, 1, 0, 0, 0, 248, 2964, 1, 0, 0, 0, 250,
    2966, 1, 0, 0, 0, 252, 3027, 1, 0, 0, 0, 254, 3066, 1, 0, 0, 0, 256, 3173, 1, 0, 0, 0, 258, 3178, 1, 0, 0, 0, 260,
    3180, 1, 0, 0, 0, 262, 3189, 1, 0, 0, 0, 264, 3198, 1, 0, 0, 0, 266, 3235, 1, 0, 0, 0, 268, 3270, 1, 0, 0, 0, 270,
    3295, 1, 0, 0, 0, 272, 3298, 1, 0, 0, 0, 274, 3311, 1, 0, 0, 0, 276, 3313, 1, 0, 0, 0, 278, 3315, 1, 0, 0, 0, 280,
    3317, 1, 0, 0, 0, 282, 3319, 1, 0, 0, 0, 284, 3321, 1, 0, 0, 0, 286, 3323, 1, 0, 0, 0, 288, 3325, 1, 0, 0, 0, 290,
    3332, 1, 0, 0, 0, 292, 3338, 1, 0, 0, 0, 294, 3340, 1, 0, 0, 0, 296, 3357, 1, 0, 0, 0, 298, 3359, 1, 0, 0, 0, 300,
    3364, 1, 0, 0, 0, 302, 3370, 1, 0, 0, 0, 304, 3382, 1, 0, 0, 0, 306, 3391, 1, 0, 0, 0, 308, 3403, 1, 0, 0, 0, 310,
    3405, 1, 0, 0, 0, 312, 3407, 1, 0, 0, 0, 314, 3409, 1, 0, 0, 0, 316, 3411, 1, 0, 0, 0, 318, 3414, 1, 0, 0, 0, 320,
    3433, 1, 0, 0, 0, 322, 3435, 1, 0, 0, 0, 324, 3437, 1, 0, 0, 0, 326, 3439, 1, 0, 0, 0, 328, 3441, 1, 0, 0, 0, 330,
    3443, 1, 0, 0, 0, 332, 3445, 1, 0, 0, 0, 334, 3449, 1, 0, 0, 0, 336, 3466, 1, 0, 0, 0, 338, 3479, 1, 0, 0, 0, 340,
    3489, 1, 0, 0, 0, 342, 3501, 1, 0, 0, 0, 344, 3503, 1, 0, 0, 0, 346, 3505, 1, 0, 0, 0, 348, 350, 3, 4, 2, 0, 349,
    348, 1, 0, 0, 0, 349, 350, 1, 0, 0, 0, 350, 354, 1, 0, 0, 0, 351, 353, 5, 5, 0, 0, 352, 351, 1, 0, 0, 0, 353, 356,
    1, 0, 0, 0, 354, 352, 1, 0, 0, 0, 354, 355, 1, 0, 0, 0, 355, 360, 1, 0, 0, 0, 356, 354, 1, 0, 0, 0, 357, 359, 3, 6,
    3, 0, 358, 357, 1, 0, 0, 0, 359, 362, 1, 0, 0, 0, 360, 358, 1, 0, 0, 0, 360, 361, 1, 0, 0, 0, 361, 363, 1, 0, 0, 0,
    362, 360, 1, 0, 0, 0, 363, 364, 3, 8, 4, 0, 364, 368, 3, 10, 5, 0, 365, 367, 3, 16, 8, 0, 366, 365, 1, 0, 0, 0, 367,
    370, 1, 0, 0, 0, 368, 366, 1, 0, 0, 0, 368, 369, 1, 0, 0, 0, 369, 371, 1, 0, 0, 0, 370, 368, 1, 0, 0, 0, 371, 372,
    5, 0, 0, 1, 372, 1, 1, 0, 0, 0, 373, 375, 3, 4, 2, 0, 374, 373, 1, 0, 0, 0, 374, 375, 1, 0, 0, 0, 375, 379, 1, 0, 0,
    0, 376, 378, 5, 5, 0, 0, 377, 376, 1, 0, 0, 0, 378, 381, 1, 0, 0, 0, 379, 377, 1, 0, 0, 0, 379, 380, 1, 0, 0, 0,
    380, 385, 1, 0, 0, 0, 381, 379, 1, 0, 0, 0, 382, 384, 3, 6, 3, 0, 383, 382, 1, 0, 0, 0, 384, 387, 1, 0, 0, 0, 385,
    383, 1, 0, 0, 0, 385, 386, 1, 0, 0, 0, 386, 388, 1, 0, 0, 0, 387, 385, 1, 0, 0, 0, 388, 389, 3, 8, 4, 0, 389, 395,
    3, 10, 5, 0, 390, 391, 3, 130, 65, 0, 391, 392, 3, 148, 74, 0, 392, 394, 1, 0, 0, 0, 393, 390, 1, 0, 0, 0, 394, 397,
    1, 0, 0, 0, 395, 393, 1, 0, 0, 0, 395, 396, 1, 0, 0, 0, 396, 398, 1, 0, 0, 0, 397, 395, 1, 0, 0, 0, 398, 399, 5, 0,
    0, 1, 399, 3, 1, 0, 0, 0, 400, 402, 5, 1, 0, 0, 401, 403, 5, 5, 0, 0, 402, 401, 1, 0, 0, 0, 403, 404, 1, 0, 0, 0,
    404, 402, 1, 0, 0, 0, 404, 405, 1, 0, 0, 0, 405, 5, 1, 0, 0, 0, 406, 407, 7, 0, 0, 0, 407, 411, 5, 63, 0, 0, 408,
    410, 5, 5, 0, 0, 409, 408, 1, 0, 0, 0, 410, 413, 1, 0, 0, 0, 411, 409, 1, 0, 0, 0, 411, 412, 1, 0, 0, 0, 412, 414,
    1, 0, 0, 0, 413, 411, 1, 0, 0, 0, 414, 418, 5, 26, 0, 0, 415, 417, 5, 5, 0, 0, 416, 415, 1, 0, 0, 0, 417, 420, 1, 0,
    0, 0, 418, 416, 1, 0, 0, 0, 418, 419, 1, 0, 0, 0, 419, 430, 1, 0, 0, 0, 420, 418, 1, 0, 0, 0, 421, 423, 5, 11, 0, 0,
    422, 424, 3, 342, 171, 0, 423, 422, 1, 0, 0, 0, 424, 425, 1, 0, 0, 0, 425, 423, 1, 0, 0, 0, 425, 426, 1, 0, 0, 0,
    426, 427, 1, 0, 0, 0, 427, 428, 5, 12, 0, 0, 428, 431, 1, 0, 0, 0, 429, 431, 3, 342, 171, 0, 430, 421, 1, 0, 0, 0,
    430, 429, 1, 0, 0, 0, 431, 435, 1, 0, 0, 0, 432, 434, 5, 5, 0, 0, 433, 432, 1, 0, 0, 0, 434, 437, 1, 0, 0, 0, 435,
    433, 1, 0, 0, 0, 435, 436, 1, 0, 0, 0, 436, 7, 1, 0, 0, 0, 437, 435, 1, 0, 0, 0, 438, 439, 5, 72, 0, 0, 439, 441, 3,
    346, 173, 0, 440, 442, 3, 148, 74, 0, 441, 440, 1, 0, 0, 0, 441, 442, 1, 0, 0, 0, 442, 444, 1, 0, 0, 0, 443, 438, 1,
    0, 0, 0, 443, 444, 1, 0, 0, 0, 444, 9, 1, 0, 0, 0, 445, 447, 3, 12, 6, 0, 446, 445, 1, 0, 0, 0, 447, 450, 1, 0, 0,
    0, 448, 446, 1, 0, 0, 0, 448, 449, 1, 0, 0, 0, 449, 11, 1, 0, 0, 0, 450, 448, 1, 0, 0, 0, 451, 452, 5, 73, 0, 0,
    452, 456, 3, 346, 173, 0, 453, 454, 5, 7, 0, 0, 454, 457, 5, 15, 0, 0, 455, 457, 3, 14, 7, 0, 456, 453, 1, 0, 0, 0,
    456, 455, 1, 0, 0, 0, 456, 457, 1, 0, 0, 0, 457, 459, 1, 0, 0, 0, 458, 460, 3, 148, 74, 0, 459, 458, 1, 0, 0, 0,
    459, 460, 1, 0, 0, 0, 460, 13, 1, 0, 0, 0, 461, 462, 5, 102, 0, 0, 462, 463, 3, 344, 172, 0, 463, 15, 1, 0, 0, 0,
    464, 466, 3, 20, 10, 0, 465, 467, 3, 150, 75, 0, 466, 465, 1, 0, 0, 0, 466, 467, 1, 0, 0, 0, 467, 17, 1, 0, 0, 0,
    468, 470, 3, 300, 150, 0, 469, 468, 1, 0, 0, 0, 469, 470, 1, 0, 0, 0, 470, 471, 1, 0, 0, 0, 471, 475, 5, 80, 0, 0,
    472, 474, 5, 5, 0, 0, 473, 472, 1, 0, 0, 0, 474, 477, 1, 0, 0, 0, 475, 473, 1, 0, 0, 0, 475, 476, 1, 0, 0, 0, 476,
    478, 1, 0, 0, 0, 477, 475, 1, 0, 0, 0, 478, 486, 3, 344, 172, 0, 479, 481, 5, 5, 0, 0, 480, 479, 1, 0, 0, 0, 481,
    484, 1, 0, 0, 0, 482, 480, 1, 0, 0, 0, 482, 483, 1, 0, 0, 0, 483, 485, 1, 0, 0, 0, 484, 482, 1, 0, 0, 0, 485, 487,
    3, 42, 21, 0, 486, 482, 1, 0, 0, 0, 486, 487, 1, 0, 0, 0, 487, 491, 1, 0, 0, 0, 488, 490, 5, 5, 0, 0, 489, 488, 1,
    0, 0, 0, 490, 493, 1, 0, 0, 0, 491, 489, 1, 0, 0, 0, 491, 492, 1, 0, 0, 0, 492, 494, 1, 0, 0, 0, 493, 491, 1, 0, 0,
    0, 494, 498, 5, 28, 0, 0, 495, 497, 5, 5, 0, 0, 496, 495, 1, 0, 0, 0, 497, 500, 1, 0, 0, 0, 498, 496, 1, 0, 0, 0,
    498, 499, 1, 0, 0, 0, 499, 501, 1, 0, 0, 0, 500, 498, 1, 0, 0, 0, 501, 502, 3, 98, 49, 0, 502, 19, 1, 0, 0, 0, 503,
    509, 3, 22, 11, 0, 504, 509, 3, 86, 43, 0, 505, 509, 3, 62, 31, 0, 506, 509, 3, 70, 35, 0, 507, 509, 3, 18, 9, 0,
    508, 503, 1, 0, 0, 0, 508, 504, 1, 0, 0, 0, 508, 505, 1, 0, 0, 0, 508, 506, 1, 0, 0, 0, 508, 507, 1, 0, 0, 0, 509,
    21, 1, 0, 0, 0, 510, 512, 3, 300, 150, 0, 511, 510, 1, 0, 0, 0, 511, 512, 1, 0, 0, 0, 512, 524, 1, 0, 0, 0, 513,
    525, 5, 74, 0, 0, 514, 518, 5, 76, 0, 0, 515, 517, 5, 5, 0, 0, 516, 515, 1, 0, 0, 0, 517, 520, 1, 0, 0, 0, 518, 516,
    1, 0, 0, 0, 518, 519, 1, 0, 0, 0, 519, 522, 1, 0, 0, 0, 520, 518, 1, 0, 0, 0, 521, 514, 1, 0, 0, 0, 521, 522, 1, 0,
    0, 0, 522, 523, 1, 0, 0, 0, 523, 525, 5, 75, 0, 0, 524, 513, 1, 0, 0, 0, 524, 521, 1, 0, 0, 0, 525, 529, 1, 0, 0, 0,
    526, 528, 5, 5, 0, 0, 527, 526, 1, 0, 0, 0, 528, 531, 1, 0, 0, 0, 529, 527, 1, 0, 0, 0, 529, 530, 1, 0, 0, 0, 530,
    532, 1, 0, 0, 0, 531, 529, 1, 0, 0, 0, 532, 540, 3, 344, 172, 0, 533, 535, 5, 5, 0, 0, 534, 533, 1, 0, 0, 0, 535,
    538, 1, 0, 0, 0, 536, 534, 1, 0, 0, 0, 536, 537, 1, 0, 0, 0, 537, 539, 1, 0, 0, 0, 538, 536, 1, 0, 0, 0, 539, 541,
    3, 42, 21, 0, 540, 536, 1, 0, 0, 0, 540, 541, 1, 0, 0, 0, 541, 549, 1, 0, 0, 0, 542, 544, 5, 5, 0, 0, 543, 542, 1,
    0, 0, 0, 544, 547, 1, 0, 0, 0, 545, 543, 1, 0, 0, 0, 545, 546, 1, 0, 0, 0, 546, 548, 1, 0, 0, 0, 547, 545, 1, 0, 0,
    0, 548, 550, 3, 24, 12, 0, 549, 545, 1, 0, 0, 0, 549, 550, 1, 0, 0, 0, 550, 565, 1, 0, 0, 0, 551, 553, 5, 5, 0, 0,
    552, 551, 1, 0, 0, 0, 553, 556, 1, 0, 0, 0, 554, 552, 1, 0, 0, 0, 554, 555, 1, 0, 0, 0, 555, 557, 1, 0, 0, 0, 556,
    554, 1, 0, 0, 0, 557, 561, 5, 26, 0, 0, 558, 560, 5, 5, 0, 0, 559, 558, 1, 0, 0, 0, 560, 563, 1, 0, 0, 0, 561, 559,
    1, 0, 0, 0, 561, 562, 1, 0, 0, 0, 562, 564, 1, 0, 0, 0, 563, 561, 1, 0, 0, 0, 564, 566, 3, 32, 16, 0, 565, 554, 1,
    0, 0, 0, 565, 566, 1, 0, 0, 0, 566, 574, 1, 0, 0, 0, 567, 569, 5, 5, 0, 0, 568, 567, 1, 0, 0, 0, 569, 572, 1, 0, 0,
    0, 570, 568, 1, 0, 0, 0, 570, 571, 1, 0, 0, 0, 571, 573, 1, 0, 0, 0, 572, 570, 1, 0, 0, 0, 573, 575, 3, 46, 23, 0,
    574, 570, 1, 0, 0, 0, 574, 575, 1, 0, 0, 0, 575, 590, 1, 0, 0, 0, 576, 578, 5, 5, 0, 0, 577, 576, 1, 0, 0, 0, 578,
    581, 1, 0, 0, 0, 579, 577, 1, 0, 0, 0, 579, 580, 1, 0, 0, 0, 580, 582, 1, 0, 0, 0, 581, 579, 1, 0, 0, 0, 582, 591,
    3, 26, 13, 0, 583, 585, 5, 5, 0, 0, 584, 583, 1, 0, 0, 0, 585, 588, 1, 0, 0, 0, 586, 584, 1, 0, 0, 0, 586, 587, 1,
    0, 0, 0, 587, 589, 1, 0, 0, 0, 588, 586, 1, 0, 0, 0, 589, 591, 3, 92, 46, 0, 590, 579, 1, 0, 0, 0, 590, 586, 1, 0,
    0, 0, 590, 591, 1, 0, 0, 0, 591, 23, 1, 0, 0, 0, 592, 594, 3, 300, 150, 0, 593, 592, 1, 0, 0, 0, 593, 594, 1, 0, 0,
    0, 594, 595, 1, 0, 0, 0, 595, 599, 5, 81, 0, 0, 596, 598, 5, 5, 0, 0, 597, 596, 1, 0, 0, 0, 598, 601, 1, 0, 0, 0,
    599, 597, 1, 0, 0, 0, 599, 600, 1, 0, 0, 0, 600, 603, 1, 0, 0, 0, 601, 599, 1, 0, 0, 0, 602, 593, 1, 0, 0, 0, 602,
    603, 1, 0, 0, 0, 603, 604, 1, 0, 0, 0, 604, 605, 3, 28, 14, 0, 605, 25, 1, 0, 0, 0, 606, 610, 5, 13, 0, 0, 607, 609,
    5, 5, 0, 0, 608, 607, 1, 0, 0, 0, 609, 612, 1, 0, 0, 0, 610, 608, 1, 0, 0, 0, 610, 611, 1, 0, 0, 0, 611, 613, 1, 0,
    0, 0, 612, 610, 1, 0, 0, 0, 613, 617, 3, 50, 25, 0, 614, 616, 5, 5, 0, 0, 615, 614, 1, 0, 0, 0, 616, 619, 1, 0, 0,
    0, 617, 615, 1, 0, 0, 0, 617, 618, 1, 0, 0, 0, 618, 620, 1, 0, 0, 0, 619, 617, 1, 0, 0, 0, 620, 621, 5, 14, 0, 0,
    621, 27, 1, 0, 0, 0, 622, 626, 5, 9, 0, 0, 623, 625, 5, 5, 0, 0, 624, 623, 1, 0, 0, 0, 625, 628, 1, 0, 0, 0, 626,
    624, 1, 0, 0, 0, 626, 627, 1, 0, 0, 0, 627, 658, 1, 0, 0, 0, 628, 626, 1, 0, 0, 0, 629, 646, 3, 30, 15, 0, 630, 632,
    5, 5, 0, 0, 631, 630, 1, 0, 0, 0, 632, 635, 1, 0, 0, 0, 633, 631, 1, 0, 0, 0, 633, 634, 1, 0, 0, 0, 634, 636, 1, 0,
    0, 0, 635, 633, 1, 0, 0, 0, 636, 640, 5, 8, 0, 0, 637, 639, 5, 5, 0, 0, 638, 637, 1, 0, 0, 0, 639, 642, 1, 0, 0, 0,
    640, 638, 1, 0, 0, 0, 640, 641, 1, 0, 0, 0, 641, 643, 1, 0, 0, 0, 642, 640, 1, 0, 0, 0, 643, 645, 3, 30, 15, 0, 644,
    633, 1, 0, 0, 0, 645, 648, 1, 0, 0, 0, 646, 644, 1, 0, 0, 0, 646, 647, 1, 0, 0, 0, 647, 656, 1, 0, 0, 0, 648, 646,
    1, 0, 0, 0, 649, 651, 5, 5, 0, 0, 650, 649, 1, 0, 0, 0, 651, 654, 1, 0, 0, 0, 652, 650, 1, 0, 0, 0, 652, 653, 1, 0,
    0, 0, 653, 655, 1, 0, 0, 0, 654, 652, 1, 0, 0, 0, 655, 657, 5, 8, 0, 0, 656, 652, 1, 0, 0, 0, 656, 657, 1, 0, 0, 0,
    657, 659, 1, 0, 0, 0, 658, 629, 1, 0, 0, 0, 658, 659, 1, 0, 0, 0, 659, 663, 1, 0, 0, 0, 660, 662, 5, 5, 0, 0, 661,
    660, 1, 0, 0, 0, 662, 665, 1, 0, 0, 0, 663, 661, 1, 0, 0, 0, 663, 664, 1, 0, 0, 0, 664, 666, 1, 0, 0, 0, 665, 663,
    1, 0, 0, 0, 666, 667, 5, 10, 0, 0, 667, 29, 1, 0, 0, 0, 668, 670, 3, 300, 150, 0, 669, 668, 1, 0, 0, 0, 669, 670, 1,
    0, 0, 0, 670, 672, 1, 0, 0, 0, 671, 673, 7, 1, 0, 0, 672, 671, 1, 0, 0, 0, 672, 673, 1, 0, 0, 0, 673, 677, 1, 0, 0,
    0, 674, 676, 5, 5, 0, 0, 675, 674, 1, 0, 0, 0, 676, 679, 1, 0, 0, 0, 677, 675, 1, 0, 0, 0, 677, 678, 1, 0, 0, 0,
    678, 680, 1, 0, 0, 0, 679, 677, 1, 0, 0, 0, 680, 681, 3, 344, 172, 0, 681, 685, 5, 26, 0, 0, 682, 684, 5, 5, 0, 0,
    683, 682, 1, 0, 0, 0, 684, 687, 1, 0, 0, 0, 685, 683, 1, 0, 0, 0, 685, 686, 1, 0, 0, 0, 686, 688, 1, 0, 0, 0, 687,
    685, 1, 0, 0, 0, 688, 703, 3, 98, 49, 0, 689, 691, 5, 5, 0, 0, 690, 689, 1, 0, 0, 0, 691, 694, 1, 0, 0, 0, 692, 690,
    1, 0, 0, 0, 692, 693, 1, 0, 0, 0, 693, 695, 1, 0, 0, 0, 694, 692, 1, 0, 0, 0, 695, 699, 5, 28, 0, 0, 696, 698, 5, 5,
    0, 0, 697, 696, 1, 0, 0, 0, 698, 701, 1, 0, 0, 0, 699, 697, 1, 0, 0, 0, 699, 700, 1, 0, 0, 0, 700, 702, 1, 0, 0, 0,
    701, 699, 1, 0, 0, 0, 702, 704, 3, 152, 76, 0, 703, 692, 1, 0, 0, 0, 703, 704, 1, 0, 0, 0, 704, 31, 1, 0, 0, 0, 705,
    722, 3, 38, 19, 0, 706, 708, 5, 5, 0, 0, 707, 706, 1, 0, 0, 0, 708, 711, 1, 0, 0, 0, 709, 707, 1, 0, 0, 0, 709, 710,
    1, 0, 0, 0, 710, 712, 1, 0, 0, 0, 711, 709, 1, 0, 0, 0, 712, 716, 5, 8, 0, 0, 713, 715, 5, 5, 0, 0, 714, 713, 1, 0,
    0, 0, 715, 718, 1, 0, 0, 0, 716, 714, 1, 0, 0, 0, 716, 717, 1, 0, 0, 0, 717, 719, 1, 0, 0, 0, 718, 716, 1, 0, 0, 0,
    719, 721, 3, 38, 19, 0, 720, 709, 1, 0, 0, 0, 721, 724, 1, 0, 0, 0, 722, 720, 1, 0, 0, 0, 722, 723, 1, 0, 0, 0, 723,
    33, 1, 0, 0, 0, 724, 722, 1, 0, 0, 0, 725, 738, 3, 36, 18, 0, 726, 738, 3, 40, 20, 0, 727, 738, 3, 106, 53, 0, 728,
    738, 3, 116, 58, 0, 729, 733, 5, 124, 0, 0, 730, 732, 5, 5, 0, 0, 731, 730, 1, 0, 0, 0, 732, 735, 1, 0, 0, 0, 733,
    731, 1, 0, 0, 0, 733, 734, 1, 0, 0, 0, 734, 736, 1, 0, 0, 0, 735, 733, 1, 0, 0, 0, 736, 738, 3, 116, 58, 0, 737,
    725, 1, 0, 0, 0, 737, 726, 1, 0, 0, 0, 737, 727, 1, 0, 0, 0, 737, 728, 1, 0, 0, 0, 737, 729, 1, 0, 0, 0, 738, 35, 1,
    0, 0, 0, 739, 743, 3, 106, 53, 0, 740, 742, 5, 5, 0, 0, 741, 740, 1, 0, 0, 0, 742, 745, 1, 0, 0, 0, 743, 741, 1, 0,
    0, 0, 743, 744, 1, 0, 0, 0, 744, 746, 1, 0, 0, 0, 745, 743, 1, 0, 0, 0, 746, 747, 3, 208, 104, 0, 747, 37, 1, 0, 0,
    0, 748, 750, 3, 334, 167, 0, 749, 748, 1, 0, 0, 0, 750, 753, 1, 0, 0, 0, 751, 749, 1, 0, 0, 0, 751, 752, 1, 0, 0, 0,
    752, 757, 1, 0, 0, 0, 753, 751, 1, 0, 0, 0, 754, 756, 5, 5, 0, 0, 755, 754, 1, 0, 0, 0, 756, 759, 1, 0, 0, 0, 757,
    755, 1, 0, 0, 0, 757, 758, 1, 0, 0, 0, 758, 760, 1, 0, 0, 0, 759, 757, 1, 0, 0, 0, 760, 761, 3, 34, 17, 0, 761, 39,
    1, 0, 0, 0, 762, 765, 3, 106, 53, 0, 763, 765, 3, 116, 58, 0, 764, 762, 1, 0, 0, 0, 764, 763, 1, 0, 0, 0, 765, 769,
    1, 0, 0, 0, 766, 768, 5, 5, 0, 0, 767, 766, 1, 0, 0, 0, 768, 771, 1, 0, 0, 0, 769, 767, 1, 0, 0, 0, 769, 770, 1, 0,
    0, 0, 770, 772, 1, 0, 0, 0, 771, 769, 1, 0, 0, 0, 772, 776, 5, 82, 0, 0, 773, 775, 5, 5, 0, 0, 774, 773, 1, 0, 0, 0,
    775, 778, 1, 0, 0, 0, 776, 774, 1, 0, 0, 0, 776, 777, 1, 0, 0, 0, 777, 779, 1, 0, 0, 0, 778, 776, 1, 0, 0, 0, 779,
    780, 3, 152, 76, 0, 780, 41, 1, 0, 0, 0, 781, 785, 5, 47, 0, 0, 782, 784, 5, 5, 0, 0, 783, 782, 1, 0, 0, 0, 784,
    787, 1, 0, 0, 0, 785, 783, 1, 0, 0, 0, 785, 786, 1, 0, 0, 0, 786, 788, 1, 0, 0, 0, 787, 785, 1, 0, 0, 0, 788, 805,
    3, 44, 22, 0, 789, 791, 5, 5, 0, 0, 790, 789, 1, 0, 0, 0, 791, 794, 1, 0, 0, 0, 792, 790, 1, 0, 0, 0, 792, 793, 1,
    0, 0, 0, 793, 795, 1, 0, 0, 0, 794, 792, 1, 0, 0, 0, 795, 799, 5, 8, 0, 0, 796, 798, 5, 5, 0, 0, 797, 796, 1, 0, 0,
    0, 798, 801, 1, 0, 0, 0, 799, 797, 1, 0, 0, 0, 799, 800, 1, 0, 0, 0, 800, 802, 1, 0, 0, 0, 801, 799, 1, 0, 0, 0,
    802, 804, 3, 44, 22, 0, 803, 792, 1, 0, 0, 0, 804, 807, 1, 0, 0, 0, 805, 803, 1, 0, 0, 0, 805, 806, 1, 0, 0, 0, 806,
    815, 1, 0, 0, 0, 807, 805, 1, 0, 0, 0, 808, 810, 5, 5, 0, 0, 809, 808, 1, 0, 0, 0, 810, 813, 1, 0, 0, 0, 811, 809,
    1, 0, 0, 0, 811, 812, 1, 0, 0, 0, 812, 814, 1, 0, 0, 0, 813, 811, 1, 0, 0, 0, 814, 816, 5, 8, 0, 0, 815, 811, 1, 0,
    0, 0, 815, 816, 1, 0, 0, 0, 816, 820, 1, 0, 0, 0, 817, 819, 5, 5, 0, 0, 818, 817, 1, 0, 0, 0, 819, 822, 1, 0, 0, 0,
    820, 818, 1, 0, 0, 0, 820, 821, 1, 0, 0, 0, 821, 823, 1, 0, 0, 0, 822, 820, 1, 0, 0, 0, 823, 824, 5, 48, 0, 0, 824,
    43, 1, 0, 0, 0, 825, 827, 3, 318, 159, 0, 826, 825, 1, 0, 0, 0, 826, 827, 1, 0, 0, 0, 827, 831, 1, 0, 0, 0, 828,
    830, 5, 5, 0, 0, 829, 828, 1, 0, 0, 0, 830, 833, 1, 0, 0, 0, 831, 829, 1, 0, 0, 0, 831, 832, 1, 0, 0, 0, 832, 834,
    1, 0, 0, 0, 833, 831, 1, 0, 0, 0, 834, 849, 3, 344, 172, 0, 835, 837, 5, 5, 0, 0, 836, 835, 1, 0, 0, 0, 837, 840, 1,
    0, 0, 0, 838, 836, 1, 0, 0, 0, 838, 839, 1, 0, 0, 0, 839, 841, 1, 0, 0, 0, 840, 838, 1, 0, 0, 0, 841, 845, 5, 26, 0,
    0, 842, 844, 5, 5, 0, 0, 843, 842, 1, 0, 0, 0, 844, 847, 1, 0, 0, 0, 845, 843, 1, 0, 0, 0, 845, 846, 1, 0, 0, 0,
    846, 848, 1, 0, 0, 0, 847, 845, 1, 0, 0, 0, 848, 850, 3, 98, 49, 0, 849, 838, 1, 0, 0, 0, 849, 850, 1, 0, 0, 0, 850,
    45, 1, 0, 0, 0, 851, 855, 5, 88, 0, 0, 852, 854, 5, 5, 0, 0, 853, 852, 1, 0, 0, 0, 854, 857, 1, 0, 0, 0, 855, 853,
    1, 0, 0, 0, 855, 856, 1, 0, 0, 0, 856, 858, 1, 0, 0, 0, 857, 855, 1, 0, 0, 0, 858, 875, 3, 48, 24, 0, 859, 861, 5,
    5, 0, 0, 860, 859, 1, 0, 0, 0, 861, 864, 1, 0, 0, 0, 862, 860, 1, 0, 0, 0, 862, 863, 1, 0, 0, 0, 863, 865, 1, 0, 0,
    0, 864, 862, 1, 0, 0, 0, 865, 869, 5, 8, 0, 0, 866, 868, 5, 5, 0, 0, 867, 866, 1, 0, 0, 0, 868, 871, 1, 0, 0, 0,
    869, 867, 1, 0, 0, 0, 869, 870, 1, 0, 0, 0, 870, 872, 1, 0, 0, 0, 871, 869, 1, 0, 0, 0, 872, 874, 3, 48, 24, 0, 873,
    862, 1, 0, 0, 0, 874, 877, 1, 0, 0, 0, 875, 873, 1, 0, 0, 0, 875, 876, 1, 0, 0, 0, 876, 47, 1, 0, 0, 0, 877, 875, 1,
    0, 0, 0, 878, 880, 3, 334, 167, 0, 879, 878, 1, 0, 0, 0, 880, 883, 1, 0, 0, 0, 881, 879, 1, 0, 0, 0, 881, 882, 1, 0,
    0, 0, 882, 884, 1, 0, 0, 0, 883, 881, 1, 0, 0, 0, 884, 888, 3, 344, 172, 0, 885, 887, 5, 5, 0, 0, 886, 885, 1, 0, 0,
    0, 887, 890, 1, 0, 0, 0, 888, 886, 1, 0, 0, 0, 888, 889, 1, 0, 0, 0, 889, 891, 1, 0, 0, 0, 890, 888, 1, 0, 0, 0,
    891, 895, 5, 26, 0, 0, 892, 894, 5, 5, 0, 0, 893, 892, 1, 0, 0, 0, 894, 897, 1, 0, 0, 0, 895, 893, 1, 0, 0, 0, 895,
    896, 1, 0, 0, 0, 896, 898, 1, 0, 0, 0, 897, 895, 1, 0, 0, 0, 898, 899, 3, 98, 49, 0, 899, 49, 1, 0, 0, 0, 900, 902,
    3, 52, 26, 0, 901, 903, 3, 150, 75, 0, 902, 901, 1, 0, 0, 0, 902, 903, 1, 0, 0, 0, 903, 905, 1, 0, 0, 0, 904, 900,
    1, 0, 0, 0, 905, 908, 1, 0, 0, 0, 906, 904, 1, 0, 0, 0, 906, 907, 1, 0, 0, 0, 907, 51, 1, 0, 0, 0, 908, 906, 1, 0,
    0, 0, 909, 914, 3, 20, 10, 0, 910, 914, 3, 56, 28, 0, 911, 914, 3, 54, 27, 0, 912, 914, 3, 88, 44, 0, 913, 909, 1,
    0, 0, 0, 913, 910, 1, 0, 0, 0, 913, 911, 1, 0, 0, 0, 913, 912, 1, 0, 0, 0, 914, 53, 1, 0, 0, 0, 915, 919, 5, 84, 0,
    0, 916, 918, 5, 5, 0, 0, 917, 916, 1, 0, 0, 0, 918, 921, 1, 0, 0, 0, 919, 917, 1, 0, 0, 0, 919, 920, 1, 0, 0, 0,
    920, 922, 1, 0, 0, 0, 921, 919, 1, 0, 0, 0, 922, 923, 3, 136, 68, 0, 923, 55, 1, 0, 0, 0, 924, 926, 3, 300, 150, 0,
    925, 924, 1, 0, 0, 0, 925, 926, 1, 0, 0, 0, 926, 927, 1, 0, 0, 0, 927, 931, 5, 83, 0, 0, 928, 930, 5, 5, 0, 0, 929,
    928, 1, 0, 0, 0, 930, 933, 1, 0, 0, 0, 931, 929, 1, 0, 0, 0, 931, 932, 1, 0, 0, 0, 932, 935, 1, 0, 0, 0, 933, 931,
    1, 0, 0, 0, 934, 936, 5, 116, 0, 0, 935, 934, 1, 0, 0, 0, 935, 936, 1, 0, 0, 0, 936, 940, 1, 0, 0, 0, 937, 939, 5,
    5, 0, 0, 938, 937, 1, 0, 0, 0, 939, 942, 1, 0, 0, 0, 940, 938, 1, 0, 0, 0, 940, 941, 1, 0, 0, 0, 941, 943, 1, 0, 0,
    0, 942, 940, 1, 0, 0, 0, 943, 951, 5, 77, 0, 0, 944, 946, 5, 5, 0, 0, 945, 944, 1, 0, 0, 0, 946, 949, 1, 0, 0, 0,
    947, 945, 1, 0, 0, 0, 947, 948, 1, 0, 0, 0, 948, 950, 1, 0, 0, 0, 949, 947, 1, 0, 0, 0, 950, 952, 3, 344, 172, 0,
    951, 947, 1, 0, 0, 0, 951, 952, 1, 0, 0, 0, 952, 967, 1, 0, 0, 0, 953, 955, 5, 5, 0, 0, 954, 953, 1, 0, 0, 0, 955,
    958, 1, 0, 0, 0, 956, 954, 1, 0, 0, 0, 956, 957, 1, 0, 0, 0, 957, 959, 1, 0, 0, 0, 958, 956, 1, 0, 0, 0, 959, 963,
    5, 26, 0, 0, 960, 962, 5, 5, 0, 0, 961, 960, 1, 0, 0, 0, 962, 965, 1, 0, 0, 0, 963, 961, 1, 0, 0, 0, 963, 964, 1, 0,
    0, 0, 964, 966, 1, 0, 0, 0, 965, 963, 1, 0, 0, 0, 966, 968, 3, 32, 16, 0, 967, 956, 1, 0, 0, 0, 967, 968, 1, 0, 0,
    0, 968, 976, 1, 0, 0, 0, 969, 971, 5, 5, 0, 0, 970, 969, 1, 0, 0, 0, 971, 974, 1, 0, 0, 0, 972, 970, 1, 0, 0, 0,
    972, 973, 1, 0, 0, 0, 973, 975, 1, 0, 0, 0, 974, 972, 1, 0, 0, 0, 975, 977, 3, 26, 13, 0, 976, 972, 1, 0, 0, 0, 976,
    977, 1, 0, 0, 0, 977, 57, 1, 0, 0, 0, 978, 982, 5, 9, 0, 0, 979, 981, 5, 5, 0, 0, 980, 979, 1, 0, 0, 0, 981, 984, 1,
    0, 0, 0, 982, 980, 1, 0, 0, 0, 982, 983, 1, 0, 0, 0, 983, 1014, 1, 0, 0, 0, 984, 982, 1, 0, 0, 0, 985, 1002, 3, 60,
    30, 0, 986, 988, 5, 5, 0, 0, 987, 986, 1, 0, 0, 0, 988, 991, 1, 0, 0, 0, 989, 987, 1, 0, 0, 0, 989, 990, 1, 0, 0, 0,
    990, 992, 1, 0, 0, 0, 991, 989, 1, 0, 0, 0, 992, 996, 5, 8, 0, 0, 993, 995, 5, 5, 0, 0, 994, 993, 1, 0, 0, 0, 995,
    998, 1, 0, 0, 0, 996, 994, 1, 0, 0, 0, 996, 997, 1, 0, 0, 0, 997, 999, 1, 0, 0, 0, 998, 996, 1, 0, 0, 0, 999, 1001,
    3, 60, 30, 0, 1000, 989, 1, 0, 0, 0, 1001, 1004, 1, 0, 0, 0, 1002, 1000, 1, 0, 0, 0, 1002, 1003, 1, 0, 0, 0, 1003,
    1012, 1, 0, 0, 0, 1004, 1002, 1, 0, 0, 0, 1005, 1007, 5, 5, 0, 0, 1006, 1005, 1, 0, 0, 0, 1007, 1010, 1, 0, 0, 0,
    1008, 1006, 1, 0, 0, 0, 1008, 1009, 1, 0, 0, 0, 1009, 1011, 1, 0, 0, 0, 1010, 1008, 1, 0, 0, 0, 1011, 1013, 5, 8, 0,
    0, 1012, 1008, 1, 0, 0, 0, 1012, 1013, 1, 0, 0, 0, 1013, 1015, 1, 0, 0, 0, 1014, 985, 1, 0, 0, 0, 1014, 1015, 1, 0,
    0, 0, 1015, 1019, 1, 0, 0, 0, 1016, 1018, 5, 5, 0, 0, 1017, 1016, 1, 0, 0, 0, 1018, 1021, 1, 0, 0, 0, 1019, 1017, 1,
    0, 0, 0, 1019, 1020, 1, 0, 0, 0, 1020, 1022, 1, 0, 0, 0, 1021, 1019, 1, 0, 0, 0, 1022, 1023, 5, 10, 0, 0, 1023, 59,
    1, 0, 0, 0, 1024, 1026, 3, 302, 151, 0, 1025, 1024, 1, 0, 0, 0, 1025, 1026, 1, 0, 0, 0, 1026, 1027, 1, 0, 0, 0,
    1027, 1042, 3, 84, 42, 0, 1028, 1030, 5, 5, 0, 0, 1029, 1028, 1, 0, 0, 0, 1030, 1033, 1, 0, 0, 0, 1031, 1029, 1, 0,
    0, 0, 1031, 1032, 1, 0, 0, 0, 1032, 1034, 1, 0, 0, 0, 1033, 1031, 1, 0, 0, 0, 1034, 1038, 5, 28, 0, 0, 1035, 1037,
    5, 5, 0, 0, 1036, 1035, 1, 0, 0, 0, 1037, 1040, 1, 0, 0, 0, 1038, 1036, 1, 0, 0, 0, 1038, 1039, 1, 0, 0, 0, 1039,
    1041, 1, 0, 0, 0, 1040, 1038, 1, 0, 0, 0, 1041, 1043, 3, 152, 76, 0, 1042, 1031, 1, 0, 0, 0, 1042, 1043, 1, 0, 0, 0,
    1043, 61, 1, 0, 0, 0, 1044, 1046, 3, 300, 150, 0, 1045, 1044, 1, 0, 0, 0, 1045, 1046, 1, 0, 0, 0, 1046, 1047, 1, 0,
    0, 0, 1047, 1055, 5, 76, 0, 0, 1048, 1050, 5, 5, 0, 0, 1049, 1048, 1, 0, 0, 0, 1050, 1053, 1, 0, 0, 0, 1051, 1049,
    1, 0, 0, 0, 1051, 1052, 1, 0, 0, 0, 1052, 1054, 1, 0, 0, 0, 1053, 1051, 1, 0, 0, 0, 1054, 1056, 3, 42, 21, 0, 1055,
    1051, 1, 0, 0, 0, 1055, 1056, 1, 0, 0, 0, 1056, 1072, 1, 0, 0, 0, 1057, 1059, 5, 5, 0, 0, 1058, 1057, 1, 0, 0, 0,
    1059, 1062, 1, 0, 0, 0, 1060, 1058, 1, 0, 0, 0, 1060, 1061, 1, 0, 0, 0, 1061, 1063, 1, 0, 0, 0, 1062, 1060, 1, 0, 0,
    0, 1063, 1067, 3, 122, 61, 0, 1064, 1066, 5, 5, 0, 0, 1065, 1064, 1, 0, 0, 0, 1066, 1069, 1, 0, 0, 0, 1067, 1065, 1,
    0, 0, 0, 1067, 1068, 1, 0, 0, 0, 1068, 1070, 1, 0, 0, 0, 1069, 1067, 1, 0, 0, 0, 1070, 1071, 5, 7, 0, 0, 1071, 1073,
    1, 0, 0, 0, 1072, 1060, 1, 0, 0, 0, 1072, 1073, 1, 0, 0, 0, 1073, 1077, 1, 0, 0, 0, 1074, 1076, 5, 5, 0, 0, 1075,
    1074, 1, 0, 0, 0, 1076, 1079, 1, 0, 0, 0, 1077, 1075, 1, 0, 0, 0, 1077, 1078, 1, 0, 0, 0, 1078, 1080, 1, 0, 0, 0,
    1079, 1077, 1, 0, 0, 0, 1080, 1084, 3, 344, 172, 0, 1081, 1083, 5, 5, 0, 0, 1082, 1081, 1, 0, 0, 0, 1083, 1086, 1,
    0, 0, 0, 1084, 1082, 1, 0, 0, 0, 1084, 1085, 1, 0, 0, 0, 1085, 1087, 1, 0, 0, 0, 1086, 1084, 1, 0, 0, 0, 1087, 1102,
    3, 58, 29, 0, 1088, 1090, 5, 5, 0, 0, 1089, 1088, 1, 0, 0, 0, 1090, 1093, 1, 0, 0, 0, 1091, 1089, 1, 0, 0, 0, 1091,
    1092, 1, 0, 0, 0, 1092, 1094, 1, 0, 0, 0, 1093, 1091, 1, 0, 0, 0, 1094, 1098, 5, 26, 0, 0, 1095, 1097, 5, 5, 0, 0,
    1096, 1095, 1, 0, 0, 0, 1097, 1100, 1, 0, 0, 0, 1098, 1096, 1, 0, 0, 0, 1098, 1099, 1, 0, 0, 0, 1099, 1101, 1, 0, 0,
    0, 1100, 1098, 1, 0, 0, 0, 1101, 1103, 3, 98, 49, 0, 1102, 1091, 1, 0, 0, 0, 1102, 1103, 1, 0, 0, 0, 1103, 1111, 1,
    0, 0, 0, 1104, 1106, 5, 5, 0, 0, 1105, 1104, 1, 0, 0, 0, 1106, 1109, 1, 0, 0, 0, 1107, 1105, 1, 0, 0, 0, 1107, 1108,
    1, 0, 0, 0, 1108, 1110, 1, 0, 0, 0, 1109, 1107, 1, 0, 0, 0, 1110, 1112, 3, 46, 23, 0, 1111, 1107, 1, 0, 0, 0, 1111,
    1112, 1, 0, 0, 0, 1112, 1120, 1, 0, 0, 0, 1113, 1115, 5, 5, 0, 0, 1114, 1113, 1, 0, 0, 0, 1115, 1118, 1, 0, 0, 0,
    1116, 1114, 1, 0, 0, 0, 1116, 1117, 1, 0, 0, 0, 1117, 1119, 1, 0, 0, 0, 1118, 1116, 1, 0, 0, 0, 1119, 1121, 3, 64,
    32, 0, 1120, 1116, 1, 0, 0, 0, 1120, 1121, 1, 0, 0, 0, 1121, 63, 1, 0, 0, 0, 1122, 1132, 3, 136, 68, 0, 1123, 1127,
    5, 28, 0, 0, 1124, 1126, 5, 5, 0, 0, 1125, 1124, 1, 0, 0, 0, 1126, 1129, 1, 0, 0, 0, 1127, 1125, 1, 0, 0, 0, 1127,
    1128, 1, 0, 0, 0, 1128, 1130, 1, 0, 0, 0, 1129, 1127, 1, 0, 0, 0, 1130, 1132, 3, 152, 76, 0, 1131, 1122, 1, 0, 0, 0,
    1131, 1123, 1, 0, 0, 0, 1132, 65, 1, 0, 0, 0, 1133, 1135, 3, 334, 167, 0, 1134, 1133, 1, 0, 0, 0, 1135, 1138, 1, 0,
    0, 0, 1136, 1134, 1, 0, 0, 0, 1136, 1137, 1, 0, 0, 0, 1137, 1142, 1, 0, 0, 0, 1138, 1136, 1, 0, 0, 0, 1139, 1141, 5,
    5, 0, 0, 1140, 1139, 1, 0, 0, 0, 1141, 1144, 1, 0, 0, 0, 1142, 1140, 1, 0, 0, 0, 1142, 1143, 1, 0, 0, 0, 1143, 1145,
    1, 0, 0, 0, 1144, 1142, 1, 0, 0, 0, 1145, 1160, 3, 344, 172, 0, 1146, 1148, 5, 5, 0, 0, 1147, 1146, 1, 0, 0, 0,
    1148, 1151, 1, 0, 0, 0, 1149, 1147, 1, 0, 0, 0, 1149, 1150, 1, 0, 0, 0, 1150, 1152, 1, 0, 0, 0, 1151, 1149, 1, 0, 0,
    0, 1152, 1156, 5, 26, 0, 0, 1153, 1155, 5, 5, 0, 0, 1154, 1153, 1, 0, 0, 0, 1155, 1158, 1, 0, 0, 0, 1156, 1154, 1,
    0, 0, 0, 1156, 1157, 1, 0, 0, 0, 1157, 1159, 1, 0, 0, 0, 1158, 1156, 1, 0, 0, 0, 1159, 1161, 3, 98, 49, 0, 1160,
    1149, 1, 0, 0, 0, 1160, 1161, 1, 0, 0, 0, 1161, 67, 1, 0, 0, 0, 1162, 1166, 5, 9, 0, 0, 1163, 1165, 5, 5, 0, 0,
    1164, 1163, 1, 0, 0, 0, 1165, 1168, 1, 0, 0, 0, 1166, 1164, 1, 0, 0, 0, 1166, 1167, 1, 0, 0, 0, 1167, 1169, 1, 0, 0,
    0, 1168, 1166, 1, 0, 0, 0, 1169, 1186, 3, 66, 33, 0, 1170, 1172, 5, 5, 0, 0, 1171, 1170, 1, 0, 0, 0, 1172, 1175, 1,
    0, 0, 0, 1173, 1171, 1, 0, 0, 0, 1173, 1174, 1, 0, 0, 0, 1174, 1176, 1, 0, 0, 0, 1175, 1173, 1, 0, 0, 0, 1176, 1180,
    5, 8, 0, 0, 1177, 1179, 5, 5, 0, 0, 1178, 1177, 1, 0, 0, 0, 1179, 1182, 1, 0, 0, 0, 1180, 1178, 1, 0, 0, 0, 1180,
    1181, 1, 0, 0, 0, 1181, 1183, 1, 0, 0, 0, 1182, 1180, 1, 0, 0, 0, 1183, 1185, 3, 66, 33, 0, 1184, 1173, 1, 0, 0, 0,
    1185, 1188, 1, 0, 0, 0, 1186, 1184, 1, 0, 0, 0, 1186, 1187, 1, 0, 0, 0, 1187, 1196, 1, 0, 0, 0, 1188, 1186, 1, 0, 0,
    0, 1189, 1191, 5, 5, 0, 0, 1190, 1189, 1, 0, 0, 0, 1191, 1194, 1, 0, 0, 0, 1192, 1190, 1, 0, 0, 0, 1192, 1193, 1, 0,
    0, 0, 1193, 1195, 1, 0, 0, 0, 1194, 1192, 1, 0, 0, 0, 1195, 1197, 5, 8, 0, 0, 1196, 1192, 1, 0, 0, 0, 1196, 1197, 1,
    0, 0, 0, 1197, 1201, 1, 0, 0, 0, 1198, 1200, 5, 5, 0, 0, 1199, 1198, 1, 0, 0, 0, 1200, 1203, 1, 0, 0, 0, 1201, 1199,
    1, 0, 0, 0, 1201, 1202, 1, 0, 0, 0, 1202, 1204, 1, 0, 0, 0, 1203, 1201, 1, 0, 0, 0, 1204, 1205, 5, 10, 0, 0, 1205,
    69, 1, 0, 0, 0, 1206, 1208, 3, 300, 150, 0, 1207, 1206, 1, 0, 0, 0, 1207, 1208, 1, 0, 0, 0, 1208, 1209, 1, 0, 0, 0,
    1209, 1217, 7, 1, 0, 0, 1210, 1212, 5, 5, 0, 0, 1211, 1210, 1, 0, 0, 0, 1212, 1215, 1, 0, 0, 0, 1213, 1211, 1, 0, 0,
    0, 1213, 1214, 1, 0, 0, 0, 1214, 1216, 1, 0, 0, 0, 1215, 1213, 1, 0, 0, 0, 1216, 1218, 3, 42, 21, 0, 1217, 1213, 1,
    0, 0, 0, 1217, 1218, 1, 0, 0, 0, 1218, 1234, 1, 0, 0, 0, 1219, 1221, 5, 5, 0, 0, 1220, 1219, 1, 0, 0, 0, 1221, 1224,
    1, 0, 0, 0, 1222, 1220, 1, 0, 0, 0, 1222, 1223, 1, 0, 0, 0, 1223, 1225, 1, 0, 0, 0, 1224, 1222, 1, 0, 0, 0, 1225,
    1229, 3, 122, 61, 0, 1226, 1228, 5, 5, 0, 0, 1227, 1226, 1, 0, 0, 0, 1228, 1231, 1, 0, 0, 0, 1229, 1227, 1, 0, 0, 0,
    1229, 1230, 1, 0, 0, 0, 1230, 1232, 1, 0, 0, 0, 1231, 1229, 1, 0, 0, 0, 1232, 1233, 5, 7, 0, 0, 1233, 1235, 1, 0, 0,
    0, 1234, 1222, 1, 0, 0, 0, 1234, 1235, 1, 0, 0, 0, 1235, 1239, 1, 0, 0, 0, 1236, 1238, 5, 5, 0, 0, 1237, 1236, 1, 0,
    0, 0, 1238, 1241, 1, 0, 0, 0, 1239, 1237, 1, 0, 0, 0, 1239, 1240, 1, 0, 0, 0, 1240, 1244, 1, 0, 0, 0, 1241, 1239, 1,
    0, 0, 0, 1242, 1245, 3, 68, 34, 0, 1243, 1245, 3, 66, 33, 0, 1244, 1242, 1, 0, 0, 0, 1244, 1243, 1, 0, 0, 0, 1245,
    1253, 1, 0, 0, 0, 1246, 1248, 5, 5, 0, 0, 1247, 1246, 1, 0, 0, 0, 1248, 1251, 1, 0, 0, 0, 1249, 1247, 1, 0, 0, 0,
    1249, 1250, 1, 0, 0, 0, 1250, 1252, 1, 0, 0, 0, 1251, 1249, 1, 0, 0, 0, 1252, 1254, 3, 46, 23, 0, 1253, 1249, 1, 0,
    0, 0, 1253, 1254, 1, 0, 0, 0, 1254, 1272, 1, 0, 0, 0, 1255, 1257, 5, 5, 0, 0, 1256, 1255, 1, 0, 0, 0, 1257, 1260, 1,
    0, 0, 0, 1258, 1256, 1, 0, 0, 0, 1258, 1259, 1, 0, 0, 0, 1259, 1270, 1, 0, 0, 0, 1260, 1258, 1, 0, 0, 0, 1261, 1265,
    5, 28, 0, 0, 1262, 1264, 5, 5, 0, 0, 1263, 1262, 1, 0, 0, 0, 1264, 1267, 1, 0, 0, 0, 1265, 1263, 1, 0, 0, 0, 1265,
    1266, 1, 0, 0, 0, 1266, 1268, 1, 0, 0, 0, 1267, 1265, 1, 0, 0, 0, 1268, 1271, 3, 152, 76, 0, 1269, 1271, 3, 72, 36,
    0, 1270, 1261, 1, 0, 0, 0, 1270, 1269, 1, 0, 0, 0, 1271, 1273, 1, 0, 0, 0, 1272, 1258, 1, 0, 0, 0, 1272, 1273, 1, 0,
    0, 0, 1273, 1281, 1, 0, 0, 0, 1274, 1276, 5, 5, 0, 0, 1275, 1274, 1, 0, 0, 0, 1276, 1279, 1, 0, 0, 0, 1277, 1275, 1,
    0, 0, 0, 1277, 1278, 1, 0, 0, 0, 1278, 1280, 1, 0, 0, 0, 1279, 1277, 1, 0, 0, 0, 1280, 1282, 5, 27, 0, 0, 1281,
    1277, 1, 0, 0, 0, 1281, 1282, 1, 0, 0, 0, 1282, 1286, 1, 0, 0, 0, 1283, 1285, 5, 5, 0, 0, 1284, 1283, 1, 0, 0, 0,
    1285, 1288, 1, 0, 0, 0, 1286, 1284, 1, 0, 0, 0, 1286, 1287, 1, 0, 0, 0, 1287, 1319, 1, 0, 0, 0, 1288, 1286, 1, 0, 0,
    0, 1289, 1291, 3, 74, 37, 0, 1290, 1289, 1, 0, 0, 0, 1290, 1291, 1, 0, 0, 0, 1291, 1302, 1, 0, 0, 0, 1292, 1294, 5,
    5, 0, 0, 1293, 1292, 1, 0, 0, 0, 1294, 1297, 1, 0, 0, 0, 1295, 1293, 1, 0, 0, 0, 1295, 1296, 1, 0, 0, 0, 1296, 1299,
    1, 0, 0, 0, 1297, 1295, 1, 0, 0, 0, 1298, 1300, 3, 148, 74, 0, 1299, 1298, 1, 0, 0, 0, 1299, 1300, 1, 0, 0, 0, 1300,
    1301, 1, 0, 0, 0, 1301, 1303, 3, 76, 38, 0, 1302, 1295, 1, 0, 0, 0, 1302, 1303, 1, 0, 0, 0, 1303, 1320, 1, 0, 0, 0,
    1304, 1306, 3, 76, 38, 0, 1305, 1304, 1, 0, 0, 0, 1305, 1306, 1, 0, 0, 0, 1306, 1317, 1, 0, 0, 0, 1307, 1309, 5, 5,
    0, 0, 1308, 1307, 1, 0, 0, 0, 1309, 1312, 1, 0, 0, 0, 1310, 1308, 1, 0, 0, 0, 1310, 1311, 1, 0, 0, 0, 1311, 1314, 1,
    0, 0, 0, 1312, 1310, 1, 0, 0, 0, 1313, 1315, 3, 148, 74, 0, 1314, 1313, 1, 0, 0, 0, 1314, 1315, 1, 0, 0, 0, 1315,
    1316, 1, 0, 0, 0, 1316, 1318, 3, 74, 37, 0, 1317, 1310, 1, 0, 0, 0, 1317, 1318, 1, 0, 0, 0, 1318, 1320, 1, 0, 0, 0,
    1319, 1290, 1, 0, 0, 0, 1319, 1305, 1, 0, 0, 0, 1320, 71, 1, 0, 0, 0, 1321, 1325, 5, 82, 0, 0, 1322, 1324, 5, 5, 0,
    0, 1323, 1322, 1, 0, 0, 0, 1324, 1327, 1, 0, 0, 0, 1325, 1323, 1, 0, 0, 0, 1325, 1326, 1, 0, 0, 0, 1326, 1328, 1, 0,
    0, 0, 1327, 1325, 1, 0, 0, 0, 1328, 1329, 3, 152, 76, 0, 1329, 73, 1, 0, 0, 0, 1330, 1332, 3, 300, 150, 0, 1331,
    1330, 1, 0, 0, 0, 1331, 1332, 1, 0, 0, 0, 1332, 1333, 1, 0, 0, 0, 1333, 1371, 5, 66, 0, 0, 1334, 1336, 5, 5, 0, 0,
    1335, 1334, 1, 0, 0, 0, 1336, 1339, 1, 0, 0, 0, 1337, 1335, 1, 0, 0, 0, 1337, 1338, 1, 0, 0, 0, 1338, 1340, 1, 0, 0,
    0, 1339, 1337, 1, 0, 0, 0, 1340, 1344, 5, 9, 0, 0, 1341, 1343, 5, 5, 0, 0, 1342, 1341, 1, 0, 0, 0, 1343, 1346, 1, 0,
    0, 0, 1344, 1342, 1, 0, 0, 0, 1344, 1345, 1, 0, 0, 0, 1345, 1347, 1, 0, 0, 0, 1346, 1344, 1, 0, 0, 0, 1347, 1362, 5,
    10, 0, 0, 1348, 1350, 5, 5, 0, 0, 1349, 1348, 1, 0, 0, 0, 1350, 1353, 1, 0, 0, 0, 1351, 1349, 1, 0, 0, 0, 1351,
    1352, 1, 0, 0, 0, 1352, 1354, 1, 0, 0, 0, 1353, 1351, 1, 0, 0, 0, 1354, 1358, 5, 26, 0, 0, 1355, 1357, 5, 5, 0, 0,
    1356, 1355, 1, 0, 0, 0, 1357, 1360, 1, 0, 0, 0, 1358, 1356, 1, 0, 0, 0, 1358, 1359, 1, 0, 0, 0, 1359, 1361, 1, 0, 0,
    0, 1360, 1358, 1, 0, 0, 0, 1361, 1363, 3, 98, 49, 0, 1362, 1351, 1, 0, 0, 0, 1362, 1363, 1, 0, 0, 0, 1363, 1367, 1,
    0, 0, 0, 1364, 1366, 5, 5, 0, 0, 1365, 1364, 1, 0, 0, 0, 1366, 1369, 1, 0, 0, 0, 1367, 1365, 1, 0, 0, 0, 1367, 1368,
    1, 0, 0, 0, 1368, 1370, 1, 0, 0, 0, 1369, 1367, 1, 0, 0, 0, 1370, 1372, 3, 64, 32, 0, 1371, 1337, 1, 0, 0, 0, 1371,
    1372, 1, 0, 0, 0, 1372, 75, 1, 0, 0, 0, 1373, 1375, 3, 300, 150, 0, 1374, 1373, 1, 0, 0, 0, 1374, 1375, 1, 0, 0, 0,
    1375, 1376, 1, 0, 0, 0, 1376, 1431, 5, 67, 0, 0, 1377, 1379, 5, 5, 0, 0, 1378, 1377, 1, 0, 0, 0, 1379, 1382, 1, 0,
    0, 0, 1380, 1378, 1, 0, 0, 0, 1380, 1381, 1, 0, 0, 0, 1381, 1383, 1, 0, 0, 0, 1382, 1380, 1, 0, 0, 0, 1383, 1387, 5,
    9, 0, 0, 1384, 1386, 5, 5, 0, 0, 1385, 1384, 1, 0, 0, 0, 1386, 1389, 1, 0, 0, 0, 1387, 1385, 1, 0, 0, 0, 1387, 1388,
    1, 0, 0, 0, 1388, 1390, 1, 0, 0, 0, 1389, 1387, 1, 0, 0, 0, 1390, 1398, 3, 80, 40, 0, 1391, 1393, 5, 5, 0, 0, 1392,
    1391, 1, 0, 0, 0, 1393, 1396, 1, 0, 0, 0, 1394, 1392, 1, 0, 0, 0, 1394, 1395, 1, 0, 0, 0, 1395, 1397, 1, 0, 0, 0,
    1396, 1394, 1, 0, 0, 0, 1397, 1399, 5, 8, 0, 0, 1398, 1394, 1, 0, 0, 0, 1398, 1399, 1, 0, 0, 0, 1399, 1403, 1, 0, 0,
    0, 1400, 1402, 5, 5, 0, 0, 1401, 1400, 1, 0, 0, 0, 1402, 1405, 1, 0, 0, 0, 1403, 1401, 1, 0, 0, 0, 1403, 1404, 1, 0,
    0, 0, 1404, 1406, 1, 0, 0, 0, 1405, 1403, 1, 0, 0, 0, 1406, 1421, 5, 10, 0, 0, 1407, 1409, 5, 5, 0, 0, 1408, 1407,
    1, 0, 0, 0, 1409, 1412, 1, 0, 0, 0, 1410, 1408, 1, 0, 0, 0, 1410, 1411, 1, 0, 0, 0, 1411, 1413, 1, 0, 0, 0, 1412,
    1410, 1, 0, 0, 0, 1413, 1417, 5, 26, 0, 0, 1414, 1416, 5, 5, 0, 0, 1415, 1414, 1, 0, 0, 0, 1416, 1419, 1, 0, 0, 0,
    1417, 1415, 1, 0, 0, 0, 1417, 1418, 1, 0, 0, 0, 1418, 1420, 1, 0, 0, 0, 1419, 1417, 1, 0, 0, 0, 1420, 1422, 3, 98,
    49, 0, 1421, 1410, 1, 0, 0, 0, 1421, 1422, 1, 0, 0, 0, 1422, 1426, 1, 0, 0, 0, 1423, 1425, 5, 5, 0, 0, 1424, 1423,
    1, 0, 0, 0, 1425, 1428, 1, 0, 0, 0, 1426, 1424, 1, 0, 0, 0, 1426, 1427, 1, 0, 0, 0, 1427, 1429, 1, 0, 0, 0, 1428,
    1426, 1, 0, 0, 0, 1429, 1430, 3, 64, 32, 0, 1430, 1432, 1, 0, 0, 0, 1431, 1380, 1, 0, 0, 0, 1431, 1432, 1, 0, 0, 0,
    1432, 77, 1, 0, 0, 0, 1433, 1437, 5, 9, 0, 0, 1434, 1436, 5, 5, 0, 0, 1435, 1434, 1, 0, 0, 0, 1436, 1439, 1, 0, 0,
    0, 1437, 1435, 1, 0, 0, 0, 1437, 1438, 1, 0, 0, 0, 1438, 1469, 1, 0, 0, 0, 1439, 1437, 1, 0, 0, 0, 1440, 1457, 3,
    80, 40, 0, 1441, 1443, 5, 5, 0, 0, 1442, 1441, 1, 0, 0, 0, 1443, 1446, 1, 0, 0, 0, 1444, 1442, 1, 0, 0, 0, 1444,
    1445, 1, 0, 0, 0, 1445, 1447, 1, 0, 0, 0, 1446, 1444, 1, 0, 0, 0, 1447, 1451, 5, 8, 0, 0, 1448, 1450, 5, 5, 0, 0,
    1449, 1448, 1, 0, 0, 0, 1450, 1453, 1, 0, 0, 0, 1451, 1449, 1, 0, 0, 0, 1451, 1452, 1, 0, 0, 0, 1452, 1454, 1, 0, 0,
    0, 1453, 1451, 1, 0, 0, 0, 1454, 1456, 3, 80, 40, 0, 1455, 1444, 1, 0, 0, 0, 1456, 1459, 1, 0, 0, 0, 1457, 1455, 1,
    0, 0, 0, 1457, 1458, 1, 0, 0, 0, 1458, 1467, 1, 0, 0, 0, 1459, 1457, 1, 0, 0, 0, 1460, 1462, 5, 5, 0, 0, 1461, 1460,
    1, 0, 0, 0, 1462, 1465, 1, 0, 0, 0, 1463, 1461, 1, 0, 0, 0, 1463, 1464, 1, 0, 0, 0, 1464, 1466, 1, 0, 0, 0, 1465,
    1463, 1, 0, 0, 0, 1466, 1468, 5, 8, 0, 0, 1467, 1463, 1, 0, 0, 0, 1467, 1468, 1, 0, 0, 0, 1468, 1470, 1, 0, 0, 0,
    1469, 1440, 1, 0, 0, 0, 1469, 1470, 1, 0, 0, 0, 1470, 1474, 1, 0, 0, 0, 1471, 1473, 5, 5, 0, 0, 1472, 1471, 1, 0, 0,
    0, 1473, 1476, 1, 0, 0, 0, 1474, 1472, 1, 0, 0, 0, 1474, 1475, 1, 0, 0, 0, 1475, 1477, 1, 0, 0, 0, 1476, 1474, 1, 0,
    0, 0, 1477, 1478, 5, 10, 0, 0, 1478, 79, 1, 0, 0, 0, 1479, 1481, 3, 302, 151, 0, 1480, 1479, 1, 0, 0, 0, 1480, 1481,
    1, 0, 0, 0, 1481, 1482, 1, 0, 0, 0, 1482, 1497, 3, 82, 41, 0, 1483, 1485, 5, 5, 0, 0, 1484, 1483, 1, 0, 0, 0, 1485,
    1488, 1, 0, 0, 0, 1486, 1484, 1, 0, 0, 0, 1486, 1487, 1, 0, 0, 0, 1487, 1489, 1, 0, 0, 0, 1488, 1486, 1, 0, 0, 0,
    1489, 1493, 5, 28, 0, 0, 1490, 1492, 5, 5, 0, 0, 1491, 1490, 1, 0, 0, 0, 1492, 1495, 1, 0, 0, 0, 1493, 1491, 1, 0,
    0, 0, 1493, 1494, 1, 0, 0, 0, 1494, 1496, 1, 0, 0, 0, 1495, 1493, 1, 0, 0, 0, 1496, 1498, 3, 152, 76, 0, 1497, 1486,
    1, 0, 0, 0, 1497, 1498, 1, 0, 0, 0, 1498, 81, 1, 0, 0, 0, 1499, 1503, 3, 344, 172, 0, 1500, 1502, 5, 5, 0, 0, 1501,
    1500, 1, 0, 0, 0, 1502, 1505, 1, 0, 0, 0, 1503, 1501, 1, 0, 0, 0, 1503, 1504, 1, 0, 0, 0, 1504, 1514, 1, 0, 0, 0,
    1505, 1503, 1, 0, 0, 0, 1506, 1510, 5, 26, 0, 0, 1507, 1509, 5, 5, 0, 0, 1508, 1507, 1, 0, 0, 0, 1509, 1512, 1, 0,
    0, 0, 1510, 1508, 1, 0, 0, 0, 1510, 1511, 1, 0, 0, 0, 1511, 1513, 1, 0, 0, 0, 1512, 1510, 1, 0, 0, 0, 1513, 1515, 3,
    98, 49, 0, 1514, 1506, 1, 0, 0, 0, 1514, 1515, 1, 0, 0, 0, 1515, 83, 1, 0, 0, 0, 1516, 1520, 3, 344, 172, 0, 1517,
    1519, 5, 5, 0, 0, 1518, 1517, 1, 0, 0, 0, 1519, 1522, 1, 0, 0, 0, 1520, 1518, 1, 0, 0, 0, 1520, 1521, 1, 0, 0, 0,
    1521, 1523, 1, 0, 0, 0, 1522, 1520, 1, 0, 0, 0, 1523, 1527, 5, 26, 0, 0, 1524, 1526, 5, 5, 0, 0, 1525, 1524, 1, 0,
    0, 0, 1526, 1529, 1, 0, 0, 0, 1527, 1525, 1, 0, 0, 0, 1527, 1528, 1, 0, 0, 0, 1528, 1530, 1, 0, 0, 0, 1529, 1527, 1,
    0, 0, 0, 1530, 1531, 3, 98, 49, 0, 1531, 85, 1, 0, 0, 0, 1532, 1534, 3, 300, 150, 0, 1533, 1532, 1, 0, 0, 0, 1533,
    1534, 1, 0, 0, 0, 1534, 1535, 1, 0, 0, 0, 1535, 1539, 5, 77, 0, 0, 1536, 1538, 5, 5, 0, 0, 1537, 1536, 1, 0, 0, 0,
    1538, 1541, 1, 0, 0, 0, 1539, 1537, 1, 0, 0, 0, 1539, 1540, 1, 0, 0, 0, 1540, 1542, 1, 0, 0, 0, 1541, 1539, 1, 0, 0,
    0, 1542, 1557, 3, 344, 172, 0, 1543, 1545, 5, 5, 0, 0, 1544, 1543, 1, 0, 0, 0, 1545, 1548, 1, 0, 0, 0, 1546, 1544,
    1, 0, 0, 0, 1546, 1547, 1, 0, 0, 0, 1547, 1549, 1, 0, 0, 0, 1548, 1546, 1, 0, 0, 0, 1549, 1553, 5, 26, 0, 0, 1550,
    1552, 5, 5, 0, 0, 1551, 1550, 1, 0, 0, 0, 1552, 1555, 1, 0, 0, 0, 1553, 1551, 1, 0, 0, 0, 1553, 1554, 1, 0, 0, 0,
    1554, 1556, 1, 0, 0, 0, 1555, 1553, 1, 0, 0, 0, 1556, 1558, 3, 32, 16, 0, 1557, 1546, 1, 0, 0, 0, 1557, 1558, 1, 0,
    0, 0, 1558, 1566, 1, 0, 0, 0, 1559, 1561, 5, 5, 0, 0, 1560, 1559, 1, 0, 0, 0, 1561, 1564, 1, 0, 0, 0, 1562, 1560, 1,
    0, 0, 0, 1562, 1563, 1, 0, 0, 0, 1563, 1565, 1, 0, 0, 0, 1564, 1562, 1, 0, 0, 0, 1565, 1567, 3, 26, 13, 0, 1566,
    1562, 1, 0, 0, 0, 1566, 1567, 1, 0, 0, 0, 1567, 87, 1, 0, 0, 0, 1568, 1570, 3, 300, 150, 0, 1569, 1568, 1, 0, 0, 0,
    1569, 1570, 1, 0, 0, 0, 1570, 1571, 1, 0, 0, 0, 1571, 1575, 5, 81, 0, 0, 1572, 1574, 5, 5, 0, 0, 1573, 1572, 1, 0,
    0, 0, 1574, 1577, 1, 0, 0, 0, 1575, 1573, 1, 0, 0, 0, 1575, 1576, 1, 0, 0, 0, 1576, 1578, 1, 0, 0, 0, 1577, 1575, 1,
    0, 0, 0, 1578, 1593, 3, 58, 29, 0, 1579, 1581, 5, 5, 0, 0, 1580, 1579, 1, 0, 0, 0, 1581, 1584, 1, 0, 0, 0, 1582,
    1580, 1, 0, 0, 0, 1582, 1583, 1, 0, 0, 0, 1583, 1585, 1, 0, 0, 0, 1584, 1582, 1, 0, 0, 0, 1585, 1589, 5, 26, 0, 0,
    1586, 1588, 5, 5, 0, 0, 1587, 1586, 1, 0, 0, 0, 1588, 1591, 1, 0, 0, 0, 1589, 1587, 1, 0, 0, 0, 1589, 1590, 1, 0, 0,
    0, 1590, 1592, 1, 0, 0, 0, 1591, 1589, 1, 0, 0, 0, 1592, 1594, 3, 90, 45, 0, 1593, 1582, 1, 0, 0, 0, 1593, 1594, 1,
    0, 0, 0, 1594, 1598, 1, 0, 0, 0, 1595, 1597, 5, 5, 0, 0, 1596, 1595, 1, 0, 0, 0, 1597, 1600, 1, 0, 0, 0, 1598, 1596,
    1, 0, 0, 0, 1598, 1599, 1, 0, 0, 0, 1599, 1602, 1, 0, 0, 0, 1600, 1598, 1, 0, 0, 0, 1601, 1603, 3, 136, 68, 0, 1602,
    1601, 1, 0, 0, 0, 1602, 1603, 1, 0, 0, 0, 1603, 89, 1, 0, 0, 0, 1604, 1608, 7, 2, 0, 0, 1605, 1607, 5, 5, 0, 0,
    1606, 1605, 1, 0, 0, 0, 1607, 1610, 1, 0, 0, 0, 1608, 1606, 1, 0, 0, 0, 1608, 1609, 1, 0, 0, 0, 1609, 1611, 1, 0, 0,
    0, 1610, 1608, 1, 0, 0, 0, 1611, 1612, 3, 208, 104, 0, 1612, 91, 1, 0, 0, 0, 1613, 1617, 5, 13, 0, 0, 1614, 1616, 5,
    5, 0, 0, 1615, 1614, 1, 0, 0, 0, 1616, 1619, 1, 0, 0, 0, 1617, 1615, 1, 0, 0, 0, 1617, 1618, 1, 0, 0, 0, 1618, 1621,
    1, 0, 0, 0, 1619, 1617, 1, 0, 0, 0, 1620, 1622, 3, 94, 47, 0, 1621, 1620, 1, 0, 0, 0, 1621, 1622, 1, 0, 0, 0, 1622,
    1637, 1, 0, 0, 0, 1623, 1625, 5, 5, 0, 0, 1624, 1623, 1, 0, 0, 0, 1625, 1628, 1, 0, 0, 0, 1626, 1624, 1, 0, 0, 0,
    1626, 1627, 1, 0, 0, 0, 1627, 1629, 1, 0, 0, 0, 1628, 1626, 1, 0, 0, 0, 1629, 1633, 5, 27, 0, 0, 1630, 1632, 5, 5,
    0, 0, 1631, 1630, 1, 0, 0, 0, 1632, 1635, 1, 0, 0, 0, 1633, 1631, 1, 0, 0, 0, 1633, 1634, 1, 0, 0, 0, 1634, 1636, 1,
    0, 0, 0, 1635, 1633, 1, 0, 0, 0, 1636, 1638, 3, 50, 25, 0, 1637, 1626, 1, 0, 0, 0, 1637, 1638, 1, 0, 0, 0, 1638,
    1642, 1, 0, 0, 0, 1639, 1641, 5, 5, 0, 0, 1640, 1639, 1, 0, 0, 0, 1641, 1644, 1, 0, 0, 0, 1642, 1640, 1, 0, 0, 0,
    1642, 1643, 1, 0, 0, 0, 1643, 1645, 1, 0, 0, 0, 1644, 1642, 1, 0, 0, 0, 1645, 1646, 5, 14, 0, 0, 1646, 93, 1, 0, 0,
    0, 1647, 1664, 3, 96, 48, 0, 1648, 1650, 5, 5, 0, 0, 1649, 1648, 1, 0, 0, 0, 1650, 1653, 1, 0, 0, 0, 1651, 1649, 1,
    0, 0, 0, 1651, 1652, 1, 0, 0, 0, 1652, 1654, 1, 0, 0, 0, 1653, 1651, 1, 0, 0, 0, 1654, 1658, 5, 8, 0, 0, 1655, 1657,
    5, 5, 0, 0, 1656, 1655, 1, 0, 0, 0, 1657, 1660, 1, 0, 0, 0, 1658, 1656, 1, 0, 0, 0, 1658, 1659, 1, 0, 0, 0, 1659,
    1661, 1, 0, 0, 0, 1660, 1658, 1, 0, 0, 0, 1661, 1663, 3, 96, 48, 0, 1662, 1651, 1, 0, 0, 0, 1663, 1666, 1, 0, 0, 0,
    1664, 1662, 1, 0, 0, 0, 1664, 1665, 1, 0, 0, 0, 1665, 1670, 1, 0, 0, 0, 1666, 1664, 1, 0, 0, 0, 1667, 1669, 5, 5, 0,
    0, 1668, 1667, 1, 0, 0, 0, 1669, 1672, 1, 0, 0, 0, 1670, 1668, 1, 0, 0, 0, 1670, 1671, 1, 0, 0, 0, 1671, 1674, 1, 0,
    0, 0, 1672, 1670, 1, 0, 0, 0, 1673, 1675, 5, 8, 0, 0, 1674, 1673, 1, 0, 0, 0, 1674, 1675, 1, 0, 0, 0, 1675, 95, 1,
    0, 0, 0, 1676, 1680, 3, 300, 150, 0, 1677, 1679, 5, 5, 0, 0, 1678, 1677, 1, 0, 0, 0, 1679, 1682, 1, 0, 0, 0, 1680,
    1678, 1, 0, 0, 0, 1680, 1681, 1, 0, 0, 0, 1681, 1684, 1, 0, 0, 0, 1682, 1680, 1, 0, 0, 0, 1683, 1676, 1, 0, 0, 0,
    1683, 1684, 1, 0, 0, 0, 1684, 1685, 1, 0, 0, 0, 1685, 1693, 3, 344, 172, 0, 1686, 1688, 5, 5, 0, 0, 1687, 1686, 1,
    0, 0, 0, 1688, 1691, 1, 0, 0, 0, 1689, 1687, 1, 0, 0, 0, 1689, 1690, 1, 0, 0, 0, 1690, 1692, 1, 0, 0, 0, 1691, 1689,
    1, 0, 0, 0, 1692, 1694, 3, 208, 104, 0, 1693, 1689, 1, 0, 0, 0, 1693, 1694, 1, 0, 0, 0, 1694, 1702, 1, 0, 0, 0,
    1695, 1697, 5, 5, 0, 0, 1696, 1695, 1, 0, 0, 0, 1697, 1700, 1, 0, 0, 0, 1698, 1696, 1, 0, 0, 0, 1698, 1699, 1, 0, 0,
    0, 1699, 1701, 1, 0, 0, 0, 1700, 1698, 1, 0, 0, 0, 1701, 1703, 3, 26, 13, 0, 1702, 1698, 1, 0, 0, 0, 1702, 1703, 1,
    0, 0, 0, 1703, 97, 1, 0, 0, 0, 1704, 1706, 3, 306, 153, 0, 1705, 1704, 1, 0, 0, 0, 1705, 1706, 1, 0, 0, 0, 1706,
    1712, 1, 0, 0, 0, 1707, 1713, 3, 116, 58, 0, 1708, 1713, 3, 120, 60, 0, 1709, 1713, 3, 102, 51, 0, 1710, 1713, 3,
    100, 50, 0, 1711, 1713, 3, 126, 63, 0, 1712, 1707, 1, 0, 0, 0, 1712, 1708, 1, 0, 0, 0, 1712, 1709, 1, 0, 0, 0, 1712,
    1710, 1, 0, 0, 0, 1712, 1711, 1, 0, 0, 0, 1713, 99, 1, 0, 0, 0, 1714, 1717, 3, 106, 53, 0, 1715, 1717, 5, 108, 0, 0,
    1716, 1714, 1, 0, 0, 0, 1716, 1715, 1, 0, 0, 0, 1717, 101, 1, 0, 0, 0, 1718, 1721, 3, 100, 50, 0, 1719, 1721, 3,
    120, 60, 0, 1720, 1718, 1, 0, 0, 0, 1720, 1719, 1, 0, 0, 0, 1721, 1725, 1, 0, 0, 0, 1722, 1724, 5, 5, 0, 0, 1723,
    1722, 1, 0, 0, 0, 1724, 1727, 1, 0, 0, 0, 1725, 1723, 1, 0, 0, 0, 1725, 1726, 1, 0, 0, 0, 1726, 1729, 1, 0, 0, 0,
    1727, 1725, 1, 0, 0, 0, 1728, 1730, 3, 104, 52, 0, 1729, 1728, 1, 0, 0, 0, 1730, 1731, 1, 0, 0, 0, 1731, 1729, 1, 0,
    0, 0, 1731, 1732, 1, 0, 0, 0, 1732, 103, 1, 0, 0, 0, 1733, 1734, 7, 3, 0, 0, 1734, 105, 1, 0, 0, 0, 1735, 1752, 3,
    108, 54, 0, 1736, 1738, 5, 5, 0, 0, 1737, 1736, 1, 0, 0, 0, 1738, 1741, 1, 0, 0, 0, 1739, 1737, 1, 0, 0, 0, 1739,
    1740, 1, 0, 0, 0, 1740, 1742, 1, 0, 0, 0, 1741, 1739, 1, 0, 0, 0, 1742, 1746, 5, 7, 0, 0, 1743, 1745, 5, 5, 0, 0,
    1744, 1743, 1, 0, 0, 0, 1745, 1748, 1, 0, 0, 0, 1746, 1744, 1, 0, 0, 0, 1746, 1747, 1, 0, 0, 0, 1747, 1749, 1, 0, 0,
    0, 1748, 1746, 1, 0, 0, 0, 1749, 1751, 3, 108, 54, 0, 1750, 1739, 1, 0, 0, 0, 1751, 1754, 1, 0, 0, 0, 1752, 1750, 1,
    0, 0, 0, 1752, 1753, 1, 0, 0, 0, 1753, 107, 1, 0, 0, 0, 1754, 1752, 1, 0, 0, 0, 1755, 1763, 3, 344, 172, 0, 1756,
    1758, 5, 5, 0, 0, 1757, 1756, 1, 0, 0, 0, 1758, 1761, 1, 0, 0, 0, 1759, 1757, 1, 0, 0, 0, 1759, 1760, 1, 0, 0, 0,
    1760, 1762, 1, 0, 0, 0, 1761, 1759, 1, 0, 0, 0, 1762, 1764, 3, 206, 103, 0, 1763, 1759, 1, 0, 0, 0, 1763, 1764, 1,
    0, 0, 0, 1764, 109, 1, 0, 0, 0, 1765, 1767, 3, 112, 56, 0, 1766, 1765, 1, 0, 0, 0, 1766, 1767, 1, 0, 0, 0, 1767,
    1768, 1, 0, 0, 0, 1768, 1771, 3, 98, 49, 0, 1769, 1771, 5, 15, 0, 0, 1770, 1766, 1, 0, 0, 0, 1770, 1769, 1, 0, 0, 0,
    1771, 111, 1, 0, 0, 0, 1772, 1774, 3, 114, 57, 0, 1773, 1772, 1, 0, 0, 0, 1774, 1775, 1, 0, 0, 0, 1775, 1773, 1, 0,
    0, 0, 1775, 1776, 1, 0, 0, 0, 1776, 113, 1, 0, 0, 0, 1777, 1781, 3, 316, 158, 0, 1778, 1780, 5, 5, 0, 0, 1779, 1778,
    1, 0, 0, 0, 1780, 1783, 1, 0, 0, 0, 1781, 1779, 1, 0, 0, 0, 1781, 1782, 1, 0, 0, 0, 1782, 1786, 1, 0, 0, 0, 1783,
    1781, 1, 0, 0, 0, 1784, 1786, 3, 334, 167, 0, 1785, 1777, 1, 0, 0, 0, 1785, 1784, 1, 0, 0, 0, 1786, 115, 1, 0, 0, 0,
    1787, 1791, 3, 122, 61, 0, 1788, 1790, 5, 5, 0, 0, 1789, 1788, 1, 0, 0, 0, 1790, 1793, 1, 0, 0, 0, 1791, 1789, 1, 0,
    0, 0, 1791, 1792, 1, 0, 0, 0, 1792, 1794, 1, 0, 0, 0, 1793, 1791, 1, 0, 0, 0, 1794, 1798, 5, 7, 0, 0, 1795, 1797, 5,
    5, 0, 0, 1796, 1795, 1, 0, 0, 0, 1797, 1800, 1, 0, 0, 0, 1798, 1796, 1, 0, 0, 0, 1798, 1799, 1, 0, 0, 0, 1799, 1802,
    1, 0, 0, 0, 1800, 1798, 1, 0, 0, 0, 1801, 1787, 1, 0, 0, 0, 1801, 1802, 1, 0, 0, 0, 1802, 1803, 1, 0, 0, 0, 1803,
    1807, 3, 118, 59, 0, 1804, 1806, 5, 5, 0, 0, 1805, 1804, 1, 0, 0, 0, 1806, 1809, 1, 0, 0, 0, 1807, 1805, 1, 0, 0, 0,
    1807, 1808, 1, 0, 0, 0, 1808, 1810, 1, 0, 0, 0, 1809, 1807, 1, 0, 0, 0, 1810, 1814, 5, 34, 0, 0, 1811, 1813, 5, 5,
    0, 0, 1812, 1811, 1, 0, 0, 0, 1813, 1816, 1, 0, 0, 0, 1814, 1812, 1, 0, 0, 0, 1814, 1815, 1, 0, 0, 0, 1815, 1817, 1,
    0, 0, 0, 1816, 1814, 1, 0, 0, 0, 1817, 1818, 3, 98, 49, 0, 1818, 117, 1, 0, 0, 0, 1819, 1823, 5, 9, 0, 0, 1820,
    1822, 5, 5, 0, 0, 1821, 1820, 1, 0, 0, 0, 1822, 1825, 1, 0, 0, 0, 1823, 1821, 1, 0, 0, 0, 1823, 1824, 1, 0, 0, 0,
    1824, 1828, 1, 0, 0, 0, 1825, 1823, 1, 0, 0, 0, 1826, 1829, 3, 84, 42, 0, 1827, 1829, 3, 98, 49, 0, 1828, 1826, 1,
    0, 0, 0, 1828, 1827, 1, 0, 0, 0, 1828, 1829, 1, 0, 0, 0, 1829, 1849, 1, 0, 0, 0, 1830, 1832, 5, 5, 0, 0, 1831, 1830,
    1, 0, 0, 0, 1832, 1835, 1, 0, 0, 0, 1833, 1831, 1, 0, 0, 0, 1833, 1834, 1, 0, 0, 0, 1834, 1836, 1, 0, 0, 0, 1835,
    1833, 1, 0, 0, 0, 1836, 1840, 5, 8, 0, 0, 1837, 1839, 5, 5, 0, 0, 1838, 1837, 1, 0, 0, 0, 1839, 1842, 1, 0, 0, 0,
    1840, 1838, 1, 0, 0, 0, 1840, 1841, 1, 0, 0, 0, 1841, 1845, 1, 0, 0, 0, 1842, 1840, 1, 0, 0, 0, 1843, 1846, 3, 84,
    42, 0, 1844, 1846, 3, 98, 49, 0, 1845, 1843, 1, 0, 0, 0, 1845, 1844, 1, 0, 0, 0, 1846, 1848, 1, 0, 0, 0, 1847, 1833,
    1, 0, 0, 0, 1848, 1851, 1, 0, 0, 0, 1849, 1847, 1, 0, 0, 0, 1849, 1850, 1, 0, 0, 0, 1850, 1859, 1, 0, 0, 0, 1851,
    1849, 1, 0, 0, 0, 1852, 1854, 5, 5, 0, 0, 1853, 1852, 1, 0, 0, 0, 1854, 1857, 1, 0, 0, 0, 1855, 1853, 1, 0, 0, 0,
    1855, 1856, 1, 0, 0, 0, 1856, 1858, 1, 0, 0, 0, 1857, 1855, 1, 0, 0, 0, 1858, 1860, 5, 8, 0, 0, 1859, 1855, 1, 0, 0,
    0, 1859, 1860, 1, 0, 0, 0, 1860, 1864, 1, 0, 0, 0, 1861, 1863, 5, 5, 0, 0, 1862, 1861, 1, 0, 0, 0, 1863, 1866, 1, 0,
    0, 0, 1864, 1862, 1, 0, 0, 0, 1864, 1865, 1, 0, 0, 0, 1865, 1867, 1, 0, 0, 0, 1866, 1864, 1, 0, 0, 0, 1867, 1868, 5,
    10, 0, 0, 1868, 119, 1, 0, 0, 0, 1869, 1873, 5, 9, 0, 0, 1870, 1872, 5, 5, 0, 0, 1871, 1870, 1, 0, 0, 0, 1872, 1875,
    1, 0, 0, 0, 1873, 1871, 1, 0, 0, 0, 1873, 1874, 1, 0, 0, 0, 1874, 1876, 1, 0, 0, 0, 1875, 1873, 1, 0, 0, 0, 1876,
    1880, 3, 98, 49, 0, 1877, 1879, 5, 5, 0, 0, 1878, 1877, 1, 0, 0, 0, 1879, 1882, 1, 0, 0, 0, 1880, 1878, 1, 0, 0, 0,
    1880, 1881, 1, 0, 0, 0, 1881, 1883, 1, 0, 0, 0, 1882, 1880, 1, 0, 0, 0, 1883, 1884, 5, 10, 0, 0, 1884, 121, 1, 0, 0,
    0, 1885, 1887, 3, 306, 153, 0, 1886, 1885, 1, 0, 0, 0, 1886, 1887, 1, 0, 0, 0, 1887, 1891, 1, 0, 0, 0, 1888, 1892,
    3, 120, 60, 0, 1889, 1892, 3, 102, 51, 0, 1890, 1892, 3, 100, 50, 0, 1891, 1888, 1, 0, 0, 0, 1891, 1889, 1, 0, 0, 0,
    1891, 1890, 1, 0, 0, 0, 1892, 123, 1, 0, 0, 0, 1893, 1897, 5, 9, 0, 0, 1894, 1896, 5, 5, 0, 0, 1895, 1894, 1, 0, 0,
    0, 1896, 1899, 1, 0, 0, 0, 1897, 1895, 1, 0, 0, 0, 1897, 1898, 1, 0, 0, 0, 1898, 1902, 1, 0, 0, 0, 1899, 1897, 1, 0,
    0, 0, 1900, 1903, 3, 106, 53, 0, 1901, 1903, 3, 124, 62, 0, 1902, 1900, 1, 0, 0, 0, 1902, 1901, 1, 0, 0, 0, 1903,
    1907, 1, 0, 0, 0, 1904, 1906, 5, 5, 0, 0, 1905, 1904, 1, 0, 0, 0, 1906, 1909, 1, 0, 0, 0, 1907, 1905, 1, 0, 0, 0,
    1907, 1908, 1, 0, 0, 0, 1908, 1910, 1, 0, 0, 0, 1909, 1907, 1, 0, 0, 0, 1910, 1911, 5, 10, 0, 0, 1911, 125, 1, 0, 0,
    0, 1912, 1914, 3, 306, 153, 0, 1913, 1912, 1, 0, 0, 0, 1913, 1914, 1, 0, 0, 0, 1914, 1917, 1, 0, 0, 0, 1915, 1918,
    3, 106, 53, 0, 1916, 1918, 3, 124, 62, 0, 1917, 1915, 1, 0, 0, 0, 1917, 1916, 1, 0, 0, 0, 1918, 1922, 1, 0, 0, 0,
    1919, 1921, 5, 5, 0, 0, 1920, 1919, 1, 0, 0, 0, 1921, 1924, 1, 0, 0, 0, 1922, 1920, 1, 0, 0, 0, 1922, 1923, 1, 0, 0,
    0, 1923, 1925, 1, 0, 0, 0, 1924, 1922, 1, 0, 0, 0, 1925, 1929, 5, 57, 0, 0, 1926, 1928, 5, 5, 0, 0, 1927, 1926, 1,
    0, 0, 0, 1928, 1931, 1, 0, 0, 0, 1929, 1927, 1, 0, 0, 0, 1929, 1930, 1, 0, 0, 0, 1930, 1933, 1, 0, 0, 0, 1931, 1929,
    1, 0, 0, 0, 1932, 1934, 3, 306, 153, 0, 1933, 1932, 1, 0, 0, 0, 1933, 1934, 1, 0, 0, 0, 1934, 1937, 1, 0, 0, 0,
    1935, 1938, 3, 106, 53, 0, 1936, 1938, 3, 124, 62, 0, 1937, 1935, 1, 0, 0, 0, 1937, 1936, 1, 0, 0, 0, 1938, 127, 1,
    0, 0, 0, 1939, 1945, 3, 130, 65, 0, 1940, 1941, 3, 150, 75, 0, 1941, 1942, 3, 130, 65, 0, 1942, 1944, 1, 0, 0, 0,
    1943, 1940, 1, 0, 0, 0, 1944, 1947, 1, 0, 0, 0, 1945, 1943, 1, 0, 0, 0, 1945, 1946, 1, 0, 0, 0, 1946, 1949, 1, 0, 0,
    0, 1947, 1945, 1, 0, 0, 0, 1948, 1939, 1, 0, 0, 0, 1948, 1949, 1, 0, 0, 0, 1949, 1951, 1, 0, 0, 0, 1950, 1952, 3,
    150, 75, 0, 1951, 1950, 1, 0, 0, 0, 1951, 1952, 1, 0, 0, 0, 1952, 129, 1, 0, 0, 0, 1953, 1956, 3, 132, 66, 0, 1954,
    1956, 3, 334, 167, 0, 1955, 1953, 1, 0, 0, 0, 1955, 1954, 1, 0, 0, 0, 1956, 1959, 1, 0, 0, 0, 1957, 1955, 1, 0, 0,
    0, 1957, 1958, 1, 0, 0, 0, 1958, 1964, 1, 0, 0, 0, 1959, 1957, 1, 0, 0, 0, 1960, 1965, 3, 20, 10, 0, 1961, 1965, 3,
    146, 73, 0, 1962, 1965, 3, 138, 69, 0, 1963, 1965, 3, 152, 76, 0, 1964, 1960, 1, 0, 0, 0, 1964, 1961, 1, 0, 0, 0,
    1964, 1962, 1, 0, 0, 0, 1964, 1963, 1, 0, 0, 0, 1965, 131, 1, 0, 0, 0, 1966, 1967, 3, 344, 172, 0, 1967, 1971, 7, 4,
    0, 0, 1968, 1970, 5, 5, 0, 0, 1969, 1968, 1, 0, 0, 0, 1970, 1973, 1, 0, 0, 0, 1971, 1969, 1, 0, 0, 0, 1971, 1972, 1,
    0, 0, 0, 1972, 133, 1, 0, 0, 0, 1973, 1971, 1, 0, 0, 0, 1974, 1977, 3, 136, 68, 0, 1975, 1977, 3, 130, 65, 0, 1976,
    1974, 1, 0, 0, 0, 1976, 1975, 1, 0, 0, 0, 1977, 135, 1, 0, 0, 0, 1978, 1982, 5, 13, 0, 0, 1979, 1981, 5, 5, 0, 0,
    1980, 1979, 1, 0, 0, 0, 1981, 1984, 1, 0, 0, 0, 1982, 1980, 1, 0, 0, 0, 1982, 1983, 1, 0, 0, 0, 1983, 1985, 1, 0, 0,
    0, 1984, 1982, 1, 0, 0, 0, 1985, 1989, 3, 128, 64, 0, 1986, 1988, 5, 5, 0, 0, 1987, 1986, 1, 0, 0, 0, 1988, 1991, 1,
    0, 0, 0, 1989, 1987, 1, 0, 0, 0, 1989, 1990, 1, 0, 0, 0, 1990, 1992, 1, 0, 0, 0, 1991, 1989, 1, 0, 0, 0, 1992, 1993,
    5, 14, 0, 0, 1993, 137, 1, 0, 0, 0, 1994, 1998, 3, 140, 70, 0, 1995, 1998, 3, 142, 71, 0, 1996, 1998, 3, 144, 72, 0,
    1997, 1994, 1, 0, 0, 0, 1997, 1995, 1, 0, 0, 0, 1997, 1996, 1, 0, 0, 0, 1998, 139, 1, 0, 0, 0, 1999, 2003, 5, 95, 0,
    0, 2000, 2002, 5, 5, 0, 0, 2001, 2000, 1, 0, 0, 0, 2002, 2005, 1, 0, 0, 0, 2003, 2001, 1, 0, 0, 0, 2003, 2004, 1, 0,
    0, 0, 2004, 2006, 1, 0, 0, 0, 2005, 2003, 1, 0, 0, 0, 2006, 2010, 5, 9, 0, 0, 2007, 2009, 3, 334, 167, 0, 2008,
    2007, 1, 0, 0, 0, 2009, 2012, 1, 0, 0, 0, 2010, 2008, 1, 0, 0, 0, 2010, 2011, 1, 0, 0, 0, 2011, 2015, 1, 0, 0, 0,
    2012, 2010, 1, 0, 0, 0, 2013, 2016, 3, 66, 33, 0, 2014, 2016, 3, 68, 34, 0, 2015, 2013, 1, 0, 0, 0, 2015, 2014, 1,
    0, 0, 0, 2016, 2017, 1, 0, 0, 0, 2017, 2018, 5, 104, 0, 0, 2018, 2019, 3, 152, 76, 0, 2019, 2023, 5, 10, 0, 0, 2020,
    2022, 5, 5, 0, 0, 2021, 2020, 1, 0, 0, 0, 2022, 2025, 1, 0, 0, 0, 2023, 2021, 1, 0, 0, 0, 2023, 2024, 1, 0, 0, 0,
    2024, 2027, 1, 0, 0, 0, 2025, 2023, 1, 0, 0, 0, 2026, 2028, 3, 134, 67, 0, 2027, 2026, 1, 0, 0, 0, 2027, 2028, 1, 0,
    0, 0, 2028, 141, 1, 0, 0, 0, 2029, 2033, 5, 97, 0, 0, 2030, 2032, 5, 5, 0, 0, 2031, 2030, 1, 0, 0, 0, 2032, 2035, 1,
    0, 0, 0, 2033, 2031, 1, 0, 0, 0, 2033, 2034, 1, 0, 0, 0, 2034, 2036, 1, 0, 0, 0, 2035, 2033, 1, 0, 0, 0, 2036, 2037,
    5, 9, 0, 0, 2037, 2038, 3, 152, 76, 0, 2038, 2042, 5, 10, 0, 0, 2039, 2041, 5, 5, 0, 0, 2040, 2039, 1, 0, 0, 0,
    2041, 2044, 1, 0, 0, 0, 2042, 2040, 1, 0, 0, 0, 2042, 2043, 1, 0, 0, 0, 2043, 2047, 1, 0, 0, 0, 2044, 2042, 1, 0, 0,
    0, 2045, 2048, 3, 134, 67, 0, 2046, 2048, 5, 27, 0, 0, 2047, 2045, 1, 0, 0, 0, 2047, 2046, 1, 0, 0, 0, 2048, 143, 1,
    0, 0, 0, 2049, 2053, 5, 96, 0, 0, 2050, 2052, 5, 5, 0, 0, 2051, 2050, 1, 0, 0, 0, 2052, 2055, 1, 0, 0, 0, 2053,
    2051, 1, 0, 0, 0, 2053, 2054, 1, 0, 0, 0, 2054, 2057, 1, 0, 0, 0, 2055, 2053, 1, 0, 0, 0, 2056, 2058, 3, 134, 67, 0,
    2057, 2056, 1, 0, 0, 0, 2057, 2058, 1, 0, 0, 0, 2058, 2062, 1, 0, 0, 0, 2059, 2061, 5, 5, 0, 0, 2060, 2059, 1, 0, 0,
    0, 2061, 2064, 1, 0, 0, 0, 2062, 2060, 1, 0, 0, 0, 2062, 2063, 1, 0, 0, 0, 2063, 2065, 1, 0, 0, 0, 2064, 2062, 1, 0,
    0, 0, 2065, 2069, 5, 97, 0, 0, 2066, 2068, 5, 5, 0, 0, 2067, 2066, 1, 0, 0, 0, 2068, 2071, 1, 0, 0, 0, 2069, 2067,
    1, 0, 0, 0, 2069, 2070, 1, 0, 0, 0, 2070, 2072, 1, 0, 0, 0, 2071, 2069, 1, 0, 0, 0, 2072, 2073, 5, 9, 0, 0, 2073,
    2074, 3, 152, 76, 0, 2074, 2075, 5, 10, 0, 0, 2075, 145, 1, 0, 0, 0, 2076, 2077, 3, 188, 94, 0, 2077, 2078, 5, 28,
    0, 0, 2078, 2083, 1, 0, 0, 0, 2079, 2080, 3, 192, 96, 0, 2080, 2081, 3, 274, 137, 0, 2081, 2083, 1, 0, 0, 0, 2082,
    2076, 1, 0, 0, 0, 2082, 2079, 1, 0, 0, 0, 2083, 2087, 1, 0, 0, 0, 2084, 2086, 5, 5, 0, 0, 2085, 2084, 1, 0, 0, 0,
    2086, 2089, 1, 0, 0, 0, 2087, 2085, 1, 0, 0, 0, 2087, 2088, 1, 0, 0, 0, 2088, 2090, 1, 0, 0, 0, 2089, 2087, 1, 0, 0,
    0, 2090, 2091, 3, 152, 76, 0, 2091, 147, 1, 0, 0, 0, 2092, 2096, 7, 5, 0, 0, 2093, 2095, 5, 5, 0, 0, 2094, 2093, 1,
    0, 0, 0, 2095, 2098, 1, 0, 0, 0, 2096, 2094, 1, 0, 0, 0, 2096, 2097, 1, 0, 0, 0, 2097, 149, 1, 0, 0, 0, 2098, 2096,
    1, 0, 0, 0, 2099, 2101, 7, 5, 0, 0, 2100, 2099, 1, 0, 0, 0, 2101, 2102, 1, 0, 0, 0, 2102, 2100, 1, 0, 0, 0, 2102,
    2103, 1, 0, 0, 0, 2103, 151, 1, 0, 0, 0, 2104, 2105, 3, 154, 77, 0, 2105, 153, 1, 0, 0, 0, 2106, 2123, 3, 156, 78,
    0, 2107, 2109, 5, 5, 0, 0, 2108, 2107, 1, 0, 0, 0, 2109, 2112, 1, 0, 0, 0, 2110, 2108, 1, 0, 0, 0, 2110, 2111, 1, 0,
    0, 0, 2111, 2113, 1, 0, 0, 0, 2112, 2110, 1, 0, 0, 0, 2113, 2117, 5, 23, 0, 0, 2114, 2116, 5, 5, 0, 0, 2115, 2114,
    1, 0, 0, 0, 2116, 2119, 1, 0, 0, 0, 2117, 2115, 1, 0, 0, 0, 2117, 2118, 1, 0, 0, 0, 2118, 2120, 1, 0, 0, 0, 2119,
    2117, 1, 0, 0, 0, 2120, 2122, 3, 156, 78, 0, 2121, 2110, 1, 0, 0, 0, 2122, 2125, 1, 0, 0, 0, 2123, 2121, 1, 0, 0, 0,
    2123, 2124, 1, 0, 0, 0, 2124, 155, 1, 0, 0, 0, 2125, 2123, 1, 0, 0, 0, 2126, 2143, 3, 158, 79, 0, 2127, 2129, 5, 5,
    0, 0, 2128, 2127, 1, 0, 0, 0, 2129, 2132, 1, 0, 0, 0, 2130, 2128, 1, 0, 0, 0, 2130, 2131, 1, 0, 0, 0, 2131, 2133, 1,
    0, 0, 0, 2132, 2130, 1, 0, 0, 0, 2133, 2137, 5, 22, 0, 0, 2134, 2136, 5, 5, 0, 0, 2135, 2134, 1, 0, 0, 0, 2136,
    2139, 1, 0, 0, 0, 2137, 2135, 1, 0, 0, 0, 2137, 2138, 1, 0, 0, 0, 2138, 2140, 1, 0, 0, 0, 2139, 2137, 1, 0, 0, 0,
    2140, 2142, 3, 158, 79, 0, 2141, 2130, 1, 0, 0, 0, 2142, 2145, 1, 0, 0, 0, 2143, 2141, 1, 0, 0, 0, 2143, 2144, 1, 0,
    0, 0, 2144, 157, 1, 0, 0, 0, 2145, 2143, 1, 0, 0, 0, 2146, 2158, 3, 160, 80, 0, 2147, 2151, 3, 276, 138, 0, 2148,
    2150, 5, 5, 0, 0, 2149, 2148, 1, 0, 0, 0, 2150, 2153, 1, 0, 0, 0, 2151, 2149, 1, 0, 0, 0, 2151, 2152, 1, 0, 0, 0,
    2152, 2154, 1, 0, 0, 0, 2153, 2151, 1, 0, 0, 0, 2154, 2155, 3, 160, 80, 0, 2155, 2157, 1, 0, 0, 0, 2156, 2147, 1, 0,
    0, 0, 2157, 2160, 1, 0, 0, 0, 2158, 2156, 1, 0, 0, 0, 2158, 2159, 1, 0, 0, 0, 2159, 159, 1, 0, 0, 0, 2160, 2158, 1,
    0, 0, 0, 2161, 2173, 3, 162, 81, 0, 2162, 2166, 3, 278, 139, 0, 2163, 2165, 5, 5, 0, 0, 2164, 2163, 1, 0, 0, 0,
    2165, 2168, 1, 0, 0, 0, 2166, 2164, 1, 0, 0, 0, 2166, 2167, 1, 0, 0, 0, 2167, 2169, 1, 0, 0, 0, 2168, 2166, 1, 0, 0,
    0, 2169, 2170, 3, 162, 81, 0, 2170, 2172, 1, 0, 0, 0, 2171, 2162, 1, 0, 0, 0, 2172, 2175, 1, 0, 0, 0, 2173, 2171, 1,
    0, 0, 0, 2173, 2174, 1, 0, 0, 0, 2174, 161, 1, 0, 0, 0, 2175, 2173, 1, 0, 0, 0, 2176, 2180, 3, 164, 82, 0, 2177,
    2179, 3, 202, 101, 0, 2178, 2177, 1, 0, 0, 0, 2179, 2182, 1, 0, 0, 0, 2180, 2178, 1, 0, 0, 0, 2180, 2181, 1, 0, 0,
    0, 2181, 163, 1, 0, 0, 0, 2182, 2180, 1, 0, 0, 0, 2183, 2204, 3, 166, 83, 0, 2184, 2188, 3, 280, 140, 0, 2185, 2187,
    5, 5, 0, 0, 2186, 2185, 1, 0, 0, 0, 2187, 2190, 1, 0, 0, 0, 2188, 2186, 1, 0, 0, 0, 2188, 2189, 1, 0, 0, 0, 2189,
    2191, 1, 0, 0, 0, 2190, 2188, 1, 0, 0, 0, 2191, 2192, 3, 166, 83, 0, 2192, 2203, 1, 0, 0, 0, 2193, 2197, 3, 282,
    141, 0, 2194, 2196, 5, 5, 0, 0, 2195, 2194, 1, 0, 0, 0, 2196, 2199, 1, 0, 0, 0, 2197, 2195, 1, 0, 0, 0, 2197, 2198,
    1, 0, 0, 0, 2198, 2200, 1, 0, 0, 0, 2199, 2197, 1, 0, 0, 0, 2200, 2201, 3, 98, 49, 0, 2201, 2203, 1, 0, 0, 0, 2202,
    2184, 1, 0, 0, 0, 2202, 2193, 1, 0, 0, 0, 2203, 2206, 1, 0, 0, 0, 2204, 2202, 1, 0, 0, 0, 2204, 2205, 1, 0, 0, 0,
    2205, 165, 1, 0, 0, 0, 2206, 2204, 1, 0, 0, 0, 2207, 2225, 3, 170, 85, 0, 2208, 2210, 5, 5, 0, 0, 2209, 2208, 1, 0,
    0, 0, 2210, 2213, 1, 0, 0, 0, 2211, 2209, 1, 0, 0, 0, 2211, 2212, 1, 0, 0, 0, 2212, 2214, 1, 0, 0, 0, 2213, 2211, 1,
    0, 0, 0, 2214, 2218, 3, 168, 84, 0, 2215, 2217, 5, 5, 0, 0, 2216, 2215, 1, 0, 0, 0, 2217, 2220, 1, 0, 0, 0, 2218,
    2216, 1, 0, 0, 0, 2218, 2219, 1, 0, 0, 0, 2219, 2221, 1, 0, 0, 0, 2220, 2218, 1, 0, 0, 0, 2221, 2222, 3, 170, 85, 0,
    2222, 2224, 1, 0, 0, 0, 2223, 2211, 1, 0, 0, 0, 2224, 2227, 1, 0, 0, 0, 2225, 2223, 1, 0, 0, 0, 2225, 2226, 1, 0, 0,
    0, 2226, 167, 1, 0, 0, 0, 2227, 2225, 1, 0, 0, 0, 2228, 2229, 5, 46, 0, 0, 2229, 2230, 5, 26, 0, 0, 2230, 169, 1, 0,
    0, 0, 2231, 2243, 3, 172, 86, 0, 2232, 2236, 3, 344, 172, 0, 2233, 2235, 5, 5, 0, 0, 2234, 2233, 1, 0, 0, 0, 2235,
    2238, 1, 0, 0, 0, 2236, 2234, 1, 0, 0, 0, 2236, 2237, 1, 0, 0, 0, 2237, 2239, 1, 0, 0, 0, 2238, 2236, 1, 0, 0, 0,
    2239, 2240, 3, 172, 86, 0, 2240, 2242, 1, 0, 0, 0, 2241, 2232, 1, 0, 0, 0, 2242, 2245, 1, 0, 0, 0, 2243, 2241, 1, 0,
    0, 0, 2243, 2244, 1, 0, 0, 0, 2244, 171, 1, 0, 0, 0, 2245, 2243, 1, 0, 0, 0, 2246, 2257, 3, 174, 87, 0, 2247, 2251,
    7, 6, 0, 0, 2248, 2250, 5, 5, 0, 0, 2249, 2248, 1, 0, 0, 0, 2250, 2253, 1, 0, 0, 0, 2251, 2249, 1, 0, 0, 0, 2251,
    2252, 1, 0, 0, 0, 2252, 2254, 1, 0, 0, 0, 2253, 2251, 1, 0, 0, 0, 2254, 2256, 3, 174, 87, 0, 2255, 2247, 1, 0, 0, 0,
    2256, 2259, 1, 0, 0, 0, 2257, 2255, 1, 0, 0, 0, 2257, 2258, 1, 0, 0, 0, 2258, 173, 1, 0, 0, 0, 2259, 2257, 1, 0, 0,
    0, 2260, 2272, 3, 176, 88, 0, 2261, 2265, 3, 284, 142, 0, 2262, 2264, 5, 5, 0, 0, 2263, 2262, 1, 0, 0, 0, 2264,
    2267, 1, 0, 0, 0, 2265, 2263, 1, 0, 0, 0, 2265, 2266, 1, 0, 0, 0, 2266, 2268, 1, 0, 0, 0, 2267, 2265, 1, 0, 0, 0,
    2268, 2269, 3, 176, 88, 0, 2269, 2271, 1, 0, 0, 0, 2270, 2261, 1, 0, 0, 0, 2271, 2274, 1, 0, 0, 0, 2272, 2270, 1, 0,
    0, 0, 2272, 2273, 1, 0, 0, 0, 2273, 175, 1, 0, 0, 0, 2274, 2272, 1, 0, 0, 0, 2275, 2287, 3, 178, 89, 0, 2276, 2280,
    3, 286, 143, 0, 2277, 2279, 5, 5, 0, 0, 2278, 2277, 1, 0, 0, 0, 2279, 2282, 1, 0, 0, 0, 2280, 2278, 1, 0, 0, 0,
    2280, 2281, 1, 0, 0, 0, 2281, 2283, 1, 0, 0, 0, 2282, 2280, 1, 0, 0, 0, 2283, 2284, 3, 178, 89, 0, 2284, 2286, 1, 0,
    0, 0, 2285, 2276, 1, 0, 0, 0, 2286, 2289, 1, 0, 0, 0, 2287, 2285, 1, 0, 0, 0, 2287, 2288, 1, 0, 0, 0, 2288, 177, 1,
    0, 0, 0, 2289, 2287, 1, 0, 0, 0, 2290, 2308, 3, 180, 90, 0, 2291, 2293, 5, 5, 0, 0, 2292, 2291, 1, 0, 0, 0, 2293,
    2296, 1, 0, 0, 0, 2294, 2292, 1, 0, 0, 0, 2294, 2295, 1, 0, 0, 0, 2295, 2297, 1, 0, 0, 0, 2296, 2294, 1, 0, 0, 0,
    2297, 2301, 3, 288, 144, 0, 2298, 2300, 5, 5, 0, 0, 2299, 2298, 1, 0, 0, 0, 2300, 2303, 1, 0, 0, 0, 2301, 2299, 1,
    0, 0, 0, 2301, 2302, 1, 0, 0, 0, 2302, 2304, 1, 0, 0, 0, 2303, 2301, 1, 0, 0, 0, 2304, 2305, 3, 98, 49, 0, 2305,
    2307, 1, 0, 0, 0, 2306, 2294, 1, 0, 0, 0, 2307, 2310, 1, 0, 0, 0, 2308, 2306, 1, 0, 0, 0, 2308, 2309, 1, 0, 0, 0,
    2309, 179, 1, 0, 0, 0, 2310, 2308, 1, 0, 0, 0, 2311, 2313, 3, 182, 91, 0, 2312, 2311, 1, 0, 0, 0, 2313, 2316, 1, 0,
    0, 0, 2314, 2312, 1, 0, 0, 0, 2314, 2315, 1, 0, 0, 0, 2315, 2317, 1, 0, 0, 0, 2316, 2314, 1, 0, 0, 0, 2317, 2318, 3,
    184, 92, 0, 2318, 181, 1, 0, 0, 0, 2319, 2329, 3, 334, 167, 0, 2320, 2329, 3, 132, 66, 0, 2321, 2325, 3, 290, 145,
    0, 2322, 2324, 5, 5, 0, 0, 2323, 2322, 1, 0, 0, 0, 2324, 2327, 1, 0, 0, 0, 2325, 2323, 1, 0, 0, 0, 2325, 2326, 1, 0,
    0, 0, 2326, 2329, 1, 0, 0, 0, 2327, 2325, 1, 0, 0, 0, 2328, 2319, 1, 0, 0, 0, 2328, 2320, 1, 0, 0, 0, 2328, 2321, 1,
    0, 0, 0, 2329, 183, 1, 0, 0, 0, 2330, 2334, 3, 212, 106, 0, 2331, 2333, 3, 186, 93, 0, 2332, 2331, 1, 0, 0, 0, 2333,
    2336, 1, 0, 0, 0, 2334, 2332, 1, 0, 0, 0, 2334, 2335, 1, 0, 0, 0, 2335, 185, 1, 0, 0, 0, 2336, 2334, 1, 0, 0, 0,
    2337, 2343, 3, 292, 146, 0, 2338, 2343, 3, 206, 103, 0, 2339, 2343, 3, 202, 101, 0, 2340, 2343, 3, 198, 99, 0, 2341,
    2343, 3, 200, 100, 0, 2342, 2337, 1, 0, 0, 0, 2342, 2338, 1, 0, 0, 0, 2342, 2339, 1, 0, 0, 0, 2342, 2340, 1, 0, 0,
    0, 2342, 2341, 1, 0, 0, 0, 2343, 187, 1, 0, 0, 0, 2344, 2345, 3, 184, 92, 0, 2345, 2346, 3, 196, 98, 0, 2346, 2350,
    1, 0, 0, 0, 2347, 2350, 3, 344, 172, 0, 2348, 2350, 3, 190, 95, 0, 2349, 2344, 1, 0, 0, 0, 2349, 2347, 1, 0, 0, 0,
    2349, 2348, 1, 0, 0, 0, 2350, 189, 1, 0, 0, 0, 2351, 2355, 5, 9, 0, 0, 2352, 2354, 5, 5, 0, 0, 2353, 2352, 1, 0, 0,
    0, 2354, 2357, 1, 0, 0, 0, 2355, 2353, 1, 0, 0, 0, 2355, 2356, 1, 0, 0, 0, 2356, 2358, 1, 0, 0, 0, 2357, 2355, 1, 0,
    0, 0, 2358, 2362, 3, 188, 94, 0, 2359, 2361, 5, 5, 0, 0, 2360, 2359, 1, 0, 0, 0, 2361, 2364, 1, 0, 0, 0, 2362, 2360,
    1, 0, 0, 0, 2362, 2363, 1, 0, 0, 0, 2363, 2365, 1, 0, 0, 0, 2364, 2362, 1, 0, 0, 0, 2365, 2366, 5, 10, 0, 0, 2366,
    191, 1, 0, 0, 0, 2367, 2370, 3, 180, 90, 0, 2368, 2370, 3, 194, 97, 0, 2369, 2367, 1, 0, 0, 0, 2369, 2368, 1, 0, 0,
    0, 2370, 193, 1, 0, 0, 0, 2371, 2375, 5, 9, 0, 0, 2372, 2374, 5, 5, 0, 0, 2373, 2372, 1, 0, 0, 0, 2374, 2377, 1, 0,
    0, 0, 2375, 2373, 1, 0, 0, 0, 2375, 2376, 1, 0, 0, 0, 2376, 2378, 1, 0, 0, 0, 2377, 2375, 1, 0, 0, 0, 2378, 2382, 3,
    192, 96, 0, 2379, 2381, 5, 5, 0, 0, 2380, 2379, 1, 0, 0, 0, 2381, 2384, 1, 0, 0, 0, 2382, 2380, 1, 0, 0, 0, 2382,
    2383, 1, 0, 0, 0, 2383, 2385, 1, 0, 0, 0, 2384, 2382, 1, 0, 0, 0, 2385, 2386, 5, 10, 0, 0, 2386, 195, 1, 0, 0, 0,
    2387, 2391, 3, 206, 103, 0, 2388, 2391, 3, 198, 99, 0, 2389, 2391, 3, 200, 100, 0, 2390, 2387, 1, 0, 0, 0, 2390,
    2388, 1, 0, 0, 0, 2390, 2389, 1, 0, 0, 0, 2391, 197, 1, 0, 0, 0, 2392, 2396, 5, 11, 0, 0, 2393, 2395, 5, 5, 0, 0,
    2394, 2393, 1, 0, 0, 0, 2395, 2398, 1, 0, 0, 0, 2396, 2394, 1, 0, 0, 0, 2396, 2397, 1, 0, 0, 0, 2397, 2399, 1, 0, 0,
    0, 2398, 2396, 1, 0, 0, 0, 2399, 2416, 3, 152, 76, 0, 2400, 2402, 5, 5, 0, 0, 2401, 2400, 1, 0, 0, 0, 2402, 2405, 1,
    0, 0, 0, 2403, 2401, 1, 0, 0, 0, 2403, 2404, 1, 0, 0, 0, 2404, 2406, 1, 0, 0, 0, 2405, 2403, 1, 0, 0, 0, 2406, 2410,
    5, 8, 0, 0, 2407, 2409, 5, 5, 0, 0, 2408, 2407, 1, 0, 0, 0, 2409, 2412, 1, 0, 0, 0, 2410, 2408, 1, 0, 0, 0, 2410,
    2411, 1, 0, 0, 0, 2411, 2413, 1, 0, 0, 0, 2412, 2410, 1, 0, 0, 0, 2413, 2415, 3, 152, 76, 0, 2414, 2403, 1, 0, 0, 0,
    2415, 2418, 1, 0, 0, 0, 2416, 2414, 1, 0, 0, 0, 2416, 2417, 1, 0, 0, 0, 2417, 2426, 1, 0, 0, 0, 2418, 2416, 1, 0, 0,
    0, 2419, 2421, 5, 5, 0, 0, 2420, 2419, 1, 0, 0, 0, 2421, 2424, 1, 0, 0, 0, 2422, 2420, 1, 0, 0, 0, 2422, 2423, 1, 0,
    0, 0, 2423, 2425, 1, 0, 0, 0, 2424, 2422, 1, 0, 0, 0, 2425, 2427, 5, 8, 0, 0, 2426, 2422, 1, 0, 0, 0, 2426, 2427, 1,
    0, 0, 0, 2427, 2431, 1, 0, 0, 0, 2428, 2430, 5, 5, 0, 0, 2429, 2428, 1, 0, 0, 0, 2430, 2433, 1, 0, 0, 0, 2431, 2429,
    1, 0, 0, 0, 2431, 2432, 1, 0, 0, 0, 2432, 2434, 1, 0, 0, 0, 2433, 2431, 1, 0, 0, 0, 2434, 2435, 5, 12, 0, 0, 2435,
    199, 1, 0, 0, 0, 2436, 2440, 3, 296, 148, 0, 2437, 2439, 5, 5, 0, 0, 2438, 2437, 1, 0, 0, 0, 2439, 2442, 1, 0, 0, 0,
    2440, 2438, 1, 0, 0, 0, 2440, 2441, 1, 0, 0, 0, 2441, 2446, 1, 0, 0, 0, 2442, 2440, 1, 0, 0, 0, 2443, 2447, 3, 344,
    172, 0, 2444, 2447, 3, 214, 107, 0, 2445, 2447, 5, 74, 0, 0, 2446, 2443, 1, 0, 0, 0, 2446, 2444, 1, 0, 0, 0, 2446,
    2445, 1, 0, 0, 0, 2447, 201, 1, 0, 0, 0, 2448, 2450, 3, 206, 103, 0, 2449, 2448, 1, 0, 0, 0, 2449, 2450, 1, 0, 0, 0,
    2450, 2456, 1, 0, 0, 0, 2451, 2453, 3, 208, 104, 0, 2452, 2451, 1, 0, 0, 0, 2452, 2453, 1, 0, 0, 0, 2453, 2454, 1,
    0, 0, 0, 2454, 2457, 3, 204, 102, 0, 2455, 2457, 3, 208, 104, 0, 2456, 2452, 1, 0, 0, 0, 2456, 2455, 1, 0, 0, 0,
    2457, 203, 1, 0, 0, 0, 2458, 2460, 3, 334, 167, 0, 2459, 2458, 1, 0, 0, 0, 2460, 2463, 1, 0, 0, 0, 2461, 2459, 1, 0,
    0, 0, 2461, 2462, 1, 0, 0, 0, 2462, 2465, 1, 0, 0, 0, 2463, 2461, 1, 0, 0, 0, 2464, 2466, 3, 132, 66, 0, 2465, 2464,
    1, 0, 0, 0, 2465, 2466, 1, 0, 0, 0, 2466, 2470, 1, 0, 0, 0, 2467, 2469, 5, 5, 0, 0, 2468, 2467, 1, 0, 0, 0, 2469,
    2472, 1, 0, 0, 0, 2470, 2468, 1, 0, 0, 0, 2470, 2471, 1, 0, 0, 0, 2471, 2473, 1, 0, 0, 0, 2472, 2470, 1, 0, 0, 0,
    2473, 2474, 3, 234, 117, 0, 2474, 205, 1, 0, 0, 0, 2475, 2479, 5, 47, 0, 0, 2476, 2478, 5, 5, 0, 0, 2477, 2476, 1,
    0, 0, 0, 2478, 2481, 1, 0, 0, 0, 2479, 2477, 1, 0, 0, 0, 2479, 2480, 1, 0, 0, 0, 2480, 2482, 1, 0, 0, 0, 2481, 2479,
    1, 0, 0, 0, 2482, 2499, 3, 110, 55, 0, 2483, 2485, 5, 5, 0, 0, 2484, 2483, 1, 0, 0, 0, 2485, 2488, 1, 0, 0, 0, 2486,
    2484, 1, 0, 0, 0, 2486, 2487, 1, 0, 0, 0, 2487, 2489, 1, 0, 0, 0, 2488, 2486, 1, 0, 0, 0, 2489, 2493, 5, 8, 0, 0,
    2490, 2492, 5, 5, 0, 0, 2491, 2490, 1, 0, 0, 0, 2492, 2495, 1, 0, 0, 0, 2493, 2491, 1, 0, 0, 0, 2493, 2494, 1, 0, 0,
    0, 2494, 2496, 1, 0, 0, 0, 2495, 2493, 1, 0, 0, 0, 2496, 2498, 3, 110, 55, 0, 2497, 2486, 1, 0, 0, 0, 2498, 2501, 1,
    0, 0, 0, 2499, 2497, 1, 0, 0, 0, 2499, 2500, 1, 0, 0, 0, 2500, 2509, 1, 0, 0, 0, 2501, 2499, 1, 0, 0, 0, 2502, 2504,
    5, 5, 0, 0, 2503, 2502, 1, 0, 0, 0, 2504, 2507, 1, 0, 0, 0, 2505, 2503, 1, 0, 0, 0, 2505, 2506, 1, 0, 0, 0, 2506,
    2508, 1, 0, 0, 0, 2507, 2505, 1, 0, 0, 0, 2508, 2510, 5, 8, 0, 0, 2509, 2505, 1, 0, 0, 0, 2509, 2510, 1, 0, 0, 0,
    2510, 2514, 1, 0, 0, 0, 2511, 2513, 5, 5, 0, 0, 2512, 2511, 1, 0, 0, 0, 2513, 2516, 1, 0, 0, 0, 2514, 2512, 1, 0, 0,
    0, 2514, 2515, 1, 0, 0, 0, 2515, 2517, 1, 0, 0, 0, 2516, 2514, 1, 0, 0, 0, 2517, 2518, 5, 48, 0, 0, 2518, 207, 1, 0,
    0, 0, 2519, 2523, 5, 9, 0, 0, 2520, 2522, 5, 5, 0, 0, 2521, 2520, 1, 0, 0, 0, 2522, 2525, 1, 0, 0, 0, 2523, 2521, 1,
    0, 0, 0, 2523, 2524, 1, 0, 0, 0, 2524, 2561, 1, 0, 0, 0, 2525, 2523, 1, 0, 0, 0, 2526, 2543, 3, 210, 105, 0, 2527,
    2529, 5, 5, 0, 0, 2528, 2527, 1, 0, 0, 0, 2529, 2532, 1, 0, 0, 0, 2530, 2528, 1, 0, 0, 0, 2530, 2531, 1, 0, 0, 0,
    2531, 2533, 1, 0, 0, 0, 2532, 2530, 1, 0, 0, 0, 2533, 2537, 5, 8, 0, 0, 2534, 2536, 5, 5, 0, 0, 2535, 2534, 1, 0, 0,
    0, 2536, 2539, 1, 0, 0, 0, 2537, 2535, 1, 0, 0, 0, 2537, 2538, 1, 0, 0, 0, 2538, 2540, 1, 0, 0, 0, 2539, 2537, 1, 0,
    0, 0, 2540, 2542, 3, 210, 105, 0, 2541, 2530, 1, 0, 0, 0, 2542, 2545, 1, 0, 0, 0, 2543, 2541, 1, 0, 0, 0, 2543,
    2544, 1, 0, 0, 0, 2544, 2553, 1, 0, 0, 0, 2545, 2543, 1, 0, 0, 0, 2546, 2548, 5, 5, 0, 0, 2547, 2546, 1, 0, 0, 0,
    2548, 2551, 1, 0, 0, 0, 2549, 2547, 1, 0, 0, 0, 2549, 2550, 1, 0, 0, 0, 2550, 2552, 1, 0, 0, 0, 2551, 2549, 1, 0, 0,
    0, 2552, 2554, 5, 8, 0, 0, 2553, 2549, 1, 0, 0, 0, 2553, 2554, 1, 0, 0, 0, 2554, 2558, 1, 0, 0, 0, 2555, 2557, 5, 5,
    0, 0, 2556, 2555, 1, 0, 0, 0, 2557, 2560, 1, 0, 0, 0, 2558, 2556, 1, 0, 0, 0, 2558, 2559, 1, 0, 0, 0, 2559, 2562, 1,
    0, 0, 0, 2560, 2558, 1, 0, 0, 0, 2561, 2526, 1, 0, 0, 0, 2561, 2562, 1, 0, 0, 0, 2562, 2563, 1, 0, 0, 0, 2563, 2564,
    5, 10, 0, 0, 2564, 209, 1, 0, 0, 0, 2565, 2567, 3, 334, 167, 0, 2566, 2565, 1, 0, 0, 0, 2566, 2567, 1, 0, 0, 0,
    2567, 2571, 1, 0, 0, 0, 2568, 2570, 5, 5, 0, 0, 2569, 2568, 1, 0, 0, 0, 2570, 2573, 1, 0, 0, 0, 2571, 2569, 1, 0, 0,
    0, 2571, 2572, 1, 0, 0, 0, 2572, 2588, 1, 0, 0, 0, 2573, 2571, 1, 0, 0, 0, 2574, 2578, 3, 344, 172, 0, 2575, 2577,
    5, 5, 0, 0, 2576, 2575, 1, 0, 0, 0, 2577, 2580, 1, 0, 0, 0, 2578, 2576, 1, 0, 0, 0, 2578, 2579, 1, 0, 0, 0, 2579,
    2581, 1, 0, 0, 0, 2580, 2578, 1, 0, 0, 0, 2581, 2585, 5, 28, 0, 0, 2582, 2584, 5, 5, 0, 0, 2583, 2582, 1, 0, 0, 0,
    2584, 2587, 1, 0, 0, 0, 2585, 2583, 1, 0, 0, 0, 2585, 2586, 1, 0, 0, 0, 2586, 2589, 1, 0, 0, 0, 2587, 2585, 1, 0, 0,
    0, 2588, 2574, 1, 0, 0, 0, 2588, 2589, 1, 0, 0, 0, 2589, 2591, 1, 0, 0, 0, 2590, 2592, 5, 15, 0, 0, 2591, 2590, 1,
    0, 0, 0, 2591, 2592, 1, 0, 0, 0, 2592, 2596, 1, 0, 0, 0, 2593, 2595, 5, 5, 0, 0, 2594, 2593, 1, 0, 0, 0, 2595, 2598,
    1, 0, 0, 0, 2596, 2594, 1, 0, 0, 0, 2596, 2597, 1, 0, 0, 0, 2597, 2599, 1, 0, 0, 0, 2598, 2596, 1, 0, 0, 0, 2599,
    2600, 3, 152, 76, 0, 2600, 211, 1, 0, 0, 0, 2601, 2616, 3, 214, 107, 0, 2602, 2616, 3, 344, 172, 0, 2603, 2616, 3,
    218, 109, 0, 2604, 2616, 3, 220, 110, 0, 2605, 2616, 3, 272, 136, 0, 2606, 2616, 3, 242, 121, 0, 2607, 2616, 3, 244,
    122, 0, 2608, 2616, 3, 216, 108, 0, 2609, 2616, 3, 246, 123, 0, 2610, 2616, 3, 248, 124, 0, 2611, 2616, 3, 250, 125,
    0, 2612, 2616, 3, 254, 127, 0, 2613, 2616, 3, 264, 132, 0, 2614, 2616, 3, 270, 135, 0, 2615, 2601, 1, 0, 0, 0, 2615,
    2602, 1, 0, 0, 0, 2615, 2603, 1, 0, 0, 0, 2615, 2604, 1, 0, 0, 0, 2615, 2605, 1, 0, 0, 0, 2615, 2606, 1, 0, 0, 0,
    2615, 2607, 1, 0, 0, 0, 2615, 2608, 1, 0, 0, 0, 2615, 2609, 1, 0, 0, 0, 2615, 2610, 1, 0, 0, 0, 2615, 2611, 1, 0, 0,
    0, 2615, 2612, 1, 0, 0, 0, 2615, 2613, 1, 0, 0, 0, 2615, 2614, 1, 0, 0, 0, 2616, 213, 1, 0, 0, 0, 2617, 2621, 5, 9,
    0, 0, 2618, 2620, 5, 5, 0, 0, 2619, 2618, 1, 0, 0, 0, 2620, 2623, 1, 0, 0, 0, 2621, 2619, 1, 0, 0, 0, 2621, 2622, 1,
    0, 0, 0, 2622, 2624, 1, 0, 0, 0, 2623, 2621, 1, 0, 0, 0, 2624, 2628, 3, 152, 76, 0, 2625, 2627, 5, 5, 0, 0, 2626,
    2625, 1, 0, 0, 0, 2627, 2630, 1, 0, 0, 0, 2628, 2626, 1, 0, 0, 0, 2628, 2629, 1, 0, 0, 0, 2629, 2631, 1, 0, 0, 0,
    2630, 2628, 1, 0, 0, 0, 2631, 2632, 5, 10, 0, 0, 2632, 215, 1, 0, 0, 0, 2633, 2637, 5, 11, 0, 0, 2634, 2636, 5, 5,
    0, 0, 2635, 2634, 1, 0, 0, 0, 2636, 2639, 1, 0, 0, 0, 2637, 2635, 1, 0, 0, 0, 2637, 2638, 1, 0, 0, 0, 2638, 2675, 1,
    0, 0, 0, 2639, 2637, 1, 0, 0, 0, 2640, 2657, 3, 152, 76, 0, 2641, 2643, 5, 5, 0, 0, 2642, 2641, 1, 0, 0, 0, 2643,
    2646, 1, 0, 0, 0, 2644, 2642, 1, 0, 0, 0, 2644, 2645, 1, 0, 0, 0, 2645, 2647, 1, 0, 0, 0, 2646, 2644, 1, 0, 0, 0,
    2647, 2651, 5, 8, 0, 0, 2648, 2650, 5, 5, 0, 0, 2649, 2648, 1, 0, 0, 0, 2650, 2653, 1, 0, 0, 0, 2651, 2649, 1, 0, 0,
    0, 2651, 2652, 1, 0, 0, 0, 2652, 2654, 1, 0, 0, 0, 2653, 2651, 1, 0, 0, 0, 2654, 2656, 3, 152, 76, 0, 2655, 2644, 1,
    0, 0, 0, 2656, 2659, 1, 0, 0, 0, 2657, 2655, 1, 0, 0, 0, 2657, 2658, 1, 0, 0, 0, 2658, 2667, 1, 0, 0, 0, 2659, 2657,
    1, 0, 0, 0, 2660, 2662, 5, 5, 0, 0, 2661, 2660, 1, 0, 0, 0, 2662, 2665, 1, 0, 0, 0, 2663, 2661, 1, 0, 0, 0, 2663,
    2664, 1, 0, 0, 0, 2664, 2666, 1, 0, 0, 0, 2665, 2663, 1, 0, 0, 0, 2666, 2668, 5, 8, 0, 0, 2667, 2663, 1, 0, 0, 0,
    2667, 2668, 1, 0, 0, 0, 2668, 2672, 1, 0, 0, 0, 2669, 2671, 5, 5, 0, 0, 2670, 2669, 1, 0, 0, 0, 2671, 2674, 1, 0, 0,
    0, 2672, 2670, 1, 0, 0, 0, 2672, 2673, 1, 0, 0, 0, 2673, 2676, 1, 0, 0, 0, 2674, 2672, 1, 0, 0, 0, 2675, 2640, 1, 0,
    0, 0, 2675, 2676, 1, 0, 0, 0, 2676, 2677, 1, 0, 0, 0, 2677, 2678, 5, 12, 0, 0, 2678, 217, 1, 0, 0, 0, 2679, 2680, 7,
    7, 0, 0, 2680, 219, 1, 0, 0, 0, 2681, 2684, 3, 222, 111, 0, 2682, 2684, 3, 224, 112, 0, 2683, 2681, 1, 0, 0, 0,
    2683, 2682, 1, 0, 0, 0, 2684, 221, 1, 0, 0, 0, 2685, 2690, 5, 151, 0, 0, 2686, 2689, 3, 226, 113, 0, 2687, 2689, 3,
    228, 114, 0, 2688, 2686, 1, 0, 0, 0, 2688, 2687, 1, 0, 0, 0, 2689, 2692, 1, 0, 0, 0, 2690, 2688, 1, 0, 0, 0, 2690,
    2691, 1, 0, 0, 0, 2691, 2693, 1, 0, 0, 0, 2692, 2690, 1, 0, 0, 0, 2693, 2694, 5, 160, 0, 0, 2694, 223, 1, 0, 0, 0,
    2695, 2701, 5, 152, 0, 0, 2696, 2700, 3, 230, 115, 0, 2697, 2700, 3, 232, 116, 0, 2698, 2700, 5, 166, 0, 0, 2699,
    2696, 1, 0, 0, 0, 2699, 2697, 1, 0, 0, 0, 2699, 2698, 1, 0, 0, 0, 2700, 2703, 1, 0, 0, 0, 2701, 2699, 1, 0, 0, 0,
    2701, 2702, 1, 0, 0, 0, 2702, 2704, 1, 0, 0, 0, 2703, 2701, 1, 0, 0, 0, 2704, 2705, 5, 165, 0, 0, 2705, 225, 1, 0,
    0, 0, 2706, 2707, 7, 8, 0, 0, 2707, 227, 1, 0, 0, 0, 2708, 2712, 5, 164, 0, 0, 2709, 2711, 5, 5, 0, 0, 2710, 2709,
    1, 0, 0, 0, 2711, 2714, 1, 0, 0, 0, 2712, 2710, 1, 0, 0, 0, 2712, 2713, 1, 0, 0, 0, 2713, 2715, 1, 0, 0, 0, 2714,
    2712, 1, 0, 0, 0, 2715, 2719, 3, 152, 76, 0, 2716, 2718, 5, 5, 0, 0, 2717, 2716, 1, 0, 0, 0, 2718, 2721, 1, 0, 0, 0,
    2719, 2717, 1, 0, 0, 0, 2719, 2720, 1, 0, 0, 0, 2720, 2722, 1, 0, 0, 0, 2721, 2719, 1, 0, 0, 0, 2722, 2723, 5, 14,
    0, 0, 2723, 229, 1, 0, 0, 0, 2724, 2725, 7, 9, 0, 0, 2725, 231, 1, 0, 0, 0, 2726, 2730, 5, 169, 0, 0, 2727, 2729, 5,
    5, 0, 0, 2728, 2727, 1, 0, 0, 0, 2729, 2732, 1, 0, 0, 0, 2730, 2728, 1, 0, 0, 0, 2730, 2731, 1, 0, 0, 0, 2731, 2733,
    1, 0, 0, 0, 2732, 2730, 1, 0, 0, 0, 2733, 2737, 3, 152, 76, 0, 2734, 2736, 5, 5, 0, 0, 2735, 2734, 1, 0, 0, 0, 2736,
    2739, 1, 0, 0, 0, 2737, 2735, 1, 0, 0, 0, 2737, 2738, 1, 0, 0, 0, 2738, 2740, 1, 0, 0, 0, 2739, 2737, 1, 0, 0, 0,
    2740, 2741, 5, 14, 0, 0, 2741, 233, 1, 0, 0, 0, 2742, 2746, 5, 13, 0, 0, 2743, 2745, 5, 5, 0, 0, 2744, 2743, 1, 0,
    0, 0, 2745, 2748, 1, 0, 0, 0, 2746, 2744, 1, 0, 0, 0, 2746, 2747, 1, 0, 0, 0, 2747, 2765, 1, 0, 0, 0, 2748, 2746, 1,
    0, 0, 0, 2749, 2751, 3, 236, 118, 0, 2750, 2749, 1, 0, 0, 0, 2750, 2751, 1, 0, 0, 0, 2751, 2755, 1, 0, 0, 0, 2752,
    2754, 5, 5, 0, 0, 2753, 2752, 1, 0, 0, 0, 2754, 2757, 1, 0, 0, 0, 2755, 2753, 1, 0, 0, 0, 2755, 2756, 1, 0, 0, 0,
    2756, 2758, 1, 0, 0, 0, 2757, 2755, 1, 0, 0, 0, 2758, 2762, 5, 34, 0, 0, 2759, 2761, 5, 5, 0, 0, 2760, 2759, 1, 0,
    0, 0, 2761, 2764, 1, 0, 0, 0, 2762, 2760, 1, 0, 0, 0, 2762, 2763, 1, 0, 0, 0, 2763, 2766, 1, 0, 0, 0, 2764, 2762, 1,
    0, 0, 0, 2765, 2750, 1, 0, 0, 0, 2765, 2766, 1, 0, 0, 0, 2766, 2767, 1, 0, 0, 0, 2767, 2771, 3, 128, 64, 0, 2768,
    2770, 5, 5, 0, 0, 2769, 2768, 1, 0, 0, 0, 2770, 2773, 1, 0, 0, 0, 2771, 2769, 1, 0, 0, 0, 2771, 2772, 1, 0, 0, 0,
    2772, 2774, 1, 0, 0, 0, 2773, 2771, 1, 0, 0, 0, 2774, 2775, 5, 14, 0, 0, 2775, 235, 1, 0, 0, 0, 2776, 2793, 3, 238,
    119, 0, 2777, 2779, 5, 5, 0, 0, 2778, 2777, 1, 0, 0, 0, 2779, 2782, 1, 0, 0, 0, 2780, 2778, 1, 0, 0, 0, 2780, 2781,
    1, 0, 0, 0, 2781, 2783, 1, 0, 0, 0, 2782, 2780, 1, 0, 0, 0, 2783, 2787, 5, 8, 0, 0, 2784, 2786, 5, 5, 0, 0, 2785,
    2784, 1, 0, 0, 0, 2786, 2789, 1, 0, 0, 0, 2787, 2785, 1, 0, 0, 0, 2787, 2788, 1, 0, 0, 0, 2788, 2790, 1, 0, 0, 0,
    2789, 2787, 1, 0, 0, 0, 2790, 2792, 3, 238, 119, 0, 2791, 2780, 1, 0, 0, 0, 2792, 2795, 1, 0, 0, 0, 2793, 2791, 1,
    0, 0, 0, 2793, 2794, 1, 0, 0, 0, 2794, 2803, 1, 0, 0, 0, 2795, 2793, 1, 0, 0, 0, 2796, 2798, 5, 5, 0, 0, 2797, 2796,
    1, 0, 0, 0, 2798, 2801, 1, 0, 0, 0, 2799, 2797, 1, 0, 0, 0, 2799, 2800, 1, 0, 0, 0, 2800, 2802, 1, 0, 0, 0, 2801,
    2799, 1, 0, 0, 0, 2802, 2804, 5, 8, 0, 0, 2803, 2799, 1, 0, 0, 0, 2803, 2804, 1, 0, 0, 0, 2804, 237, 1, 0, 0, 0,
    2805, 2824, 3, 66, 33, 0, 2806, 2821, 3, 68, 34, 0, 2807, 2809, 5, 5, 0, 0, 2808, 2807, 1, 0, 0, 0, 2809, 2812, 1,
    0, 0, 0, 2810, 2808, 1, 0, 0, 0, 2810, 2811, 1, 0, 0, 0, 2811, 2813, 1, 0, 0, 0, 2812, 2810, 1, 0, 0, 0, 2813, 2817,
    5, 26, 0, 0, 2814, 2816, 5, 5, 0, 0, 2815, 2814, 1, 0, 0, 0, 2816, 2819, 1, 0, 0, 0, 2817, 2815, 1, 0, 0, 0, 2817,
    2818, 1, 0, 0, 0, 2818, 2820, 1, 0, 0, 0, 2819, 2817, 1, 0, 0, 0, 2820, 2822, 3, 98, 49, 0, 2821, 2810, 1, 0, 0, 0,
    2821, 2822, 1, 0, 0, 0, 2822, 2824, 1, 0, 0, 0, 2823, 2805, 1, 0, 0, 0, 2823, 2806, 1, 0, 0, 0, 2824, 239, 1, 0, 0,
    0, 2825, 2827, 5, 124, 0, 0, 2826, 2825, 1, 0, 0, 0, 2826, 2827, 1, 0, 0, 0, 2827, 2831, 1, 0, 0, 0, 2828, 2830, 5,
    5, 0, 0, 2829, 2828, 1, 0, 0, 0, 2830, 2833, 1, 0, 0, 0, 2831, 2829, 1, 0, 0, 0, 2831, 2832, 1, 0, 0, 0, 2832, 2834,
    1, 0, 0, 0, 2833, 2831, 1, 0, 0, 0, 2834, 2850, 5, 76, 0, 0, 2835, 2837, 5, 5, 0, 0, 2836, 2835, 1, 0, 0, 0, 2837,
    2840, 1, 0, 0, 0, 2838, 2836, 1, 0, 0, 0, 2838, 2839, 1, 0, 0, 0, 2839, 2841, 1, 0, 0, 0, 2840, 2838, 1, 0, 0, 0,
    2841, 2845, 3, 98, 49, 0, 2842, 2844, 5, 5, 0, 0, 2843, 2842, 1, 0, 0, 0, 2844, 2847, 1, 0, 0, 0, 2845, 2843, 1, 0,
    0, 0, 2845, 2846, 1, 0, 0, 0, 2846, 2848, 1, 0, 0, 0, 2847, 2845, 1, 0, 0, 0, 2848, 2849, 5, 7, 0, 0, 2849, 2851, 1,
    0, 0, 0, 2850, 2838, 1, 0, 0, 0, 2850, 2851, 1, 0, 0, 0, 2851, 2855, 1, 0, 0, 0, 2852, 2854, 5, 5, 0, 0, 2853, 2852,
    1, 0, 0, 0, 2854, 2857, 1, 0, 0, 0, 2855, 2853, 1, 0, 0, 0, 2855, 2856, 1, 0, 0, 0, 2856, 2858, 1, 0, 0, 0, 2857,
    2855, 1, 0, 0, 0, 2858, 2873, 3, 78, 39, 0, 2859, 2861, 5, 5, 0, 0, 2860, 2859, 1, 0, 0, 0, 2861, 2864, 1, 0, 0, 0,
    2862, 2860, 1, 0, 0, 0, 2862, 2863, 1, 0, 0, 0, 2863, 2865, 1, 0, 0, 0, 2864, 2862, 1, 0, 0, 0, 2865, 2869, 5, 26,
    0, 0, 2866, 2868, 5, 5, 0, 0, 2867, 2866, 1, 0, 0, 0, 2868, 2871, 1, 0, 0, 0, 2869, 2867, 1, 0, 0, 0, 2869, 2870, 1,
    0, 0, 0, 2870, 2872, 1, 0, 0, 0, 2871, 2869, 1, 0, 0, 0, 2872, 2874, 3, 98, 49, 0, 2873, 2862, 1, 0, 0, 0, 2873,
    2874, 1, 0, 0, 0, 2874, 2882, 1, 0, 0, 0, 2875, 2877, 5, 5, 0, 0, 2876, 2875, 1, 0, 0, 0, 2877, 2880, 1, 0, 0, 0,
    2878, 2876, 1, 0, 0, 0, 2878, 2879, 1, 0, 0, 0, 2879, 2881, 1, 0, 0, 0, 2880, 2878, 1, 0, 0, 0, 2881, 2883, 3, 46,
    23, 0, 2882, 2878, 1, 0, 0, 0, 2882, 2883, 1, 0, 0, 0, 2883, 2891, 1, 0, 0, 0, 2884, 2886, 5, 5, 0, 0, 2885, 2884,
    1, 0, 0, 0, 2886, 2889, 1, 0, 0, 0, 2887, 2885, 1, 0, 0, 0, 2887, 2888, 1, 0, 0, 0, 2888, 2890, 1, 0, 0, 0, 2889,
    2887, 1, 0, 0, 0, 2890, 2892, 3, 64, 32, 0, 2891, 2887, 1, 0, 0, 0, 2891, 2892, 1, 0, 0, 0, 2892, 241, 1, 0, 0, 0,
    2893, 2896, 3, 234, 117, 0, 2894, 2896, 3, 240, 120, 0, 2895, 2893, 1, 0, 0, 0, 2895, 2894, 1, 0, 0, 0, 2896, 243,
    1, 0, 0, 0, 2897, 2899, 5, 116, 0, 0, 2898, 2897, 1, 0, 0, 0, 2898, 2899, 1, 0, 0, 0, 2899, 2903, 1, 0, 0, 0, 2900,
    2902, 5, 5, 0, 0, 2901, 2900, 1, 0, 0, 0, 2902, 2905, 1, 0, 0, 0, 2903, 2901, 1, 0, 0, 0, 2903, 2904, 1, 0, 0, 0,
    2904, 2906, 1, 0, 0, 0, 2905, 2903, 1, 0, 0, 0, 2906, 2927, 5, 77, 0, 0, 2907, 2909, 5, 5, 0, 0, 2908, 2907, 1, 0,
    0, 0, 2909, 2912, 1, 0, 0, 0, 2910, 2908, 1, 0, 0, 0, 2910, 2911, 1, 0, 0, 0, 2911, 2913, 1, 0, 0, 0, 2912, 2910, 1,
    0, 0, 0, 2913, 2917, 5, 26, 0, 0, 2914, 2916, 5, 5, 0, 0, 2915, 2914, 1, 0, 0, 0, 2916, 2919, 1, 0, 0, 0, 2917,
    2915, 1, 0, 0, 0, 2917, 2918, 1, 0, 0, 0, 2918, 2920, 1, 0, 0, 0, 2919, 2917, 1, 0, 0, 0, 2920, 2924, 3, 32, 16, 0,
    2921, 2923, 5, 5, 0, 0, 2922, 2921, 1, 0, 0, 0, 2923, 2926, 1, 0, 0, 0, 2924, 2922, 1, 0, 0, 0, 2924, 2925, 1, 0, 0,
    0, 2925, 2928, 1, 0, 0, 0, 2926, 2924, 1, 0, 0, 0, 2927, 2910, 1, 0, 0, 0, 2927, 2928, 1, 0, 0, 0, 2928, 2936, 1, 0,
    0, 0, 2929, 2931, 5, 5, 0, 0, 2930, 2929, 1, 0, 0, 0, 2931, 2934, 1, 0, 0, 0, 2932, 2930, 1, 0, 0, 0, 2932, 2933, 1,
    0, 0, 0, 2933, 2935, 1, 0, 0, 0, 2934, 2932, 1, 0, 0, 0, 2935, 2937, 3, 26, 13, 0, 2936, 2932, 1, 0, 0, 0, 2936,
    2937, 1, 0, 0, 0, 2937, 245, 1, 0, 0, 0, 2938, 2939, 7, 10, 0, 0, 2939, 247, 1, 0, 0, 0, 2940, 2957, 5, 86, 0, 0,
    2941, 2945, 5, 47, 0, 0, 2942, 2944, 5, 5, 0, 0, 2943, 2942, 1, 0, 0, 0, 2944, 2947, 1, 0, 0, 0, 2945, 2943, 1, 0,
    0, 0, 2945, 2946, 1, 0, 0, 0, 2946, 2948, 1, 0, 0, 0, 2947, 2945, 1, 0, 0, 0, 2948, 2952, 3, 98, 49, 0, 2949, 2951,
    5, 5, 0, 0, 2950, 2949, 1, 0, 0, 0, 2951, 2954, 1, 0, 0, 0, 2952, 2950, 1, 0, 0, 0, 2952, 2953, 1, 0, 0, 0, 2953,
    2955, 1, 0, 0, 0, 2954, 2952, 1, 0, 0, 0, 2955, 2956, 5, 48, 0, 0, 2956, 2958, 1, 0, 0, 0, 2957, 2941, 1, 0, 0, 0,
    2957, 2958, 1, 0, 0, 0, 2958, 2961, 1, 0, 0, 0, 2959, 2960, 5, 41, 0, 0, 2960, 2962, 3, 344, 172, 0, 2961, 2959, 1,
    0, 0, 0, 2961, 2962, 1, 0, 0, 0, 2962, 2965, 1, 0, 0, 0, 2963, 2965, 5, 62, 0, 0, 2964, 2940, 1, 0, 0, 0, 2964,
    2963, 1, 0, 0, 0, 2965, 249, 1, 0, 0, 0, 2966, 2970, 5, 89, 0, 0, 2967, 2969, 5, 5, 0, 0, 2968, 2967, 1, 0, 0, 0,
    2969, 2972, 1, 0, 0, 0, 2970, 2968, 1, 0, 0, 0, 2970, 2971, 1, 0, 0, 0, 2971, 2973, 1, 0, 0, 0, 2972, 2970, 1, 0, 0,
    0, 2973, 2977, 5, 9, 0, 0, 2974, 2976, 5, 5, 0, 0, 2975, 2974, 1, 0, 0, 0, 2976, 2979, 1, 0, 0, 0, 2977, 2975, 1, 0,
    0, 0, 2977, 2978, 1, 0, 0, 0, 2978, 2980, 1, 0, 0, 0, 2979, 2977, 1, 0, 0, 0, 2980, 2984, 3, 152, 76, 0, 2981, 2983,
    5, 5, 0, 0, 2982, 2981, 1, 0, 0, 0, 2983, 2986, 1, 0, 0, 0, 2984, 2982, 1, 0, 0, 0, 2984, 2985, 1, 0, 0, 0, 2985,
    2987, 1, 0, 0, 0, 2986, 2984, 1, 0, 0, 0, 2987, 2991, 5, 10, 0, 0, 2988, 2990, 5, 5, 0, 0, 2989, 2988, 1, 0, 0, 0,
    2990, 2993, 1, 0, 0, 0, 2991, 2989, 1, 0, 0, 0, 2991, 2992, 1, 0, 0, 0, 2992, 3025, 1, 0, 0, 0, 2993, 2991, 1, 0, 0,
    0, 2994, 3026, 3, 134, 67, 0, 2995, 2997, 3, 134, 67, 0, 2996, 2995, 1, 0, 0, 0, 2996, 2997, 1, 0, 0, 0, 2997, 3001,
    1, 0, 0, 0, 2998, 3000, 5, 5, 0, 0, 2999, 2998, 1, 0, 0, 0, 3000, 3003, 1, 0, 0, 0, 3001, 2999, 1, 0, 0, 0, 3001,
    3002, 1, 0, 0, 0, 3002, 3005, 1, 0, 0, 0, 3003, 3001, 1, 0, 0, 0, 3004, 3006, 5, 27, 0, 0, 3005, 3004, 1, 0, 0, 0,
    3005, 3006, 1, 0, 0, 0, 3006, 3010, 1, 0, 0, 0, 3007, 3009, 5, 5, 0, 0, 3008, 3007, 1, 0, 0, 0, 3009, 3012, 1, 0, 0,
    0, 3010, 3008, 1, 0, 0, 0, 3010, 3011, 1, 0, 0, 0, 3011, 3013, 1, 0, 0, 0, 3012, 3010, 1, 0, 0, 0, 3013, 3017, 5,
    90, 0, 0, 3014, 3016, 5, 5, 0, 0, 3015, 3014, 1, 0, 0, 0, 3016, 3019, 1, 0, 0, 0, 3017, 3015, 1, 0, 0, 0, 3017,
    3018, 1, 0, 0, 0, 3018, 3022, 1, 0, 0, 0, 3019, 3017, 1, 0, 0, 0, 3020, 3023, 3, 134, 67, 0, 3021, 3023, 5, 27, 0,
    0, 3022, 3020, 1, 0, 0, 0, 3022, 3021, 1, 0, 0, 0, 3023, 3026, 1, 0, 0, 0, 3024, 3026, 5, 27, 0, 0, 3025, 2994, 1,
    0, 0, 0, 3025, 2996, 1, 0, 0, 0, 3025, 3024, 1, 0, 0, 0, 3026, 251, 1, 0, 0, 0, 3027, 3061, 5, 9, 0, 0, 3028, 3030,
    3, 334, 167, 0, 3029, 3028, 1, 0, 0, 0, 3030, 3033, 1, 0, 0, 0, 3031, 3029, 1, 0, 0, 0, 3031, 3032, 1, 0, 0, 0,
    3032, 3037, 1, 0, 0, 0, 3033, 3031, 1, 0, 0, 0, 3034, 3036, 5, 5, 0, 0, 3035, 3034, 1, 0, 0, 0, 3036, 3039, 1, 0, 0,
    0, 3037, 3035, 1, 0, 0, 0, 3037, 3038, 1, 0, 0, 0, 3038, 3040, 1, 0, 0, 0, 3039, 3037, 1, 0, 0, 0, 3040, 3044, 5,
    78, 0, 0, 3041, 3043, 5, 5, 0, 0, 3042, 3041, 1, 0, 0, 0, 3043, 3046, 1, 0, 0, 0, 3044, 3042, 1, 0, 0, 0, 3044,
    3045, 1, 0, 0, 0, 3045, 3047, 1, 0, 0, 0, 3046, 3044, 1, 0, 0, 0, 3047, 3051, 3, 66, 33, 0, 3048, 3050, 5, 5, 0, 0,
    3049, 3048, 1, 0, 0, 0, 3050, 3053, 1, 0, 0, 0, 3051, 3049, 1, 0, 0, 0, 3051, 3052, 1, 0, 0, 0, 3052, 3054, 1, 0, 0,
    0, 3053, 3051, 1, 0, 0, 0, 3054, 3058, 5, 28, 0, 0, 3055, 3057, 5, 5, 0, 0, 3056, 3055, 1, 0, 0, 0, 3057, 3060, 1,
    0, 0, 0, 3058, 3056, 1, 0, 0, 0, 3058, 3059, 1, 0, 0, 0, 3059, 3062, 1, 0, 0, 0, 3060, 3058, 1, 0, 0, 0, 3061, 3031,
    1, 0, 0, 0, 3061, 3062, 1, 0, 0, 0, 3062, 3063, 1, 0, 0, 0, 3063, 3064, 3, 152, 76, 0, 3064, 3065, 5, 10, 0, 0,
    3065, 253, 1, 0, 0, 0, 3066, 3070, 5, 91, 0, 0, 3067, 3069, 5, 5, 0, 0, 3068, 3067, 1, 0, 0, 0, 3069, 3072, 1, 0, 0,
    0, 3070, 3068, 1, 0, 0, 0, 3070, 3071, 1, 0, 0, 0, 3071, 3074, 1, 0, 0, 0, 3072, 3070, 1, 0, 0, 0, 3073, 3075, 3,
    252, 126, 0, 3074, 3073, 1, 0, 0, 0, 3074, 3075, 1, 0, 0, 0, 3075, 3079, 1, 0, 0, 0, 3076, 3078, 5, 5, 0, 0, 3077,
    3076, 1, 0, 0, 0, 3078, 3081, 1, 0, 0, 0, 3079, 3077, 1, 0, 0, 0, 3079, 3080, 1, 0, 0, 0, 3080, 3082, 1, 0, 0, 0,
    3081, 3079, 1, 0, 0, 0, 3082, 3086, 5, 13, 0, 0, 3083, 3085, 5, 5, 0, 0, 3084, 3083, 1, 0, 0, 0, 3085, 3088, 1, 0,
    0, 0, 3086, 3084, 1, 0, 0, 0, 3086, 3087, 1, 0, 0, 0, 3087, 3098, 1, 0, 0, 0, 3088, 3086, 1, 0, 0, 0, 3089, 3093, 3,
    256, 128, 0, 3090, 3092, 5, 5, 0, 0, 3091, 3090, 1, 0, 0, 0, 3092, 3095, 1, 0, 0, 0, 3093, 3091, 1, 0, 0, 0, 3093,
    3094, 1, 0, 0, 0, 3094, 3097, 1, 0, 0, 0, 3095, 3093, 1, 0, 0, 0, 3096, 3089, 1, 0, 0, 0, 3097, 3100, 1, 0, 0, 0,
    3098, 3096, 1, 0, 0, 0, 3098, 3099, 1, 0, 0, 0, 3099, 3104, 1, 0, 0, 0, 3100, 3098, 1, 0, 0, 0, 3101, 3103, 5, 5, 0,
    0, 3102, 3101, 1, 0, 0, 0, 3103, 3106, 1, 0, 0, 0, 3104, 3102, 1, 0, 0, 0, 3104, 3105, 1, 0, 0, 0, 3105, 3107, 1, 0,
    0, 0, 3106, 3104, 1, 0, 0, 0, 3107, 3108, 5, 14, 0, 0, 3108, 255, 1, 0, 0, 0, 3109, 3126, 3, 258, 129, 0, 3110,
    3112, 5, 5, 0, 0, 3111, 3110, 1, 0, 0, 0, 3112, 3115, 1, 0, 0, 0, 3113, 3111, 1, 0, 0, 0, 3113, 3114, 1, 0, 0, 0,
    3114, 3116, 1, 0, 0, 0, 3115, 3113, 1, 0, 0, 0, 3116, 3120, 5, 8, 0, 0, 3117, 3119, 5, 5, 0, 0, 3118, 3117, 1, 0, 0,
    0, 3119, 3122, 1, 0, 0, 0, 3120, 3118, 1, 0, 0, 0, 3120, 3121, 1, 0, 0, 0, 3121, 3123, 1, 0, 0, 0, 3122, 3120, 1, 0,
    0, 0, 3123, 3125, 3, 258, 129, 0, 3124, 3113, 1, 0, 0, 0, 3125, 3128, 1, 0, 0, 0, 3126, 3124, 1, 0, 0, 0, 3126,
    3127, 1, 0, 0, 0, 3127, 3136, 1, 0, 0, 0, 3128, 3126, 1, 0, 0, 0, 3129, 3131, 5, 5, 0, 0, 3130, 3129, 1, 0, 0, 0,
    3131, 3134, 1, 0, 0, 0, 3132, 3130, 1, 0, 0, 0, 3132, 3133, 1, 0, 0, 0, 3133, 3135, 1, 0, 0, 0, 3134, 3132, 1, 0, 0,
    0, 3135, 3137, 5, 8, 0, 0, 3136, 3132, 1, 0, 0, 0, 3136, 3137, 1, 0, 0, 0, 3137, 3141, 1, 0, 0, 0, 3138, 3140, 5, 5,
    0, 0, 3139, 3138, 1, 0, 0, 0, 3140, 3143, 1, 0, 0, 0, 3141, 3139, 1, 0, 0, 0, 3141, 3142, 1, 0, 0, 0, 3142, 3144, 1,
    0, 0, 0, 3143, 3141, 1, 0, 0, 0, 3144, 3148, 5, 34, 0, 0, 3145, 3147, 5, 5, 0, 0, 3146, 3145, 1, 0, 0, 0, 3147,
    3150, 1, 0, 0, 0, 3148, 3146, 1, 0, 0, 0, 3148, 3149, 1, 0, 0, 0, 3149, 3151, 1, 0, 0, 0, 3150, 3148, 1, 0, 0, 0,
    3151, 3153, 3, 134, 67, 0, 3152, 3154, 3, 148, 74, 0, 3153, 3152, 1, 0, 0, 0, 3153, 3154, 1, 0, 0, 0, 3154, 3174, 1,
    0, 0, 0, 3155, 3159, 5, 90, 0, 0, 3156, 3158, 5, 5, 0, 0, 3157, 3156, 1, 0, 0, 0, 3158, 3161, 1, 0, 0, 0, 3159,
    3157, 1, 0, 0, 0, 3159, 3160, 1, 0, 0, 0, 3160, 3162, 1, 0, 0, 0, 3161, 3159, 1, 0, 0, 0, 3162, 3166, 5, 34, 0, 0,
    3163, 3165, 5, 5, 0, 0, 3164, 3163, 1, 0, 0, 0, 3165, 3168, 1, 0, 0, 0, 3166, 3164, 1, 0, 0, 0, 3166, 3167, 1, 0, 0,
    0, 3167, 3169, 1, 0, 0, 0, 3168, 3166, 1, 0, 0, 0, 3169, 3171, 3, 134, 67, 0, 3170, 3172, 3, 148, 74, 0, 3171, 3170,
    1, 0, 0, 0, 3171, 3172, 1, 0, 0, 0, 3172, 3174, 1, 0, 0, 0, 3173, 3109, 1, 0, 0, 0, 3173, 3155, 1, 0, 0, 0, 3174,
    257, 1, 0, 0, 0, 3175, 3179, 3, 152, 76, 0, 3176, 3179, 3, 260, 130, 0, 3177, 3179, 3, 262, 131, 0, 3178, 3175, 1,
    0, 0, 0, 3178, 3176, 1, 0, 0, 0, 3178, 3177, 1, 0, 0, 0, 3179, 259, 1, 0, 0, 0, 3180, 3184, 3, 280, 140, 0, 3181,
    3183, 5, 5, 0, 0, 3182, 3181, 1, 0, 0, 0, 3183, 3186, 1, 0, 0, 0, 3184, 3182, 1, 0, 0, 0, 3184, 3185, 1, 0, 0, 0,
    3185, 3187, 1, 0, 0, 0, 3186, 3184, 1, 0, 0, 0, 3187, 3188, 3, 152, 76, 0, 3188, 261, 1, 0, 0, 0, 3189, 3193, 3,
    282, 141, 0, 3190, 3192, 5, 5, 0, 0, 3191, 3190, 1, 0, 0, 0, 3192, 3195, 1, 0, 0, 0, 3193, 3191, 1, 0, 0, 0, 3193,
    3194, 1, 0, 0, 0, 3194, 3196, 1, 0, 0, 0, 3195, 3193, 1, 0, 0, 0, 3196, 3197, 3, 98, 49, 0, 3197, 263, 1, 0, 0, 0,
    3198, 3202, 5, 92, 0, 0, 3199, 3201, 5, 5, 0, 0, 3200, 3199, 1, 0, 0, 0, 3201, 3204, 1, 0, 0, 0, 3202, 3200, 1, 0,
    0, 0, 3202, 3203, 1, 0, 0, 0, 3203, 3205, 1, 0, 0, 0, 3204, 3202, 1, 0, 0, 0, 3205, 3233, 3, 136, 68, 0, 3206, 3208,
    5, 5, 0, 0, 3207, 3206, 1, 0, 0, 0, 3208, 3211, 1, 0, 0, 0, 3209, 3207, 1, 0, 0, 0, 3209, 3210, 1, 0, 0, 0, 3210,
    3212, 1, 0, 0, 0, 3211, 3209, 1, 0, 0, 0, 3212, 3214, 3, 266, 133, 0, 3213, 3209, 1, 0, 0, 0, 3214, 3215, 1, 0, 0,
    0, 3215, 3213, 1, 0, 0, 0, 3215, 3216, 1, 0, 0, 0, 3216, 3224, 1, 0, 0, 0, 3217, 3219, 5, 5, 0, 0, 3218, 3217, 1, 0,
    0, 0, 3219, 3222, 1, 0, 0, 0, 3220, 3218, 1, 0, 0, 0, 3220, 3221, 1, 0, 0, 0, 3221, 3223, 1, 0, 0, 0, 3222, 3220, 1,
    0, 0, 0, 3223, 3225, 3, 268, 134, 0, 3224, 3220, 1, 0, 0, 0, 3224, 3225, 1, 0, 0, 0, 3225, 3234, 1, 0, 0, 0, 3226,
    3228, 5, 5, 0, 0, 3227, 3226, 1, 0, 0, 0, 3228, 3231, 1, 0, 0, 0, 3229, 3227, 1, 0, 0, 0, 3229, 3230, 1, 0, 0, 0,
    3230, 3232, 1, 0, 0, 0, 3231, 3229, 1, 0, 0, 0, 3232, 3234, 3, 268, 134, 0, 3233, 3213, 1, 0, 0, 0, 3233, 3229, 1,
    0, 0, 0, 3234, 265, 1, 0, 0, 0, 3235, 3239, 5, 93, 0, 0, 3236, 3238, 5, 5, 0, 0, 3237, 3236, 1, 0, 0, 0, 3238, 3241,
    1, 0, 0, 0, 3239, 3237, 1, 0, 0, 0, 3239, 3240, 1, 0, 0, 0, 3240, 3242, 1, 0, 0, 0, 3241, 3239, 1, 0, 0, 0, 3242,
    3246, 5, 9, 0, 0, 3243, 3245, 3, 334, 167, 0, 3244, 3243, 1, 0, 0, 0, 3245, 3248, 1, 0, 0, 0, 3246, 3244, 1, 0, 0,
    0, 3246, 3247, 1, 0, 0, 0, 3247, 3249, 1, 0, 0, 0, 3248, 3246, 1, 0, 0, 0, 3249, 3250, 3, 344, 172, 0, 3250, 3251,
    5, 26, 0, 0, 3251, 3259, 3, 98, 49, 0, 3252, 3254, 5, 5, 0, 0, 3253, 3252, 1, 0, 0, 0, 3254, 3257, 1, 0, 0, 0, 3255,
    3253, 1, 0, 0, 0, 3255, 3256, 1, 0, 0, 0, 3256, 3258, 1, 0, 0, 0, 3257, 3255, 1, 0, 0, 0, 3258, 3260, 5, 8, 0, 0,
    3259, 3255, 1, 0, 0, 0, 3259, 3260, 1, 0, 0, 0, 3260, 3261, 1, 0, 0, 0, 3261, 3265, 5, 10, 0, 0, 3262, 3264, 5, 5,
    0, 0, 3263, 3262, 1, 0, 0, 0, 3264, 3267, 1, 0, 0, 0, 3265, 3263, 1, 0, 0, 0, 3265, 3266, 1, 0, 0, 0, 3266, 3268, 1,
    0, 0, 0, 3267, 3265, 1, 0, 0, 0, 3268, 3269, 3, 136, 68, 0, 3269, 267, 1, 0, 0, 0, 3270, 3274, 5, 94, 0, 0, 3271,
    3273, 5, 5, 0, 0, 3272, 3271, 1, 0, 0, 0, 3273, 3276, 1, 0, 0, 0, 3274, 3272, 1, 0, 0, 0, 3274, 3275, 1, 0, 0, 0,
    3275, 3277, 1, 0, 0, 0, 3276, 3274, 1, 0, 0, 0, 3277, 3278, 3, 136, 68, 0, 3278, 269, 1, 0, 0, 0, 3279, 3283, 5, 98,
    0, 0, 3280, 3282, 5, 5, 0, 0, 3281, 3280, 1, 0, 0, 0, 3282, 3285, 1, 0, 0, 0, 3283, 3281, 1, 0, 0, 0, 3283, 3284, 1,
    0, 0, 0, 3284, 3286, 1, 0, 0, 0, 3285, 3283, 1, 0, 0, 0, 3286, 3296, 3, 152, 76, 0, 3287, 3289, 7, 11, 0, 0, 3288,
    3290, 3, 152, 76, 0, 3289, 3288, 1, 0, 0, 0, 3289, 3290, 1, 0, 0, 0, 3290, 3296, 1, 0, 0, 0, 3291, 3296, 5, 100, 0,
    0, 3292, 3296, 5, 59, 0, 0, 3293, 3296, 5, 101, 0, 0, 3294, 3296, 5, 60, 0, 0, 3295, 3279, 1, 0, 0, 0, 3295, 3287,
    1, 0, 0, 0, 3295, 3291, 1, 0, 0, 0, 3295, 3292, 1, 0, 0, 0, 3295, 3293, 1, 0, 0, 0, 3295, 3294, 1, 0, 0, 0, 3296,
    271, 1, 0, 0, 0, 3297, 3299, 3, 122, 61, 0, 3298, 3297, 1, 0, 0, 0, 3298, 3299, 1, 0, 0, 0, 3299, 3300, 1, 0, 0, 0,
    3300, 3304, 5, 38, 0, 0, 3301, 3303, 5, 5, 0, 0, 3302, 3301, 1, 0, 0, 0, 3303, 3306, 1, 0, 0, 0, 3304, 3302, 1, 0,
    0, 0, 3304, 3305, 1, 0, 0, 0, 3305, 3309, 1, 0, 0, 0, 3306, 3304, 1, 0, 0, 0, 3307, 3310, 3, 344, 172, 0, 3308,
    3310, 5, 74, 0, 0, 3309, 3307, 1, 0, 0, 0, 3309, 3308, 1, 0, 0, 0, 3310, 273, 1, 0, 0, 0, 3311, 3312, 7, 12, 0, 0,
    3312, 275, 1, 0, 0, 0, 3313, 3314, 7, 13, 0, 0, 3314, 277, 1, 0, 0, 0, 3315, 3316, 7, 14, 0, 0, 3316, 279, 1, 0, 0,
    0, 3317, 3318, 7, 15, 0, 0, 3318, 281, 1, 0, 0, 0, 3319, 3320, 7, 16, 0, 0, 3320, 283, 1, 0, 0, 0, 3321, 3322, 7,
    17, 0, 0, 3322, 285, 1, 0, 0, 0, 3323, 3324, 7, 18, 0, 0, 3324, 287, 1, 0, 0, 0, 3325, 3326, 7, 19, 0, 0, 3326, 289,
    1, 0, 0, 0, 3327, 3333, 5, 20, 0, 0, 3328, 3333, 5, 21, 0, 0, 3329, 3333, 5, 19, 0, 0, 3330, 3333, 5, 18, 0, 0,
    3331, 3333, 3, 294, 147, 0, 3332, 3327, 1, 0, 0, 0, 3332, 3328, 1, 0, 0, 0, 3332, 3329, 1, 0, 0, 0, 3332, 3330, 1,
    0, 0, 0, 3332, 3331, 1, 0, 0, 0, 3333, 291, 1, 0, 0, 0, 3334, 3339, 5, 20, 0, 0, 3335, 3339, 5, 21, 0, 0, 3336,
    3337, 5, 25, 0, 0, 3337, 3339, 3, 294, 147, 0, 3338, 3334, 1, 0, 0, 0, 3338, 3335, 1, 0, 0, 0, 3338, 3336, 1, 0, 0,
    0, 3339, 293, 1, 0, 0, 0, 3340, 3341, 7, 20, 0, 0, 3341, 295, 1, 0, 0, 0, 3342, 3344, 5, 5, 0, 0, 3343, 3342, 1, 0,
    0, 0, 3344, 3347, 1, 0, 0, 0, 3345, 3343, 1, 0, 0, 0, 3345, 3346, 1, 0, 0, 0, 3346, 3348, 1, 0, 0, 0, 3347, 3345, 1,
    0, 0, 0, 3348, 3358, 5, 7, 0, 0, 3349, 3351, 5, 5, 0, 0, 3350, 3349, 1, 0, 0, 0, 3351, 3354, 1, 0, 0, 0, 3352, 3350,
    1, 0, 0, 0, 3352, 3353, 1, 0, 0, 0, 3353, 3355, 1, 0, 0, 0, 3354, 3352, 1, 0, 0, 0, 3355, 3358, 3, 298, 149, 0,
    3356, 3358, 5, 38, 0, 0, 3357, 3345, 1, 0, 0, 0, 3357, 3352, 1, 0, 0, 0, 3357, 3356, 1, 0, 0, 0, 3358, 297, 1, 0, 0,
    0, 3359, 3360, 5, 46, 0, 0, 3360, 3361, 5, 7, 0, 0, 3361, 299, 1, 0, 0, 0, 3362, 3365, 3, 334, 167, 0, 3363, 3365,
    3, 304, 152, 0, 3364, 3362, 1, 0, 0, 0, 3364, 3363, 1, 0, 0, 0, 3365, 3366, 1, 0, 0, 0, 3366, 3364, 1, 0, 0, 0,
    3366, 3367, 1, 0, 0, 0, 3367, 301, 1, 0, 0, 0, 3368, 3371, 3, 334, 167, 0, 3369, 3371, 3, 328, 164, 0, 3370, 3368,
    1, 0, 0, 0, 3370, 3369, 1, 0, 0, 0, 3371, 3372, 1, 0, 0, 0, 3372, 3370, 1, 0, 0, 0, 3372, 3373, 1, 0, 0, 0, 3373,
    303, 1, 0, 0, 0, 3374, 3383, 3, 310, 155, 0, 3375, 3383, 3, 312, 156, 0, 3376, 3383, 3, 314, 157, 0, 3377, 3383, 3,
    322, 161, 0, 3378, 3383, 3, 324, 162, 0, 3379, 3383, 3, 326, 163, 0, 3380, 3383, 3, 328, 164, 0, 3381, 3383, 3, 332,
    166, 0, 3382, 3374, 1, 0, 0, 0, 3382, 3375, 1, 0, 0, 0, 3382, 3376, 1, 0, 0, 0, 3382, 3377, 1, 0, 0, 0, 3382, 3378,
    1, 0, 0, 0, 3382, 3379, 1, 0, 0, 0, 3382, 3380, 1, 0, 0, 0, 3382, 3381, 1, 0, 0, 0, 3383, 3387, 1, 0, 0, 0, 3384,
    3386, 5, 5, 0, 0, 3385, 3384, 1, 0, 0, 0, 3386, 3389, 1, 0, 0, 0, 3387, 3385, 1, 0, 0, 0, 3387, 3388, 1, 0, 0, 0,
    3388, 305, 1, 0, 0, 0, 3389, 3387, 1, 0, 0, 0, 3390, 3392, 3, 308, 154, 0, 3391, 3390, 1, 0, 0, 0, 3392, 3393, 1, 0,
    0, 0, 3393, 3391, 1, 0, 0, 0, 3393, 3394, 1, 0, 0, 0, 3394, 307, 1, 0, 0, 0, 3395, 3404, 3, 334, 167, 0, 3396, 3400,
    5, 124, 0, 0, 3397, 3399, 5, 5, 0, 0, 3398, 3397, 1, 0, 0, 0, 3399, 3402, 1, 0, 0, 0, 3400, 3398, 1, 0, 0, 0, 3400,
    3401, 1, 0, 0, 0, 3401, 3404, 1, 0, 0, 0, 3402, 3400, 1, 0, 0, 0, 3403, 3395, 1, 0, 0, 0, 3403, 3396, 1, 0, 0, 0,
    3404, 309, 1, 0, 0, 0, 3405, 3406, 7, 21, 0, 0, 3406, 311, 1, 0, 0, 0, 3407, 3408, 7, 22, 0, 0, 3408, 313, 1, 0, 0,
    0, 3409, 3410, 7, 23, 0, 0, 3410, 315, 1, 0, 0, 0, 3411, 3412, 7, 24, 0, 0, 3412, 317, 1, 0, 0, 0, 3413, 3415, 3,
    320, 160, 0, 3414, 3413, 1, 0, 0, 0, 3415, 3416, 1, 0, 0, 0, 3416, 3414, 1, 0, 0, 0, 3416, 3417, 1, 0, 0, 0, 3417,
    319, 1, 0, 0, 0, 3418, 3422, 3, 330, 165, 0, 3419, 3421, 5, 5, 0, 0, 3420, 3419, 1, 0, 0, 0, 3421, 3424, 1, 0, 0, 0,
    3422, 3420, 1, 0, 0, 0, 3422, 3423, 1, 0, 0, 0, 3423, 3434, 1, 0, 0, 0, 3424, 3422, 1, 0, 0, 0, 3425, 3429, 3, 316,
    158, 0, 3426, 3428, 5, 5, 0, 0, 3427, 3426, 1, 0, 0, 0, 3428, 3431, 1, 0, 0, 0, 3429, 3427, 1, 0, 0, 0, 3429, 3430,
    1, 0, 0, 0, 3430, 3434, 1, 0, 0, 0, 3431, 3429, 1, 0, 0, 0, 3432, 3434, 3, 334, 167, 0, 3433, 3418, 1, 0, 0, 0,
    3433, 3425, 1, 0, 0, 0, 3433, 3432, 1, 0, 0, 0, 3434, 321, 1, 0, 0, 0, 3435, 3436, 7, 25, 0, 0, 3436, 323, 1, 0, 0,
    0, 3437, 3438, 5, 129, 0, 0, 3438, 325, 1, 0, 0, 0, 3439, 3440, 7, 26, 0, 0, 3440, 327, 1, 0, 0, 0, 3441, 3442, 7,
    27, 0, 0, 3442, 329, 1, 0, 0, 0, 3443, 3444, 5, 134, 0, 0, 3444, 331, 1, 0, 0, 0, 3445, 3446, 7, 28, 0, 0, 3446,
    333, 1, 0, 0, 0, 3447, 3450, 3, 336, 168, 0, 3448, 3450, 3, 338, 169, 0, 3449, 3447, 1, 0, 0, 0, 3449, 3448, 1, 0,
    0, 0, 3450, 3454, 1, 0, 0, 0, 3451, 3453, 5, 5, 0, 0, 3452, 3451, 1, 0, 0, 0, 3453, 3456, 1, 0, 0, 0, 3454, 3452, 1,
    0, 0, 0, 3454, 3455, 1, 0, 0, 0, 3455, 335, 1, 0, 0, 0, 3456, 3454, 1, 0, 0, 0, 3457, 3461, 3, 340, 170, 0, 3458,
    3460, 5, 5, 0, 0, 3459, 3458, 1, 0, 0, 0, 3460, 3463, 1, 0, 0, 0, 3461, 3459, 1, 0, 0, 0, 3461, 3462, 1, 0, 0, 0,
    3462, 3467, 1, 0, 0, 0, 3463, 3461, 1, 0, 0, 0, 3464, 3467, 5, 41, 0, 0, 3465, 3467, 5, 43, 0, 0, 3466, 3457, 1, 0,
    0, 0, 3466, 3464, 1, 0, 0, 0, 3466, 3465, 1, 0, 0, 0, 3467, 3468, 1, 0, 0, 0, 3468, 3469, 3, 342, 171, 0, 3469, 337,
    1, 0, 0, 0, 3470, 3474, 3, 340, 170, 0, 3471, 3473, 5, 5, 0, 0, 3472, 3471, 1, 0, 0, 0, 3473, 3476, 1, 0, 0, 0,
    3474, 3472, 1, 0, 0, 0, 3474, 3475, 1, 0, 0, 0, 3475, 3480, 1, 0, 0, 0, 3476, 3474, 1, 0, 0, 0, 3477, 3480, 5, 41,
    0, 0, 3478, 3480, 5, 43, 0, 0, 3479, 3470, 1, 0, 0, 0, 3479, 3477, 1, 0, 0, 0, 3479, 3478, 1, 0, 0, 0, 3480, 3481,
    1, 0, 0, 0, 3481, 3483, 5, 11, 0, 0, 3482, 3484, 3, 342, 171, 0, 3483, 3482, 1, 0, 0, 0, 3484, 3485, 1, 0, 0, 0,
    3485, 3483, 1, 0, 0, 0, 3485, 3486, 1, 0, 0, 0, 3486, 3487, 1, 0, 0, 0, 3487, 3488, 5, 12, 0, 0, 3488, 339, 1, 0, 0,
    0, 3489, 3490, 7, 0, 0, 0, 3490, 3494, 7, 29, 0, 0, 3491, 3493, 5, 5, 0, 0, 3492, 3491, 1, 0, 0, 0, 3493, 3496, 1,
    0, 0, 0, 3494, 3492, 1, 0, 0, 0, 3494, 3495, 1, 0, 0, 0, 3495, 3497, 1, 0, 0, 0, 3496, 3494, 1, 0, 0, 0, 3497, 3498,
    5, 26, 0, 0, 3498, 341, 1, 0, 0, 0, 3499, 3502, 3, 36, 18, 0, 3500, 3502, 3, 106, 53, 0, 3501, 3499, 1, 0, 0, 0,
    3501, 3500, 1, 0, 0, 0, 3502, 343, 1, 0, 0, 0, 3503, 3504, 7, 30, 0, 0, 3504, 345, 1, 0, 0, 0, 3505, 3516, 3, 344,
    172, 0, 3506, 3508, 5, 5, 0, 0, 3507, 3506, 1, 0, 0, 0, 3508, 3511, 1, 0, 0, 0, 3509, 3507, 1, 0, 0, 0, 3509, 3510,
    1, 0, 0, 0, 3510, 3512, 1, 0, 0, 0, 3511, 3509, 1, 0, 0, 0, 3512, 3513, 5, 7, 0, 0, 3513, 3515, 3, 344, 172, 0,
    3514, 3509, 1, 0, 0, 0, 3515, 3518, 1, 0, 0, 0, 3516, 3514, 1, 0, 0, 0, 3516, 3517, 1, 0, 0, 0, 3517, 347, 1, 0, 0,
    0, 3518, 3516, 1, 0, 0, 0, 542, 349, 354, 360, 368, 374, 379, 385, 395, 404, 411, 418, 425, 430, 435, 441, 443, 448,
    456, 459, 466, 469, 475, 482, 486, 491, 498, 508, 511, 518, 521, 524, 529, 536, 540, 545, 549, 554, 561, 565, 570,
    574, 579, 586, 590, 593, 599, 602, 610, 617, 626, 633, 640, 646, 652, 656, 658, 663, 669, 672, 677, 685, 692, 699,
    703, 709, 716, 722, 733, 737, 743, 751, 757, 764, 769, 776, 785, 792, 799, 805, 811, 815, 820, 826, 831, 838, 845,
    849, 855, 862, 869, 875, 881, 888, 895, 902, 906, 913, 919, 925, 931, 935, 940, 947, 951, 956, 963, 967, 972, 976,
    982, 989, 996, 1002, 1008, 1012, 1014, 1019, 1025, 1031, 1038, 1042, 1045, 1051, 1055, 1060, 1067, 1072, 1077, 1084,
    1091, 1098, 1102, 1107, 1111, 1116, 1120, 1127, 1131, 1136, 1142, 1149, 1156, 1160, 1166, 1173, 1180, 1186, 1192,
    1196, 1201, 1207, 1213, 1217, 1222, 1229, 1234, 1239, 1244, 1249, 1253, 1258, 1265, 1270, 1272, 1277, 1281, 1286,
    1290, 1295, 1299, 1302, 1305, 1310, 1314, 1317, 1319, 1325, 1331, 1337, 1344, 1351, 1358, 1362, 1367, 1371, 1374,
    1380, 1387, 1394, 1398, 1403, 1410, 1417, 1421, 1426, 1431, 1437, 1444, 1451, 1457, 1463, 1467, 1469, 1474, 1480,
    1486, 1493, 1497, 1503, 1510, 1514, 1520, 1527, 1533, 1539, 1546, 1553, 1557, 1562, 1566, 1569, 1575, 1582, 1589,
    1593, 1598, 1602, 1608, 1617, 1621, 1626, 1633, 1637, 1642, 1651, 1658, 1664, 1670, 1674, 1680, 1683, 1689, 1693,
    1698, 1702, 1705, 1712, 1716, 1720, 1725, 1731, 1739, 1746, 1752, 1759, 1763, 1766, 1770, 1775, 1781, 1785, 1791,
    1798, 1801, 1807, 1814, 1823, 1828, 1833, 1840, 1845, 1849, 1855, 1859, 1864, 1873, 1880, 1886, 1891, 1897, 1902,
    1907, 1913, 1917, 1922, 1929, 1933, 1937, 1945, 1948, 1951, 1955, 1957, 1964, 1971, 1976, 1982, 1989, 1997, 2003,
    2010, 2015, 2023, 2027, 2033, 2042, 2047, 2053, 2057, 2062, 2069, 2082, 2087, 2096, 2102, 2110, 2117, 2123, 2130,
    2137, 2143, 2151, 2158, 2166, 2173, 2180, 2188, 2197, 2202, 2204, 2211, 2218, 2225, 2236, 2243, 2251, 2257, 2265,
    2272, 2280, 2287, 2294, 2301, 2308, 2314, 2325, 2328, 2334, 2342, 2349, 2355, 2362, 2369, 2375, 2382, 2390, 2396,
    2403, 2410, 2416, 2422, 2426, 2431, 2440, 2446, 2449, 2452, 2456, 2461, 2465, 2470, 2479, 2486, 2493, 2499, 2505,
    2509, 2514, 2523, 2530, 2537, 2543, 2549, 2553, 2558, 2561, 2566, 2571, 2578, 2585, 2588, 2591, 2596, 2615, 2621,
    2628, 2637, 2644, 2651, 2657, 2663, 2667, 2672, 2675, 2683, 2688, 2690, 2699, 2701, 2712, 2719, 2730, 2737, 2746,
    2750, 2755, 2762, 2765, 2771, 2780, 2787, 2793, 2799, 2803, 2810, 2817, 2821, 2823, 2826, 2831, 2838, 2845, 2850,
    2855, 2862, 2869, 2873, 2878, 2882, 2887, 2891, 2895, 2898, 2903, 2910, 2917, 2924, 2927, 2932, 2936, 2945, 2952,
    2957, 2961, 2964, 2970, 2977, 2984, 2991, 2996, 3001, 3005, 3010, 3017, 3022, 3025, 3031, 3037, 3044, 3051, 3058,
    3061, 3070, 3074, 3079, 3086, 3093, 3098, 3104, 3113, 3120, 3126, 3132, 3136, 3141, 3148, 3153, 3159, 3166, 3171,
    3173, 3178, 3184, 3193, 3202, 3209, 3215, 3220, 3224, 3229, 3233, 3239, 3246, 3255, 3259, 3265, 3274, 3283, 3289,
    3295, 3298, 3304, 3309, 3332, 3338, 3345, 3352, 3357, 3364, 3366, 3370, 3372, 3382, 3387, 3393, 3400, 3403, 3416,
    3422, 3429, 3433, 3449, 3454, 3461, 3466, 3474, 3479, 3485, 3494, 3501, 3509, 3516,
  ];

  private static __ATN: antlr.ATN;
  public static get _ATN(): antlr.ATN {
    if (!KotlinParser.__ATN) {
      KotlinParser.__ATN = new antlr.ATNDeserializer().deserialize(KotlinParser._serializedATN);
    }

    return KotlinParser.__ATN;
  }

  private static readonly vocabulary = new antlr.Vocabulary(KotlinParser.literalNames, KotlinParser.symbolicNames, []);

  public override get vocabulary(): antlr.Vocabulary {
    return KotlinParser.vocabulary;
  }

  private static readonly decisionsToDFA = KotlinParser._ATN.decisionToState.map(
    (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index),
  );
}

export class KotlinFileContext extends antlr.ParserRuleContext {
  public packageHeader(): PackageHeaderContext {
    return this.getRuleContext(0, PackageHeaderContext)!;
  }
  public importList(): ImportListContext {
    return this.getRuleContext(0, ImportListContext)!;
  }
  public EOF(): antlr.TerminalNode {
    return this.getToken(KotlinParser.EOF, 0)!;
  }
  public shebangLine(): ShebangLineContext | null {
    return this.getRuleContext(0, ShebangLineContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public fileAnnotation(): FileAnnotationContext[];
  public fileAnnotation(i: number): FileAnnotationContext | null;
  public fileAnnotation(i?: number): FileAnnotationContext[] | FileAnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(FileAnnotationContext);
    }

    return this.getRuleContext(i, FileAnnotationContext);
  }
  public topLevelObject(): TopLevelObjectContext[];
  public topLevelObject(i: number): TopLevelObjectContext | null;
  public topLevelObject(i?: number): TopLevelObjectContext[] | TopLevelObjectContext | null {
    if (i === undefined) {
      return this.getRuleContexts(TopLevelObjectContext);
    }

    return this.getRuleContext(i, TopLevelObjectContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_kotlinFile;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterKotlinFile) {
      listener.enterKotlinFile(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitKotlinFile) {
      listener.exitKotlinFile(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitKotlinFile) {
      return visitor.visitKotlinFile(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ScriptContext extends antlr.ParserRuleContext {
  public packageHeader(): PackageHeaderContext {
    return this.getRuleContext(0, PackageHeaderContext)!;
  }
  public importList(): ImportListContext {
    return this.getRuleContext(0, ImportListContext)!;
  }
  public EOF(): antlr.TerminalNode {
    return this.getToken(KotlinParser.EOF, 0)!;
  }
  public shebangLine(): ShebangLineContext | null {
    return this.getRuleContext(0, ShebangLineContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public fileAnnotation(): FileAnnotationContext[];
  public fileAnnotation(i: number): FileAnnotationContext | null;
  public fileAnnotation(i?: number): FileAnnotationContext[] | FileAnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(FileAnnotationContext);
    }

    return this.getRuleContext(i, FileAnnotationContext);
  }
  public statement(): StatementContext[];
  public statement(i: number): StatementContext | null;
  public statement(i?: number): StatementContext[] | StatementContext | null {
    if (i === undefined) {
      return this.getRuleContexts(StatementContext);
    }

    return this.getRuleContext(i, StatementContext);
  }
  public semi(): SemiContext[];
  public semi(i: number): SemiContext | null;
  public semi(i?: number): SemiContext[] | SemiContext | null {
    if (i === undefined) {
      return this.getRuleContexts(SemiContext);
    }

    return this.getRuleContext(i, SemiContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_script;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterScript) {
      listener.enterScript(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitScript) {
      listener.exitScript(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitScript) {
      return visitor.visitScript(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ShebangLineContext extends antlr.ParserRuleContext {
  public ShebangLine(): antlr.TerminalNode {
    return this.getToken(KotlinParser.ShebangLine, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_shebangLine;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterShebangLine) {
      listener.enterShebangLine(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitShebangLine) {
      listener.exitShebangLine(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitShebangLine) {
      return visitor.visitShebangLine(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class FileAnnotationContext extends antlr.ParserRuleContext {
  public FILE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.FILE, 0)!;
  }
  public COLON(): antlr.TerminalNode {
    return this.getToken(KotlinParser.COLON, 0)!;
  }
  public AT_NO_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.AT_NO_WS, 0);
  }
  public AT_PRE_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.AT_PRE_WS, 0);
  }
  public LSQUARE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.LSQUARE, 0);
  }
  public RSQUARE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.RSQUARE, 0);
  }
  public unescapedAnnotation(): UnescapedAnnotationContext[];
  public unescapedAnnotation(i: number): UnescapedAnnotationContext | null;
  public unescapedAnnotation(i?: number): UnescapedAnnotationContext[] | UnescapedAnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(UnescapedAnnotationContext);
    }

    return this.getRuleContext(i, UnescapedAnnotationContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_fileAnnotation;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterFileAnnotation) {
      listener.enterFileAnnotation(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitFileAnnotation) {
      listener.exitFileAnnotation(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitFileAnnotation) {
      return visitor.visitFileAnnotation(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class PackageHeaderContext extends antlr.ParserRuleContext {
  public PACKAGE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.PACKAGE, 0);
  }
  public identifier(): IdentifierContext | null {
    return this.getRuleContext(0, IdentifierContext);
  }
  public semi(): SemiContext | null {
    return this.getRuleContext(0, SemiContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_packageHeader;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterPackageHeader) {
      listener.enterPackageHeader(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitPackageHeader) {
      listener.exitPackageHeader(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitPackageHeader) {
      return visitor.visitPackageHeader(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ImportListContext extends antlr.ParserRuleContext {
  public importHeader(): ImportHeaderContext[];
  public importHeader(i: number): ImportHeaderContext | null;
  public importHeader(i?: number): ImportHeaderContext[] | ImportHeaderContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ImportHeaderContext);
    }

    return this.getRuleContext(i, ImportHeaderContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_importList;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterImportList) {
      listener.enterImportList(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitImportList) {
      listener.exitImportList(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitImportList) {
      return visitor.visitImportList(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ImportHeaderContext extends antlr.ParserRuleContext {
  public IMPORT(): antlr.TerminalNode {
    return this.getToken(KotlinParser.IMPORT, 0)!;
  }
  public identifier(): IdentifierContext {
    return this.getRuleContext(0, IdentifierContext)!;
  }
  public DOT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DOT, 0);
  }
  public MULT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.MULT, 0);
  }
  public importAlias(): ImportAliasContext | null {
    return this.getRuleContext(0, ImportAliasContext);
  }
  public semi(): SemiContext | null {
    return this.getRuleContext(0, SemiContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_importHeader;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterImportHeader) {
      listener.enterImportHeader(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitImportHeader) {
      listener.exitImportHeader(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitImportHeader) {
      return visitor.visitImportHeader(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ImportAliasContext extends antlr.ParserRuleContext {
  public AS(): antlr.TerminalNode {
    return this.getToken(KotlinParser.AS, 0)!;
  }
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_importAlias;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterImportAlias) {
      listener.enterImportAlias(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitImportAlias) {
      listener.exitImportAlias(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitImportAlias) {
      return visitor.visitImportAlias(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TopLevelObjectContext extends antlr.ParserRuleContext {
  public declaration(): DeclarationContext {
    return this.getRuleContext(0, DeclarationContext)!;
  }
  public semis(): SemisContext | null {
    return this.getRuleContext(0, SemisContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_topLevelObject;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTopLevelObject) {
      listener.enterTopLevelObject(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTopLevelObject) {
      listener.exitTopLevelObject(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTopLevelObject) {
      return visitor.visitTopLevelObject(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeAliasContext extends antlr.ParserRuleContext {
  public TYPE_ALIAS(): antlr.TerminalNode {
    return this.getToken(KotlinParser.TYPE_ALIAS, 0)!;
  }
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public ASSIGNMENT(): antlr.TerminalNode {
    return this.getToken(KotlinParser.ASSIGNMENT, 0)!;
  }
  public type(): TypeContext {
    return this.getRuleContext(0, TypeContext)!;
  }
  public modifiers(): ModifiersContext | null {
    return this.getRuleContext(0, ModifiersContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public typeParameters(): TypeParametersContext | null {
    return this.getRuleContext(0, TypeParametersContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeAlias;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeAlias) {
      listener.enterTypeAlias(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeAlias) {
      listener.exitTypeAlias(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeAlias) {
      return visitor.visitTypeAlias(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class DeclarationContext extends antlr.ParserRuleContext {
  public classDeclaration(): ClassDeclarationContext | null {
    return this.getRuleContext(0, ClassDeclarationContext);
  }
  public objectDeclaration(): ObjectDeclarationContext | null {
    return this.getRuleContext(0, ObjectDeclarationContext);
  }
  public functionDeclaration(): FunctionDeclarationContext | null {
    return this.getRuleContext(0, FunctionDeclarationContext);
  }
  public propertyDeclaration(): PropertyDeclarationContext | null {
    return this.getRuleContext(0, PropertyDeclarationContext);
  }
  public typeAlias(): TypeAliasContext | null {
    return this.getRuleContext(0, TypeAliasContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_declaration;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterDeclaration) {
      listener.enterDeclaration(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitDeclaration) {
      listener.exitDeclaration(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitDeclaration) {
      return visitor.visitDeclaration(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ClassDeclarationContext extends antlr.ParserRuleContext {
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public CLASS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.CLASS, 0);
  }
  public INTERFACE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.INTERFACE, 0);
  }
  public modifiers(): ModifiersContext | null {
    return this.getRuleContext(0, ModifiersContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public typeParameters(): TypeParametersContext | null {
    return this.getRuleContext(0, TypeParametersContext);
  }
  public primaryConstructor(): PrimaryConstructorContext | null {
    return this.getRuleContext(0, PrimaryConstructorContext);
  }
  public COLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLON, 0);
  }
  public delegationSpecifiers(): DelegationSpecifiersContext | null {
    return this.getRuleContext(0, DelegationSpecifiersContext);
  }
  public typeConstraints(): TypeConstraintsContext | null {
    return this.getRuleContext(0, TypeConstraintsContext);
  }
  public classBody(): ClassBodyContext | null {
    return this.getRuleContext(0, ClassBodyContext);
  }
  public enumClassBody(): EnumClassBodyContext | null {
    return this.getRuleContext(0, EnumClassBodyContext);
  }
  public FUN(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.FUN, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_classDeclaration;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterClassDeclaration) {
      listener.enterClassDeclaration(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitClassDeclaration) {
      listener.exitClassDeclaration(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitClassDeclaration) {
      return visitor.visitClassDeclaration(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class PrimaryConstructorContext extends antlr.ParserRuleContext {
  public classParameters(): ClassParametersContext {
    return this.getRuleContext(0, ClassParametersContext)!;
  }
  public CONSTRUCTOR(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.CONSTRUCTOR, 0);
  }
  public modifiers(): ModifiersContext | null {
    return this.getRuleContext(0, ModifiersContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_primaryConstructor;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterPrimaryConstructor) {
      listener.enterPrimaryConstructor(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitPrimaryConstructor) {
      listener.exitPrimaryConstructor(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitPrimaryConstructor) {
      return visitor.visitPrimaryConstructor(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ClassBodyContext extends antlr.ParserRuleContext {
  public LCURL(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LCURL, 0)!;
  }
  public classMemberDeclarations(): ClassMemberDeclarationsContext {
    return this.getRuleContext(0, ClassMemberDeclarationsContext)!;
  }
  public RCURL(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RCURL, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_classBody;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterClassBody) {
      listener.enterClassBody(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitClassBody) {
      listener.exitClassBody(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitClassBody) {
      return visitor.visitClassBody(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ClassParametersContext extends antlr.ParserRuleContext {
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public classParameter(): ClassParameterContext[];
  public classParameter(i: number): ClassParameterContext | null;
  public classParameter(i?: number): ClassParameterContext[] | ClassParameterContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ClassParameterContext);
    }

    return this.getRuleContext(i, ClassParameterContext);
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_classParameters;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterClassParameters) {
      listener.enterClassParameters(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitClassParameters) {
      listener.exitClassParameters(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitClassParameters) {
      return visitor.visitClassParameters(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ClassParameterContext extends antlr.ParserRuleContext {
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public COLON(): antlr.TerminalNode {
    return this.getToken(KotlinParser.COLON, 0)!;
  }
  public type(): TypeContext {
    return this.getRuleContext(0, TypeContext)!;
  }
  public modifiers(): ModifiersContext | null {
    return this.getRuleContext(0, ModifiersContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public ASSIGNMENT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ASSIGNMENT, 0);
  }
  public expression(): ExpressionContext | null {
    return this.getRuleContext(0, ExpressionContext);
  }
  public VAL(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.VAL, 0);
  }
  public VAR(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.VAR, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_classParameter;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterClassParameter) {
      listener.enterClassParameter(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitClassParameter) {
      listener.exitClassParameter(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitClassParameter) {
      return visitor.visitClassParameter(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class DelegationSpecifiersContext extends antlr.ParserRuleContext {
  public annotatedDelegationSpecifier(): AnnotatedDelegationSpecifierContext[];
  public annotatedDelegationSpecifier(i: number): AnnotatedDelegationSpecifierContext | null;
  public annotatedDelegationSpecifier(
    i?: number,
  ): AnnotatedDelegationSpecifierContext[] | AnnotatedDelegationSpecifierContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AnnotatedDelegationSpecifierContext);
    }

    return this.getRuleContext(i, AnnotatedDelegationSpecifierContext);
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_delegationSpecifiers;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterDelegationSpecifiers) {
      listener.enterDelegationSpecifiers(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitDelegationSpecifiers) {
      listener.exitDelegationSpecifiers(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitDelegationSpecifiers) {
      return visitor.visitDelegationSpecifiers(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class DelegationSpecifierContext extends antlr.ParserRuleContext {
  public constructorInvocation(): ConstructorInvocationContext | null {
    return this.getRuleContext(0, ConstructorInvocationContext);
  }
  public explicitDelegation(): ExplicitDelegationContext | null {
    return this.getRuleContext(0, ExplicitDelegationContext);
  }
  public userType(): UserTypeContext | null {
    return this.getRuleContext(0, UserTypeContext);
  }
  public functionType(): FunctionTypeContext | null {
    return this.getRuleContext(0, FunctionTypeContext);
  }
  public SUSPEND(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SUSPEND, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_delegationSpecifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterDelegationSpecifier) {
      listener.enterDelegationSpecifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitDelegationSpecifier) {
      listener.exitDelegationSpecifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitDelegationSpecifier) {
      return visitor.visitDelegationSpecifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ConstructorInvocationContext extends antlr.ParserRuleContext {
  public userType(): UserTypeContext {
    return this.getRuleContext(0, UserTypeContext)!;
  }
  public valueArguments(): ValueArgumentsContext {
    return this.getRuleContext(0, ValueArgumentsContext)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_constructorInvocation;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterConstructorInvocation) {
      listener.enterConstructorInvocation(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitConstructorInvocation) {
      listener.exitConstructorInvocation(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitConstructorInvocation) {
      return visitor.visitConstructorInvocation(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AnnotatedDelegationSpecifierContext extends antlr.ParserRuleContext {
  public delegationSpecifier(): DelegationSpecifierContext {
    return this.getRuleContext(0, DelegationSpecifierContext)!;
  }
  public annotation(): AnnotationContext[];
  public annotation(i: number): AnnotationContext | null;
  public annotation(i?: number): AnnotationContext[] | AnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AnnotationContext);
    }

    return this.getRuleContext(i, AnnotationContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_annotatedDelegationSpecifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAnnotatedDelegationSpecifier) {
      listener.enterAnnotatedDelegationSpecifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAnnotatedDelegationSpecifier) {
      listener.exitAnnotatedDelegationSpecifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAnnotatedDelegationSpecifier) {
      return visitor.visitAnnotatedDelegationSpecifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ExplicitDelegationContext extends antlr.ParserRuleContext {
  public BY(): antlr.TerminalNode {
    return this.getToken(KotlinParser.BY, 0)!;
  }
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext)!;
  }
  public userType(): UserTypeContext | null {
    return this.getRuleContext(0, UserTypeContext);
  }
  public functionType(): FunctionTypeContext | null {
    return this.getRuleContext(0, FunctionTypeContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_explicitDelegation;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterExplicitDelegation) {
      listener.enterExplicitDelegation(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitExplicitDelegation) {
      listener.exitExplicitDelegation(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitExplicitDelegation) {
      return visitor.visitExplicitDelegation(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeParametersContext extends antlr.ParserRuleContext {
  public LANGLE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LANGLE, 0)!;
  }
  public typeParameter(): TypeParameterContext[];
  public typeParameter(i: number): TypeParameterContext | null;
  public typeParameter(i?: number): TypeParameterContext[] | TypeParameterContext | null {
    if (i === undefined) {
      return this.getRuleContexts(TypeParameterContext);
    }

    return this.getRuleContext(i, TypeParameterContext);
  }
  public RANGLE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RANGLE, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeParameters;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeParameters) {
      listener.enterTypeParameters(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeParameters) {
      listener.exitTypeParameters(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeParameters) {
      return visitor.visitTypeParameters(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeParameterContext extends antlr.ParserRuleContext {
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public typeParameterModifiers(): TypeParameterModifiersContext | null {
    return this.getRuleContext(0, TypeParameterModifiersContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLON, 0);
  }
  public type(): TypeContext | null {
    return this.getRuleContext(0, TypeContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeParameter;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeParameter) {
      listener.enterTypeParameter(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeParameter) {
      listener.exitTypeParameter(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeParameter) {
      return visitor.visitTypeParameter(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeConstraintsContext extends antlr.ParserRuleContext {
  public WHERE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.WHERE, 0)!;
  }
  public typeConstraint(): TypeConstraintContext[];
  public typeConstraint(i: number): TypeConstraintContext | null;
  public typeConstraint(i?: number): TypeConstraintContext[] | TypeConstraintContext | null {
    if (i === undefined) {
      return this.getRuleContexts(TypeConstraintContext);
    }

    return this.getRuleContext(i, TypeConstraintContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeConstraints;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeConstraints) {
      listener.enterTypeConstraints(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeConstraints) {
      listener.exitTypeConstraints(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeConstraints) {
      return visitor.visitTypeConstraints(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeConstraintContext extends antlr.ParserRuleContext {
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public COLON(): antlr.TerminalNode {
    return this.getToken(KotlinParser.COLON, 0)!;
  }
  public type(): TypeContext {
    return this.getRuleContext(0, TypeContext)!;
  }
  public annotation(): AnnotationContext[];
  public annotation(i: number): AnnotationContext | null;
  public annotation(i?: number): AnnotationContext[] | AnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AnnotationContext);
    }

    return this.getRuleContext(i, AnnotationContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeConstraint;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeConstraint) {
      listener.enterTypeConstraint(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeConstraint) {
      listener.exitTypeConstraint(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeConstraint) {
      return visitor.visitTypeConstraint(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ClassMemberDeclarationsContext extends antlr.ParserRuleContext {
  public classMemberDeclaration(): ClassMemberDeclarationContext[];
  public classMemberDeclaration(i: number): ClassMemberDeclarationContext | null;
  public classMemberDeclaration(i?: number): ClassMemberDeclarationContext[] | ClassMemberDeclarationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ClassMemberDeclarationContext);
    }

    return this.getRuleContext(i, ClassMemberDeclarationContext);
  }
  public semis(): SemisContext[];
  public semis(i: number): SemisContext | null;
  public semis(i?: number): SemisContext[] | SemisContext | null {
    if (i === undefined) {
      return this.getRuleContexts(SemisContext);
    }

    return this.getRuleContext(i, SemisContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_classMemberDeclarations;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterClassMemberDeclarations) {
      listener.enterClassMemberDeclarations(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitClassMemberDeclarations) {
      listener.exitClassMemberDeclarations(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitClassMemberDeclarations) {
      return visitor.visitClassMemberDeclarations(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ClassMemberDeclarationContext extends antlr.ParserRuleContext {
  public declaration(): DeclarationContext | null {
    return this.getRuleContext(0, DeclarationContext);
  }
  public companionObject(): CompanionObjectContext | null {
    return this.getRuleContext(0, CompanionObjectContext);
  }
  public anonymousInitializer(): AnonymousInitializerContext | null {
    return this.getRuleContext(0, AnonymousInitializerContext);
  }
  public secondaryConstructor(): SecondaryConstructorContext | null {
    return this.getRuleContext(0, SecondaryConstructorContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_classMemberDeclaration;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterClassMemberDeclaration) {
      listener.enterClassMemberDeclaration(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitClassMemberDeclaration) {
      listener.exitClassMemberDeclaration(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitClassMemberDeclaration) {
      return visitor.visitClassMemberDeclaration(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AnonymousInitializerContext extends antlr.ParserRuleContext {
  public INIT(): antlr.TerminalNode {
    return this.getToken(KotlinParser.INIT, 0)!;
  }
  public block(): BlockContext {
    return this.getRuleContext(0, BlockContext)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_anonymousInitializer;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAnonymousInitializer) {
      listener.enterAnonymousInitializer(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAnonymousInitializer) {
      listener.exitAnonymousInitializer(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAnonymousInitializer) {
      return visitor.visitAnonymousInitializer(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class CompanionObjectContext extends antlr.ParserRuleContext {
  public COMPANION(): antlr.TerminalNode {
    return this.getToken(KotlinParser.COMPANION, 0)!;
  }
  public OBJECT(): antlr.TerminalNode {
    return this.getToken(KotlinParser.OBJECT, 0)!;
  }
  public modifiers(): ModifiersContext | null {
    return this.getRuleContext(0, ModifiersContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public DATA(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DATA, 0);
  }
  public simpleIdentifier(): SimpleIdentifierContext | null {
    return this.getRuleContext(0, SimpleIdentifierContext);
  }
  public COLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLON, 0);
  }
  public delegationSpecifiers(): DelegationSpecifiersContext | null {
    return this.getRuleContext(0, DelegationSpecifiersContext);
  }
  public classBody(): ClassBodyContext | null {
    return this.getRuleContext(0, ClassBodyContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_companionObject;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterCompanionObject) {
      listener.enterCompanionObject(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitCompanionObject) {
      listener.exitCompanionObject(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitCompanionObject) {
      return visitor.visitCompanionObject(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class FunctionValueParametersContext extends antlr.ParserRuleContext {
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public functionValueParameter(): FunctionValueParameterContext[];
  public functionValueParameter(i: number): FunctionValueParameterContext | null;
  public functionValueParameter(i?: number): FunctionValueParameterContext[] | FunctionValueParameterContext | null {
    if (i === undefined) {
      return this.getRuleContexts(FunctionValueParameterContext);
    }

    return this.getRuleContext(i, FunctionValueParameterContext);
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_functionValueParameters;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterFunctionValueParameters) {
      listener.enterFunctionValueParameters(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitFunctionValueParameters) {
      listener.exitFunctionValueParameters(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitFunctionValueParameters) {
      return visitor.visitFunctionValueParameters(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class FunctionValueParameterContext extends antlr.ParserRuleContext {
  public parameter(): ParameterContext {
    return this.getRuleContext(0, ParameterContext)!;
  }
  public parameterModifiers(): ParameterModifiersContext | null {
    return this.getRuleContext(0, ParameterModifiersContext);
  }
  public ASSIGNMENT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ASSIGNMENT, 0);
  }
  public expression(): ExpressionContext | null {
    return this.getRuleContext(0, ExpressionContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_functionValueParameter;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterFunctionValueParameter) {
      listener.enterFunctionValueParameter(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitFunctionValueParameter) {
      listener.exitFunctionValueParameter(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitFunctionValueParameter) {
      return visitor.visitFunctionValueParameter(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class FunctionDeclarationContext extends antlr.ParserRuleContext {
  public FUN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.FUN, 0)!;
  }
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public functionValueParameters(): FunctionValueParametersContext {
    return this.getRuleContext(0, FunctionValueParametersContext)!;
  }
  public modifiers(): ModifiersContext | null {
    return this.getRuleContext(0, ModifiersContext);
  }
  public typeParameters(): TypeParametersContext | null {
    return this.getRuleContext(0, TypeParametersContext);
  }
  public receiverType(): ReceiverTypeContext | null {
    return this.getRuleContext(0, ReceiverTypeContext);
  }
  public DOT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DOT, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLON, 0);
  }
  public type(): TypeContext | null {
    return this.getRuleContext(0, TypeContext);
  }
  public typeConstraints(): TypeConstraintsContext | null {
    return this.getRuleContext(0, TypeConstraintsContext);
  }
  public functionBody(): FunctionBodyContext | null {
    return this.getRuleContext(0, FunctionBodyContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_functionDeclaration;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterFunctionDeclaration) {
      listener.enterFunctionDeclaration(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitFunctionDeclaration) {
      listener.exitFunctionDeclaration(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitFunctionDeclaration) {
      return visitor.visitFunctionDeclaration(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class FunctionBodyContext extends antlr.ParserRuleContext {
  public block(): BlockContext | null {
    return this.getRuleContext(0, BlockContext);
  }
  public ASSIGNMENT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ASSIGNMENT, 0);
  }
  public expression(): ExpressionContext | null {
    return this.getRuleContext(0, ExpressionContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_functionBody;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterFunctionBody) {
      listener.enterFunctionBody(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitFunctionBody) {
      listener.exitFunctionBody(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitFunctionBody) {
      return visitor.visitFunctionBody(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class VariableDeclarationContext extends antlr.ParserRuleContext {
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public annotation(): AnnotationContext[];
  public annotation(i: number): AnnotationContext | null;
  public annotation(i?: number): AnnotationContext[] | AnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AnnotationContext);
    }

    return this.getRuleContext(i, AnnotationContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLON, 0);
  }
  public type(): TypeContext | null {
    return this.getRuleContext(0, TypeContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_variableDeclaration;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterVariableDeclaration) {
      listener.enterVariableDeclaration(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitVariableDeclaration) {
      listener.exitVariableDeclaration(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitVariableDeclaration) {
      return visitor.visitVariableDeclaration(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class MultiVariableDeclarationContext extends antlr.ParserRuleContext {
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public variableDeclaration(): VariableDeclarationContext[];
  public variableDeclaration(i: number): VariableDeclarationContext | null;
  public variableDeclaration(i?: number): VariableDeclarationContext[] | VariableDeclarationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(VariableDeclarationContext);
    }

    return this.getRuleContext(i, VariableDeclarationContext);
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_multiVariableDeclaration;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterMultiVariableDeclaration) {
      listener.enterMultiVariableDeclaration(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitMultiVariableDeclaration) {
      listener.exitMultiVariableDeclaration(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitMultiVariableDeclaration) {
      return visitor.visitMultiVariableDeclaration(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class PropertyDeclarationContext extends antlr.ParserRuleContext {
  public VAL(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.VAL, 0);
  }
  public VAR(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.VAR, 0);
  }
  public modifiers(): ModifiersContext | null {
    return this.getRuleContext(0, ModifiersContext);
  }
  public typeParameters(): TypeParametersContext | null {
    return this.getRuleContext(0, TypeParametersContext);
  }
  public receiverType(): ReceiverTypeContext | null {
    return this.getRuleContext(0, ReceiverTypeContext);
  }
  public DOT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DOT, 0);
  }
  public typeConstraints(): TypeConstraintsContext | null {
    return this.getRuleContext(0, TypeConstraintsContext);
  }
  public SEMICOLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SEMICOLON, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public multiVariableDeclaration(): MultiVariableDeclarationContext | null {
    return this.getRuleContext(0, MultiVariableDeclarationContext);
  }
  public variableDeclaration(): VariableDeclarationContext | null {
    return this.getRuleContext(0, VariableDeclarationContext);
  }
  public ASSIGNMENT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ASSIGNMENT, 0);
  }
  public expression(): ExpressionContext | null {
    return this.getRuleContext(0, ExpressionContext);
  }
  public propertyDelegate(): PropertyDelegateContext | null {
    return this.getRuleContext(0, PropertyDelegateContext);
  }
  public getter(): GetterContext | null {
    return this.getRuleContext(0, GetterContext);
  }
  public setter(): SetterContext | null {
    return this.getRuleContext(0, SetterContext);
  }
  public semi(): SemiContext | null {
    return this.getRuleContext(0, SemiContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_propertyDeclaration;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterPropertyDeclaration) {
      listener.enterPropertyDeclaration(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitPropertyDeclaration) {
      listener.exitPropertyDeclaration(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitPropertyDeclaration) {
      return visitor.visitPropertyDeclaration(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class PropertyDelegateContext extends antlr.ParserRuleContext {
  public BY(): antlr.TerminalNode {
    return this.getToken(KotlinParser.BY, 0)!;
  }
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_propertyDelegate;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterPropertyDelegate) {
      listener.enterPropertyDelegate(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitPropertyDelegate) {
      listener.exitPropertyDelegate(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitPropertyDelegate) {
      return visitor.visitPropertyDelegate(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class GetterContext extends antlr.ParserRuleContext {
  public GET(): antlr.TerminalNode {
    return this.getToken(KotlinParser.GET, 0)!;
  }
  public modifiers(): ModifiersContext | null {
    return this.getRuleContext(0, ModifiersContext);
  }
  public LPAREN(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.LPAREN, 0);
  }
  public RPAREN(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.RPAREN, 0);
  }
  public functionBody(): FunctionBodyContext | null {
    return this.getRuleContext(0, FunctionBodyContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLON, 0);
  }
  public type(): TypeContext | null {
    return this.getRuleContext(0, TypeContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_getter;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterGetter) {
      listener.enterGetter(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitGetter) {
      listener.exitGetter(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitGetter) {
      return visitor.visitGetter(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class SetterContext extends antlr.ParserRuleContext {
  public SET(): antlr.TerminalNode {
    return this.getToken(KotlinParser.SET, 0)!;
  }
  public modifiers(): ModifiersContext | null {
    return this.getRuleContext(0, ModifiersContext);
  }
  public LPAREN(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.LPAREN, 0);
  }
  public functionValueParameterWithOptionalType(): FunctionValueParameterWithOptionalTypeContext | null {
    return this.getRuleContext(0, FunctionValueParameterWithOptionalTypeContext);
  }
  public RPAREN(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.RPAREN, 0);
  }
  public functionBody(): FunctionBodyContext | null {
    return this.getRuleContext(0, FunctionBodyContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COMMA(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COMMA, 0);
  }
  public COLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLON, 0);
  }
  public type(): TypeContext | null {
    return this.getRuleContext(0, TypeContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_setter;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterSetter) {
      listener.enterSetter(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitSetter) {
      listener.exitSetter(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitSetter) {
      return visitor.visitSetter(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ParametersWithOptionalTypeContext extends antlr.ParserRuleContext {
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public functionValueParameterWithOptionalType(): FunctionValueParameterWithOptionalTypeContext[];
  public functionValueParameterWithOptionalType(i: number): FunctionValueParameterWithOptionalTypeContext | null;
  public functionValueParameterWithOptionalType(
    i?: number,
  ): FunctionValueParameterWithOptionalTypeContext[] | FunctionValueParameterWithOptionalTypeContext | null {
    if (i === undefined) {
      return this.getRuleContexts(FunctionValueParameterWithOptionalTypeContext);
    }

    return this.getRuleContext(i, FunctionValueParameterWithOptionalTypeContext);
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_parametersWithOptionalType;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterParametersWithOptionalType) {
      listener.enterParametersWithOptionalType(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitParametersWithOptionalType) {
      listener.exitParametersWithOptionalType(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitParametersWithOptionalType) {
      return visitor.visitParametersWithOptionalType(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class FunctionValueParameterWithOptionalTypeContext extends antlr.ParserRuleContext {
  public parameterWithOptionalType(): ParameterWithOptionalTypeContext {
    return this.getRuleContext(0, ParameterWithOptionalTypeContext)!;
  }
  public parameterModifiers(): ParameterModifiersContext | null {
    return this.getRuleContext(0, ParameterModifiersContext);
  }
  public ASSIGNMENT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ASSIGNMENT, 0);
  }
  public expression(): ExpressionContext | null {
    return this.getRuleContext(0, ExpressionContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_functionValueParameterWithOptionalType;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterFunctionValueParameterWithOptionalType) {
      listener.enterFunctionValueParameterWithOptionalType(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitFunctionValueParameterWithOptionalType) {
      listener.exitFunctionValueParameterWithOptionalType(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitFunctionValueParameterWithOptionalType) {
      return visitor.visitFunctionValueParameterWithOptionalType(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ParameterWithOptionalTypeContext extends antlr.ParserRuleContext {
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLON, 0);
  }
  public type(): TypeContext | null {
    return this.getRuleContext(0, TypeContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_parameterWithOptionalType;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterParameterWithOptionalType) {
      listener.enterParameterWithOptionalType(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitParameterWithOptionalType) {
      listener.exitParameterWithOptionalType(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitParameterWithOptionalType) {
      return visitor.visitParameterWithOptionalType(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ParameterContext extends antlr.ParserRuleContext {
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public COLON(): antlr.TerminalNode {
    return this.getToken(KotlinParser.COLON, 0)!;
  }
  public type(): TypeContext {
    return this.getRuleContext(0, TypeContext)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_parameter;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterParameter) {
      listener.enterParameter(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitParameter) {
      listener.exitParameter(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitParameter) {
      return visitor.visitParameter(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ObjectDeclarationContext extends antlr.ParserRuleContext {
  public OBJECT(): antlr.TerminalNode {
    return this.getToken(KotlinParser.OBJECT, 0)!;
  }
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public modifiers(): ModifiersContext | null {
    return this.getRuleContext(0, ModifiersContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLON, 0);
  }
  public delegationSpecifiers(): DelegationSpecifiersContext | null {
    return this.getRuleContext(0, DelegationSpecifiersContext);
  }
  public classBody(): ClassBodyContext | null {
    return this.getRuleContext(0, ClassBodyContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_objectDeclaration;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterObjectDeclaration) {
      listener.enterObjectDeclaration(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitObjectDeclaration) {
      listener.exitObjectDeclaration(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitObjectDeclaration) {
      return visitor.visitObjectDeclaration(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class SecondaryConstructorContext extends antlr.ParserRuleContext {
  public CONSTRUCTOR(): antlr.TerminalNode {
    return this.getToken(KotlinParser.CONSTRUCTOR, 0)!;
  }
  public functionValueParameters(): FunctionValueParametersContext {
    return this.getRuleContext(0, FunctionValueParametersContext)!;
  }
  public modifiers(): ModifiersContext | null {
    return this.getRuleContext(0, ModifiersContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLON, 0);
  }
  public constructorDelegationCall(): ConstructorDelegationCallContext | null {
    return this.getRuleContext(0, ConstructorDelegationCallContext);
  }
  public block(): BlockContext | null {
    return this.getRuleContext(0, BlockContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_secondaryConstructor;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterSecondaryConstructor) {
      listener.enterSecondaryConstructor(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitSecondaryConstructor) {
      listener.exitSecondaryConstructor(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitSecondaryConstructor) {
      return visitor.visitSecondaryConstructor(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ConstructorDelegationCallContext extends antlr.ParserRuleContext {
  public valueArguments(): ValueArgumentsContext {
    return this.getRuleContext(0, ValueArgumentsContext)!;
  }
  public THIS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.THIS, 0);
  }
  public SUPER(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SUPER, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_constructorDelegationCall;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterConstructorDelegationCall) {
      listener.enterConstructorDelegationCall(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitConstructorDelegationCall) {
      listener.exitConstructorDelegationCall(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitConstructorDelegationCall) {
      return visitor.visitConstructorDelegationCall(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class EnumClassBodyContext extends antlr.ParserRuleContext {
  public LCURL(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LCURL, 0)!;
  }
  public RCURL(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RCURL, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public enumEntries(): EnumEntriesContext | null {
    return this.getRuleContext(0, EnumEntriesContext);
  }
  public SEMICOLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SEMICOLON, 0);
  }
  public classMemberDeclarations(): ClassMemberDeclarationsContext | null {
    return this.getRuleContext(0, ClassMemberDeclarationsContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_enumClassBody;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterEnumClassBody) {
      listener.enterEnumClassBody(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitEnumClassBody) {
      listener.exitEnumClassBody(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitEnumClassBody) {
      return visitor.visitEnumClassBody(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class EnumEntriesContext extends antlr.ParserRuleContext {
  public enumEntry(): EnumEntryContext[];
  public enumEntry(i: number): EnumEntryContext | null;
  public enumEntry(i?: number): EnumEntryContext[] | EnumEntryContext | null {
    if (i === undefined) {
      return this.getRuleContexts(EnumEntryContext);
    }

    return this.getRuleContext(i, EnumEntryContext);
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_enumEntries;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterEnumEntries) {
      listener.enterEnumEntries(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitEnumEntries) {
      listener.exitEnumEntries(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitEnumEntries) {
      return visitor.visitEnumEntries(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class EnumEntryContext extends antlr.ParserRuleContext {
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public modifiers(): ModifiersContext | null {
    return this.getRuleContext(0, ModifiersContext);
  }
  public valueArguments(): ValueArgumentsContext | null {
    return this.getRuleContext(0, ValueArgumentsContext);
  }
  public classBody(): ClassBodyContext | null {
    return this.getRuleContext(0, ClassBodyContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_enumEntry;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterEnumEntry) {
      listener.enterEnumEntry(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitEnumEntry) {
      listener.exitEnumEntry(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitEnumEntry) {
      return visitor.visitEnumEntry(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeContext extends antlr.ParserRuleContext {
  public functionType(): FunctionTypeContext | null {
    return this.getRuleContext(0, FunctionTypeContext);
  }
  public parenthesizedType(): ParenthesizedTypeContext | null {
    return this.getRuleContext(0, ParenthesizedTypeContext);
  }
  public nullableType(): NullableTypeContext | null {
    return this.getRuleContext(0, NullableTypeContext);
  }
  public typeReference(): TypeReferenceContext | null {
    return this.getRuleContext(0, TypeReferenceContext);
  }
  public definitelyNonNullableType(): DefinitelyNonNullableTypeContext | null {
    return this.getRuleContext(0, DefinitelyNonNullableTypeContext);
  }
  public typeModifiers(): TypeModifiersContext | null {
    return this.getRuleContext(0, TypeModifiersContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_type;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterType) {
      listener.enterType(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitType) {
      listener.exitType(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitType) {
      return visitor.visitType(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeReferenceContext extends antlr.ParserRuleContext {
  public userType(): UserTypeContext | null {
    return this.getRuleContext(0, UserTypeContext);
  }
  public DYNAMIC(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DYNAMIC, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeReference;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeReference) {
      listener.enterTypeReference(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeReference) {
      listener.exitTypeReference(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeReference) {
      return visitor.visitTypeReference(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class NullableTypeContext extends antlr.ParserRuleContext {
  public typeReference(): TypeReferenceContext | null {
    return this.getRuleContext(0, TypeReferenceContext);
  }
  public parenthesizedType(): ParenthesizedTypeContext | null {
    return this.getRuleContext(0, ParenthesizedTypeContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public quest(): QuestContext[];
  public quest(i: number): QuestContext | null;
  public quest(i?: number): QuestContext[] | QuestContext | null {
    if (i === undefined) {
      return this.getRuleContexts(QuestContext);
    }

    return this.getRuleContext(i, QuestContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_nullableType;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterNullableType) {
      listener.enterNullableType(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitNullableType) {
      listener.exitNullableType(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitNullableType) {
      return visitor.visitNullableType(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class QuestContext extends antlr.ParserRuleContext {
  public QUEST_NO_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.QUEST_NO_WS, 0);
  }
  public QUEST_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.QUEST_WS, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_quest;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterQuest) {
      listener.enterQuest(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitQuest) {
      listener.exitQuest(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitQuest) {
      return visitor.visitQuest(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class UserTypeContext extends antlr.ParserRuleContext {
  public simpleUserType(): SimpleUserTypeContext[];
  public simpleUserType(i: number): SimpleUserTypeContext | null;
  public simpleUserType(i?: number): SimpleUserTypeContext[] | SimpleUserTypeContext | null {
    if (i === undefined) {
      return this.getRuleContexts(SimpleUserTypeContext);
    }

    return this.getRuleContext(i, SimpleUserTypeContext);
  }
  public DOT(): antlr.TerminalNode[];
  public DOT(i: number): antlr.TerminalNode | null;
  public DOT(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.DOT);
    } else {
      return this.getToken(KotlinParser.DOT, i);
    }
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_userType;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterUserType) {
      listener.enterUserType(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitUserType) {
      listener.exitUserType(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitUserType) {
      return visitor.visitUserType(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class SimpleUserTypeContext extends antlr.ParserRuleContext {
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public typeArguments(): TypeArgumentsContext | null {
    return this.getRuleContext(0, TypeArgumentsContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_simpleUserType;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterSimpleUserType) {
      listener.enterSimpleUserType(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitSimpleUserType) {
      listener.exitSimpleUserType(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitSimpleUserType) {
      return visitor.visitSimpleUserType(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeProjectionContext extends antlr.ParserRuleContext {
  public type(): TypeContext | null {
    return this.getRuleContext(0, TypeContext);
  }
  public typeProjectionModifiers(): TypeProjectionModifiersContext | null {
    return this.getRuleContext(0, TypeProjectionModifiersContext);
  }
  public MULT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.MULT, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeProjection;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeProjection) {
      listener.enterTypeProjection(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeProjection) {
      listener.exitTypeProjection(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeProjection) {
      return visitor.visitTypeProjection(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeProjectionModifiersContext extends antlr.ParserRuleContext {
  public typeProjectionModifier(): TypeProjectionModifierContext[];
  public typeProjectionModifier(i: number): TypeProjectionModifierContext | null;
  public typeProjectionModifier(i?: number): TypeProjectionModifierContext[] | TypeProjectionModifierContext | null {
    if (i === undefined) {
      return this.getRuleContexts(TypeProjectionModifierContext);
    }

    return this.getRuleContext(i, TypeProjectionModifierContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeProjectionModifiers;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeProjectionModifiers) {
      listener.enterTypeProjectionModifiers(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeProjectionModifiers) {
      listener.exitTypeProjectionModifiers(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeProjectionModifiers) {
      return visitor.visitTypeProjectionModifiers(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeProjectionModifierContext extends antlr.ParserRuleContext {
  public varianceModifier(): VarianceModifierContext | null {
    return this.getRuleContext(0, VarianceModifierContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public annotation(): AnnotationContext | null {
    return this.getRuleContext(0, AnnotationContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeProjectionModifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeProjectionModifier) {
      listener.enterTypeProjectionModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeProjectionModifier) {
      listener.exitTypeProjectionModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeProjectionModifier) {
      return visitor.visitTypeProjectionModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class FunctionTypeContext extends antlr.ParserRuleContext {
  public functionTypeParameters(): FunctionTypeParametersContext {
    return this.getRuleContext(0, FunctionTypeParametersContext)!;
  }
  public ARROW(): antlr.TerminalNode {
    return this.getToken(KotlinParser.ARROW, 0)!;
  }
  public type(): TypeContext {
    return this.getRuleContext(0, TypeContext)!;
  }
  public receiverType(): ReceiverTypeContext | null {
    return this.getRuleContext(0, ReceiverTypeContext);
  }
  public DOT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DOT, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_functionType;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterFunctionType) {
      listener.enterFunctionType(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitFunctionType) {
      listener.exitFunctionType(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitFunctionType) {
      return visitor.visitFunctionType(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class FunctionTypeParametersContext extends antlr.ParserRuleContext {
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public parameter(): ParameterContext[];
  public parameter(i: number): ParameterContext | null;
  public parameter(i?: number): ParameterContext[] | ParameterContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ParameterContext);
    }

    return this.getRuleContext(i, ParameterContext);
  }
  public type_(): TypeContext[];
  public type_(i: number): TypeContext | null;
  public type_(i?: number): TypeContext[] | TypeContext | null {
    if (i === undefined) {
      return this.getRuleContexts(TypeContext);
    }

    return this.getRuleContext(i, TypeContext);
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_functionTypeParameters;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterFunctionTypeParameters) {
      listener.enterFunctionTypeParameters(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitFunctionTypeParameters) {
      listener.exitFunctionTypeParameters(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitFunctionTypeParameters) {
      return visitor.visitFunctionTypeParameters(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ParenthesizedTypeContext extends antlr.ParserRuleContext {
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public type(): TypeContext {
    return this.getRuleContext(0, TypeContext)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_parenthesizedType;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterParenthesizedType) {
      listener.enterParenthesizedType(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitParenthesizedType) {
      listener.exitParenthesizedType(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitParenthesizedType) {
      return visitor.visitParenthesizedType(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ReceiverTypeContext extends antlr.ParserRuleContext {
  public parenthesizedType(): ParenthesizedTypeContext | null {
    return this.getRuleContext(0, ParenthesizedTypeContext);
  }
  public nullableType(): NullableTypeContext | null {
    return this.getRuleContext(0, NullableTypeContext);
  }
  public typeReference(): TypeReferenceContext | null {
    return this.getRuleContext(0, TypeReferenceContext);
  }
  public typeModifiers(): TypeModifiersContext | null {
    return this.getRuleContext(0, TypeModifiersContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_receiverType;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterReceiverType) {
      listener.enterReceiverType(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitReceiverType) {
      listener.exitReceiverType(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitReceiverType) {
      return visitor.visitReceiverType(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ParenthesizedUserTypeContext extends antlr.ParserRuleContext {
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public userType(): UserTypeContext | null {
    return this.getRuleContext(0, UserTypeContext);
  }
  public parenthesizedUserType(): ParenthesizedUserTypeContext | null {
    return this.getRuleContext(0, ParenthesizedUserTypeContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_parenthesizedUserType;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterParenthesizedUserType) {
      listener.enterParenthesizedUserType(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitParenthesizedUserType) {
      listener.exitParenthesizedUserType(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitParenthesizedUserType) {
      return visitor.visitParenthesizedUserType(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class DefinitelyNonNullableTypeContext extends antlr.ParserRuleContext {
  public AMP(): antlr.TerminalNode {
    return this.getToken(KotlinParser.AMP, 0)!;
  }
  public userType(): UserTypeContext[];
  public userType(i: number): UserTypeContext | null;
  public userType(i?: number): UserTypeContext[] | UserTypeContext | null {
    if (i === undefined) {
      return this.getRuleContexts(UserTypeContext);
    }

    return this.getRuleContext(i, UserTypeContext);
  }
  public parenthesizedUserType(): ParenthesizedUserTypeContext[];
  public parenthesizedUserType(i: number): ParenthesizedUserTypeContext | null;
  public parenthesizedUserType(i?: number): ParenthesizedUserTypeContext[] | ParenthesizedUserTypeContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ParenthesizedUserTypeContext);
    }

    return this.getRuleContext(i, ParenthesizedUserTypeContext);
  }
  public typeModifiers(): TypeModifiersContext[];
  public typeModifiers(i: number): TypeModifiersContext | null;
  public typeModifiers(i?: number): TypeModifiersContext[] | TypeModifiersContext | null {
    if (i === undefined) {
      return this.getRuleContexts(TypeModifiersContext);
    }

    return this.getRuleContext(i, TypeModifiersContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_definitelyNonNullableType;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterDefinitelyNonNullableType) {
      listener.enterDefinitelyNonNullableType(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitDefinitelyNonNullableType) {
      listener.exitDefinitelyNonNullableType(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitDefinitelyNonNullableType) {
      return visitor.visitDefinitelyNonNullableType(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class StatementsContext extends antlr.ParserRuleContext {
  public statement(): StatementContext[];
  public statement(i: number): StatementContext | null;
  public statement(i?: number): StatementContext[] | StatementContext | null {
    if (i === undefined) {
      return this.getRuleContexts(StatementContext);
    }

    return this.getRuleContext(i, StatementContext);
  }
  public semis(): SemisContext[];
  public semis(i: number): SemisContext | null;
  public semis(i?: number): SemisContext[] | SemisContext | null {
    if (i === undefined) {
      return this.getRuleContexts(SemisContext);
    }

    return this.getRuleContext(i, SemisContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_statements;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterStatements) {
      listener.enterStatements(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitStatements) {
      listener.exitStatements(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitStatements) {
      return visitor.visitStatements(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class StatementContext extends antlr.ParserRuleContext {
  public declaration(): DeclarationContext | null {
    return this.getRuleContext(0, DeclarationContext);
  }
  public assignment(): AssignmentContext | null {
    return this.getRuleContext(0, AssignmentContext);
  }
  public loopStatement(): LoopStatementContext | null {
    return this.getRuleContext(0, LoopStatementContext);
  }
  public expression(): ExpressionContext | null {
    return this.getRuleContext(0, ExpressionContext);
  }
  public label(): LabelContext[];
  public label(i: number): LabelContext | null;
  public label(i?: number): LabelContext[] | LabelContext | null {
    if (i === undefined) {
      return this.getRuleContexts(LabelContext);
    }

    return this.getRuleContext(i, LabelContext);
  }
  public annotation(): AnnotationContext[];
  public annotation(i: number): AnnotationContext | null;
  public annotation(i?: number): AnnotationContext[] | AnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AnnotationContext);
    }

    return this.getRuleContext(i, AnnotationContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_statement;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterStatement) {
      listener.enterStatement(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitStatement) {
      listener.exitStatement(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitStatement) {
      return visitor.visitStatement(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class LabelContext extends antlr.ParserRuleContext {
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public AT_NO_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.AT_NO_WS, 0);
  }
  public AT_POST_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.AT_POST_WS, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_label;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterLabel) {
      listener.enterLabel(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitLabel) {
      listener.exitLabel(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitLabel) {
      return visitor.visitLabel(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ControlStructureBodyContext extends antlr.ParserRuleContext {
  public block(): BlockContext | null {
    return this.getRuleContext(0, BlockContext);
  }
  public statement(): StatementContext | null {
    return this.getRuleContext(0, StatementContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_controlStructureBody;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterControlStructureBody) {
      listener.enterControlStructureBody(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitControlStructureBody) {
      listener.exitControlStructureBody(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitControlStructureBody) {
      return visitor.visitControlStructureBody(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class BlockContext extends antlr.ParserRuleContext {
  public LCURL(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LCURL, 0)!;
  }
  public statements(): StatementsContext {
    return this.getRuleContext(0, StatementsContext)!;
  }
  public RCURL(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RCURL, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_block;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterBlock) {
      listener.enterBlock(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitBlock) {
      listener.exitBlock(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitBlock) {
      return visitor.visitBlock(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class LoopStatementContext extends antlr.ParserRuleContext {
  public forStatement(): ForStatementContext | null {
    return this.getRuleContext(0, ForStatementContext);
  }
  public whileStatement(): WhileStatementContext | null {
    return this.getRuleContext(0, WhileStatementContext);
  }
  public doWhileStatement(): DoWhileStatementContext | null {
    return this.getRuleContext(0, DoWhileStatementContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_loopStatement;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterLoopStatement) {
      listener.enterLoopStatement(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitLoopStatement) {
      listener.exitLoopStatement(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitLoopStatement) {
      return visitor.visitLoopStatement(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ForStatementContext extends antlr.ParserRuleContext {
  public FOR(): antlr.TerminalNode {
    return this.getToken(KotlinParser.FOR, 0)!;
  }
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public IN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.IN, 0)!;
  }
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public variableDeclaration(): VariableDeclarationContext | null {
    return this.getRuleContext(0, VariableDeclarationContext);
  }
  public multiVariableDeclaration(): MultiVariableDeclarationContext | null {
    return this.getRuleContext(0, MultiVariableDeclarationContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public annotation(): AnnotationContext[];
  public annotation(i: number): AnnotationContext | null;
  public annotation(i?: number): AnnotationContext[] | AnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AnnotationContext);
    }

    return this.getRuleContext(i, AnnotationContext);
  }
  public controlStructureBody(): ControlStructureBodyContext | null {
    return this.getRuleContext(0, ControlStructureBodyContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_forStatement;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterForStatement) {
      listener.enterForStatement(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitForStatement) {
      listener.exitForStatement(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitForStatement) {
      return visitor.visitForStatement(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class WhileStatementContext extends antlr.ParserRuleContext {
  public WHILE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.WHILE, 0)!;
  }
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public controlStructureBody(): ControlStructureBodyContext | null {
    return this.getRuleContext(0, ControlStructureBodyContext);
  }
  public SEMICOLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SEMICOLON, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_whileStatement;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterWhileStatement) {
      listener.enterWhileStatement(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitWhileStatement) {
      listener.exitWhileStatement(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitWhileStatement) {
      return visitor.visitWhileStatement(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class DoWhileStatementContext extends antlr.ParserRuleContext {
  public DO(): antlr.TerminalNode {
    return this.getToken(KotlinParser.DO, 0)!;
  }
  public WHILE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.WHILE, 0)!;
  }
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public controlStructureBody(): ControlStructureBodyContext | null {
    return this.getRuleContext(0, ControlStructureBodyContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_doWhileStatement;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterDoWhileStatement) {
      listener.enterDoWhileStatement(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitDoWhileStatement) {
      listener.exitDoWhileStatement(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitDoWhileStatement) {
      return visitor.visitDoWhileStatement(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AssignmentContext extends antlr.ParserRuleContext {
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext)!;
  }
  public directlyAssignableExpression(): DirectlyAssignableExpressionContext | null {
    return this.getRuleContext(0, DirectlyAssignableExpressionContext);
  }
  public ASSIGNMENT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ASSIGNMENT, 0);
  }
  public assignableExpression(): AssignableExpressionContext | null {
    return this.getRuleContext(0, AssignableExpressionContext);
  }
  public assignmentAndOperator(): AssignmentAndOperatorContext | null {
    return this.getRuleContext(0, AssignmentAndOperatorContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_assignment;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAssignment) {
      listener.enterAssignment(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAssignment) {
      listener.exitAssignment(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAssignment) {
      return visitor.visitAssignment(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class SemiContext extends antlr.ParserRuleContext {
  public SEMICOLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SEMICOLON, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_semi;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterSemi) {
      listener.enterSemi(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitSemi) {
      listener.exitSemi(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitSemi) {
      return visitor.visitSemi(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class SemisContext extends antlr.ParserRuleContext {
  public SEMICOLON(): antlr.TerminalNode[];
  public SEMICOLON(i: number): antlr.TerminalNode | null;
  public SEMICOLON(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.SEMICOLON);
    } else {
      return this.getToken(KotlinParser.SEMICOLON, i);
    }
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_semis;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterSemis) {
      listener.enterSemis(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitSemis) {
      listener.exitSemis(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitSemis) {
      return visitor.visitSemis(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ExpressionContext extends antlr.ParserRuleContext {
  public disjunction(): DisjunctionContext {
    return this.getRuleContext(0, DisjunctionContext)!;
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_expression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterExpression) {
      listener.enterExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitExpression) {
      listener.exitExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitExpression) {
      return visitor.visitExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class DisjunctionContext extends antlr.ParserRuleContext {
  public conjunction(): ConjunctionContext[];
  public conjunction(i: number): ConjunctionContext | null;
  public conjunction(i?: number): ConjunctionContext[] | ConjunctionContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ConjunctionContext);
    }

    return this.getRuleContext(i, ConjunctionContext);
  }
  public DISJ(): antlr.TerminalNode[];
  public DISJ(i: number): antlr.TerminalNode | null;
  public DISJ(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.DISJ);
    } else {
      return this.getToken(KotlinParser.DISJ, i);
    }
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_disjunction;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterDisjunction) {
      listener.enterDisjunction(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitDisjunction) {
      listener.exitDisjunction(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitDisjunction) {
      return visitor.visitDisjunction(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ConjunctionContext extends antlr.ParserRuleContext {
  public equality(): EqualityContext[];
  public equality(i: number): EqualityContext | null;
  public equality(i?: number): EqualityContext[] | EqualityContext | null {
    if (i === undefined) {
      return this.getRuleContexts(EqualityContext);
    }

    return this.getRuleContext(i, EqualityContext);
  }
  public CONJ(): antlr.TerminalNode[];
  public CONJ(i: number): antlr.TerminalNode | null;
  public CONJ(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.CONJ);
    } else {
      return this.getToken(KotlinParser.CONJ, i);
    }
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_conjunction;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterConjunction) {
      listener.enterConjunction(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitConjunction) {
      listener.exitConjunction(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitConjunction) {
      return visitor.visitConjunction(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class EqualityContext extends antlr.ParserRuleContext {
  public comparison(): ComparisonContext[];
  public comparison(i: number): ComparisonContext | null;
  public comparison(i?: number): ComparisonContext[] | ComparisonContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ComparisonContext);
    }

    return this.getRuleContext(i, ComparisonContext);
  }
  public equalityOperator(): EqualityOperatorContext[];
  public equalityOperator(i: number): EqualityOperatorContext | null;
  public equalityOperator(i?: number): EqualityOperatorContext[] | EqualityOperatorContext | null {
    if (i === undefined) {
      return this.getRuleContexts(EqualityOperatorContext);
    }

    return this.getRuleContext(i, EqualityOperatorContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_equality;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterEquality) {
      listener.enterEquality(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitEquality) {
      listener.exitEquality(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitEquality) {
      return visitor.visitEquality(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ComparisonContext extends antlr.ParserRuleContext {
  public genericCallLikeComparison(): GenericCallLikeComparisonContext[];
  public genericCallLikeComparison(i: number): GenericCallLikeComparisonContext | null;
  public genericCallLikeComparison(
    i?: number,
  ): GenericCallLikeComparisonContext[] | GenericCallLikeComparisonContext | null {
    if (i === undefined) {
      return this.getRuleContexts(GenericCallLikeComparisonContext);
    }

    return this.getRuleContext(i, GenericCallLikeComparisonContext);
  }
  public comparisonOperator(): ComparisonOperatorContext[];
  public comparisonOperator(i: number): ComparisonOperatorContext | null;
  public comparisonOperator(i?: number): ComparisonOperatorContext[] | ComparisonOperatorContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ComparisonOperatorContext);
    }

    return this.getRuleContext(i, ComparisonOperatorContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_comparison;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterComparison) {
      listener.enterComparison(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitComparison) {
      listener.exitComparison(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitComparison) {
      return visitor.visitComparison(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class GenericCallLikeComparisonContext extends antlr.ParserRuleContext {
  public infixOperation(): InfixOperationContext {
    return this.getRuleContext(0, InfixOperationContext)!;
  }
  public callSuffix(): CallSuffixContext[];
  public callSuffix(i: number): CallSuffixContext | null;
  public callSuffix(i?: number): CallSuffixContext[] | CallSuffixContext | null {
    if (i === undefined) {
      return this.getRuleContexts(CallSuffixContext);
    }

    return this.getRuleContext(i, CallSuffixContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_genericCallLikeComparison;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterGenericCallLikeComparison) {
      listener.enterGenericCallLikeComparison(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitGenericCallLikeComparison) {
      listener.exitGenericCallLikeComparison(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitGenericCallLikeComparison) {
      return visitor.visitGenericCallLikeComparison(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class InfixOperationContext extends antlr.ParserRuleContext {
  public elvisExpression(): ElvisExpressionContext[];
  public elvisExpression(i: number): ElvisExpressionContext | null;
  public elvisExpression(i?: number): ElvisExpressionContext[] | ElvisExpressionContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ElvisExpressionContext);
    }

    return this.getRuleContext(i, ElvisExpressionContext);
  }
  public inOperator(): InOperatorContext[];
  public inOperator(i: number): InOperatorContext | null;
  public inOperator(i?: number): InOperatorContext[] | InOperatorContext | null {
    if (i === undefined) {
      return this.getRuleContexts(InOperatorContext);
    }

    return this.getRuleContext(i, InOperatorContext);
  }
  public isOperator(): IsOperatorContext[];
  public isOperator(i: number): IsOperatorContext | null;
  public isOperator(i?: number): IsOperatorContext[] | IsOperatorContext | null {
    if (i === undefined) {
      return this.getRuleContexts(IsOperatorContext);
    }

    return this.getRuleContext(i, IsOperatorContext);
  }
  public type_(): TypeContext[];
  public type_(i: number): TypeContext | null;
  public type_(i?: number): TypeContext[] | TypeContext | null {
    if (i === undefined) {
      return this.getRuleContexts(TypeContext);
    }

    return this.getRuleContext(i, TypeContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_infixOperation;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterInfixOperation) {
      listener.enterInfixOperation(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitInfixOperation) {
      listener.exitInfixOperation(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitInfixOperation) {
      return visitor.visitInfixOperation(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ElvisExpressionContext extends antlr.ParserRuleContext {
  public infixFunctionCall(): InfixFunctionCallContext[];
  public infixFunctionCall(i: number): InfixFunctionCallContext | null;
  public infixFunctionCall(i?: number): InfixFunctionCallContext[] | InfixFunctionCallContext | null {
    if (i === undefined) {
      return this.getRuleContexts(InfixFunctionCallContext);
    }

    return this.getRuleContext(i, InfixFunctionCallContext);
  }
  public elvis(): ElvisContext[];
  public elvis(i: number): ElvisContext | null;
  public elvis(i?: number): ElvisContext[] | ElvisContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ElvisContext);
    }

    return this.getRuleContext(i, ElvisContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_elvisExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterElvisExpression) {
      listener.enterElvisExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitElvisExpression) {
      listener.exitElvisExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitElvisExpression) {
      return visitor.visitElvisExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ElvisContext extends antlr.ParserRuleContext {
  public QUEST_NO_WS(): antlr.TerminalNode {
    return this.getToken(KotlinParser.QUEST_NO_WS, 0)!;
  }
  public COLON(): antlr.TerminalNode {
    return this.getToken(KotlinParser.COLON, 0)!;
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_elvis;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterElvis) {
      listener.enterElvis(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitElvis) {
      listener.exitElvis(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitElvis) {
      return visitor.visitElvis(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class InfixFunctionCallContext extends antlr.ParserRuleContext {
  public rangeExpression(): RangeExpressionContext[];
  public rangeExpression(i: number): RangeExpressionContext | null;
  public rangeExpression(i?: number): RangeExpressionContext[] | RangeExpressionContext | null {
    if (i === undefined) {
      return this.getRuleContexts(RangeExpressionContext);
    }

    return this.getRuleContext(i, RangeExpressionContext);
  }
  public simpleIdentifier(): SimpleIdentifierContext[];
  public simpleIdentifier(i: number): SimpleIdentifierContext | null;
  public simpleIdentifier(i?: number): SimpleIdentifierContext[] | SimpleIdentifierContext | null {
    if (i === undefined) {
      return this.getRuleContexts(SimpleIdentifierContext);
    }

    return this.getRuleContext(i, SimpleIdentifierContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_infixFunctionCall;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterInfixFunctionCall) {
      listener.enterInfixFunctionCall(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitInfixFunctionCall) {
      listener.exitInfixFunctionCall(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitInfixFunctionCall) {
      return visitor.visitInfixFunctionCall(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class RangeExpressionContext extends antlr.ParserRuleContext {
  public additiveExpression(): AdditiveExpressionContext[];
  public additiveExpression(i: number): AdditiveExpressionContext | null;
  public additiveExpression(i?: number): AdditiveExpressionContext[] | AdditiveExpressionContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AdditiveExpressionContext);
    }

    return this.getRuleContext(i, AdditiveExpressionContext);
  }
  public RANGE(): antlr.TerminalNode[];
  public RANGE(i: number): antlr.TerminalNode | null;
  public RANGE(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.RANGE);
    } else {
      return this.getToken(KotlinParser.RANGE, i);
    }
  }
  public RANGE_UNTIL(): antlr.TerminalNode[];
  public RANGE_UNTIL(i: number): antlr.TerminalNode | null;
  public RANGE_UNTIL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.RANGE_UNTIL);
    } else {
      return this.getToken(KotlinParser.RANGE_UNTIL, i);
    }
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_rangeExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterRangeExpression) {
      listener.enterRangeExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitRangeExpression) {
      listener.exitRangeExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitRangeExpression) {
      return visitor.visitRangeExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AdditiveExpressionContext extends antlr.ParserRuleContext {
  public multiplicativeExpression(): MultiplicativeExpressionContext[];
  public multiplicativeExpression(i: number): MultiplicativeExpressionContext | null;
  public multiplicativeExpression(
    i?: number,
  ): MultiplicativeExpressionContext[] | MultiplicativeExpressionContext | null {
    if (i === undefined) {
      return this.getRuleContexts(MultiplicativeExpressionContext);
    }

    return this.getRuleContext(i, MultiplicativeExpressionContext);
  }
  public additiveOperator(): AdditiveOperatorContext[];
  public additiveOperator(i: number): AdditiveOperatorContext | null;
  public additiveOperator(i?: number): AdditiveOperatorContext[] | AdditiveOperatorContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AdditiveOperatorContext);
    }

    return this.getRuleContext(i, AdditiveOperatorContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_additiveExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAdditiveExpression) {
      listener.enterAdditiveExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAdditiveExpression) {
      listener.exitAdditiveExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAdditiveExpression) {
      return visitor.visitAdditiveExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class MultiplicativeExpressionContext extends antlr.ParserRuleContext {
  public asExpression(): AsExpressionContext[];
  public asExpression(i: number): AsExpressionContext | null;
  public asExpression(i?: number): AsExpressionContext[] | AsExpressionContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AsExpressionContext);
    }

    return this.getRuleContext(i, AsExpressionContext);
  }
  public multiplicativeOperator(): MultiplicativeOperatorContext[];
  public multiplicativeOperator(i: number): MultiplicativeOperatorContext | null;
  public multiplicativeOperator(i?: number): MultiplicativeOperatorContext[] | MultiplicativeOperatorContext | null {
    if (i === undefined) {
      return this.getRuleContexts(MultiplicativeOperatorContext);
    }

    return this.getRuleContext(i, MultiplicativeOperatorContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_multiplicativeExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterMultiplicativeExpression) {
      listener.enterMultiplicativeExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitMultiplicativeExpression) {
      listener.exitMultiplicativeExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitMultiplicativeExpression) {
      return visitor.visitMultiplicativeExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AsExpressionContext extends antlr.ParserRuleContext {
  public prefixUnaryExpression(): PrefixUnaryExpressionContext {
    return this.getRuleContext(0, PrefixUnaryExpressionContext)!;
  }
  public asOperator(): AsOperatorContext[];
  public asOperator(i: number): AsOperatorContext | null;
  public asOperator(i?: number): AsOperatorContext[] | AsOperatorContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AsOperatorContext);
    }

    return this.getRuleContext(i, AsOperatorContext);
  }
  public type_(): TypeContext[];
  public type_(i: number): TypeContext | null;
  public type_(i?: number): TypeContext[] | TypeContext | null {
    if (i === undefined) {
      return this.getRuleContexts(TypeContext);
    }

    return this.getRuleContext(i, TypeContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_asExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAsExpression) {
      listener.enterAsExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAsExpression) {
      listener.exitAsExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAsExpression) {
      return visitor.visitAsExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class PrefixUnaryExpressionContext extends antlr.ParserRuleContext {
  public postfixUnaryExpression(): PostfixUnaryExpressionContext {
    return this.getRuleContext(0, PostfixUnaryExpressionContext)!;
  }
  public unaryPrefix(): UnaryPrefixContext[];
  public unaryPrefix(i: number): UnaryPrefixContext | null;
  public unaryPrefix(i?: number): UnaryPrefixContext[] | UnaryPrefixContext | null {
    if (i === undefined) {
      return this.getRuleContexts(UnaryPrefixContext);
    }

    return this.getRuleContext(i, UnaryPrefixContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_prefixUnaryExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterPrefixUnaryExpression) {
      listener.enterPrefixUnaryExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitPrefixUnaryExpression) {
      listener.exitPrefixUnaryExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitPrefixUnaryExpression) {
      return visitor.visitPrefixUnaryExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class UnaryPrefixContext extends antlr.ParserRuleContext {
  public annotation(): AnnotationContext | null {
    return this.getRuleContext(0, AnnotationContext);
  }
  public label(): LabelContext | null {
    return this.getRuleContext(0, LabelContext);
  }
  public prefixUnaryOperator(): PrefixUnaryOperatorContext | null {
    return this.getRuleContext(0, PrefixUnaryOperatorContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_unaryPrefix;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterUnaryPrefix) {
      listener.enterUnaryPrefix(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitUnaryPrefix) {
      listener.exitUnaryPrefix(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitUnaryPrefix) {
      return visitor.visitUnaryPrefix(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class PostfixUnaryExpressionContext extends antlr.ParserRuleContext {
  public primaryExpression(): PrimaryExpressionContext {
    return this.getRuleContext(0, PrimaryExpressionContext)!;
  }
  public postfixUnarySuffix(): PostfixUnarySuffixContext[];
  public postfixUnarySuffix(i: number): PostfixUnarySuffixContext | null;
  public postfixUnarySuffix(i?: number): PostfixUnarySuffixContext[] | PostfixUnarySuffixContext | null {
    if (i === undefined) {
      return this.getRuleContexts(PostfixUnarySuffixContext);
    }

    return this.getRuleContext(i, PostfixUnarySuffixContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_postfixUnaryExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterPostfixUnaryExpression) {
      listener.enterPostfixUnaryExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitPostfixUnaryExpression) {
      listener.exitPostfixUnaryExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitPostfixUnaryExpression) {
      return visitor.visitPostfixUnaryExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class PostfixUnarySuffixContext extends antlr.ParserRuleContext {
  public postfixUnaryOperator(): PostfixUnaryOperatorContext | null {
    return this.getRuleContext(0, PostfixUnaryOperatorContext);
  }
  public typeArguments(): TypeArgumentsContext | null {
    return this.getRuleContext(0, TypeArgumentsContext);
  }
  public callSuffix(): CallSuffixContext | null {
    return this.getRuleContext(0, CallSuffixContext);
  }
  public indexingSuffix(): IndexingSuffixContext | null {
    return this.getRuleContext(0, IndexingSuffixContext);
  }
  public navigationSuffix(): NavigationSuffixContext | null {
    return this.getRuleContext(0, NavigationSuffixContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_postfixUnarySuffix;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterPostfixUnarySuffix) {
      listener.enterPostfixUnarySuffix(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitPostfixUnarySuffix) {
      listener.exitPostfixUnarySuffix(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitPostfixUnarySuffix) {
      return visitor.visitPostfixUnarySuffix(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class DirectlyAssignableExpressionContext extends antlr.ParserRuleContext {
  public postfixUnaryExpression(): PostfixUnaryExpressionContext | null {
    return this.getRuleContext(0, PostfixUnaryExpressionContext);
  }
  public assignableSuffix(): AssignableSuffixContext | null {
    return this.getRuleContext(0, AssignableSuffixContext);
  }
  public simpleIdentifier(): SimpleIdentifierContext | null {
    return this.getRuleContext(0, SimpleIdentifierContext);
  }
  public parenthesizedDirectlyAssignableExpression(): ParenthesizedDirectlyAssignableExpressionContext | null {
    return this.getRuleContext(0, ParenthesizedDirectlyAssignableExpressionContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_directlyAssignableExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterDirectlyAssignableExpression) {
      listener.enterDirectlyAssignableExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitDirectlyAssignableExpression) {
      listener.exitDirectlyAssignableExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitDirectlyAssignableExpression) {
      return visitor.visitDirectlyAssignableExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ParenthesizedDirectlyAssignableExpressionContext extends antlr.ParserRuleContext {
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public directlyAssignableExpression(): DirectlyAssignableExpressionContext {
    return this.getRuleContext(0, DirectlyAssignableExpressionContext)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_parenthesizedDirectlyAssignableExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterParenthesizedDirectlyAssignableExpression) {
      listener.enterParenthesizedDirectlyAssignableExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitParenthesizedDirectlyAssignableExpression) {
      listener.exitParenthesizedDirectlyAssignableExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitParenthesizedDirectlyAssignableExpression) {
      return visitor.visitParenthesizedDirectlyAssignableExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AssignableExpressionContext extends antlr.ParserRuleContext {
  public prefixUnaryExpression(): PrefixUnaryExpressionContext | null {
    return this.getRuleContext(0, PrefixUnaryExpressionContext);
  }
  public parenthesizedAssignableExpression(): ParenthesizedAssignableExpressionContext | null {
    return this.getRuleContext(0, ParenthesizedAssignableExpressionContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_assignableExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAssignableExpression) {
      listener.enterAssignableExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAssignableExpression) {
      listener.exitAssignableExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAssignableExpression) {
      return visitor.visitAssignableExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ParenthesizedAssignableExpressionContext extends antlr.ParserRuleContext {
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public assignableExpression(): AssignableExpressionContext {
    return this.getRuleContext(0, AssignableExpressionContext)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_parenthesizedAssignableExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterParenthesizedAssignableExpression) {
      listener.enterParenthesizedAssignableExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitParenthesizedAssignableExpression) {
      listener.exitParenthesizedAssignableExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitParenthesizedAssignableExpression) {
      return visitor.visitParenthesizedAssignableExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AssignableSuffixContext extends antlr.ParserRuleContext {
  public typeArguments(): TypeArgumentsContext | null {
    return this.getRuleContext(0, TypeArgumentsContext);
  }
  public indexingSuffix(): IndexingSuffixContext | null {
    return this.getRuleContext(0, IndexingSuffixContext);
  }
  public navigationSuffix(): NavigationSuffixContext | null {
    return this.getRuleContext(0, NavigationSuffixContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_assignableSuffix;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAssignableSuffix) {
      listener.enterAssignableSuffix(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAssignableSuffix) {
      listener.exitAssignableSuffix(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAssignableSuffix) {
      return visitor.visitAssignableSuffix(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class IndexingSuffixContext extends antlr.ParserRuleContext {
  public LSQUARE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LSQUARE, 0)!;
  }
  public expression(): ExpressionContext[];
  public expression(i: number): ExpressionContext | null;
  public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ExpressionContext);
    }

    return this.getRuleContext(i, ExpressionContext);
  }
  public RSQUARE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RSQUARE, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_indexingSuffix;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterIndexingSuffix) {
      listener.enterIndexingSuffix(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitIndexingSuffix) {
      listener.exitIndexingSuffix(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitIndexingSuffix) {
      return visitor.visitIndexingSuffix(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class NavigationSuffixContext extends antlr.ParserRuleContext {
  public memberAccessOperator(): MemberAccessOperatorContext {
    return this.getRuleContext(0, MemberAccessOperatorContext)!;
  }
  public simpleIdentifier(): SimpleIdentifierContext | null {
    return this.getRuleContext(0, SimpleIdentifierContext);
  }
  public parenthesizedExpression(): ParenthesizedExpressionContext | null {
    return this.getRuleContext(0, ParenthesizedExpressionContext);
  }
  public CLASS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.CLASS, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_navigationSuffix;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterNavigationSuffix) {
      listener.enterNavigationSuffix(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitNavigationSuffix) {
      listener.exitNavigationSuffix(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitNavigationSuffix) {
      return visitor.visitNavigationSuffix(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class CallSuffixContext extends antlr.ParserRuleContext {
  public annotatedLambda(): AnnotatedLambdaContext | null {
    return this.getRuleContext(0, AnnotatedLambdaContext);
  }
  public valueArguments(): ValueArgumentsContext | null {
    return this.getRuleContext(0, ValueArgumentsContext);
  }
  public typeArguments(): TypeArgumentsContext | null {
    return this.getRuleContext(0, TypeArgumentsContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_callSuffix;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterCallSuffix) {
      listener.enterCallSuffix(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitCallSuffix) {
      listener.exitCallSuffix(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitCallSuffix) {
      return visitor.visitCallSuffix(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AnnotatedLambdaContext extends antlr.ParserRuleContext {
  public lambdaLiteral(): LambdaLiteralContext {
    return this.getRuleContext(0, LambdaLiteralContext)!;
  }
  public annotation(): AnnotationContext[];
  public annotation(i: number): AnnotationContext | null;
  public annotation(i?: number): AnnotationContext[] | AnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AnnotationContext);
    }

    return this.getRuleContext(i, AnnotationContext);
  }
  public label(): LabelContext | null {
    return this.getRuleContext(0, LabelContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_annotatedLambda;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAnnotatedLambda) {
      listener.enterAnnotatedLambda(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAnnotatedLambda) {
      listener.exitAnnotatedLambda(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAnnotatedLambda) {
      return visitor.visitAnnotatedLambda(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeArgumentsContext extends antlr.ParserRuleContext {
  public LANGLE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LANGLE, 0)!;
  }
  public typeProjection(): TypeProjectionContext[];
  public typeProjection(i: number): TypeProjectionContext | null;
  public typeProjection(i?: number): TypeProjectionContext[] | TypeProjectionContext | null {
    if (i === undefined) {
      return this.getRuleContexts(TypeProjectionContext);
    }

    return this.getRuleContext(i, TypeProjectionContext);
  }
  public RANGLE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RANGLE, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeArguments;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeArguments) {
      listener.enterTypeArguments(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeArguments) {
      listener.exitTypeArguments(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeArguments) {
      return visitor.visitTypeArguments(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ValueArgumentsContext extends antlr.ParserRuleContext {
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public valueArgument(): ValueArgumentContext[];
  public valueArgument(i: number): ValueArgumentContext | null;
  public valueArgument(i?: number): ValueArgumentContext[] | ValueArgumentContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ValueArgumentContext);
    }

    return this.getRuleContext(i, ValueArgumentContext);
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_valueArguments;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterValueArguments) {
      listener.enterValueArguments(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitValueArguments) {
      listener.exitValueArguments(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitValueArguments) {
      return visitor.visitValueArguments(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ValueArgumentContext extends antlr.ParserRuleContext {
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext)!;
  }
  public annotation(): AnnotationContext | null {
    return this.getRuleContext(0, AnnotationContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public simpleIdentifier(): SimpleIdentifierContext | null {
    return this.getRuleContext(0, SimpleIdentifierContext);
  }
  public ASSIGNMENT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ASSIGNMENT, 0);
  }
  public MULT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.MULT, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_valueArgument;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterValueArgument) {
      listener.enterValueArgument(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitValueArgument) {
      listener.exitValueArgument(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitValueArgument) {
      return visitor.visitValueArgument(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class PrimaryExpressionContext extends antlr.ParserRuleContext {
  public parenthesizedExpression(): ParenthesizedExpressionContext | null {
    return this.getRuleContext(0, ParenthesizedExpressionContext);
  }
  public simpleIdentifier(): SimpleIdentifierContext | null {
    return this.getRuleContext(0, SimpleIdentifierContext);
  }
  public literalConstant(): LiteralConstantContext | null {
    return this.getRuleContext(0, LiteralConstantContext);
  }
  public stringLiteral(): StringLiteralContext | null {
    return this.getRuleContext(0, StringLiteralContext);
  }
  public callableReference(): CallableReferenceContext | null {
    return this.getRuleContext(0, CallableReferenceContext);
  }
  public functionLiteral(): FunctionLiteralContext | null {
    return this.getRuleContext(0, FunctionLiteralContext);
  }
  public objectLiteral(): ObjectLiteralContext | null {
    return this.getRuleContext(0, ObjectLiteralContext);
  }
  public collectionLiteral(): CollectionLiteralContext | null {
    return this.getRuleContext(0, CollectionLiteralContext);
  }
  public thisExpression(): ThisExpressionContext | null {
    return this.getRuleContext(0, ThisExpressionContext);
  }
  public superExpression(): SuperExpressionContext | null {
    return this.getRuleContext(0, SuperExpressionContext);
  }
  public ifExpression(): IfExpressionContext | null {
    return this.getRuleContext(0, IfExpressionContext);
  }
  public whenExpression(): WhenExpressionContext | null {
    return this.getRuleContext(0, WhenExpressionContext);
  }
  public tryExpression(): TryExpressionContext | null {
    return this.getRuleContext(0, TryExpressionContext);
  }
  public jumpExpression(): JumpExpressionContext | null {
    return this.getRuleContext(0, JumpExpressionContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_primaryExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterPrimaryExpression) {
      listener.enterPrimaryExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitPrimaryExpression) {
      listener.exitPrimaryExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitPrimaryExpression) {
      return visitor.visitPrimaryExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ParenthesizedExpressionContext extends antlr.ParserRuleContext {
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_parenthesizedExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterParenthesizedExpression) {
      listener.enterParenthesizedExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitParenthesizedExpression) {
      listener.exitParenthesizedExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitParenthesizedExpression) {
      return visitor.visitParenthesizedExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class CollectionLiteralContext extends antlr.ParserRuleContext {
  public LSQUARE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LSQUARE, 0)!;
  }
  public RSQUARE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RSQUARE, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public expression(): ExpressionContext[];
  public expression(i: number): ExpressionContext | null;
  public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ExpressionContext);
    }

    return this.getRuleContext(i, ExpressionContext);
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_collectionLiteral;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterCollectionLiteral) {
      listener.enterCollectionLiteral(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitCollectionLiteral) {
      listener.exitCollectionLiteral(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitCollectionLiteral) {
      return visitor.visitCollectionLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class LiteralConstantContext extends antlr.ParserRuleContext {
  public BooleanLiteral(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.BooleanLiteral, 0);
  }
  public IntegerLiteral(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.IntegerLiteral, 0);
  }
  public HexLiteral(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.HexLiteral, 0);
  }
  public BinLiteral(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.BinLiteral, 0);
  }
  public CharacterLiteral(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.CharacterLiteral, 0);
  }
  public RealLiteral(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.RealLiteral, 0);
  }
  public NullLiteral(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.NullLiteral, 0);
  }
  public LongLiteral(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.LongLiteral, 0);
  }
  public UnsignedLiteral(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.UnsignedLiteral, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_literalConstant;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterLiteralConstant) {
      listener.enterLiteralConstant(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitLiteralConstant) {
      listener.exitLiteralConstant(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitLiteralConstant) {
      return visitor.visitLiteralConstant(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class StringLiteralContext extends antlr.ParserRuleContext {
  public lineStringLiteral(): LineStringLiteralContext | null {
    return this.getRuleContext(0, LineStringLiteralContext);
  }
  public multiLineStringLiteral(): MultiLineStringLiteralContext | null {
    return this.getRuleContext(0, MultiLineStringLiteralContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_stringLiteral;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterStringLiteral) {
      listener.enterStringLiteral(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitStringLiteral) {
      listener.exitStringLiteral(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitStringLiteral) {
      return visitor.visitStringLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class LineStringLiteralContext extends antlr.ParserRuleContext {
  public QUOTE_OPEN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.QUOTE_OPEN, 0)!;
  }
  public QUOTE_CLOSE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.QUOTE_CLOSE, 0)!;
  }
  public lineStringContent(): LineStringContentContext[];
  public lineStringContent(i: number): LineStringContentContext | null;
  public lineStringContent(i?: number): LineStringContentContext[] | LineStringContentContext | null {
    if (i === undefined) {
      return this.getRuleContexts(LineStringContentContext);
    }

    return this.getRuleContext(i, LineStringContentContext);
  }
  public lineStringExpression(): LineStringExpressionContext[];
  public lineStringExpression(i: number): LineStringExpressionContext | null;
  public lineStringExpression(i?: number): LineStringExpressionContext[] | LineStringExpressionContext | null {
    if (i === undefined) {
      return this.getRuleContexts(LineStringExpressionContext);
    }

    return this.getRuleContext(i, LineStringExpressionContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_lineStringLiteral;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterLineStringLiteral) {
      listener.enterLineStringLiteral(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitLineStringLiteral) {
      listener.exitLineStringLiteral(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitLineStringLiteral) {
      return visitor.visitLineStringLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class MultiLineStringLiteralContext extends antlr.ParserRuleContext {
  public TRIPLE_QUOTE_OPEN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.TRIPLE_QUOTE_OPEN, 0)!;
  }
  public TRIPLE_QUOTE_CLOSE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.TRIPLE_QUOTE_CLOSE, 0)!;
  }
  public multiLineStringContent(): MultiLineStringContentContext[];
  public multiLineStringContent(i: number): MultiLineStringContentContext | null;
  public multiLineStringContent(i?: number): MultiLineStringContentContext[] | MultiLineStringContentContext | null {
    if (i === undefined) {
      return this.getRuleContexts(MultiLineStringContentContext);
    }

    return this.getRuleContext(i, MultiLineStringContentContext);
  }
  public multiLineStringExpression(): MultiLineStringExpressionContext[];
  public multiLineStringExpression(i: number): MultiLineStringExpressionContext | null;
  public multiLineStringExpression(
    i?: number,
  ): MultiLineStringExpressionContext[] | MultiLineStringExpressionContext | null {
    if (i === undefined) {
      return this.getRuleContexts(MultiLineStringExpressionContext);
    }

    return this.getRuleContext(i, MultiLineStringExpressionContext);
  }
  public MultiLineStringQuote(): antlr.TerminalNode[];
  public MultiLineStringQuote(i: number): antlr.TerminalNode | null;
  public MultiLineStringQuote(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.MultiLineStringQuote);
    } else {
      return this.getToken(KotlinParser.MultiLineStringQuote, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_multiLineStringLiteral;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterMultiLineStringLiteral) {
      listener.enterMultiLineStringLiteral(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitMultiLineStringLiteral) {
      listener.exitMultiLineStringLiteral(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitMultiLineStringLiteral) {
      return visitor.visitMultiLineStringLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class LineStringContentContext extends antlr.ParserRuleContext {
  public LineStrText(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.LineStrText, 0);
  }
  public LineStrEscapedChar(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.LineStrEscapedChar, 0);
  }
  public LineStrRef(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.LineStrRef, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_lineStringContent;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterLineStringContent) {
      listener.enterLineStringContent(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitLineStringContent) {
      listener.exitLineStringContent(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitLineStringContent) {
      return visitor.visitLineStringContent(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class LineStringExpressionContext extends antlr.ParserRuleContext {
  public LineStrExprStart(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LineStrExprStart, 0)!;
  }
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext)!;
  }
  public RCURL(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RCURL, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_lineStringExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterLineStringExpression) {
      listener.enterLineStringExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitLineStringExpression) {
      listener.exitLineStringExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitLineStringExpression) {
      return visitor.visitLineStringExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class MultiLineStringContentContext extends antlr.ParserRuleContext {
  public MultiLineStrText(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.MultiLineStrText, 0);
  }
  public MultiLineStringQuote(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.MultiLineStringQuote, 0);
  }
  public MultiLineStrRef(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.MultiLineStrRef, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_multiLineStringContent;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterMultiLineStringContent) {
      listener.enterMultiLineStringContent(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitMultiLineStringContent) {
      listener.exitMultiLineStringContent(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitMultiLineStringContent) {
      return visitor.visitMultiLineStringContent(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class MultiLineStringExpressionContext extends antlr.ParserRuleContext {
  public MultiLineStrExprStart(): antlr.TerminalNode {
    return this.getToken(KotlinParser.MultiLineStrExprStart, 0)!;
  }
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext)!;
  }
  public RCURL(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RCURL, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_multiLineStringExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterMultiLineStringExpression) {
      listener.enterMultiLineStringExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitMultiLineStringExpression) {
      listener.exitMultiLineStringExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitMultiLineStringExpression) {
      return visitor.visitMultiLineStringExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class LambdaLiteralContext extends antlr.ParserRuleContext {
  public LCURL(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LCURL, 0)!;
  }
  public statements(): StatementsContext {
    return this.getRuleContext(0, StatementsContext)!;
  }
  public RCURL(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RCURL, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public ARROW(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ARROW, 0);
  }
  public lambdaParameters(): LambdaParametersContext | null {
    return this.getRuleContext(0, LambdaParametersContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_lambdaLiteral;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterLambdaLiteral) {
      listener.enterLambdaLiteral(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitLambdaLiteral) {
      listener.exitLambdaLiteral(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitLambdaLiteral) {
      return visitor.visitLambdaLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class LambdaParametersContext extends antlr.ParserRuleContext {
  public lambdaParameter(): LambdaParameterContext[];
  public lambdaParameter(i: number): LambdaParameterContext | null;
  public lambdaParameter(i?: number): LambdaParameterContext[] | LambdaParameterContext | null {
    if (i === undefined) {
      return this.getRuleContexts(LambdaParameterContext);
    }

    return this.getRuleContext(i, LambdaParameterContext);
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_lambdaParameters;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterLambdaParameters) {
      listener.enterLambdaParameters(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitLambdaParameters) {
      listener.exitLambdaParameters(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitLambdaParameters) {
      return visitor.visitLambdaParameters(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class LambdaParameterContext extends antlr.ParserRuleContext {
  public variableDeclaration(): VariableDeclarationContext | null {
    return this.getRuleContext(0, VariableDeclarationContext);
  }
  public multiVariableDeclaration(): MultiVariableDeclarationContext | null {
    return this.getRuleContext(0, MultiVariableDeclarationContext);
  }
  public COLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLON, 0);
  }
  public type(): TypeContext | null {
    return this.getRuleContext(0, TypeContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_lambdaParameter;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterLambdaParameter) {
      listener.enterLambdaParameter(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitLambdaParameter) {
      listener.exitLambdaParameter(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitLambdaParameter) {
      return visitor.visitLambdaParameter(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AnonymousFunctionContext extends antlr.ParserRuleContext {
  public FUN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.FUN, 0)!;
  }
  public parametersWithOptionalType(): ParametersWithOptionalTypeContext {
    return this.getRuleContext(0, ParametersWithOptionalTypeContext)!;
  }
  public SUSPEND(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SUSPEND, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public type_(): TypeContext[];
  public type_(i: number): TypeContext | null;
  public type_(i?: number): TypeContext[] | TypeContext | null {
    if (i === undefined) {
      return this.getRuleContexts(TypeContext);
    }

    return this.getRuleContext(i, TypeContext);
  }
  public DOT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DOT, 0);
  }
  public COLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLON, 0);
  }
  public typeConstraints(): TypeConstraintsContext | null {
    return this.getRuleContext(0, TypeConstraintsContext);
  }
  public functionBody(): FunctionBodyContext | null {
    return this.getRuleContext(0, FunctionBodyContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_anonymousFunction;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAnonymousFunction) {
      listener.enterAnonymousFunction(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAnonymousFunction) {
      listener.exitAnonymousFunction(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAnonymousFunction) {
      return visitor.visitAnonymousFunction(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class FunctionLiteralContext extends antlr.ParserRuleContext {
  public lambdaLiteral(): LambdaLiteralContext | null {
    return this.getRuleContext(0, LambdaLiteralContext);
  }
  public anonymousFunction(): AnonymousFunctionContext | null {
    return this.getRuleContext(0, AnonymousFunctionContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_functionLiteral;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterFunctionLiteral) {
      listener.enterFunctionLiteral(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitFunctionLiteral) {
      listener.exitFunctionLiteral(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitFunctionLiteral) {
      return visitor.visitFunctionLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ObjectLiteralContext extends antlr.ParserRuleContext {
  public OBJECT(): antlr.TerminalNode {
    return this.getToken(KotlinParser.OBJECT, 0)!;
  }
  public DATA(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DATA, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public COLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLON, 0);
  }
  public delegationSpecifiers(): DelegationSpecifiersContext | null {
    return this.getRuleContext(0, DelegationSpecifiersContext);
  }
  public classBody(): ClassBodyContext | null {
    return this.getRuleContext(0, ClassBodyContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_objectLiteral;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterObjectLiteral) {
      listener.enterObjectLiteral(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitObjectLiteral) {
      listener.exitObjectLiteral(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitObjectLiteral) {
      return visitor.visitObjectLiteral(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ThisExpressionContext extends antlr.ParserRuleContext {
  public THIS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.THIS, 0);
  }
  public THIS_AT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.THIS_AT, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_thisExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterThisExpression) {
      listener.enterThisExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitThisExpression) {
      listener.exitThisExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitThisExpression) {
      return visitor.visitThisExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class SuperExpressionContext extends antlr.ParserRuleContext {
  public SUPER(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SUPER, 0);
  }
  public LANGLE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.LANGLE, 0);
  }
  public type(): TypeContext | null {
    return this.getRuleContext(0, TypeContext);
  }
  public RANGLE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.RANGLE, 0);
  }
  public AT_NO_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.AT_NO_WS, 0);
  }
  public simpleIdentifier(): SimpleIdentifierContext | null {
    return this.getRuleContext(0, SimpleIdentifierContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public SUPER_AT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SUPER_AT, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_superExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterSuperExpression) {
      listener.enterSuperExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitSuperExpression) {
      listener.exitSuperExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitSuperExpression) {
      return visitor.visitSuperExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class IfExpressionContext extends antlr.ParserRuleContext {
  public IF(): antlr.TerminalNode {
    return this.getToken(KotlinParser.IF, 0)!;
  }
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public controlStructureBody(): ControlStructureBodyContext[];
  public controlStructureBody(i: number): ControlStructureBodyContext | null;
  public controlStructureBody(i?: number): ControlStructureBodyContext[] | ControlStructureBodyContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ControlStructureBodyContext);
    }

    return this.getRuleContext(i, ControlStructureBodyContext);
  }
  public ELSE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ELSE, 0);
  }
  public SEMICOLON(): antlr.TerminalNode[];
  public SEMICOLON(i: number): antlr.TerminalNode | null;
  public SEMICOLON(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.SEMICOLON);
    } else {
      return this.getToken(KotlinParser.SEMICOLON, i);
    }
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_ifExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterIfExpression) {
      listener.enterIfExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitIfExpression) {
      listener.exitIfExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitIfExpression) {
      return visitor.visitIfExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class WhenSubjectContext extends antlr.ParserRuleContext {
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public VAL(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.VAL, 0);
  }
  public variableDeclaration(): VariableDeclarationContext | null {
    return this.getRuleContext(0, VariableDeclarationContext);
  }
  public ASSIGNMENT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ASSIGNMENT, 0);
  }
  public annotation(): AnnotationContext[];
  public annotation(i: number): AnnotationContext | null;
  public annotation(i?: number): AnnotationContext[] | AnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AnnotationContext);
    }

    return this.getRuleContext(i, AnnotationContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_whenSubject;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterWhenSubject) {
      listener.enterWhenSubject(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitWhenSubject) {
      listener.exitWhenSubject(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitWhenSubject) {
      return visitor.visitWhenSubject(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class WhenExpressionContext extends antlr.ParserRuleContext {
  public WHEN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.WHEN, 0)!;
  }
  public LCURL(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LCURL, 0)!;
  }
  public RCURL(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RCURL, 0)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public whenSubject(): WhenSubjectContext | null {
    return this.getRuleContext(0, WhenSubjectContext);
  }
  public whenEntry(): WhenEntryContext[];
  public whenEntry(i: number): WhenEntryContext | null;
  public whenEntry(i?: number): WhenEntryContext[] | WhenEntryContext | null {
    if (i === undefined) {
      return this.getRuleContexts(WhenEntryContext);
    }

    return this.getRuleContext(i, WhenEntryContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_whenExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterWhenExpression) {
      listener.enterWhenExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitWhenExpression) {
      listener.exitWhenExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitWhenExpression) {
      return visitor.visitWhenExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class WhenEntryContext extends antlr.ParserRuleContext {
  public whenCondition(): WhenConditionContext[];
  public whenCondition(i: number): WhenConditionContext | null;
  public whenCondition(i?: number): WhenConditionContext[] | WhenConditionContext | null {
    if (i === undefined) {
      return this.getRuleContexts(WhenConditionContext);
    }

    return this.getRuleContext(i, WhenConditionContext);
  }
  public ARROW(): antlr.TerminalNode {
    return this.getToken(KotlinParser.ARROW, 0)!;
  }
  public controlStructureBody(): ControlStructureBodyContext {
    return this.getRuleContext(0, ControlStructureBodyContext)!;
  }
  public COMMA(): antlr.TerminalNode[];
  public COMMA(i: number): antlr.TerminalNode | null;
  public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.COMMA);
    } else {
      return this.getToken(KotlinParser.COMMA, i);
    }
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public semi(): SemiContext | null {
    return this.getRuleContext(0, SemiContext);
  }
  public ELSE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ELSE, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_whenEntry;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterWhenEntry) {
      listener.enterWhenEntry(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitWhenEntry) {
      listener.exitWhenEntry(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitWhenEntry) {
      return visitor.visitWhenEntry(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class WhenConditionContext extends antlr.ParserRuleContext {
  public expression(): ExpressionContext | null {
    return this.getRuleContext(0, ExpressionContext);
  }
  public rangeTest(): RangeTestContext | null {
    return this.getRuleContext(0, RangeTestContext);
  }
  public typeTest(): TypeTestContext | null {
    return this.getRuleContext(0, TypeTestContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_whenCondition;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterWhenCondition) {
      listener.enterWhenCondition(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitWhenCondition) {
      listener.exitWhenCondition(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitWhenCondition) {
      return visitor.visitWhenCondition(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class RangeTestContext extends antlr.ParserRuleContext {
  public inOperator(): InOperatorContext {
    return this.getRuleContext(0, InOperatorContext)!;
  }
  public expression(): ExpressionContext {
    return this.getRuleContext(0, ExpressionContext)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_rangeTest;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterRangeTest) {
      listener.enterRangeTest(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitRangeTest) {
      listener.exitRangeTest(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitRangeTest) {
      return visitor.visitRangeTest(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeTestContext extends antlr.ParserRuleContext {
  public isOperator(): IsOperatorContext {
    return this.getRuleContext(0, IsOperatorContext)!;
  }
  public type(): TypeContext {
    return this.getRuleContext(0, TypeContext)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeTest;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeTest) {
      listener.enterTypeTest(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeTest) {
      listener.exitTypeTest(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeTest) {
      return visitor.visitTypeTest(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TryExpressionContext extends antlr.ParserRuleContext {
  public TRY(): antlr.TerminalNode {
    return this.getToken(KotlinParser.TRY, 0)!;
  }
  public block(): BlockContext {
    return this.getRuleContext(0, BlockContext)!;
  }
  public finallyBlock(): FinallyBlockContext | null {
    return this.getRuleContext(0, FinallyBlockContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public catchBlock(): CatchBlockContext[];
  public catchBlock(i: number): CatchBlockContext | null;
  public catchBlock(i?: number): CatchBlockContext[] | CatchBlockContext | null {
    if (i === undefined) {
      return this.getRuleContexts(CatchBlockContext);
    }

    return this.getRuleContext(i, CatchBlockContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_tryExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTryExpression) {
      listener.enterTryExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTryExpression) {
      listener.exitTryExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTryExpression) {
      return visitor.visitTryExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class CatchBlockContext extends antlr.ParserRuleContext {
  public CATCH(): antlr.TerminalNode {
    return this.getToken(KotlinParser.CATCH, 0)!;
  }
  public LPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LPAREN, 0)!;
  }
  public simpleIdentifier(): SimpleIdentifierContext {
    return this.getRuleContext(0, SimpleIdentifierContext)!;
  }
  public COLON(): antlr.TerminalNode {
    return this.getToken(KotlinParser.COLON, 0)!;
  }
  public type(): TypeContext {
    return this.getRuleContext(0, TypeContext)!;
  }
  public RPAREN(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RPAREN, 0)!;
  }
  public block(): BlockContext {
    return this.getRuleContext(0, BlockContext)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public annotation(): AnnotationContext[];
  public annotation(i: number): AnnotationContext | null;
  public annotation(i?: number): AnnotationContext[] | AnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AnnotationContext);
    }

    return this.getRuleContext(i, AnnotationContext);
  }
  public COMMA(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COMMA, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_catchBlock;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterCatchBlock) {
      listener.enterCatchBlock(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitCatchBlock) {
      listener.exitCatchBlock(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitCatchBlock) {
      return visitor.visitCatchBlock(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class FinallyBlockContext extends antlr.ParserRuleContext {
  public FINALLY(): antlr.TerminalNode {
    return this.getToken(KotlinParser.FINALLY, 0)!;
  }
  public block(): BlockContext {
    return this.getRuleContext(0, BlockContext)!;
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_finallyBlock;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterFinallyBlock) {
      listener.enterFinallyBlock(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitFinallyBlock) {
      listener.exitFinallyBlock(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitFinallyBlock) {
      return visitor.visitFinallyBlock(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class JumpExpressionContext extends antlr.ParserRuleContext {
  public THROW(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.THROW, 0);
  }
  public expression(): ExpressionContext | null {
    return this.getRuleContext(0, ExpressionContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public RETURN(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.RETURN, 0);
  }
  public RETURN_AT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.RETURN_AT, 0);
  }
  public CONTINUE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.CONTINUE, 0);
  }
  public CONTINUE_AT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.CONTINUE_AT, 0);
  }
  public BREAK(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.BREAK, 0);
  }
  public BREAK_AT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.BREAK_AT, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_jumpExpression;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterJumpExpression) {
      listener.enterJumpExpression(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitJumpExpression) {
      listener.exitJumpExpression(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitJumpExpression) {
      return visitor.visitJumpExpression(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class CallableReferenceContext extends antlr.ParserRuleContext {
  public COLONCOLON(): antlr.TerminalNode {
    return this.getToken(KotlinParser.COLONCOLON, 0)!;
  }
  public simpleIdentifier(): SimpleIdentifierContext | null {
    return this.getRuleContext(0, SimpleIdentifierContext);
  }
  public CLASS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.CLASS, 0);
  }
  public receiverType(): ReceiverTypeContext | null {
    return this.getRuleContext(0, ReceiverTypeContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_callableReference;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterCallableReference) {
      listener.enterCallableReference(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitCallableReference) {
      listener.exitCallableReference(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitCallableReference) {
      return visitor.visitCallableReference(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AssignmentAndOperatorContext extends antlr.ParserRuleContext {
  public ADD_ASSIGNMENT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ADD_ASSIGNMENT, 0);
  }
  public SUB_ASSIGNMENT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SUB_ASSIGNMENT, 0);
  }
  public MULT_ASSIGNMENT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.MULT_ASSIGNMENT, 0);
  }
  public DIV_ASSIGNMENT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DIV_ASSIGNMENT, 0);
  }
  public MOD_ASSIGNMENT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.MOD_ASSIGNMENT, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_assignmentAndOperator;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAssignmentAndOperator) {
      listener.enterAssignmentAndOperator(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAssignmentAndOperator) {
      listener.exitAssignmentAndOperator(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAssignmentAndOperator) {
      return visitor.visitAssignmentAndOperator(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class EqualityOperatorContext extends antlr.ParserRuleContext {
  public EXCL_EQ(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.EXCL_EQ, 0);
  }
  public EXCL_EQEQ(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.EXCL_EQEQ, 0);
  }
  public EQEQ(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.EQEQ, 0);
  }
  public EQEQEQ(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.EQEQEQ, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_equalityOperator;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterEqualityOperator) {
      listener.enterEqualityOperator(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitEqualityOperator) {
      listener.exitEqualityOperator(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitEqualityOperator) {
      return visitor.visitEqualityOperator(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ComparisonOperatorContext extends antlr.ParserRuleContext {
  public LANGLE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.LANGLE, 0);
  }
  public RANGLE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.RANGLE, 0);
  }
  public LE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.LE, 0);
  }
  public GE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.GE, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_comparisonOperator;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterComparisonOperator) {
      listener.enterComparisonOperator(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitComparisonOperator) {
      listener.exitComparisonOperator(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitComparisonOperator) {
      return visitor.visitComparisonOperator(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class InOperatorContext extends antlr.ParserRuleContext {
  public IN(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.IN, 0);
  }
  public NOT_IN(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.NOT_IN, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_inOperator;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterInOperator) {
      listener.enterInOperator(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitInOperator) {
      listener.exitInOperator(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitInOperator) {
      return visitor.visitInOperator(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class IsOperatorContext extends antlr.ParserRuleContext {
  public IS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.IS, 0);
  }
  public NOT_IS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.NOT_IS, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_isOperator;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterIsOperator) {
      listener.enterIsOperator(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitIsOperator) {
      listener.exitIsOperator(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitIsOperator) {
      return visitor.visitIsOperator(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AdditiveOperatorContext extends antlr.ParserRuleContext {
  public ADD(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ADD, 0);
  }
  public SUB(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SUB, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_additiveOperator;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAdditiveOperator) {
      listener.enterAdditiveOperator(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAdditiveOperator) {
      listener.exitAdditiveOperator(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAdditiveOperator) {
      return visitor.visitAdditiveOperator(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class MultiplicativeOperatorContext extends antlr.ParserRuleContext {
  public MULT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.MULT, 0);
  }
  public DIV(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DIV, 0);
  }
  public MOD(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.MOD, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_multiplicativeOperator;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterMultiplicativeOperator) {
      listener.enterMultiplicativeOperator(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitMultiplicativeOperator) {
      listener.exitMultiplicativeOperator(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitMultiplicativeOperator) {
      return visitor.visitMultiplicativeOperator(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AsOperatorContext extends antlr.ParserRuleContext {
  public AS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.AS, 0);
  }
  public AS_SAFE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.AS_SAFE, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_asOperator;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAsOperator) {
      listener.enterAsOperator(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAsOperator) {
      listener.exitAsOperator(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAsOperator) {
      return visitor.visitAsOperator(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class PrefixUnaryOperatorContext extends antlr.ParserRuleContext {
  public INCR(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.INCR, 0);
  }
  public DECR(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DECR, 0);
  }
  public SUB(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SUB, 0);
  }
  public ADD(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ADD, 0);
  }
  public excl(): ExclContext | null {
    return this.getRuleContext(0, ExclContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_prefixUnaryOperator;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterPrefixUnaryOperator) {
      listener.enterPrefixUnaryOperator(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitPrefixUnaryOperator) {
      listener.exitPrefixUnaryOperator(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitPrefixUnaryOperator) {
      return visitor.visitPrefixUnaryOperator(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class PostfixUnaryOperatorContext extends antlr.ParserRuleContext {
  public INCR(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.INCR, 0);
  }
  public DECR(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DECR, 0);
  }
  public EXCL_NO_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.EXCL_NO_WS, 0);
  }
  public excl(): ExclContext | null {
    return this.getRuleContext(0, ExclContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_postfixUnaryOperator;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterPostfixUnaryOperator) {
      listener.enterPostfixUnaryOperator(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitPostfixUnaryOperator) {
      listener.exitPostfixUnaryOperator(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitPostfixUnaryOperator) {
      return visitor.visitPostfixUnaryOperator(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ExclContext extends antlr.ParserRuleContext {
  public EXCL_NO_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.EXCL_NO_WS, 0);
  }
  public EXCL_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.EXCL_WS, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_excl;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterExcl) {
      listener.enterExcl(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitExcl) {
      listener.exitExcl(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitExcl) {
      return visitor.visitExcl(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class MemberAccessOperatorContext extends antlr.ParserRuleContext {
  public DOT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DOT, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public safeNav(): SafeNavContext | null {
    return this.getRuleContext(0, SafeNavContext);
  }
  public COLONCOLON(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COLONCOLON, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_memberAccessOperator;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterMemberAccessOperator) {
      listener.enterMemberAccessOperator(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitMemberAccessOperator) {
      listener.exitMemberAccessOperator(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitMemberAccessOperator) {
      return visitor.visitMemberAccessOperator(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class SafeNavContext extends antlr.ParserRuleContext {
  public QUEST_NO_WS(): antlr.TerminalNode {
    return this.getToken(KotlinParser.QUEST_NO_WS, 0)!;
  }
  public DOT(): antlr.TerminalNode {
    return this.getToken(KotlinParser.DOT, 0)!;
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_safeNav;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterSafeNav) {
      listener.enterSafeNav(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitSafeNav) {
      listener.exitSafeNav(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitSafeNav) {
      return visitor.visitSafeNav(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ModifiersContext extends antlr.ParserRuleContext {
  public annotation(): AnnotationContext[];
  public annotation(i: number): AnnotationContext | null;
  public annotation(i?: number): AnnotationContext[] | AnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AnnotationContext);
    }

    return this.getRuleContext(i, AnnotationContext);
  }
  public modifier(): ModifierContext[];
  public modifier(i: number): ModifierContext | null;
  public modifier(i?: number): ModifierContext[] | ModifierContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ModifierContext);
    }

    return this.getRuleContext(i, ModifierContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_modifiers;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterModifiers) {
      listener.enterModifiers(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitModifiers) {
      listener.exitModifiers(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitModifiers) {
      return visitor.visitModifiers(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ParameterModifiersContext extends antlr.ParserRuleContext {
  public annotation(): AnnotationContext[];
  public annotation(i: number): AnnotationContext | null;
  public annotation(i?: number): AnnotationContext[] | AnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(AnnotationContext);
    }

    return this.getRuleContext(i, AnnotationContext);
  }
  public parameterModifier(): ParameterModifierContext[];
  public parameterModifier(i: number): ParameterModifierContext | null;
  public parameterModifier(i?: number): ParameterModifierContext[] | ParameterModifierContext | null {
    if (i === undefined) {
      return this.getRuleContexts(ParameterModifierContext);
    }

    return this.getRuleContext(i, ParameterModifierContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_parameterModifiers;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterParameterModifiers) {
      listener.enterParameterModifiers(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitParameterModifiers) {
      listener.exitParameterModifiers(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitParameterModifiers) {
      return visitor.visitParameterModifiers(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ModifierContext extends antlr.ParserRuleContext {
  public classModifier(): ClassModifierContext | null {
    return this.getRuleContext(0, ClassModifierContext);
  }
  public memberModifier(): MemberModifierContext | null {
    return this.getRuleContext(0, MemberModifierContext);
  }
  public visibilityModifier(): VisibilityModifierContext | null {
    return this.getRuleContext(0, VisibilityModifierContext);
  }
  public functionModifier(): FunctionModifierContext | null {
    return this.getRuleContext(0, FunctionModifierContext);
  }
  public propertyModifier(): PropertyModifierContext | null {
    return this.getRuleContext(0, PropertyModifierContext);
  }
  public inheritanceModifier(): InheritanceModifierContext | null {
    return this.getRuleContext(0, InheritanceModifierContext);
  }
  public parameterModifier(): ParameterModifierContext | null {
    return this.getRuleContext(0, ParameterModifierContext);
  }
  public platformModifier(): PlatformModifierContext | null {
    return this.getRuleContext(0, PlatformModifierContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_modifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterModifier) {
      listener.enterModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitModifier) {
      listener.exitModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitModifier) {
      return visitor.visitModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeModifiersContext extends antlr.ParserRuleContext {
  public typeModifier(): TypeModifierContext[];
  public typeModifier(i: number): TypeModifierContext | null;
  public typeModifier(i?: number): TypeModifierContext[] | TypeModifierContext | null {
    if (i === undefined) {
      return this.getRuleContexts(TypeModifierContext);
    }

    return this.getRuleContext(i, TypeModifierContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeModifiers;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeModifiers) {
      listener.enterTypeModifiers(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeModifiers) {
      listener.exitTypeModifiers(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeModifiers) {
      return visitor.visitTypeModifiers(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeModifierContext extends antlr.ParserRuleContext {
  public annotation(): AnnotationContext | null {
    return this.getRuleContext(0, AnnotationContext);
  }
  public SUSPEND(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SUSPEND, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeModifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeModifier) {
      listener.enterTypeModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeModifier) {
      listener.exitTypeModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeModifier) {
      return visitor.visitTypeModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ClassModifierContext extends antlr.ParserRuleContext {
  public ENUM(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ENUM, 0);
  }
  public SEALED(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SEALED, 0);
  }
  public ANNOTATION(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ANNOTATION, 0);
  }
  public DATA(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DATA, 0);
  }
  public INNER(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.INNER, 0);
  }
  public VALUE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.VALUE, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_classModifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterClassModifier) {
      listener.enterClassModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitClassModifier) {
      listener.exitClassModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitClassModifier) {
      return visitor.visitClassModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class MemberModifierContext extends antlr.ParserRuleContext {
  public OVERRIDE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.OVERRIDE, 0);
  }
  public LATEINIT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.LATEINIT, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_memberModifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterMemberModifier) {
      listener.enterMemberModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitMemberModifier) {
      listener.exitMemberModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitMemberModifier) {
      return visitor.visitMemberModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class VisibilityModifierContext extends antlr.ParserRuleContext {
  public PUBLIC(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.PUBLIC, 0);
  }
  public PRIVATE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.PRIVATE, 0);
  }
  public INTERNAL(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.INTERNAL, 0);
  }
  public PROTECTED(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.PROTECTED, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_visibilityModifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterVisibilityModifier) {
      listener.enterVisibilityModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitVisibilityModifier) {
      listener.exitVisibilityModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitVisibilityModifier) {
      return visitor.visitVisibilityModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class VarianceModifierContext extends antlr.ParserRuleContext {
  public IN(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.IN, 0);
  }
  public OUT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.OUT, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_varianceModifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterVarianceModifier) {
      listener.enterVarianceModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitVarianceModifier) {
      listener.exitVarianceModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitVarianceModifier) {
      return visitor.visitVarianceModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeParameterModifiersContext extends antlr.ParserRuleContext {
  public typeParameterModifier(): TypeParameterModifierContext[];
  public typeParameterModifier(i: number): TypeParameterModifierContext | null;
  public typeParameterModifier(i?: number): TypeParameterModifierContext[] | TypeParameterModifierContext | null {
    if (i === undefined) {
      return this.getRuleContexts(TypeParameterModifierContext);
    }

    return this.getRuleContext(i, TypeParameterModifierContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeParameterModifiers;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeParameterModifiers) {
      listener.enterTypeParameterModifiers(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeParameterModifiers) {
      listener.exitTypeParameterModifiers(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeParameterModifiers) {
      return visitor.visitTypeParameterModifiers(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class TypeParameterModifierContext extends antlr.ParserRuleContext {
  public reificationModifier(): ReificationModifierContext | null {
    return this.getRuleContext(0, ReificationModifierContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public varianceModifier(): VarianceModifierContext | null {
    return this.getRuleContext(0, VarianceModifierContext);
  }
  public annotation(): AnnotationContext | null {
    return this.getRuleContext(0, AnnotationContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_typeParameterModifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterTypeParameterModifier) {
      listener.enterTypeParameterModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitTypeParameterModifier) {
      listener.exitTypeParameterModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitTypeParameterModifier) {
      return visitor.visitTypeParameterModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class FunctionModifierContext extends antlr.ParserRuleContext {
  public TAILREC(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.TAILREC, 0);
  }
  public OPERATOR(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.OPERATOR, 0);
  }
  public INFIX(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.INFIX, 0);
  }
  public INLINE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.INLINE, 0);
  }
  public EXTERNAL(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.EXTERNAL, 0);
  }
  public SUSPEND(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SUSPEND, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_functionModifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterFunctionModifier) {
      listener.enterFunctionModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitFunctionModifier) {
      listener.exitFunctionModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitFunctionModifier) {
      return visitor.visitFunctionModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class PropertyModifierContext extends antlr.ParserRuleContext {
  public CONST(): antlr.TerminalNode {
    return this.getToken(KotlinParser.CONST, 0)!;
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_propertyModifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterPropertyModifier) {
      listener.enterPropertyModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitPropertyModifier) {
      listener.exitPropertyModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitPropertyModifier) {
      return visitor.visitPropertyModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class InheritanceModifierContext extends antlr.ParserRuleContext {
  public ABSTRACT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ABSTRACT, 0);
  }
  public FINAL(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.FINAL, 0);
  }
  public OPEN(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.OPEN, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_inheritanceModifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterInheritanceModifier) {
      listener.enterInheritanceModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitInheritanceModifier) {
      listener.exitInheritanceModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitInheritanceModifier) {
      return visitor.visitInheritanceModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ParameterModifierContext extends antlr.ParserRuleContext {
  public VARARG(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.VARARG, 0);
  }
  public NOINLINE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.NOINLINE, 0);
  }
  public CROSSINLINE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.CROSSINLINE, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_parameterModifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterParameterModifier) {
      listener.enterParameterModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitParameterModifier) {
      listener.exitParameterModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitParameterModifier) {
      return visitor.visitParameterModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class ReificationModifierContext extends antlr.ParserRuleContext {
  public REIFIED(): antlr.TerminalNode {
    return this.getToken(KotlinParser.REIFIED, 0)!;
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_reificationModifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterReificationModifier) {
      listener.enterReificationModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitReificationModifier) {
      listener.exitReificationModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitReificationModifier) {
      return visitor.visitReificationModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class PlatformModifierContext extends antlr.ParserRuleContext {
  public EXPECT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.EXPECT, 0);
  }
  public ACTUAL(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ACTUAL, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_platformModifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterPlatformModifier) {
      listener.enterPlatformModifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitPlatformModifier) {
      listener.exitPlatformModifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitPlatformModifier) {
      return visitor.visitPlatformModifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AnnotationContext extends antlr.ParserRuleContext {
  public singleAnnotation(): SingleAnnotationContext | null {
    return this.getRuleContext(0, SingleAnnotationContext);
  }
  public multiAnnotation(): MultiAnnotationContext | null {
    return this.getRuleContext(0, MultiAnnotationContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_annotation;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAnnotation) {
      listener.enterAnnotation(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAnnotation) {
      listener.exitAnnotation(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAnnotation) {
      return visitor.visitAnnotation(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class SingleAnnotationContext extends antlr.ParserRuleContext {
  public unescapedAnnotation(): UnescapedAnnotationContext {
    return this.getRuleContext(0, UnescapedAnnotationContext)!;
  }
  public annotationUseSiteTarget(): AnnotationUseSiteTargetContext | null {
    return this.getRuleContext(0, AnnotationUseSiteTargetContext);
  }
  public AT_NO_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.AT_NO_WS, 0);
  }
  public AT_PRE_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.AT_PRE_WS, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_singleAnnotation;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterSingleAnnotation) {
      listener.enterSingleAnnotation(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitSingleAnnotation) {
      listener.exitSingleAnnotation(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitSingleAnnotation) {
      return visitor.visitSingleAnnotation(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class MultiAnnotationContext extends antlr.ParserRuleContext {
  public LSQUARE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.LSQUARE, 0)!;
  }
  public RSQUARE(): antlr.TerminalNode {
    return this.getToken(KotlinParser.RSQUARE, 0)!;
  }
  public annotationUseSiteTarget(): AnnotationUseSiteTargetContext | null {
    return this.getRuleContext(0, AnnotationUseSiteTargetContext);
  }
  public AT_NO_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.AT_NO_WS, 0);
  }
  public AT_PRE_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.AT_PRE_WS, 0);
  }
  public unescapedAnnotation(): UnescapedAnnotationContext[];
  public unescapedAnnotation(i: number): UnescapedAnnotationContext | null;
  public unescapedAnnotation(i?: number): UnescapedAnnotationContext[] | UnescapedAnnotationContext | null {
    if (i === undefined) {
      return this.getRuleContexts(UnescapedAnnotationContext);
    }

    return this.getRuleContext(i, UnescapedAnnotationContext);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_multiAnnotation;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterMultiAnnotation) {
      listener.enterMultiAnnotation(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitMultiAnnotation) {
      listener.exitMultiAnnotation(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitMultiAnnotation) {
      return visitor.visitMultiAnnotation(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class AnnotationUseSiteTargetContext extends antlr.ParserRuleContext {
  public COLON(): antlr.TerminalNode {
    return this.getToken(KotlinParser.COLON, 0)!;
  }
  public AT_NO_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.AT_NO_WS, 0);
  }
  public AT_PRE_WS(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.AT_PRE_WS, 0);
  }
  public FIELD(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.FIELD, 0);
  }
  public PROPERTY(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.PROPERTY, 0);
  }
  public GET(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.GET, 0);
  }
  public SET(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SET, 0);
  }
  public RECEIVER(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.RECEIVER, 0);
  }
  public PARAM(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.PARAM, 0);
  }
  public SETPARAM(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SETPARAM, 0);
  }
  public DELEGATE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DELEGATE, 0);
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_annotationUseSiteTarget;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterAnnotationUseSiteTarget) {
      listener.enterAnnotationUseSiteTarget(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitAnnotationUseSiteTarget) {
      listener.exitAnnotationUseSiteTarget(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitAnnotationUseSiteTarget) {
      return visitor.visitAnnotationUseSiteTarget(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class UnescapedAnnotationContext extends antlr.ParserRuleContext {
  public constructorInvocation(): ConstructorInvocationContext | null {
    return this.getRuleContext(0, ConstructorInvocationContext);
  }
  public userType(): UserTypeContext | null {
    return this.getRuleContext(0, UserTypeContext);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_unescapedAnnotation;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterUnescapedAnnotation) {
      listener.enterUnescapedAnnotation(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitUnescapedAnnotation) {
      listener.exitUnescapedAnnotation(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitUnescapedAnnotation) {
      return visitor.visitUnescapedAnnotation(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class SimpleIdentifierContext extends antlr.ParserRuleContext {
  public Identifier(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.Identifier, 0);
  }
  public ABSTRACT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ABSTRACT, 0);
  }
  public ANNOTATION(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ANNOTATION, 0);
  }
  public BY(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.BY, 0);
  }
  public CATCH(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.CATCH, 0);
  }
  public COMPANION(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.COMPANION, 0);
  }
  public CONSTRUCTOR(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.CONSTRUCTOR, 0);
  }
  public CROSSINLINE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.CROSSINLINE, 0);
  }
  public DATA(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DATA, 0);
  }
  public DYNAMIC(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DYNAMIC, 0);
  }
  public ENUM(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ENUM, 0);
  }
  public EXTERNAL(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.EXTERNAL, 0);
  }
  public FINAL(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.FINAL, 0);
  }
  public FINALLY(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.FINALLY, 0);
  }
  public GET(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.GET, 0);
  }
  public IMPORT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.IMPORT, 0);
  }
  public INFIX(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.INFIX, 0);
  }
  public INIT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.INIT, 0);
  }
  public INLINE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.INLINE, 0);
  }
  public INNER(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.INNER, 0);
  }
  public INTERNAL(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.INTERNAL, 0);
  }
  public LATEINIT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.LATEINIT, 0);
  }
  public NOINLINE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.NOINLINE, 0);
  }
  public OPEN(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.OPEN, 0);
  }
  public OPERATOR(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.OPERATOR, 0);
  }
  public OUT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.OUT, 0);
  }
  public OVERRIDE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.OVERRIDE, 0);
  }
  public PRIVATE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.PRIVATE, 0);
  }
  public PROTECTED(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.PROTECTED, 0);
  }
  public PUBLIC(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.PUBLIC, 0);
  }
  public REIFIED(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.REIFIED, 0);
  }
  public SEALED(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SEALED, 0);
  }
  public TAILREC(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.TAILREC, 0);
  }
  public SET(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SET, 0);
  }
  public VARARG(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.VARARG, 0);
  }
  public WHERE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.WHERE, 0);
  }
  public FIELD(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.FIELD, 0);
  }
  public PROPERTY(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.PROPERTY, 0);
  }
  public RECEIVER(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.RECEIVER, 0);
  }
  public PARAM(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.PARAM, 0);
  }
  public SETPARAM(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SETPARAM, 0);
  }
  public DELEGATE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.DELEGATE, 0);
  }
  public FILE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.FILE, 0);
  }
  public EXPECT(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.EXPECT, 0);
  }
  public ACTUAL(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.ACTUAL, 0);
  }
  public CONST(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.CONST, 0);
  }
  public SUSPEND(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.SUSPEND, 0);
  }
  public VALUE(): antlr.TerminalNode | null {
    return this.getToken(KotlinParser.VALUE, 0);
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_simpleIdentifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterSimpleIdentifier) {
      listener.enterSimpleIdentifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitSimpleIdentifier) {
      listener.exitSimpleIdentifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitSimpleIdentifier) {
      return visitor.visitSimpleIdentifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}

export class IdentifierContext extends antlr.ParserRuleContext {
  public simpleIdentifier(): SimpleIdentifierContext[];
  public simpleIdentifier(i: number): SimpleIdentifierContext | null;
  public simpleIdentifier(i?: number): SimpleIdentifierContext[] | SimpleIdentifierContext | null {
    if (i === undefined) {
      return this.getRuleContexts(SimpleIdentifierContext);
    }

    return this.getRuleContext(i, SimpleIdentifierContext);
  }
  public DOT(): antlr.TerminalNode[];
  public DOT(i: number): antlr.TerminalNode | null;
  public DOT(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.DOT);
    } else {
      return this.getToken(KotlinParser.DOT, i);
    }
  }
  public NL(): antlr.TerminalNode[];
  public NL(i: number): antlr.TerminalNode | null;
  public NL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    if (i === undefined) {
      return this.getTokens(KotlinParser.NL);
    } else {
      return this.getToken(KotlinParser.NL, i);
    }
  }
  public override get ruleIndex(): number {
    return KotlinParser.RULE_identifier;
  }
  public override enterRule(listener: KotlinParserListener): void {
    if (listener.enterIdentifier) {
      listener.enterIdentifier(this);
    }
  }
  public override exitRule(listener: KotlinParserListener): void {
    if (listener.exitIdentifier) {
      listener.exitIdentifier(this);
    }
  }
  public override accept<Result>(visitor: KotlinParserVisitor<Result>): Result | null {
    if (visitor.visitIdentifier) {
      return visitor.visitIdentifier(this);
    } else {
      return visitor.visitChildren(this);
    }
  }
}
