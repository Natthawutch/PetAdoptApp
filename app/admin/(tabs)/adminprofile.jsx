import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  clearClerkToken,
  createClerkSupabaseClient,
  resetRealtimeClient,
} from "../../../config/supabaseClient";
import { fetchDashboardStats } from "../../../lib/dashboardApi";
import { clearAdminStatus } from "../../../utils/adminStorage";

const RESET_STATS = {
  totalUsers: null,
  volunteers: null,
  pendingApprovals: null,
  animalsLookingForHome: null,
  adoptionsSuccess: null,
};

const safeText = (v, fallback = "-") =>
  v === null || v === undefined || String(v).trim() === ""
    ? fallback
    : String(v);

export default function AdminProfile() {
  const { user, isLoaded } = useUser();
  const { signOut, getToken } = useAuth();
  const router = useRouter();

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const ready = isLoaded && !!user && !isLoggingOut;

  // primitive dependencies
  const clerkId = user?.id ?? "";
  const clerkEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const clerkImage = user?.imageUrl ?? "";
  const clerkName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    "Admin User";

  const [dbUser, setDbUser] = useState(null);
  const [stats, setStats] = useState(RESET_STATS);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState("");

  // keep stable getToken
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const merged = useMemo(() => {
    const fullName = safeText(dbUser?.full_name, clerkName);
    const email = safeText(dbUser?.email, clerkEmail);
    const avatarUrl = dbUser?.avatar_url || clerkImage || "";
    const role = safeText(dbUser?.role, "admin");
    const phone = safeText(dbUser?.phone_number ?? dbUser?.phone, "-");
    const verificationStatus = safeText(
      dbUser?.verification_status,
      "unverified",
    );

    return { fullName, email, avatarUrl, role, phone, verificationStatus };
  }, [dbUser, clerkName, clerkEmail, clerkImage]);

  useEffect(() => {
    let alive = true;

    const loadAll = async () => {
      try {
        setLastError("");
        setLoading(true);

        if (!ready) return;

        if (!clerkId && !clerkEmail) {
          throw new Error("Missing Clerk identity (id/email)");
        }

        // ✅ สำคัญ: ตอน logout / session หลุด ให้ token เป็น null แล้ว return เฉย ๆ
        const token = await getTokenRef
          .current({ template: "supabase" })
          .catch(() => null);

        if (!token) {
          // ไม่ต้อง throw ให้ noisy (ตอนออกระบบจะเข้าเคสนี้)
          return;
        }

        const supabase = createClerkSupabaseClient(token);

        const fetchProfile = async () => {
          let profile = null;

          if (clerkId) {
            const { data, error } = await supabase
              .from("users")
              .select("*")
              .eq("clerk_id", clerkId)
              .maybeSingle();
            if (error) throw error;
            profile = data ?? null;
          }

          if (!profile && clerkEmail) {
            const { data, error } = await supabase
              .from("users")
              .select("*")
              .eq("email", clerkEmail)
              .maybeSingle();
            if (error) throw error;
            profile = data ?? null;
          }

          return profile;
        };

        const [profile, dashboardStats] = await Promise.all([
          fetchProfile(),
          fetchDashboardStats(token),
        ]);

        if (!alive) return;

        setDbUser(profile);
        setStats(dashboardStats || RESET_STATS);

        const role = String(profile?.role || "admin").toLowerCase();
        if (profile && role !== "admin" && role !== "superadmin") {
          Alert.alert("ไม่มีสิทธิ์เข้าถึง", "บัญชีนี้ไม่ใช่ผู้ดูแลระบบ");
          router.replace("/login");
        }
      } catch (e) {
        console.error("❌ AdminProfile load error:", e);
        if (!alive) return;
        setDbUser(null);
        setStats(RESET_STATS);
        setLastError(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadAll();

    return () => {
      alive = false;
    };
  }, [ready, clerkId, clerkEmail, router]);

  const quickStats = useMemo(
    () => [
      {
        label: "ผู้ใช้ทั้งหมด",
        value: stats.totalUsers == null ? "—" : String(stats.totalUsers),
        icon: "people",
      },
      {
        label: "ผู้ใช้ที่ยังไม่ได้ยืนยันตัวตน",
        value:
          stats.pendingApprovals == null ? "—" : String(stats.pendingApprovals),
        icon: "alert-circle",
      },
      {
        label: "อาสาสมัคร",
        value: stats.volunteers == null ? "—" : String(stats.volunteers),
        icon: "hand-left",
      },
      {
        label: "ได้รับการอุปการะแล้ว",
        value:
          stats.adoptionsSuccess == null ? "—" : String(stats.adoptionsSuccess),
        icon: "heart",
      },
    ],
    [stats],
  );

  const adminActions = [
    {
      label: "จัดการการผู้ใช้",
      icon: "people-outline",
      color: "#6366f1",
      onPress: () => router.push("/admin/users"),
    },
    {
      label: "รายงานโพสต์",
      icon: "document-text-outline",
      color: "#f59e0b",
      onPress: () => router.push("/admin/user-reports"),
    },
  ];

  const handleLogout = async () => {
    Alert.alert("ออกจากระบบ", "คุณต้องการออกจากระบบใช่หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ออกจากระบบ",
        style: "destructive",
        onPress: async () => {
          try {
            setIsLoggingOut(true);
            setLoading(true);

            // ✅ 1) ปิด realtime ก่อน (กัน RealtimeBridge spam)
            await resetRealtimeClient();

            // ✅ 2) ล้าง token global ที่ fetch ใช้
            clearClerkToken();

            // ✅ 3) เคลียร์สถานะในเครื่อง
            await clearAdminStatus();

            // ✅ 4) ค่อย signOut
            await signOut();

            router.replace("/login");
          } catch (err) {
            console.error("❌ Logout Error:", err);
            Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถออกจากระบบได้");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const initial = (merged.fullName?.[0] || "A").toUpperCase();

  if (!isLoaded) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10, color: "#64748b" }}>
          Loading profile…
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10, color: "#64748b" }}>Redirecting...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              {!!merged.avatarUrl ? (
                <Image
                  source={{ uri: merged.avatarUrl }}
                  style={styles.avatarImg}
                />
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
            </View>
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#fff" />
            </View>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.name}>{merged.fullName}</Text>

            <View style={styles.row}>
              <Ionicons name="mail-outline" size={14} color="#64748b" />
              <Text style={styles.mutedText}>{merged.email}</Text>
            </View>

            <View style={styles.row}>
              <Ionicons name="person-outline" size={14} color="#64748b" />
              <Text style={styles.mutedText}>{merged.role}</Text>
            </View>

            <View style={styles.row}>
              <Ionicons name="call-outline" size={14} color="#64748b" />
              <Text style={styles.mutedText}>{merged.phone}</Text>
            </View>

            <View style={styles.row}>
              <Ionicons name="alert-circle-outline" size={14} color="#64748b" />
              <Text style={styles.mutedText}>{merged.verificationStatus}</Text>
            </View>
          </View>
        </View>

        {!!lastError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{lastError}</Text>
          </View>
        )}

        {loading && (
          <View style={{ paddingTop: 14 }}>
            <ActivityIndicator />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>สถิติด่วน</Text>
          <View style={styles.statsGridWrap}>
            {quickStats.map((stat, idx) => (
              <View key={idx} style={styles.statCardHalf}>
                <View style={styles.statIcon}>
                  <Ionicons name={stat.icon} size={20} color="#6366f1" />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>เครื่องมือผู้ดูแลระบบ</Text>
          <View style={styles.toolsGrid}>
            {adminActions.map((action, idx) => (
              <Pressable
                key={idx}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.toolCard,
                  pressed && styles.toolCardPressed,
                ]}
              >
                <View
                  style={[
                    styles.toolIcon,
                    { backgroundColor: `${action.color}15` },
                  ]}
                >
                  <Ionicons name={action.icon} size={24} color={action.color} />
                </View>
                <Text style={styles.toolLabel}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.logoutButton,
              pressed && styles.logoutButtonPressed,
            ]}
          >
            <Ionicons name="log-out-outline" size={20} color="#dc2626" />
            <Text style={styles.logoutText}>ออกจากระบบ</Text>
          </Pressable>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  centered: { justifyContent: "center", alignItems: "center" },

  profileCard: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: 40,
    padding: 20,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },

  avatarContainer: { position: "relative", marginRight: 16 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#6366f1",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 64, height: 64, borderRadius: 32 },
  avatarText: { fontSize: 24, fontWeight: "700", color: "#fff" },

  adminBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#10b981",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },

  profileInfo: { flex: 1 },
  name: { fontSize: 18, fontWeight: "700", color: "#1e293b", marginBottom: 8 },

  row: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  mutedText: { fontSize: 13, color: "#64748b" },

  errorBox: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#fee2e2",
  },
  errorText: { fontSize: 12, color: "#dc2626" },

  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 16,
  },

  statsGridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCardHalf: {
    width: "48%",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#eef2ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 2,
  },
  statLabel: { fontSize: 11, color: "#64748b", fontWeight: "600" },

  toolsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  toolCard: {
    width: "48%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  toolCardPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  toolIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  toolLabel: { fontSize: 14, fontWeight: "600", color: "#334155" },

  logoutButton: {
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#fee2e2",
  },
  logoutButtonPressed: { opacity: 0.7, backgroundColor: "#fef2f2" },
  logoutText: { fontSize: 16, fontWeight: "700", color: "#dc2626" },
});
