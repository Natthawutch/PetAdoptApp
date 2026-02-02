// app/volunteer/home/VolunteerHome.jsx
// VolunteerHome.jsx - Stable Realtime + Reliable Sync (FULL)
// ✅ Fixed: fetchUnreadCount now uses volunteerUuid (Supabase UUID) instead of userId (Clerk ID)
// ✅ Fixed: Realtime notifications listener uses volunteerUuid
// ✅ UPDATED: "ช่วยเหลือไม่สำเร็จ" shows TOTAL failed cases (no 7-day filter)

import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function jitter(ms, pct = 0.25) {
  const delta = ms * pct;
  return Math.floor(ms - delta + Math.random() * (delta * 2));
}

function isBadStatus(s) {
  return (
    s === "disconnected" ||
    s === "CLOSED" ||
    s === "TIMED_OUT" ||
    s === "CHANNEL_ERROR"
  );
}

/* --------------------------- Main Screen -------------------------- */

export default function VolunteerHome() {
  const router = useRouter();
  const { getToken, isSignedIn } = useAuth();
  const { user, isLoaded } = useUser();

  const userId = user?.id; // ✅ Clerk id (string)

  const [urgentCount, setUrgentCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const [stats, setStats] = useState({
    totalCases: 0,
    activeReports: 0,
    completedCases: 0,
    failedCases: 0, // ✅ total failed (no 7-day filter)
  });

  const [statsLoading, setStatsLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState("disconnected");
  const [lastSyncLabel, setLastSyncLabel] = useState("—");

  // ✅ volunteer uuid in DB (users.id)
  const [volunteerUuid, setVolunteerUuid] = useState(null);

  // ✅ keep latest realtimeStatus
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
  const connectInFlightRef = useRef(false);

  // Retry
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef(null);

  // Sync timers
  const urgentDebounceRef = useRef(null);
  const statsDebounceRef = useRef(null);
  const notifDebounceRef = useRef(null);
  const periodicSyncTimerRef = useRef(null);

  // access connectRealtime from timers without dependency loops
  const connectRealtimeRef = useRef(null);

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

  /* -------------------------- Token helpers -------------------------- */

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

  const getSupabase = useCallback(async () => {
    const token = await getClerkToken();
    if (!token) return null;
    return createClerkSupabaseClient(token);
  }, [getClerkToken]);

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
      const supabase = await getSupabase();
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

  // ✅ FIXED: fetchUnreadCount now uses volunteerUuid (Supabase UUID)
  const fetchUnreadCount = useCallback(async () => {
    try {
      const supabase = await getSupabase();
      if (!supabase) return;

      // ✅ Must use volunteerUuid (Supabase UUID), not userId (Clerk ID)
      let vu = volunteerUuid;
      if (!vu) {
        vu = await resolveVolunteerUuid(supabase);
        if (!vu) {
          console.log("❌ Cannot resolve volunteer uuid for notifications");
          return;
        }
        if (mountedRef.current) setVolunteerUuid(vu);
      }

      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", vu)
        .eq("unread", true);

      if (error) throw error;
      if (!mountedRef.current) return;

      setUnreadCount(count || 0);
      setLastSyncLabel(formatTimeLabel());
    } catch (e) {
      console.log("❌ fetchUnreadCount error:", e);
    }
  }, [getSupabase, volunteerUuid, resolveVolunteerUuid, formatTimeLabel]);

  const fetchVolunteerStats = useCallback(async () => {
    try {
      if (!userId) return;

      setStatsLoading(true);

      const supabase = await getSupabase();
      if (!supabase) return;

      // ensure volunteerUuid
      let vu = volunteerUuid;
      if (!vu) {
        vu = await resolveVolunteerUuid(supabase);
        if (!vu) {
          console.log("❌ Cannot resolve volunteer uuid");
          return;
        }
        if (mountedRef.current) setVolunteerUuid(vu);
      }

      const [
        { count: completedCount, error: completedErr },
        { count: activeCount, error: activeErr },
        { count: failedCount, error: failedErr },
      ] = await Promise.all([
        supabase
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("assigned_volunteer_id", vu)
          .eq("status", "completed"),
        supabase
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("assigned_volunteer_id", vu)
          .eq("status", "in_progress"),
        supabase
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("assigned_volunteer_id", vu)
          .eq("status", "failed"),
      ]);

      if (completedErr) throw completedErr;
      if (activeErr) throw activeErr;
      if (failedErr) throw failedErr;

      if (!mountedRef.current) return;

      const completedCases = completedCount || 0;
      const activeReports = activeCount || 0;
      const failedCases = failedCount || 0;

      const totalCases = completedCases + activeReports + failedCases;

      setStats({
        totalCases,
        activeReports,
        completedCases,
        failedCases,
      });

      setLastSyncLabel(formatTimeLabel());
    } catch (e) {
      console.log("❌ fetchVolunteerStats error:", e);
    } finally {
      if (mountedRef.current) setStatsLoading(false);
    }
  }, [
    userId,
    volunteerUuid,
    getSupabase,
    resolveVolunteerUuid,
    formatTimeLabel,
  ]);

  /* ----------------------- Debounced sync split ---------------------- */

  const scheduleDebouncedUrgent = useCallback(
    (delay = 450) => {
      clearTimer(urgentDebounceRef);
      urgentDebounceRef.current = setTimeout(() => {
        fetchUrgentCount();
      }, delay);
    },
    [clearTimer, fetchUrgentCount],
  );

  const scheduleDebouncedStats = useCallback(
    (delay = 750) => {
      clearTimer(statsDebounceRef);
      statsDebounceRef.current = setTimeout(() => {
        fetchVolunteerStats();
      }, delay);
    },
    [clearTimer, fetchVolunteerStats],
  );

  const scheduleDebouncedNotif = useCallback(
    (delay = 550) => {
      clearTimer(notifDebounceRef);
      notifDebounceRef.current = setTimeout(() => {
        fetchUnreadCount();
      }, delay);
    },
    [clearTimer, fetchUnreadCount],
  );

  const syncAll = useCallback(async () => {
    await Promise.all([
      fetchUrgentCount(),
      fetchVolunteerStats(),
      fetchUnreadCount(),
    ]);
  }, [fetchUrgentCount, fetchVolunteerStats, fetchUnreadCount]);

  /* -------------------------- Realtime ----------------------------- */

  const removeRealtimeChannel = useCallback(async () => {
    const rt = realtimeRef.current;
    const ch = channelRef.current;

    try {
      if (rt && ch) {
        await rt.removeChannel(ch);
      }
    } catch (e) {
      console.log("removeRealtimeChannel error:", e);
    } finally {
      channelRef.current = null;
      if (mountedRef.current) setRealtimeStatus("disconnected");
    }
  }, []);

  const scheduleReconnect = useCallback(
    (reason = "unknown") => {
      if (!mountedRef.current) return;
      if (appStateRef.current !== "active") return;

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

        // ✅ prevent overlaps
        if (connectInFlightRef.current) return;
        if (connectLockRef.current && !force) return;

        connectLockRef.current = true;
        connectInFlightRef.current = true;

        setRealtimeStatus("CONNECTING");

        // ✅ remove old channel if any
        if (channelRef.current) {
          await removeRealtimeChannel();
        }

        const token = await getClerkToken();
        if (!token) {
          setRealtimeStatus("disconnected");
          connectLockRef.current = false;
          connectInFlightRef.current = false;
          scheduleReconnect("no_token");
          return;
        }

        const rtClient = getRealtimeClient(token);
        realtimeRef.current = rtClient;

        const channel = rtClient.channel(`vh-${userId}`, {
          config: { broadcast: { self: false } },
        });

        // ✅ Listener A: pending reports => urgentCount
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "reports",
            filter: "status=eq.pending",
          },
          () => {
            if (!mountedRef.current) return;
            scheduleDebouncedUrgent(400);
          },
        );

        // ✅ Listener B: assigned to me => stats
        if (volunteerUuid) {
          channel.on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "reports",
              filter: `assigned_volunteer_id=eq.${volunteerUuid}`,
            },
            () => {
              if (!mountedRef.current) return;
              scheduleDebouncedStats(650);
            },
          );
        }

        // ✅ Listener C: notifications for me (uses volunteerUuid)
        if (volunteerUuid) {
          channel.on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${volunteerUuid}`,
            },
            () => {
              if (!mountedRef.current) return;
              scheduleDebouncedNotif(450);
            },
          );
        }

        channel.subscribe((status) => {
          if (!mountedRef.current) return;

          setRealtimeStatus(status);

          if (status === "SUBSCRIBED") {
            retryAttemptRef.current = 0;
            connectLockRef.current = false;
            connectInFlightRef.current = false;

            // initial quick sync after subscribe
            scheduleDebouncedUrgent(250);
            if (volunteerUuid) {
              scheduleDebouncedStats(350);
              scheduleDebouncedNotif(300);
            }
            return;
          }

          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            connectLockRef.current = false;
            connectInFlightRef.current = false;
            channelRef.current = null;
            scheduleReconnect(`status:${status}:${reason}`);
          }
        });

        channelRef.current = channel;
      } catch (e) {
        console.log("❌ connectRealtime error:", e);
        connectLockRef.current = false;
        connectInFlightRef.current = false;
        channelRef.current = null;
        setRealtimeStatus("disconnected");
        scheduleReconnect(`exception:${reason}`);
      }
    },
    [
      userId,
      volunteerUuid,
      removeRealtimeChannel,
      getClerkToken,
      scheduleReconnect,
      scheduleDebouncedUrgent,
      scheduleDebouncedStats,
      scheduleDebouncedNotif,
    ],
  );

  useEffect(() => {
    connectRealtimeRef.current = connectRealtime;
  }, [connectRealtime]);

  /* --------------------- Init + Periodic Sync ------------------ */

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      if (!userId) return;

      // initial fetch
      await fetchUrgentCount();

      // ✅ resolve volunteerUuid first before fetching unreadCount
      const supabase = await getSupabase();
      if (supabase) {
        const vu = await resolveVolunteerUuid(supabase);
        if (vu && mountedRef.current) {
          setVolunteerUuid(vu);
        }
      }

      // ✅ Now fetch unreadCount (after volunteerUuid is set)
      await fetchUnreadCount();
      await fetchVolunteerStats();
      await connectRealtimeRef.current?.({ force: true, reason: "init" });

      clearTimer(periodicSyncTimerRef);

      const tick = async () => {
        if (!mountedRef.current) return;

        await syncAll();

        // reconnect เฉพาะตอนหลุดจริง
        const s = realtimeStatusRef.current;
        if (isBadStatus(s)) {
          connectRealtimeRef.current?.({ force: true, reason: "periodic" });
        }

        periodicSyncTimerRef.current = setTimeout(tick, 60000); // 60s
      };

      periodicSyncTimerRef.current = setTimeout(tick, 60000);
    };

    init();

    return () => {
      mountedRef.current = false;
      clearTimer(urgentDebounceRef);
      clearTimer(statsDebounceRef);
      clearTimer(notifDebounceRef);
      clearTimer(periodicSyncTimerRef);
      clearTimer(retryTimerRef);
      removeRealtimeChannel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ถ้า volunteerUuid เพิ่งถูก resolve ทีหลัง ให้ reconnect เพื่อเพิ่ม listener
  useEffect(() => {
    if (!userId) return;
    if (!volunteerUuid) return;

    if (realtimeStatusRef.current === "SUBSCRIBED") {
      connectRealtimeRef.current?.({ force: true, reason: "uuid_ready" });
    }
  }, [userId, volunteerUuid]);

  /* --------------------- Foreground reconnect ------------------ */

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev.match(/inactive|background/) && nextState === "active") {
        syncAll();

        try {
          realtimeRef.current?.realtime?.connect?.();
        } catch {}

        if (realtimeStatusRef.current !== "SUBSCRIBED") {
          connectRealtimeRef.current?.({ force: true, reason: "foreground" });
        }
      }
    });

    return () => sub.remove();
  }, [syncAll]);

  // ✅ IMPORTANT: when returning from Notifications screen, re-fetch unreadCount
  useFocusEffect(
    useCallback(() => {
      fetchUnreadCount();
      return () => {};
    }, [fetchUnreadCount]),
  );

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
  const goGuide = () => router.push("/volunteer/guide");
  const goNotifications = () => router.push("/volunteer/notifications");
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
            onPress={goNotifications}
          >
            <Ionicons name="notifications-outline" size={22} color="#0f172a" />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Primary: Reports */}
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

        {/* Guide */}
        <TouchableOpacity
          style={[styles.primaryCard, styles.primaryCalm, styles.guideCard]}
          onPress={goGuide}
          activeOpacity={0.9}
        >
          <View style={styles.primaryLeft}>
            <View style={[styles.primaryIcon, styles.iconCalm]}>
              <Ionicons
                name="document-text-outline"
                size={22}
                color="#0ea5e9"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.primaryTitle}>คู่มืออาสาสมัคร</Text>
              <Text style={styles.primaryDesc}>
                วิธีรับเคส • ขั้นตอนช่วยเหลือ • ข้อควรระวัง
              </Text>
            </View>
          </View>

          <View style={styles.primaryRight}>
            <Ionicons name="chevron-forward" size={20} color="#0f172a" />
          </View>
        </TouchableOpacity>
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
            icon="close-circle-outline"
            title="ช่วยเหลือไม่สำเร็จ"
            value={stats.failedCases}
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

  guideCard: { marginTop: 12 },

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
