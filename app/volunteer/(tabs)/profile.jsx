import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
    Alert,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

export default function VolunteerProfile() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();

  const stats = {
    helpedAnimals: 24,
    completedTasks: 18,
    activeHours: 156,
  };

  const handleLogout = () => {
    Alert.alert("ออกจากระบบ", "คุณต้องการออกจากระบบใช่หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ออกจากระบบ",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/sign-in");
        },
      },
    ]);
  };

  const menuItems = [
    {
      id: "1",
      icon: "person-outline",
      title: "แก้ไขโปรไฟล์",
      subtitle: "จัดการข้อมูลส่วนตัว",
      color: "#8b5cf6",
      onPress: () => {},
    },
    {
      id: "2",
      icon: "notifications-outline",
      title: "การแจ้งเตือน",
      subtitle: "ตั้งค่าการแจ้งเตือน",
      color: "#3b82f6",
      onPress: () => {},
    },
    {
      id: "3",
      icon: "shield-checkmark-outline",
      title: "ความปลอดภัย",
      subtitle: "รหัสผ่านและความเป็นส่วนตัว",
      color: "#22c55e",
      onPress: () => {},
    },
    {
      id: "4",
      icon: "help-circle-outline",
      title: "ช่วยเหลือและคำถาม",
      subtitle: "คำถามที่พบบ่อยและการติดต่อ",
      color: "#f59e0b",
      onPress: () => {},
    },
    {
      id: "5",
      icon: "document-text-outline",
      title: "เงื่อนไขการใช้งาน",
      subtitle: "นโยบายและข้อตกลง",
      color: "#64748b",
      onPress: () => {},
    },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.profileCard}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={48} color="#8b5cf6" />
              </View>
            )}
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
            </View>
          </View>

          {/* User Info */}
          <Text style={styles.name}>{user?.fullName || "อาสาสมัคร"}</Text>
          <Text style={styles.email}>
            {user?.primaryEmailAddress?.emailAddress}
          </Text>

          {/* Role Badge */}
          <View style={styles.roleBadge}>
            <Ionicons name="ribbon" size={14} color="#22c55e" />
            <Text style={styles.roleText}>อาสาสมัคร</Text>
          </View>
        </View>

        {/* Stats Section */}
        <View style={styles.statsSection}>
          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: "#dcfce7" }]}>
              <Ionicons name="paw" size={20} color="#22c55e" />
            </View>
            <Text style={styles.statNumber}>{stats.helpedAnimals}</Text>
            <Text style={styles.statLabel}>สัตว์ที่ช่วยแล้ว</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: "#dbeafe" }]}>
              <Ionicons name="checkmark-done" size={20} color="#3b82f6" />
            </View>
            <Text style={styles.statNumber}>{stats.completedTasks}</Text>
            <Text style={styles.statLabel}>งานสำเร็จ</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: "#fef3c7" }]}>
              <Ionicons name="time" size={20} color="#f59e0b" />
            </View>
            <Text style={styles.statNumber}>{stats.activeHours}</Text>
            <Text style={styles.statLabel}>ชั่วโมง</Text>
          </View>
        </View>
      </View>

      {/* Menu Section */}
      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>การตั้งค่า</Text>

        {menuItems.map((item, index) => (
          <Pressable
            key={item.id}
            style={[
              styles.menuItem,
              index === menuItems.length - 1 && styles.menuItemLast,
            ]}
            onPress={item.onPress}
            android_ripple={{ color: "#f1f5f9" }}
          >
            <View
              style={[styles.menuIcon, { backgroundColor: `${item.color}15` }]}
            >
              <Ionicons name={item.icon} size={22} color={item.color} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
          </Pressable>
        ))}
      </View>

      {/* Logout Button */}
      <Pressable style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={22} color="#ef4444" />
        <Text style={styles.logoutText}>ออกจากระบบ</Text>
      </Pressable>

      {/* App Version */}
      <Text style={styles.version}>เวอร์ชัน 1.0.0</Text>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
  },
  profileCard: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: "#f1f5f9",
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#f5f3ff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#f1f5f9",
  },
  statusBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22c55e",
  },
  name: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 12,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dcfce7",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  roleText: {
    color: "#16a34a",
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  statsSection: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 12,
  },
  menuSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  menuItemLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 13,
    color: "#64748b",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#fee2e2",
    gap: 8,
  },
  logoutText: {
    color: "#ef4444",
    fontWeight: "700",
    fontSize: 15,
  },
  version: {
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 24,
  },
});
