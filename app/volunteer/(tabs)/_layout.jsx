import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function VolunteerTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#8B5CF6",
      }}
    >
      {/* 🥇 Reports = งานหลัก */}
      <Tabs.Screen
        name="reports"
        options={{
          title: "เคสช่วยเหลือ",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="alert-circle-outline" size={size} color={color} />
          ),
        }}
      />

      {/* 🥈 Dashboard */}
      <Tabs.Screen
        name="index"
        options={{
          title: "แดชบอร์ด",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="speedometer-outline" size={size} color={color} />
          ),
        }}
      />

      {/* 🥉 Chat
      <Tabs.Screen
        name="chats"
        options={{
          title: "แชท",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      /> */}

      {/* Notifications */}
      <Tabs.Screen
        name="notifications"
        options={{
          title: "แจ้งเตือน",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Adoption */}
      <Tabs.Screen
        name="adoption"
        options={{
          title: "หาบ้าน",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Profile = ท้ายสุดเสมอ */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "โปรไฟล์",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
