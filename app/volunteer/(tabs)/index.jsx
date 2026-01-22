// app/volunteer/home/VolunteerHome.jsx
// VolunteerHome.jsx - Stable Realtime + Reliable Sync (Full Code)
// ✅ Fix realtime “ไม่นิ่ง”:
// - ใช้ realtimeStatusRef กัน stale state ใน periodic tick
// - แยก removeRealtimeChannel ออกจาก cleanupRealtime (ลด race/lock สั่น)
// - connectRealtime ไม่ reset lock/counter กลางทาง
// - periodic tick อ่านสถานะล่าสุดจาก ref

import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
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

/* ----------------------------- Utils ----------------------------- */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function jitter(ms, pct = 0.2) {
  const delta = ms * pct;
  return Math.floor(ms - delta + Math.random() * (delta * 2));
}

/* --------------------------- Main Screen -------------------------- */

export default function VolunteerHome() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();

  const [urgentCount, setUrgentCount] = useState(0);

  const [stats, setStats] = useState({
    totalCases: 0,
    activeReports: 0,
    completedCases: 0,
    completed7d: 0,
  });

  const [statsLoading, setStatsLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState("disconnected"); // disconnected | CONNECTING | SUBSCRIBED | ...
  const [lastSyncLabel, setLastSyncLabel] = useState("—");

  // ✅ keep latest realtimeStatus (fix periodic reconnect bug)
  const realtimeStatusRef = useRef("disconnected");
  useEffect(() => {
    realtimeStatusRef.current = realtimeStatus;
  }, [realtimeStatus]);

  // Animation
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Lifecycles / Refs
  const mountedRef = useRef(true);
  const appStateRef = useRef(AppState.currentState);

  // Realtime refs
  const realtimeRef = useRef(null);
  const channelRef = useRef(null);
  const connectLockRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef(null);

  // Sync timers
  const debounceTimerRef = useRef(null);
  const periodicSyncTimerRef = useRef(null);

  // access connectRealtime from timers without dependency loops
  const connectRealtimeRef = useRef(null);

  const userId = user?.id;

  const formatTimeLabel = useCallback(() => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }, []);

  const clearTimer = useCallback((ref) => {
    if (ref.current) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);

  const getFreshToken = useCallback(async () => {
    return await getToken({ template: "supabase", skipCache: true });
  }, [getToken]);

  const getSupabase = useCallback(
    async (fresh = false) => {
      const token = fresh
        ? await getFreshToken()
        : await getToken({ template: "supabase" });
      if (!token) return null;
      return createClerkSupabaseClient(token);
    },
    [getToken, getFreshToken],
  );

  /* --------------------------- Data Fetch -------------------------- */

  const resolveVolunteerUuid = useCallback(
    async (supabase) => {
      if (!supabase || !userId) return null;

      const { data: me, error } = await supabase
        .from("users")
        .select("id")
        .eq("clerk_id", userId)
        .single();

      if (error || !me?.id) return null;
      return me.id;
    },
    [userId],
  );

  const fetchUrgentCount = useCallback(async () => {
    try {
      const supabase = await getSupabase(false);
      if (!supabase) return;

      const { count, error } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (error) throw error;
      if (!mountedRef.current) return;

      setUrgentCount(count || 0);
      setLastSyncLabel(formatTimeLabel());
    } catch (e) {
      console.log("❌ fetchUrgentCount error:", e);
    }
  }, [getSupabase, formatTimeLabel]);

  const fetchVolunteerStats = useCallback(async () => {
    try {
      if (!userId) return;
      setStatsLoading(true);

      const supabase = await getSupabase(false);
      if (!supabase) return;

      const volunteerUuid = await resolveVolunteerUuid(supabase);
      if (!volunteerUuid) {
        console.log("❌ Cannot resolve volunteer uuid");
        return;
      }

      const [{ count: completedCount }, { count: activeCount }] =
        await Promise.all([
          supabase
            .from("reports")
            .select("id", { count: "exact", head: true })
            .eq("assigned_volunteer_id", volunteerUuid)
            .eq("status", "completed"),
          supabase
            .from("reports")
            .select("id", { count: "exact", head: true })
            .eq("assigned_volunteer_id", volunteerUuid)
            .eq("status", "in_progress"),
        ]);

      const from7dIso = new Date(Date.now() - 7 * 86400000).toISOString();
      const { count: completed7dCount, error: c7Err } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("assigned_volunteer_id", volunteerUuid)
        .eq("status", "completed")
        .gte("completed_at", from7dIso);

      if (c7Err) throw c7Err;

      if (!mountedRef.current) return;

      const completedCases = completedCount || 0;
      const activeReports = activeCount || 0;
      const totalCases = completedCases + activeReports;

      setStats({
        totalCases,
        activeReports,
        completedCases,
        completed7d: completed7dCount || 0,
      });

      setLastSyncLabel(formatTimeLabel());
    } catch (e) {
      console.log("❌ fetchVolunteerStats error:", e);
    } finally {
      if (mountedRef.current) setStatsLoading(false);
    }
  }, [userId, getSupabase, resolveVolunteerUuid, formatTimeLabel]);

  const syncAll = useCallback(async () => {
    await Promise.all([fetchUrgentCount(), fetchVolunteerStats()]);
  }, [fetchUrgentCount, fetchVolunteerStats]);

  const scheduleDebouncedSync = useCallback(
    (delay = 650) => {
      clearTimer(debounceTimerRef);
      debounceTimerRef.current = setTimeout(() => {
        syncAll();
      }, delay);
    },
    [syncAll, clearTimer],
  );

  /* -------------------------- Realtime ----------------------------- */

  // ✅ remove only channel/client (do NOT reset lock/counters here)
  const removeRealtimeChannel = useCallback(async () => {
    try {
      if (realtimeRef.current && channelRef.current) {
        await realtimeRef.current.removeChannel(channelRef.current);
      }
    } catch (e) {
      console.log("removeRealtimeChannel error:", e);
    } finally {
      channelRef.current = null;
      realtimeRef.current = null;
      if (mountedRef.current) setRealtimeStatus("disconnected");
    }
  }, []);

  // ✅ full cleanup for unmount only
  const cleanupRealtime = useCallback(async () => {
    clearTimer(retryTimerRef);
    retryAttemptRef.current = 0;
    connectLockRef.current = false;
    await removeRealtimeChannel();
  }, [clearTimer, removeRealtimeChannel]);

  const scheduleReconnect = useCallback(
    (reason = "unknown") => {
      if (!mountedRef.current) return;

      const attempt = retryAttemptRef.current + 1;
      retryAttemptRef.current = attempt;

      const base = clamp(800 * Math.pow(1.8, attempt - 1), 800, 12000);
      const waitMs = jitter(base, 0.25);

      clearTimer(retryTimerRef);
      retryTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        connectRealtimeRef.current?.({ force: true, reason });
      }, waitMs);
    },
    [clearTimer],
  );

  const connectRealtime = useCallback(
    async ({ force = false, reason = "manual" } = {}) => {
      try {
        if (!userId) return;

        if (connectLockRef.current && !force) return;
        connectLockRef.current = true;

        setRealtimeStatus("CONNECTING");

        // ปิดของเก่าก่อน (ไม่ reset lock/counter)
        await removeRealtimeChannel();

        const token = await getFreshToken();
        if (!token) {
          setRealtimeStatus("disconnected");
          connectLockRef.current = false;
          return;
        }

        const realtime = getRealtimeClient(token);
        realtimeRef.current = realtime;

        const channel = realtime.channel(`vh-reports-${userId}`, {
          config: { broadcast: { self: false } },
        });

        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "reports" },
          () => {
            if (!mountedRef.current) return;
            scheduleDebouncedSync(650);
          },
        );

        channel.subscribe((status) => {
          if (!mountedRef.current) return;

          setRealtimeStatus(status);

          if (status === "SUBSCRIBED") {
            retryAttemptRef.current = 0;
            connectLockRef.current = false;
            scheduleDebouncedSync(250);
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            connectLockRef.current = false;
            scheduleReconnect(`status:${status}:${reason}`);
            return;
          }

          if (status === "CLOSED") {
            connectLockRef.current = false;
            scheduleReconnect(`status:CLOSED:${reason}`);
          }
        });

        channelRef.current = channel;
      } catch (e) {
        console.log("❌ connectRealtime error:", e);
        connectLockRef.current = false;
        setRealtimeStatus("disconnected");
        scheduleReconnect(`exception:${reason}`);
      }
    },
    [
      userId,
      removeRealtimeChannel,
      getFreshToken,
      scheduleDebouncedSync,
      scheduleReconnect,
    ],
  );

  useEffect(() => {
    connectRealtimeRef.current = connectRealtime;
  }, [connectRealtime]);

  /* --------------------- AppState + Periodic Sync ------------------ */

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      if (!userId) return;

      await syncAll();
      await connectRealtimeRef.current?.({ force: true, reason: "init" });

      clearTimer(periodicSyncTimerRef);

      const tick = async () => {
        if (!mountedRef.current) return;

        await syncAll();

        // ✅ use ref (latest status)
        if (realtimeStatusRef.current !== "SUBSCRIBED") {
          connectRealtimeRef.current?.({ force: true, reason: "periodic" });
        }

        periodicSyncTimerRef.current = setTimeout(tick, 35000);
      };

      periodicSyncTimerRef.current = setTimeout(tick, 35000);
    };

    init();

    return () => {
      mountedRef.current = false;
      clearTimer(debounceTimerRef);
      clearTimer(periodicSyncTimerRef);
      cleanupRealtime();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev.match(/inactive|background/) && nextState === "active") {
        syncAll();
        if (realtimeStatusRef.current !== "SUBSCRIBED") {
          connectRealtimeRef.current?.({ force: true, reason: "foreground" });
        }
      }
    });

    return () => sub.remove();
  }, [syncAll]);

  /* --------------------------- Animation --------------------------- */

  useEffect(() => {
    if (realtimeStatus === "SUBSCRIBED") {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    }
  }, [realtimeStatus, pulseAnim]);

  /* ----------------------------- UI -------------------------------- */

  const goReports = () => router.push("/volunteer/reports");
  const live = realtimeStatus === "SUBSCRIBED";

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.top}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>สวัสดี, อาสาสมัคร 👋</Text>

            <View style={styles.subRow}>
              <Text style={styles.sub}>
                วันนี้มีภารกิจให้ช่วย{" "}
                {urgentCount > 0 ? "เร่งด่วน" : "อยู่ในคิว"} พร้อมลุยไหม
              </Text>

              {live && (
                <Animated.View
                  style={[
                    styles.liveIndicator,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                >
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </Animated.View>
              )}
            </View>

            <Text style={styles.syncHint}>
              อัปเดตล่าสุด {lastSyncLabel} • Realtime:{" "}
              {live ? "เชื่อมต่อแล้ว" : "กำลังเชื่อมต่อ/หลุด"}
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

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>สรุปผลงานของคุณ</Text>

          {statsLoading ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <ActivityIndicator size="small" color="#8b5cf6" />
              <Text style={styles.sectionHint}>กำลังอัปเดต...</Text>
            </View>
          ) : (
            <Text style={styles.sectionHint}>อัปเดต {lastSyncLabel}</Text>
          )}
        </View>

        <View style={styles.statsGrid}>
          <StatTile
            icon="albums-outline"
            title="เคสทั้งหมด"
            value={stats.totalCases}
            unit="เคส"
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
            icon="trophy-outline"
            title="เคสสำเร็จ"
            value={stats.completedCases}
            unit="เคส"
            tone="blue"
          />
          <StatTile
            icon="calendar-outline"
            title="ปิดเคส 7 วัน"
            value={stats.completed7d}
            unit="เคส"
            tone="pink"
          />
        </View>
      </View>

      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

/* ---------------------------- Components --------------------------- */

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

/* ------------------------------ Tones ------------------------------ */

const statTones = {
  green: { bg: { backgroundColor: "#dcfce7" }, color: "#16a34a" },
  amber: { bg: { backgroundColor: "#fef3c7" }, color: "#d97706" },
  blue: { bg: { backgroundColor: "#dbeafe" }, color: "#2563eb" },
  pink: { bg: { backgroundColor: "#fce7f3" }, color: "#db2777" },
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

/* ------------------------------ Styles ----------------------------- */

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
  notifBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },

  hello: { fontSize: 26, fontWeight: "800", color: "#0f172a" },

  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  sub: { fontSize: 14, color: "#64748b", flex: 1 },

  syncHint: { marginTop: 6, fontSize: 12, color: "#94a3b8" },

  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16a34a",
  },
  liveText: { fontSize: 10, fontWeight: "800", color: "#16a34a" },

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
});
