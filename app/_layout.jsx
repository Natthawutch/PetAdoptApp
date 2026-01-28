import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";

import AuthWrapper from "../components/AuthWrapper";
import RealtimeBridge from "../components/RealtimeBridge";
import ClerkWrapper from "../config/clerkProvider";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    outfit: require("../assets/fonts/Outfit-Regular.ttf"),
    "outfit-medium": require("../assets/fonts/Outfit-Medium.ttf"),
    "outfit-bold": require("../assets/fonts/Outfit-Bold.ttf"),
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ClerkWrapper>
      <RealtimeBridge />

      {/* ✅ AuthWrapper ต้องครอบ Stack แต่หน้า index จะ bypass ได้เพราะมี auth check ของตัวเอง */}
      <AuthWrapper>
        <StatusBar style="dark" />

        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login/index" />
          <Stack.Screen name="register/index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="admin" />
          <Stack.Screen name="add-new-pet/index" />
          <Stack.Screen name="pet-details/index" />
          <Stack.Screen name="Favorite/favorite" />
          <Stack.Screen name="Inbox/inbox" />
          <Stack.Screen name="user-post/index" />
        </Stack>
      </AuthWrapper>
    </ClerkWrapper>
  );
}
