plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("plugin.serialization") version "2.0.21"
    application
}

group = "ultrascript"
version = "1.0.0"

repositories {
    mavenCentral()
    // JetBrains repositories for Analysis API and its transitive dependencies
    maven("https://maven.pkg.jetbrains.space/kotlin/p/kotlin/kotlin-ide-plugin-dependencies")
    maven("https://packages.jetbrains.team/maven/p/ij/intellij-dependencies")
    maven("https://www.jetbrains.com/intellij-repository/releases")
}

// Kotlin compiler version
val kotlinVersion = "2.0.21"
// Analysis API version (from intellij-dependencies repo)
val analysisApiVersion = "2.0.21-release-482"

dependencies {
    // Kotlin standard library
    implementation(kotlin("stdlib"))

    // Kotlin Compiler for PSI parsing
    implementation("org.jetbrains.kotlin:kotlin-compiler-embeddable:$kotlinVersion")

    // Kotlin Analysis API (K2/FIR) - from intellij-dependencies repo
    implementation("org.jetbrains.kotlin:analysis-api-standalone-for-ide:$analysisApiVersion")

    // JSON serialization for stdin/stdout protocol
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // Logging
    implementation("io.github.microutils:kotlin-logging-jvm:3.0.5")
    implementation("ch.qos.logback:logback-classic:1.4.14")
}

application {
    mainClass.set("ultrascript.K2CliKt")
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11)
    }
}

tasks.withType<JavaCompile> {
    sourceCompatibility = "11"
    targetCompatibility = "11"
}

// Fat JAR with all dependencies
tasks.register<Jar>("fatJar") {
    group = "build"
    description = "Creates a fat JAR with all dependencies"

    archiveBaseName.set("kotlin-k2-cli")
    archiveClassifier.set("all")

    manifest {
        attributes["Main-Class"] = "ultrascript.K2CliKt"
    }

    duplicatesStrategy = DuplicatesStrategy.EXCLUDE

    from(sourceSets.main.get().output)

    dependsOn(configurations.runtimeClasspath)
    from({
        configurations.runtimeClasspath.get().filter { it.name.endsWith("jar") }.map { zipTree(it) }
    })
}

// Alias for convenience
tasks.register("shadowJar") {
    group = "build"
    dependsOn("fatJar")
}
