import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  createClerkSupabaseClient,
  getRealtimeClient,
} from "../../../config/supabaseClient";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function VolunteerProfile() {
  const { user, isLoaded } = useUser();
  const { signOut, getToken, isSignedIn } = useAuth();
  const router = useRouter();

  const userId = user?.id;

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState({
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
  });

  const [volunteerUuid, setVolunteerUuid] = useState(null);

  const mountedRef = useRef(true);
  const didFetchRef = useRef(false);
  const lastUserIdRef = useRef(null);

  // REST client (queries)
  const supabaseRef = useRef(null);

  // realtime client + channel
  const rtRef = useRef(null);
  const channelRef = useRef(null);

  // debounce / polling
  const debounceRef = useRef(null);
  const pollRef = useRef(null);

  // focus guard
  const isFocusedRef = useRef(false);

  // subscribe guard
  const subscribingRef = useRef(false);
  const subscribedRef = useRef(false);

  // one-time log per focus
  const didLogSubscribedRef = useRef(false);

  const getClerkToken = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return null;
    for (let i = 0; i < 6; i++) {
      try {
        const token = await getToken({ template: "supabase" });
        if (token) return token;
      } catch {}
      await sleep(200 + i * 150);
    }
    return null;
  }, [isLoaded, isSignedIn, getToken]);

  const ensureSupabase = useCallback(async () => {
    if (supabaseRef.current) return supabaseRef.current;

    const token = await getClerkToken();
    if (!token) return null;

    supabaseRef.current = createClerkSupabaseClient(token);
    return supabaseRef.current;
  }, [getClerkToken]);

  const refreshRealtimeAuth = useCallback(async () => {
    const token = await getClerkToken();
    if (!token) return null;

    const rt = getRealtimeClient(token);
    rt.realtime.setAuth(token);
    rtRef.current = rt;

    return token;
  }, [getClerkToken]);

  const resetUI = useCallback(() => {
    if (!mountedRef.current) return;
    setVolunteerUuid(null);
    setStats({ totalTasks: 0, activeTasks: 0, completedTasks: 0 });
  }, []);

  const fetchStatsByUuid = useCallback(
    async (uuid) => {
      if (!uuid || !mountedRef.current) return;

      try {
        const supabase = await ensureSupabase();
        if (!supabase) return;

        const { data: allTasks, error } = await supabase
          .from("reports")
          .select("status")
          .eq("assigned_volunteer_id", uuid);

        if (error) throw error;

        const tasks = allTasks || [];
        const completed = tasks.filter((t) => t.status === "completed");
        const active = tasks.filter(
          (t) => t.status === "in_progress" || t.status === "assigned",
        );

        if (!mountedRef.current) return;

        setStats({
          totalTasks: tasks.length,
          activeTasks: active.length,
          completedTasks: completed.length,
        });
      } catch (e) {
        console.error("Error fetching volunteer stats:", e);
      }
    },
    [ensureSupabase],
  );

  const fetchVolunteerData = useCallback(
    async ({ showSpinner } = { showSpinner: false }) => {
      if (!mountedRef.current) return;
      if (showSpinner) setInitialLoading(true);

      try {
        if (!userId || !isLoaded || !isSignedIn) {
          resetUI();
          return;
        }

        const supabase = await ensureSupabase();
        if (!supabase) {
          resetUI();
          return;
        }

        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("id")
          .eq("clerk_id", userId)
          .single();

        if (userError || !userData?.id) {
          Alert.alert(
            "ไม่พบข้อมูลอาสา",
            "ไม่พบ users.id จาก clerk_id ในตาราง users",
          );
          resetUI();
          return;
        }

        // ✅ กัน set uuid ซ้ำ (กัน effect ยิงซ้ำ)
        setVolunteerUuid((prev) => (prev === userData.id ? prev : userData.id));

        await fetchStatsByUuid(userData.id);
      } catch (e) {
        console.error("Error fetching volunteer data:", e);
        Alert.alert("ข้อผิดพลาด", "ไม่สามารถโหลดข้อมูลได้");
      } finally {
        if (mountedRef.current) setInitialLoading(false);
      }
    },
    [userId, isLoaded, isSignedIn, ensureSupabase, resetUI, fetchStatsByUuid],
  );

  // Initial load
  useEffect(() => {
    mountedRef.current = true;

    if (lastUserIdRef.current !== userId) {
      lastUserIdRef.current = userId;
      didFetchRef.current = false;
    }

    if (isLoaded && isSignedIn && userId && !didFetchRef.current) {
      didFetchRef.current = true;
      fetchVolunteerData({ showSpinner: true });
    }

    if (isLoaded && (!isSignedIn || !userId)) {
      resetUI();
      setInitialLoading(false);
    }

    return () => {
      mountedRef.current = false;
    };
  }, [isLoaded, isSignedIn, userId, fetchVolunteerData, resetUI]);

  const cleanupRealtime = useCallback(async () => {
    try {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      const rt = rtRef.current;
      const ch = channelRef.current;
      if (rt && ch) {
        await rt.removeChannel(ch);
      }
    } catch {}
    channelRef.current = null;

    subscribedRef.current = false;
    subscribingRef.current = false;
    didLogSubscribedRef.current = false;
  }, []);

  const setupRealtime = useCallback(async () => {
    if (!isFocusedRef.current) return;
    if (!volunteerUuid) return;

    if (subscribedRef.current || subscribingRef.current) return;
    subscribingRef.current = true;

    await ensureSupabase();

    const token = await refreshRealtimeAuth();
    if (!token || !isFocusedRef.current) {
      subscribingRef.current = false;
      return;
    }

    // cleanup before re-subscribe
    await cleanupRealtime();
    if (!isFocusedRef.current) return;

    const rt = rtRef.current;
    if (!rt) {
      subscribingRef.current = false;
      return;
    }

    const channel = rt
      .channel(`volunteer-reports-${volunteerUuid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reports",
          filter: `assigned_volunteer_id=eq.${volunteerUuid}`,
        },
        (payload) => {
          // log เฉพาะ event จริง
          console.info("[RT EVENT]", payload.eventType);

          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            fetchStatsByUuid(volunteerUuid);
          }, 150);
        },
      )
      .subscribe((status) => {
        const s = typeof status === "string" ? status.trim() : String(status);

        if (s === "SUBSCRIBED") {
          subscribedRef.current = true;
          subscribingRef.current = false;

          // ✅ log ครั้งเดียวต่อ focus แน่นอน
          if (!didLogSubscribedRef.current) {
            didLogSubscribedRef.current = true;
            console.info("[RT] SUBSCRIBED");
          }

          if (!pollRef.current) {
            pollRef.current = setInterval(() => {
              if (volunteerUuid) fetchStatsByUuid(volunteerUuid);
            }, 30 * 1000);
          }
        }

        if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          subscribedRef.current = false;
          subscribingRef.current = false;
          didLogSubscribedRef.current = false;
        }
      });

    channelRef.current = channel;
    fetchStatsByUuid(volunteerUuid);
  }, [
    volunteerUuid,
    ensureSupabase,
    refreshRealtimeAuth,
    cleanupRealtime,
    fetchStatsByUuid,
  ]);

  // ✅ สำคัญ: subscribe เฉพาะตอนหน้าถูก focus และ cleanup ตอน blur
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;

      // reset log once per focus
      didLogSubscribedRef.current = false;

      // try setup if uuid already exists
      setupRealtime();

      return () => {
        isFocusedRef.current = false;
        cleanupRealtime();
      };
    }, [setupRealtime, cleanupRealtime]),
  );

  // ✅ ถ้า uuid เปลี่ยนตอนกำลัง focus → setup ใหม่
  useEffect(() => {
    if (!isFocusedRef.current) return;
    setupRealtime();
  }, [volunteerUuid, setupRealtime]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      if (volunteerUuid) await fetchStatsByUuid(volunteerUuid);
      else await fetchVolunteerData({ showSpinner: false });
    } finally {
      setRefreshing(false);
    }
  }, [volunteerUuid, fetchStatsByUuid, fetchVolunteerData]);

  const handleLogout = () => {
    Alert.alert("ออกจากระบบ", "คุณต้องการออกจากระบบใช่หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ออกจากระบบ",
        style: "destructive",
        onPress: async () => {
          await signOut({ redirectUrl: "/" });
        },
      },
    ]);
  };

  const openGuide = () => router.push("/volunteer/guide");
  const openEquipment = () => router.push("/volunteer/equipment");
  const openTraining = () => router.push("/volunteer/training");
  const openMyTasks = () => router.push("/volunteer/(tabs)/reports");

  const fullName = user?.fullName || "อาสาสมัคร";
  const email = user?.primaryEmailAddress?.emailAddress || "";

  if (initialLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#7c3aed"]}
            tintColor="#7c3aed"
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.profileSection}>
              <View style={styles.avatarWrapper}>
                {user?.imageUrl ? (
                  <Image
                    source={{ uri: user.imageUrl }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person" size={28} color="#7c3aed" />
                  </View>
                )}
              </View>

              <View style={styles.userInfo}>
                <Text style={styles.userName} numberOfLines={1}>
                  {fullName}
                </Text>
                <Text style={styles.userEmail} numberOfLines={1}>
                  {email}
                </Text>
              </View>
            </View>

            {/* ลบปุ่มตั้งค่า */}
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "#ede9fe" }]}>
              <Ionicons name="layers-outline" size={20} color="#7c3aed" />
            </View>
            <Text style={styles.statValue}>{stats.totalTasks}</Text>
            <Text style={styles.statLabel}>งานทั้งหมด</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "#dbeafe" }]}>
              <Ionicons name="clipboard-outline" size={20} color="#3b82f6" />
            </View>
            <Text style={styles.statValue}>{stats.activeTasks}</Text>
            <Text style={styles.statLabel}>งานกำลังทำ</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "#dcfce7" }]}>
              <Ionicons
                name="checkmark-done-outline"
                size={20}
                color="#22c55e"
              />
            </View>
            <Text style={styles.statValue}>{stats.completedTasks}</Text>
            <Text style={styles.statLabel}>งานสำเร็จ</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>สิ่งจำเป็นสำหรับอาสา</Text>
            <Pressable onPress={openMyTasks}>
              <Text style={styles.viewAll}>งานของฉัน</Text>
            </Pressable>
          </View>

          <View style={styles.essentialsGrid}>
            <Pressable style={styles.essentialCard} onPress={openGuide}>
              <View
                style={[styles.essentialIcon, { backgroundColor: "#dbeafe" }]}
              >
                <Ionicons name="book-outline" size={18} color="#2563eb" />
              </View>
              <Text style={styles.essentialTitle}>คู่มือช่วยเหลือ</Text>
              <Text style={styles.essentialSub}>ขั้นตอนมาตรฐาน</Text>
            </Pressable>

            <Pressable style={styles.essentialCard} onPress={openEquipment}>
              <View
                style={[styles.essentialIcon, { backgroundColor: "#fef3c7" }]}
              >
                <Ionicons name="construct-outline" size={18} color="#d97706" />
              </View>
              <Text style={styles.essentialTitle}>อุปกรณ์ที่ต้องมี</Text>
              <Text style={styles.essentialSub}>เช็กลิสต์ก่อนออกเคส</Text>
            </Pressable>

            <Pressable style={styles.essentialCard} onPress={openTraining}>
              <View
                style={[styles.essentialIcon, { backgroundColor: "#ede9fe" }]}
              >
                <Ionicons name="school-outline" size={18} color="#7c3aed" />
              </View>
              <Text style={styles.essentialTitle}>อบรม</Text>
              <Text style={styles.essentialSub}>เรียนรู้ก่อนรับงาน</Text>
            </Pressable>

            <Pressable style={styles.essentialCard} onPress={openMyTasks}>
              <View
                style={[styles.essentialIcon, { backgroundColor: "#dcfce7" }]}
              >
                <Ionicons name="documents-outline" size={18} color="#16a34a" />
              </View>
              <Text style={styles.essentialTitle}>รายงานของฉัน</Text>
              <Text style={styles.essentialSub}>ดูงานทั้งหมด</Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.logoutText}>ออกจากระบบ</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  loadingContainer: { justifyContent: "center", alignItems: "center" },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: "#64748b",
    fontWeight: "600",
  },
  scrollContent: { paddingBottom: 40 },

  header: {
    backgroundColor: "#fff",
    paddingTop: 60,
    paddingBottom: 18,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  avatarWrapper: { position: "relative" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#ede9fe",
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ede9fe",
    justifyContent: "center",
    alignItems: "center",
  },
  userInfo: { flex: 1 },
  userName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 2,
  },
  userEmail: { fontSize: 12, color: "#64748b" },

  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 2,
  },
  statLabel: { fontSize: 11, color: "#64748b", fontWeight: "600" },

  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a" },
  viewAll: { fontSize: 13, fontWeight: "700", color: "#7c3aed" },

  essentialsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  essentialCard: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  essentialIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  essentialTitle: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  essentialSub: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },

  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#fee2e2",
  },
  logoutText: { fontSize: 14, fontWeight: "700", color: "#ef4444" },
});
