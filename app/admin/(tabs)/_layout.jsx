import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import AdminGuard from "../../../components/AdminGuard";

function TabIcon({ name, color, focused, badgeCount }) {
  return (
    <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
      <Ionicons name={name} size={24} color={color} />
      {!!badgeCount && badgeCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </Text>
        </View>
      )}
    </View>
  );
}

function AdminTabsLayout() {
  // TODO: แนะนำให้ดึงจาก DB จริง เช่นจำนวน pending verifications
  const notificationCount = 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#6366f1",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowOffset: { width: 0, height: -4 },
          shadowRadius: 12,
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          position: "absolute",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginTop: 4,
        },
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "bar-chart" : "bar-chart-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="users"
        options={{
          title: "Users",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "people" : "people-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "notifications" : "notifications-outline"}
              color={color}
              focused={focused}
              badgeCount={notificationCount}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="verifications"
        options={{
          title: "Verifications",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              // ✅ Ionicons ไม่มี "verifications" ให้ใช้ไอคอนที่ใกล้เคียง
              name={focused ? "shield-checkmark" : "shield-checkmark-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="volunteers"
        options={{
          title: "Volunteers",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "people" : "people-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="adminprofile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "person" : "person-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}

// ✅ Wrap ด้วย AdminGuard
export default function AdminLayout() {
  return (
    <AdminGuard>
      <AdminTabsLayout />
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 25,
    position: "relative",
  },
  iconContainerActive: {
    backgroundColor: "#eef2ff",
  },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
});
