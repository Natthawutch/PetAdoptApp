// VolunteerHome.jsx (Redesign + Real Stats + FIX realtime spam)
import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  createClerkSupabaseClient,
  getRealtimeClient,
} from "../../../config/supabaseClient";

export default function VolunteerHome() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const [urgentCount, setUrgentCount] = useState(0);

  // ✅ stats จริงจาก backend
  const [stats, setStats] = useState({
    helpedAnimals: 0,
    activeReports: 0,
    totalHours: 0,
    streakDays: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // ✅ Realtime refs (กัน subscribe ซ้ำ)
  const channelRef = useRef(null);
  const subscribedRef = useRef(false);
  const statsTimerRef = useRef(null);

  const calcStreakDays = useCallback((completedDates) => {
    const dayKey = (d) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x.getTime();
    };

    const uniqueDays = new Set(completedDates.map(dayKey));
    if (uniqueDays.size === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // อนุโลม: ถ้าวันนี้ไม่มี completed แต่เมื่อวานมี ให้เริ่มจากเมื่อวาน
    let cursor = today.getTime();
    if (!uniqueDays.has(cursor)) cursor -= 86400000;

    while (uniqueDays.has(cursor)) {
      streak += 1;
      cursor -= 86400000;
    }

    return streak;
  }, []);

  const fetchVolunteerStats = useCallback(async () => {
    try {
      if (!user?.id) return;

      const token = await getToken();
      if (!token) {
        console.log("⚠️ fetchVolunteerStats: No token available");
        return;
      }

      setStatsLoading(true);

      const supabase = createClerkSupabaseClient(token);

      // 1) หา UUID ของอาสาในตาราง users
      const { data: me, error: meErr } = await supabase
        .from("users")
        .select("id")
        .eq("clerk_id", user.id)
        .single();

      if (meErr || !me?.id) {
        console.log("❌ Cannot resolve volunteer uuid:", meErr);
        return;
      }

      const volunteerId = me.id;

      // 2) ช่วยแล้ว (completed)
      const { count: helpedCount, error: helpedErr } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("assigned_volunteer_id", volunteerId)
        .eq("status", "completed");

      if (helpedErr) console.log("❌ helpedErr:", helpedErr);

      // 3) กำลังดำเนินการ (in_progress)
      const { count: activeCount, error: activeErr } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("assigned_volunteer_id", volunteerId)
        .eq("status", "in_progress");

      if (activeErr) console.log("❌ activeErr:", activeErr);

      // 4) ชั่วโมงอาสา (ชั่วคราว: completed * 1 ชั่วโมง)
      // ✅ ถ้ามีฟิลด์จริง เช่น help_duration_minutes บอกมา เดี๋ยวทำให้เป็นของจริง
      const totalHours = Math.round((helpedCount || 0) * 1);

      // 5) streakDays จาก completed_at ย้อนหลัง 60 วัน
      const from = new Date(Date.now() - 60 * 86400000).toISOString();

      const { data: completedRows, error: streakErr } = await supabase
        .from("reports")
        .select("completed_at")
        .eq("assigned_volunteer_id", volunteerId)
        .eq("status", "completed")
        .gte("completed_at", from)
        .not("completed_at", "is", null);

      if (streakErr) console.log("❌ streakErr:", streakErr);

      const completedDates = (completedRows || [])
        .map((r) => r.completed_at)
        .filter(Boolean)
        .map((s) => new Date(s));

      const streakDays = calcStreakDays(completedDates);

      setStats({
        helpedAnimals: helpedCount || 0,
        activeReports: activeCount || 0,
        totalHours: totalHours || 0,
        streakDays: streakDays || 0,
      });
    } catch (e) {
      console.log("❌ fetchVolunteerStats error:", e);
    } finally {
      setStatsLoading(false);
    }
  }, [getToken, user?.id, calcStreakDays]);

  // ✅ debounce refresh stats (กันยิงถี่)
  const scheduleStatsRefresh = useCallback(() => {
    if (statsTimerRef.current) clearTimeout(statsTimerRef.current);
    statsTimerRef.current = setTimeout(() => {
      fetchVolunteerStats();
    }, 500);
  }, [fetchVolunteerStats]);

  useEffect(() => {
    let cancelled = false;
    let localSubscribed = false; // track ใน scope นี้

    const setupRealtimeAndUrgent = async () => {
      try {
        if (!user?.id) return;

        // ✅ เช็คก่อนว่ามี channel อยู่แล้วหรือยัง
        if (subscribedRef.current || channelRef.current) {
          console.log("⏭️ Already subscribed, skipping");
          return;
        }

        const token = await getToken();
        if (!token) {
          console.log("⚠️ No token yet, will retry");
          return;
        }

        // ป้องกันหลายเธรดแย่งกัน
        subscribedRef.current = true;
        localSubscribed = true;

        const supabase = createClerkSupabaseClient(token);

        // 1) initial urgent count
        const { data, error } = await supabase
          .from("reports")
          .select("id")
          .eq("status", "urgent");

        if (cancelled) return; // ออกก่อนถ้า unmount แล้ว

        if (!cancelled) setUrgentCount(data?.length || 0);
        if (error) console.log("❌ Fetch urgent reports error:", error);

        // 2) subscribe realtime
        const realtime = getRealtimeClient(token);

        // ถ้ามี channel ค้างจาก dev/fast refresh → ลบทิ้ง
        if (channelRef.current) {
          try {
            await realtime.removeChannel(channelRef.current);
          } catch (e) {
            console.log("⚠️ Remove old channel error:", e);
          }
          channelRef.current = null;
        }

        if (cancelled) return; // เช็คอีกรอบก่อน subscribe

        const channel = realtime.channel("reports_updates");
        channelRef.current = channel;

        channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "reports" },
            (payload) => {
              if (cancelled) return; // ไม่ทำอะไรถ้า unmount แล้ว

              // urgentCount logic
              if (
                payload.eventType === "INSERT" &&
                payload.new.status === "urgent"
              ) {
                setUrgentCount((p) => p + 1);
              }
              if (
                payload.eventType === "UPDATE" &&
                payload.old.status !== "urgent" &&
                payload.new.status === "urgent"
              ) {
                setUrgentCount((p) => p + 1);
              }
              if (
                payload.eventType === "UPDATE" &&
                payload.old.status === "urgent" &&
                payload.new.status !== "urgent"
              ) {
                setUrgentCount((p) => Math.max(p - 1, 0));
              }
              if (
                payload.eventType === "DELETE" &&
                payload.old.status === "urgent"
              ) {
                setUrgentCount((p) => Math.max(p - 1, 0));
              }

              // ✅ refresh stats แบบ debounce
              scheduleStatsRefresh();
            },
          )
          .subscribe((status) => {
            if (cancelled) return;
            console.log("✅ Realtime reports_updates status:", status);
          });

        console.log("✅ Realtime subscription set for reports");

        // โหลดสถิติครั้งแรก (ต้องมี token แล้ว)
        if (!cancelled) fetchVolunteerStats();
      } catch (e) {
        if (localSubscribed) subscribedRef.current = false;
        console.log("❌ setup realtime error:", e);
      }
    };

    setupRealtimeAndUrgent();

    return () => {
      cancelled = true;

      // เคลียร์ debounce timer
      if (statsTimerRef.current) {
        clearTimeout(statsTimerRef.current);
        statsTimerRef.current = null;
      }

      const cleanup = async () => {
        try {
          const token = await getToken();
          if (!token) return;

          const realtime = getRealtimeClient(token);

          if (channelRef.current) {
            await realtime.removeChannel(channelRef.current);
            channelRef.current = null;
            console.log("🛑 Realtime channel removed");
          }
        } catch (e) {
          console.log("⚠️ Cleanup error:", e);
        } finally {
          subscribedRef.current = false;
        }
      };

      cleanup();
    };
  }, [user?.id, getToken, fetchVolunteerStats, scheduleStatsRefresh]);

  const goReports = () => router.push("/volunteer/reports");

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Top Header + Mission */}
      <View style={styles.top}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>สวัสดี, อาสาสมัคร 👋</Text>
            <Text style={styles.sub}>
              วันนี้มีภารกิจให้ช่วย {urgentCount > 0 ? "เร่งด่วน" : "อยู่ในคิว"}{" "}
              พร้อมลุยไหม
            </Text>
          </View>

          <TouchableOpacity
            style={styles.notifBtn}
            activeOpacity={0.85}
            onPress={() => router.push("/volunteer/notifications")}
          >
            <Ionicons name="notifications-outline" size={22} color="#0f172a" />

            {urgentCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {urgentCount > 99 ? "99+" : urgentCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Primary CTA: Urgent */}
        <TouchableOpacity
          style={[
            styles.primaryCard,
            urgentCount > 0 ? styles.primaryDanger : styles.primaryCalm,
          ]}
          onPress={goReports}
          activeOpacity={0.9}
        >
          <View style={styles.primaryLeft}>
            <View
              style={[
                styles.primaryIcon,
                urgentCount > 0 ? styles.iconDanger : styles.iconCalm,
              ]}
            >
              <Ionicons
                name={urgentCount > 0 ? "alert" : "sparkles"}
                size={22}
                color={urgentCount > 0 ? "#ef4444" : "#0ea5e9"}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.primaryTitle}>
                {urgentCount > 0 ? "รับเคสด่วนทันที" : "เริ่มช่วยเคสในคิว"}
              </Text>
              <Text style={styles.primaryDesc}>
                {urgentCount > 0
                  ? "มีสัตว์ต้องการความช่วยเหลือเร่งด่วน"
                  : "ดูเคสใหม่ ๆ และเลือกช่วยได้เลย"}
              </Text>
            </View>
          </View>

          <View style={styles.primaryRight}>
            {urgentCount > 0 && (
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{urgentCount}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={20} color="#0f172a" />
          </View>
        </TouchableOpacity>

        {/* Quick tools row */}
        <View style={styles.toolsRow}>
          <ToolChip
            icon="map-outline"
            label="แผนที่"
            onPress={() => router.push("/volunteer/map")}
            tone="blue"
          />
          <ToolChip
            icon="call-outline"
            label="ฉุกเฉิน"
            onPress={() => router.push("/volunteer/emergency")}
            tone="pink"
          />
          <ToolChip
            icon="document-text-outline"
            label="คู่มือ"
            onPress={() => router.push("/volunteer/guide")}
            tone="teal"
          />
          <ToolChip
            icon="settings-outline"
            label="ตั้งค่า"
            onPress={() => router.push("/volunteer/settings")}
            tone="orange"
          />
        </View>
      </View>

      {/* Impact / Stats */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>สรุปผลงานของคุณ</Text>
          {statsLoading ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <ActivityIndicator size="small" />
              <Text style={styles.sectionHint}>กำลังอัปเดต...</Text>
            </View>
          ) : (
            <Text style={styles.sectionHint}>อัปเดตล่าสุดวันนี้</Text>
          )}
        </View>

        <View style={styles.statsGrid}>
          <StatTile
            icon="paw-outline"
            title="ช่วยแล้ว"
            value={stats.helpedAnimals}
            unit="ตัว"
            tone="green"
          />
          <StatTile
            icon="time-outline"
            title="กำลังดำเนินการ"
            value={stats.activeReports}
            unit="เคส"
            tone="amber"
          />
          <StatTile
            icon="ribbon-outline"
            title="ชั่วโมงอาสา"
            value={stats.totalHours}
            unit="ชม."
            tone="blue"
          />
          <StatTile
            icon="flame-outline"
            title="สตรีค"
            value={stats.streakDays}
            unit="วัน"
            tone="pink"
          />
        </View>
      </View>

      {/* My work / All work */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>งานของอาสา</Text>

        <ActionRow
          icon="checkmark-done-outline"
          title="งานของฉัน"
          desc="เคสที่คุณรับผิดชอบอยู่"
          badgeText="ต่อเนื่อง"
          onPress={() => router.push("/volunteer/my-tasks")}
          tone="indigo"
        />

        <ActionRow
          icon="list-outline"
          title="รายงานทั้งหมด"
          desc="ดูทุกเคสในระบบ และกรองตามพื้นที่ได้"
          onPress={() => router.push("/volunteer/reports")}
          tone="slate"
        />

        <ActionRow
          icon="chatbubbles-outline"
          title="ข้อความ / ประสานงาน"
          desc="คุยกับทีม หรือส่งอัปเดตเคส"
          onPress={() => router.push("/volunteer/messages")}
          tone="teal"
        />
      </View>

      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

/* ---------- Small Components ---------- */

function ToolChip({ icon, label, onPress, tone = "blue" }) {
  const toneStyle = toolTones[tone] || toolTones.blue;
  return (
    <TouchableOpacity
      style={[styles.toolChip, toneStyle.bg]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.toolIconWrap, toneStyle.iconBg]}>
        <Ionicons name={icon} size={18} color={toneStyle.iconColor} />
      </View>
      <Text style={styles.toolLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatTile({ icon, title, value, unit, tone = "green" }) {
  const t = statTones[tone] || statTones.green;
  return (
    <View style={styles.statTile}>
      <View style={[styles.statTileIcon, t.bg]}>
        <Ionicons name={icon} size={18} color={t.color} />
      </View>
      <Text style={styles.statTileTitle}>{title}</Text>
      <Text style={styles.statTileValue}>
        {value} <Text style={styles.statTileUnit}>{unit}</Text>
      </Text>
    </View>
  );
}

function ActionRow({ icon, title, desc, onPress, badgeText, tone = "slate" }) {
  const t = rowTones[tone] || rowTones.slate;
  return (
    <TouchableOpacity
      style={styles.actionRow}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={[styles.rowIcon, t.bg]}>
        <Ionicons name={icon} size={22} color={t.color} />
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.rowTopLine}>
          <Text style={styles.rowTitle}>{title}</Text>
          {!!badgeText && (
            <View style={styles.rowBadge}>
              <Text style={styles.rowBadgeText}>{badgeText}</Text>
            </View>
          )}
        </View>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
    </TouchableOpacity>
  );
}

/* ---------- Tones ---------- */

const statTones = {
  green: { bg: { backgroundColor: "#dcfce7" }, color: "#16a34a" },
  amber: { bg: { backgroundColor: "#fef3c7" }, color: "#d97706" },
  blue: { bg: { backgroundColor: "#dbeafe" }, color: "#2563eb" },
  pink: { bg: { backgroundColor: "#fce7f3" }, color: "#db2777" },
};

const rowTones = {
  indigo: { bg: { backgroundColor: "#e0e7ff" }, color: "#4f46e5" },
  teal: { bg: { backgroundColor: "#ccfbf1" }, color: "#0f766e" },
  slate: { bg: { backgroundColor: "#e2e8f0" }, color: "#334155" },
};

const toolTones = {
  blue: {
    bg: { backgroundColor: "#ffffff" },
    iconBg: { backgroundColor: "#dbeafe" },
    iconColor: "#2563eb",
  },
  pink: {
    bg: { backgroundColor: "#ffffff" },
    iconBg: { backgroundColor: "#fce7f3" },
    iconColor: "#db2777",
  },
  teal: {
    bg: { backgroundColor: "#ffffff" },
    iconBg: { backgroundColor: "#ccfbf1" },
    iconColor: "#0f766e",
  },
  orange: {
    bg: { backgroundColor: "#ffffff" },
    iconBg: { backgroundColor: "#fed7aa" },
    iconColor: "#ea580c",
  },
};

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },

  top: {
    backgroundColor: "#fff",
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 16,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
    position: "relative",
  },

  notifBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },

  notifBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
  },
  hello: { fontSize: 26, fontWeight: "800", color: "#0f172a" },
  sub: { marginTop: 4, fontSize: 14, color: "#64748b" },

  primaryCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  primaryDanger: {
    backgroundColor: "#fff5f5",
    borderWidth: 1,
    borderColor: "#fee2e2",
  },
  primaryCalm: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
  },

  primaryLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  primaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconDanger: { backgroundColor: "#fee2e2" },
  iconCalm: { backgroundColor: "#dbeafe" },

  primaryTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  primaryDesc: { marginTop: 2, fontSize: 13, color: "#475569" },

  primaryRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  countPill: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  countPillText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  toolsRow: { marginTop: 14, flexDirection: "row", gap: 10 },
  toolChip: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  toolIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  toolLabel: { fontSize: 12, fontWeight: "700", color: "#334155" },

  section: { paddingHorizontal: 20, marginTop: 14 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  sectionHint: { fontSize: 12, color: "#94a3b8" },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statTile: {
    width: "47.8%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  statTileIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  statTileTitle: { fontSize: 12, fontWeight: "700", color: "#64748b" },
  statTileValue: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
  },
  statTileUnit: { fontSize: 12, fontWeight: "800", color: "#64748b" },

  actionRow: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTopLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a" },
  rowDesc: { marginTop: 4, fontSize: 13, color: "#64748b" },
  rowBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  rowBadgeText: { fontSize: 11, fontWeight: "800", color: "#334155" },
});
