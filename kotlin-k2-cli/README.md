# Kotlin K2 CLI

High-performance Kotlin parser using Kotlin PSI (Program Structure Interface).
Provides accurate AST extraction via embedded Kotlin compiler.

## Features

- Package, import, class, interface, object, enum extraction
- Function and property extraction with full signatures
- Call graph extraction from method bodies
- Modifier and annotation support
- KDoc documentation extraction
- JSON Lines protocol for easy integration

## Requirements

- JDK 11+ (for running)
- Gradle 8.x (for building)

## Building

```bash
# Option 1: Using Gradle wrapper (after generating)
./gradlew fatJar

# Option 2: Using system Gradle
gradle fatJar

# Option 3: Windows without wrapper
gradle.bat fatJar
```

The fat JAR will be created at:
`build/libs/kotlin-k2-cli-1.0.0-all.jar`

## Usage

The CLI reads JSON commands from stdin and writes results to stdout.

### Parse Command

```json
{"id": "uuid", "type": "parse", "filePath": "src/main/kotlin/Example.kt", "content": "package example\nclass Example"}
```

### Response

```json
{"id": "uuid", "success": true, "entities": [...], "relationships": [...], "callGraph": [...]}
```

### Shutdown Command

```json
{"id": "uuid", "type": "shutdown"}
```

## Running Manually

```bash
java -Xms256m -Xmx1g -jar build/libs/kotlin-k2-cli-1.0.0-all.jar
```

## Protocol

- Communication via JSON Lines (one JSON object per line)
- stdin: Commands
- stdout: Results
- stderr: Logs

## Integration with UltraScript

The `kotlin-k2-provider.ts` in the parent project automatically:
1. Detects JVM 11+
2. Starts K2 CLI as subprocess
3. Sends parse requests via stdin
4. Receives results via stdout

If K2 CLI JAR is not found, UltraScript falls back to ANTLR-based parsing.
