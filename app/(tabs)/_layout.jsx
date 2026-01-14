import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import Color from "../../constants/Colors";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Color.BLACK,
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopWidth: 0,
          elevation: 5,
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowOffset: { width: 0, height: -2 },
          shadowRadius: 10,
          height: 60,
          paddingBottom: 5,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          overflow: "hidden",
        },
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: "600",
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "หน้าแรก",
          tabBarIcon: ({ color }) => (
            <Ionicons name="home-sharp" size={25} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="report"
        options={{
          title: "แจ้งสัตว์จร",
          tabBarIcon: ({ color }) => (
            <Ionicons name="alert-circle" size={25} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="add-pet"
        options={{
          title: "เพิ่มสัตว์เลี้ยง",
          tabBarIcon: ({ color }) => (
            <Ionicons name="add-circle" size={25} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="notifications" // เปลี่ยนตรงนี้
        options={{
          title: "การแจ้งเตือน", // เปลี่ยน title
          tabBarIcon: ({ color }) => (
            <Ionicons name="notifications" size={25} color={color} /> // เปลี่ยนไอคอนเป็น notifications
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "โปรไฟล์",
          tabBarIcon: ({ color }) => (
            <Ionicons name="people-circle-sharp" size={25} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
