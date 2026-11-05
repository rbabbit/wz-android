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
        versionCode = 59
        versionName = "5.9-single-tap-build"
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
