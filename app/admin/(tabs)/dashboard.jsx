import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { createClerkSupabaseClient } from "../../../config/supabaseClient";
import { fetchDashboardStats } from "../../../lib/dashboardApi";

const buildStats = (s = {}) => [
  {
    key: "totalUsers",
    title: "ผู้ใช้ทั้งหมด",
    number: s.totalUsers ?? 0,
    icon: "people-outline",
    color: "#3b82f6",
    bgColor: "#dbeafe",
  },
  {
    key: "volunteers",
    title: "อาสาสมัคร",
    number: s.volunteers ?? 0,
    icon: "hand-left-outline",
    color: "#ec4899",
    bgColor: "#fce7f3",
  },
  {
    key: "animalsLookingForHome",
    title: "สัตว์กำลังหาบ้าน",
    number: s.animalsLookingForHome ?? 0,
    icon: "paw-outline",
    color: "#f59e0b",
    bgColor: "#fef3c7",
  },
  {
    key: "adoptionsSuccess",
    title: "รับเลี้ยงสำเร็จ",
    number: s.adoptionsSuccess ?? 0,
    icon: "heart-outline",
    color: "#10b981",
    bgColor: "#d1fae5",
  },
  {
    key: "pendingApprovals",
    title: "ยังไม่ได้ยืนยันตัวตน",
    number: s.pendingApprovals ?? 0,
    icon: "time-outline",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
  },
];

const Card = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

const SkeletonBlock = ({ h = 12, w = "100%", r = 12, style }) => (
  <View
    style={[styles.skeleton, { height: h, width: w, borderRadius: r }, style]}
  />
);

export default function Dashboard() {
  const { getToken } = useAuth();

  const [statsData, setStatsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ realtime refs
  const supabaseRef = useRef(null);
  const channelsRef = useRef([]);
  const reloadTimerRef = useRef(null);

  const load = async () => {
    try {
      const token = await getToken({ template: "supabase" });
      const stats = await fetchDashboardStats(token);
      setStatsData(stats);
    } catch (e) {
      console.error("Dashboard load error:", e);
    } finally {
      setLoading(false);
    }
  };

  // ✅ debounce reload (กันยิงถี่)
  const scheduleReload = () => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      load();
    }, 250);
  };

  useEffect(() => {
    load();
  }, []);

  // ✅ Realtime subscribe: users + pets (+ adoptions ถ้ามี)
  useEffect(() => {
    let alive = true;

    const setupRealtime = async () => {
      try {
        const token = await getToken({ template: "supabase" });
        const supabase = createClerkSupabaseClient(token);
        supabaseRef.current = supabase;

        // cleanup ของเดิม (กันซ้อน)
        channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
        channelsRef.current = [];

        const tablesToWatch = [
          "users",
          "pets",
          // ถ้าคุณมีตารางอื่นที่เอาไปคิด stats ให้ใส่เพิ่ม เช่น:
          // "adoptions",
          // "adoption_requests",
        ];

        const newChannels = tablesToWatch.map((table) =>
          supabase
            .channel(`dashboard-realtime-${table}`)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table },
              () => {
                if (!alive) return;
                scheduleReload();
              },
            )
            .subscribe(),
        );

        channelsRef.current = newChannels;
      } catch (e) {
        console.error("Dashboard setupRealtime error:", e);
      }
    };

    setupRealtime();

    return () => {
      alive = false;
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);

      const supabase = supabaseRef.current;
      if (supabase) {
        channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      }
      channelsRef.current = [];
    };
  }, [getToken]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const stats = useMemo(() => buildStats(statsData || {}), [statsData]);

  const quickStats = useMemo(() => {
    const s = statsData || {};
    return [
      {
        label: "ยังไม่ได้ยืนยันตัวตน",
        value: s.pendingApprovals ?? 0,
        icon: "time-outline",
        color: "#8b5cf6",
      },
      {
        label: "สัตว์กำลังหาบ้าน",
        value: s.animalsLookingForHome ?? 0,
        icon: "paw-outline",
        color: "#f59e0b",
      },
      {
        label: "รับเลี้ยงสำเร็จ",
        value: s.adoptionsSuccess ?? 0,
        icon: "heart-outline",
        color: "#10b981",
      },
    ];
  }, [statsData]);

  const Content = () => (
    <View>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ภาพรวมระบบ</Text>
      </View>

      <View style={{ paddingTop: 16 }}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>สรุปด่วน</Text>
              <Text style={styles.sectionSub}>ภาพรวมสถานะล่าสุด</Text>
            </View>
          </View>

          <View style={styles.quickRow}>
            {loading && !statsData ? (
              <>
                <Card style={styles.quickCard}>
                  <SkeletonBlock
                    h={36}
                    w={36}
                    r={12}
                    style={{ marginBottom: 10 }}
                  />
                  <SkeletonBlock h={22} w={48} r={8} />
                  <SkeletonBlock h={12} w={60} r={8} style={{ marginTop: 8 }} />
                </Card>
                <Card style={styles.quickCard}>
                  <SkeletonBlock
                    h={36}
                    w={36}
                    r={12}
                    style={{ marginBottom: 10 }}
                  />
                  <SkeletonBlock h={22} w={48} r={8} />
                  <SkeletonBlock h={12} w={60} r={8} style={{ marginTop: 8 }} />
                </Card>
                <Card style={styles.quickCard}>
                  <SkeletonBlock
                    h={36}
                    w={36}
                    r={12}
                    style={{ marginBottom: 10 }}
                  />
                  <SkeletonBlock h={22} w={48} r={8} />
                  <SkeletonBlock h={12} w={60} r={8} style={{ marginTop: 8 }} />
                </Card>
              </>
            ) : (
              quickStats.map((item) => (
                <Card key={item.label} style={styles.quickCard}>
                  <View
                    style={[
                      styles.quickIcon,
                      { backgroundColor: item.color + "18" },
                    ]}
                  >
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <Text style={styles.quickValue}>
                    {Number(item.value).toLocaleString("th-TH")}
                  </Text>
                  <Text style={styles.quickLabel}>{item.label}</Text>
                </Card>
              ))
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>ตัวชี้วัดหลัก</Text>
              <Text style={styles.sectionSub}>
                แตะเพื่อดูรายละเอียด (ภายหลังค่อยต่อ)
              </Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            {loading && !statsData ? (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Card key={i} style={styles.statCard}>
                    <SkeletonBlock
                      h={42}
                      w={42}
                      r={14}
                      style={{ marginBottom: 12 }}
                    />
                    <SkeletonBlock h={26} w={90} r={10} />
                    <SkeletonBlock
                      h={12}
                      w={110}
                      r={8}
                      style={{ marginTop: 10 }}
                    />
                  </Card>
                ))}
              </>
            ) : (
              stats.map((stat) => (
                <Card key={stat.key} style={styles.statCard}>
                  <View
                    style={[styles.statIcon, { backgroundColor: stat.bgColor }]}
                  >
                    <Ionicons name={stat.icon} size={22} color={stat.color} />
                  </View>
                  <Text style={styles.statNumber}>
                    {Number(stat.number).toLocaleString("th-TH")}
                  </Text>
                  <Text style={styles.statLabel}>{stat.title}</Text>
                </Card>
              ))
            )}
          </View>
        </View>

        <View style={{ height: 16 }} />
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={[{ id: "content" }]}
        keyExtractor={(item) => item.id}
        renderItem={Content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        nestedScrollEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" },
  content: { paddingBottom: 20 },

  header: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerTitle: {
    fontSize: 26,
    color: "#0f172a",
    fontWeight: "900",
    letterSpacing: -0.3,
  },

  section: { paddingHorizontal: 20, marginTop: 18 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  sectionSub: {
    marginTop: 4,
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "700",
  },

  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  quickRow: { flexDirection: "row", gap: 10 },
  quickCard: { flex: 1, alignItems: "center", paddingVertical: 16 },
  quickIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  quickValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  quickLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "800",
    marginTop: 4,
  },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { width: "48%" },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 4,
    letterSpacing: -0.4,
  },
  statLabel: { fontSize: 12, color: "#64748b", fontWeight: "800" },

  skeleton: { backgroundColor: "#e2e8f0" },
});
