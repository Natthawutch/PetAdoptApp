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
import { clearAdminStatus } from "../../../utils/adminStorage";

const RESET_STATS = {
  totalPosts: null,
  activePosts: null,
  reportedPosts: null, // ✅ "รายงานโพสต์ทั้งหมด" (นับจาก user_reports)
  totalReports: null, // ✅ "รายงานเคสช่วยเหลือทั้งหมด" (นับจาก reports)
  todayActivity: null,
  weekActivity: null,
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

        // ✅ สถิติ Admin
        const fetchAdminStats = async () => {
          try {
            // 1) นับโพสต์ทั้งหมด
            const { count: totalPosts, error: totalPostsErr } = await supabase
              .from("pets")
              .select("*", { count: "exact", head: true });
            if (totalPostsErr) throw totalPostsErr;

            // 2) นับโพสต์ที่ยัง Available
            const { count: activePosts, error: activePostsErr } = await supabase
              .from("pets")
              .select("*", { count: "exact", head: true })
              .eq("post_status", "Available");
            if (activePostsErr) throw activePostsErr;

            // ✅ 3) นับ "รายงานโพสต์ทั้งหมด" = จำนวนแถวใน user_reports
            const { count: reportedPosts, error: reportedPostsErr } =
              await supabase
                .from("user_reports")
                .select("*", { count: "exact", head: true });
            if (reportedPostsErr) throw reportedPostsErr;

            // 4) นับ "รายงานเคสช่วยเหลือทั้งหมด" = จำนวนแถวใน reports
            const { count: totalReports, error: totalReportsErr } =
              await supabase
                .from("reports")
                .select("*", { count: "exact", head: true });
            if (totalReportsErr) throw totalReportsErr;

            // 5) กิจกรรมวันนี้ (โพสต์ที่สร้างวันนี้)
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const { count: todayActivity, error: todayErr } = await supabase
              .from("pets")
              .select("*", { count: "exact", head: true })
              .gte("created_at", today.toISOString());
            if (todayErr) throw todayErr;

            // 6) กิจกรรม 7 วันที่แล้ว
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            weekAgo.setHours(0, 0, 0, 0);
            const { count: weekActivity, error: weekErr } = await supabase
              .from("pets")
              .select("*", { count: "exact", head: true })
              .gte("created_at", weekAgo.toISOString());
            if (weekErr) throw weekErr;

            return {
              totalPosts: totalPosts ?? 0,
              activePosts: activePosts ?? 0,
              reportedPosts: reportedPosts ?? 0, // ✅ ถูกแล้ว
              totalReports: totalReports ?? 0,
              todayActivity: todayActivity ?? 0,
              weekActivity: weekActivity ?? 0,
            };
          } catch (error) {
            console.error("❌ Error fetching admin stats:", error);
            return RESET_STATS;
          }
        };

        const [profile, adminStats] = await Promise.all([
          fetchProfile(),
          fetchAdminStats(),
        ]);

        if (!alive) return;

        setDbUser(profile);
        setStats(adminStats || RESET_STATS);

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
        label: "โพสต์สัตว์เลี้ยงทั้งหมด",
        value: stats.totalPosts == null ? "—" : String(stats.totalPosts),
        icon: "document-text",
        color: "#6366f1",
      },
      {
        label: "สัตว์เลี้ยงที่ยังต้องการผู้รับเลี้ยง",
        value: stats.activePosts == null ? "—" : String(stats.activePosts),
        icon: "checkmark-circle",
        color: "#10b981",
      },
      {
        label: "รายงานโพสต์ทั้งหมด",
        value: stats.reportedPosts == null ? "—" : String(stats.reportedPosts),
        icon: "warning",
        color: "#f59e0b",
      },
      {
        label: "รายงานเคสช่วยเหลือทั้งหมด",
        value: stats.totalReports == null ? "—" : String(stats.totalReports),
        icon: "alert-circle",
        color: "#ef4444",
      },
    ],
    [stats],
  );

  const adminActions = [
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
        {/* Profile Card */}
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
              <Ionicons name="person-outline" size={14} color="#64748b" />
              <Text style={styles.mutedText}>{merged.role}</Text>
            </View>

            <View style={styles.row}>
              <Ionicons name="shield-outline" size={14} color="#64748b" />
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

        {/* Stats Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>สถิติการจัดการ</Text>
          <View style={styles.statsGridWrap}>
            {quickStats.map((stat, idx) => (
              <View key={idx} style={styles.statCardHalf}>
                <View
                  style={[
                    styles.statIcon,
                    { backgroundColor: `${stat.color}15` },
                  ]}
                >
                  <Ionicons name={stat.icon} size={20} color={stat.color} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Admin Tools */}
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

        {/* Logout Button */}
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
  statLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
    textAlign: "center",
  },

  toolsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  toolCard: {
    width: "100%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    flexDirection: "row",
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
    marginRight: 16,
  },
  toolLabel: { fontSize: 16, fontWeight: "600", color: "#334155", flex: 1 },

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
