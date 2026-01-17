import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
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

  // TODO: แทนที่ด้วยข้อมูลจริงจาก backend
  const [stats] = useState({
    helpedAnimals: 24,
    completedTasks: 18,
    activeHours: 156,
    activeTasks: 2,
    hoursThisMonth: 12,
    rating: 4.7,
  });

  // TODO: แทนที่ด้วยประวัติงานจริง
  const recentActivities = useMemo(
    () => [
      {
        id: "a1",
        title: "ให้อาหารแมวจร (โซน A)",
        subtitle: "ภารกิจสำเร็จ • เพิ่ม 1.5 ชม.",
        icon: "paw-outline",
        iconBg: "#dcfce7",
        iconColor: "#22c55e",
        timeText: "วันนี้ 09:20",
      },
      {
        id: "a2",
        title: "ช่วยพาสุนัขไปพบสัตวแพทย์",
        subtitle: "กำลังดำเนินการ",
        icon: "medkit-outline",
        iconBg: "#dbeafe",
        iconColor: "#3b82f6",
        timeText: "เมื่อวาน 16:40",
      },
      {
        id: "a3",
        title: "ทำความสะอาดพื้นที่พักสัตว์",
        subtitle: "ภารกิจสำเร็จ • เพิ่ม 2 ชม.",
        icon: "sparkles-outline",
        iconBg: "#fef3c7",
        iconColor: "#f59e0b",
        timeText: "10 ม.ค.",
      },
    ],
    []
  );

  const handleLogout = () => {
    Alert.alert("ออกจากระบบ", "คุณต้องการออกจากระบบใช่หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ออกจากระบบ",
        style: "destructive",
        onPress: async () => {
          await signOut({ redirectUrl: "/" }); // หรือ "/(auth)/sign-in"
        },
      },
    ]);
  };

  const quickActions = [
    {
      id: "q1",
      title: "งานของฉัน",
      subtitle: "งานที่รับไว้/กำลังทำ",
      icon: "clipboard-outline",
      color: "#8b5cf6",
      onPress: () => router.push("/volunteer/my-tasks"),
    },
    {
      id: "q2",
      title: "ประวัติภารกิจ",
      subtitle: "งานที่ทำสำเร็จทั้งหมด",
      icon: "time-outline",
      color: "#3b82f6",
      onPress: () => router.push("/volunteer/history"),
    },
    {
      id: "q3",
      title: "เช็คอิน / QR",
      subtitle: "เริ่มงานและบันทึกเวลา",
      icon: "qr-code-outline",
      color: "#22c55e",
      onPress: () => router.push("/volunteer/check-in"),
    },
  ];

  const menuItems = [
    {
      id: "m1",
      icon: "person-outline",
      title: "ข้อมูลอาสา",
      subtitle: "แก้ไขโปรไฟล์/ทักษะ/พื้นที่",
      color: "#8b5cf6",
      onPress: () => router.push("/volunteer/edit-profile"),
    },
    {
      id: "m2",
      icon: "document-text-outline",
      title: "ชั่วโมงอาสา",
      subtitle: "สรุปชั่วโมงและใบรับรอง",
      color: "#3b82f6",
      onPress: () => router.push("/volunteer/hours"),
    },
    {
      id: "m3",
      icon: "notifications-outline",
      title: "การแจ้งเตือน",
      subtitle: "ตั้งค่าการแจ้งเตือนงานใหม่",
      color: "#f59e0b",
      onPress: () => router.push("/settings/notifications"),
    },
    {
      id: "m4",
      icon: "shield-checkmark-outline",
      title: "ความปลอดภัย",
      subtitle: "ความเป็นส่วนตัวและบัญชี",
      color: "#22c55e",
      onPress: () => router.push("/settings/security"),
    },
    {
      id: "m5",
      icon: "help-circle-outline",
      title: "ช่วยเหลือ",
      subtitle: "คำถามที่พบบ่อย/ติดต่อทีมงาน",
      color: "#64748b",
      onPress: () => router.push("/help"),
    },
  ];

  const fullName = user?.fullName || "อาสาสมัคร";
  const email = user?.primaryEmailAddress?.emailAddress || "";

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.profileCard}>
          <View style={styles.avatarRow}>
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

            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{fullName}</Text>
              {!!email && <Text style={styles.email}>{email}</Text>}

              <View style={styles.roleBadge}>
                <Ionicons name="ribbon" size={14} color="#16a34a" />
                <Text style={styles.roleText}>Volunteer</Text>

                <View style={styles.dotSep} />
                <Ionicons name="star" size={14} color="#f59e0b" />
                <Text style={styles.roleMeta}>{stats.rating.toFixed(1)}</Text>
              </View>
            </View>
          </View>

          {/* Volunteer Summary */}
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>ชั่วโมงเดือนนี้</Text>
              <Text style={styles.summaryValue}>{stats.hoursThisMonth}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>งานกำลังทำ</Text>
              <Text style={styles.summaryValue}>{stats.activeTasks}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>งานสำเร็จ</Text>
              <Text style={styles.summaryValue}>{stats.completedTasks}</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickSection}>
          {quickActions.map((qa) => (
            <Pressable
              key={qa.id}
              style={styles.quickCard}
              onPress={qa.onPress}
              android_ripple={{ color: "#f1f5f9" }}
            >
              <View
                style={[styles.quickIcon, { backgroundColor: `${qa.color}15` }]}
              >
                <Ionicons name={qa.icon} size={22} color={qa.color} />
              </View>
              <Text style={styles.quickTitle}>{qa.title}</Text>
              <Text style={styles.quickSubtitle}>{qa.subtitle}</Text>
            </Pressable>
          ))}
        </View>

        {/* Stats */}
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
            <Text style={styles.statLabel}>ภารกิจสำเร็จ</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: "#fef3c7" }]}>
              <Ionicons name="time" size={20} color="#f59e0b" />
            </View>
            <Text style={styles.statNumber}>{stats.activeHours}</Text>
            <Text style={styles.statLabel}>ชั่วโมงสะสม</Text>
          </View>
        </View>
      </View>

      {/* Recent Activities */}
      <View style={styles.menuSection}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>กิจกรรมล่าสุด</Text>
          <Pressable onPress={() => router.push("/volunteer/history")}>
            <Text style={styles.seeAll}>ดูทั้งหมด</Text>
          </Pressable>
        </View>

        <View style={styles.activityBox}>
          {recentActivities.map((a, idx) => (
            <View
              key={a.id}
              style={[
                styles.activityItem,
                idx === recentActivities.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <View
                style={[styles.activityIcon, { backgroundColor: a.iconBg }]}
              >
                <Ionicons name={a.icon} size={20} color={a.iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityTitle}>{a.title}</Text>
                <Text style={styles.activitySub}>{a.subtitle}</Text>
              </View>
              <Text style={styles.activityTime}>{a.timeText}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Settings */}
      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>การตั้งค่าอาสา</Text>

        <View style={styles.menuBox}>
          {menuItems.map((item, index) => (
            <Pressable
              key={item.id}
              style={[
                styles.menuItem,
                index === 0 && styles.menuItemFirst,
                index === menuItems.length - 1 && styles.menuItemLast,
              ]}
              onPress={item.onPress}
              android_ripple={{ color: "#f1f5f9" }}
            >
              <View
                style={[
                  styles.menuIcon,
                  { backgroundColor: `${item.color}15` },
                ]}
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
      </View>

      {/* Logout */}
      <Pressable style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={22} color="#ef4444" />
        <Text style={styles.logoutText}>ออกจากระบบ</Text>
      </Pressable>

      <Text style={styles.version}>เวอร์ชัน 1.0.0</Text>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },

  header: { paddingTop: 60, paddingBottom: 16 },

  profileCard: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },

  avatarRow: { flexDirection: "row", gap: 14, alignItems: "center" },

  avatarContainer: { position: "relative" },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: "#f1f5f9",
  },
  avatarPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#f5f3ff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#f1f5f9",
  },
  statusBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22c55e",
  },

  name: { fontSize: 20, fontWeight: "800", color: "#1e293b" },
  email: { fontSize: 13, color: "#64748b", marginTop: 2, marginBottom: 10 },

  roleBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dcfce7",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    gap: 6,
  },
  roleText: {
    color: "#16a34a",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  roleMeta: { color: "#92400e", fontWeight: "800", fontSize: 12 },
  dotSep: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#bbf7d0",
    marginHorizontal: 2,
  },

  summaryGrid: { flexDirection: "row", gap: 10, marginTop: 16 },
  summaryCard: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#eef2f7",
  },
  summaryLabel: { fontSize: 12, color: "#64748b", marginBottom: 6 },
  summaryValue: { fontSize: 18, fontWeight: "900", color: "#1e293b" },

  quickSection: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  quickCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  quickTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 2,
  },
  quickSubtitle: { fontSize: 11, color: "#64748b" },

  statsSection: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 20,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  statItem: { flex: 1, alignItems: "center" },
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
    fontWeight: "900",
    color: "#1e293b",
    marginBottom: 2,
  },
  statLabel: { fontSize: 11, color: "#64748b", textAlign: "center" },
  statDivider: { width: 1, backgroundColor: "#e2e8f0", marginHorizontal: 10 },

  menuSection: { paddingHorizontal: 20, marginTop: 18 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 12,
  },
  seeAll: { color: "#3b82f6", fontWeight: "700" },

  activityBox: {
    backgroundColor: "#fff",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  activityTitle: { fontSize: 14, fontWeight: "800", color: "#1e293b" },
  activitySub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  activityTime: { fontSize: 11, color: "#94a3b8" },

  menuBox: {
    backgroundColor: "#fff",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  menuItemFirst: { borderTopWidth: 0 },
  menuItemLast: {},
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  menuContent: { flex: 1 },
  menuTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 2,
  },
  menuSubtitle: { fontSize: 13, color: "#64748b" },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: 22,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#fee2e2",
    gap: 8,
  },
  logoutText: { color: "#ef4444", fontWeight: "800", fontSize: 15 },

  version: {
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 20,
  },
});
