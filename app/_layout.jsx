import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import AuthWrapper from "../components/AuthWrapper"; // ✅ ใช้ AuthWrapper แทน SyncUser
import RealtimeBridge from "../components/RealtimeBridge";

import SyncPushToken from "../components/SyncPushToken";
import ClerkWrapper from "../config/clerkProvider";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    outfit: require("../assets/fonts/Outfit-Regular.ttf"),
    "outfit-medium": require("../assets/fonts/Outfit-Medium.ttf"),
    "outfit-bold": require("../assets/fonts/Outfit-Bold.ttf"),
  });

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#fff",
        }}
      >
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <ClerkWrapper>
      <RealtimeBridge />
      <AuthWrapper />
      <SyncPushToken />
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
    </ClerkWrapper>
  );
}
