plugins {
    id("com.android.application")
}

val playStoreBuild = providers.gradleProperty("playStoreBuild").map(String::toBoolean).orElse(false).get()

android {
    namespace = "com.rbabbit.blocknight.warzone"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.rbabbit.warzonetowers.lab"
        minSdk = 26
        targetSdk = 36
        versionCode = 110
        versionName = "0.99.10"
        buildConfigField("boolean", "PLAY_STORE_BUILD", playStoreBuild.toString())
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    androidResources {
        noCompress += listOf("wasm", "data")
    }

    // Keep private signing inputs outside the project, archives and command line.
    signingConfigs {
        create("publisher") {
            providers.environmentVariable("WZ_RELEASE_KEYSTORE").orNull?.let { storeFile = file(it) }
            storePassword = providers.environmentVariable("WZ_RELEASE_STORE_PASSWORD").orNull
            keyAlias = providers.environmentVariable("WZ_RELEASE_KEY_ALIAS").orNull
            keyPassword = providers.environmentVariable("WZ_RELEASE_KEY_PASSWORD").orNull
        }
    }
    buildTypes {
        getByName("release") {
            isDebuggable = false
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("publisher")
        }
    }
    if (playStoreBuild) {
        sourceSets {
            getByName("release") {
                manifest.srcFile("src/playRelease/AndroidManifest.xml")
                java.directories.add("src/playRelease/java")
            }
        }
    }
}

dependencies {
    implementation("org.chromium.net:cronet-bundled:500.1.0")
    implementation("androidx.webkit:webkit:1.18.0")
}

tasks.withType<org.gradle.api.tasks.compile.JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    if (playStoreBuild) {
        val directUpdaterRoot = file("src/main/java").canonicalFile.toPath()
        exclude { entry ->
            entry.file.name.startsWith("AppUpdate") &&
                entry.file.canonicalFile.toPath().startsWith(directUpdaterRoot)
        }
    }
}
