// import "dotenv/config";

export default {
  expo: {
    name: "Stay Dog&Cat Care",
    slug: "pet-adoption-app",
    version: "1.0.0",
    scheme: "petadoption",

    icon: "./assets/images/icon1.png",

    android: {
      package: "com.cmru.petadoption",
      usesCleartextTraffic: true,
      intentFilters: [
        {
          action: "VIEW",
          data: [{ scheme: "petadoption" }],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },

    ios: {
      bundleIdentifier: "com.cmru.petadoption",
      scheme: "petadoption",
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
      },
    },

    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png",
    },

    extra: {
      // 🔑 ENV
      clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,

      // ✅ EAS PROJECT ID (สำคัญ)
      eas: {
        projectId: "b107fb4b-86b8-4475-8f1b-d1380a0d1620",
      },
    },
  },
};
