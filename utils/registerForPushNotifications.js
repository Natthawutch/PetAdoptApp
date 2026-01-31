import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export async function registerForPushNotificationsAsync() {
  try {
    if (!Device.isDevice) {
      console.log("❌ ต้องใช้มือถือจริง (Device.isDevice = false)");
      return null;
    }

    // ✅ ขอ permission
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();

    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("❌ ผู้ใช้ไม่อนุญาต notification");
      return null;
    }

    // ✅ Android ต้องมี channel
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    // ✅ สำคัญ: projectId (โดยเฉพาะ dev-client/eas build)
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      // @ts-ignore
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.log("❌ projectId not found");
      console.log("👉 แก้: ใส่ extra.eas.projectId ใน app.json/app.config.js");
      return null;
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId }))
      .data;

    console.log("📱 Expo Push Token:", token);

    return token;
  } catch (e) {
    console.log("❌ registerForPushNotificationsAsync error:", e);
    return null;
  }
}
