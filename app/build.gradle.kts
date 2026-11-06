plugins {
    id("com.android.application")
}

android {
    namespace = "com.rbabbit.blocknight.warzone"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.rbabbit.warzonetowers"
        minSdk = 26
        targetSdk = 36
        versionCode = 67
        versionName = "6.4-build-display"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    androidResources {
        noCompress += listOf("wasm", "data")
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.18.0")
}

tasks.withType<org.gradle.api.tasks.compile.JavaCompile>().configureEach {
    options.encoding = "UTF-8"
}
