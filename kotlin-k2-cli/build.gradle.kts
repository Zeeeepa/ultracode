plugins {
    kotlin("jvm") version "2.1.20-dev-6663"
    kotlin("plugin.serialization") version "2.1.20-dev-6663"
    application
}

group = "ultrascript"
version = "1.0.0"

repositories {
    mavenCentral()
    // JetBrains bootstrap repo for dev versions of Analysis API
    maven("https://packages.jetbrains.team/maven/p/kt/bootstrap")
}

val kotlinVersion = "2.1.20-dev-6663"

dependencies {
    // Kotlin standard library
    implementation(kotlin("stdlib"))

    // Kotlin Compiler for PSI parsing
    implementation("org.jetbrains.kotlin:kotlin-compiler-embeddable:$kotlinVersion")

    // Kotlin Analysis API (K2/FIR) - dev version from bootstrap repo
    implementation("org.jetbrains.kotlin:analysis-api-for-ide:$kotlinVersion")

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
