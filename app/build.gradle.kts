plugins {
    id("com.android.application")
}

// The user authorized publisher rewarded ads for this delivery. For development
// or device testing, explicitly use -PadmobLiveAds=false for Google's sample unit.
val admobLiveAds = providers.gradleProperty("admobLiveAds").map(String::toBoolean).orElse(true).get()

android {
    namespace = "com.rbabbit.blocknight.warzone"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.rbabbit.warzonetowers.lab"
        minSdk = 26
        targetSdk = 36
        versionCode = 78
        versionName = "0.78"
        manifestPlaceholders["admobAppId"] = "ca-app-pub-3430279660625393~3119801475"
        buildConfigField("boolean", "ADMOB_TEST_ADS", (!admobLiveAds).toString())
        buildConfigField("String", "ADMOB_REWARDED_AD_UNIT_ID", "\"" + (if (admobLiveAds)
            "ca-app-pub-3430279660625393/5338770704" else "ca-app-pub-3940256099942544/5224354917") + "\"")
    }

    buildFeatures { buildConfig = true }

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
    implementation("com.google.android.gms:play-services-ads:25.5.0")
    implementation("com.google.android.ump:user-messaging-platform:4.0.0")
}

tasks.withType<org.gradle.api.tasks.compile.JavaCompile>().configureEach {
    options.encoding = "UTF-8"
}
