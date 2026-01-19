import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("plugin.serialization") version "2.0.21"
    application
}

group = "ultrascript"
version = "1.0.0"

repositories {
    mavenCentral()
    maven("https://maven.pkg.jetbrains.space/kotlin/p/kotlin/kotlin-ide-plugin-dependencies")
}

val kotlinVersion = "2.0.21"

dependencies {
    // Kotlin standard library
    implementation(kotlin("stdlib"))

    // Kotlin Compiler for PSI parsing
    implementation("org.jetbrains.kotlin:kotlin-compiler-embeddable:$kotlinVersion")

    // Kotlin Analysis API (K2/FIR)
    implementation("org.jetbrains.kotlin:analysis-api-standalone-for-ide:$kotlinVersion") {
        isTransitive = true
    }
    implementation("org.jetbrains.kotlin:analysis-api-impl-base:$kotlinVersion")
    implementation("org.jetbrains.kotlin:high-level-api-fir-for-ide:$kotlinVersion")
    implementation("org.jetbrains.kotlin:low-level-api-fir-for-ide:$kotlinVersion")
    implementation("org.jetbrains.kotlin:symbol-light-classes-for-ide:$kotlinVersion")

    // JSON serialization for stdin/stdout protocol
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // Logging
    implementation("io.github.microutils:kotlin-logging-jvm:3.0.5")
    implementation("ch.qos.logback:logback-classic:1.4.14")
}

application {
    mainClass.set("ultrascript.K2CliKt")
}

tasks.withType<KotlinCompile> {
    kotlinOptions {
        jvmTarget = "11"
        freeCompilerArgs = listOf(
            "-Xcontext-receivers",
            "-opt-in=org.jetbrains.kotlin.analysis.api.KaExperimentalApi",
            "-opt-in=org.jetbrains.kotlin.analysis.api.KaNonPublicApi"
        )
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
