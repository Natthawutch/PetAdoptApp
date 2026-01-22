import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
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

export default function VolunteerReports() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const userId = user?.id;

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [realtimeStatus, setRealtimeStatus] = useState("disconnected"); // disconnected | CONNECTING | SUBSCRIBED | ...
  const [newReportId, setNewReportId] = useState(null);

  // ✅ volunteer uuid in DB (users.id)
  const [volunteerUuid, setVolunteerUuid] = useState(null);

  // ✅ UX: banner when a case moved to completed and disappears from "all"
  const [justCompletedCount, setJustCompletedCount] = useState(0);
  const justCompletedTimerRef = useRef(null);

  // Animation for LIVE status
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Refs / Lifecycles
  const mountedRef = useRef(true);
  const isInitializedRef = useRef(false);

  // Realtime refs
  const realtimeClientRef = useRef(null);
  const channelRef = useRef(null);

  // Guards
  const cleanupInProgressRef = useRef(false);
  const connectLockRef = useRef(false);
  const intentionalCloseRef = useRef(false);

  // Retry
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef(null);

  /* --------------------------- Timers ---------------------------- */
  const clearTimer = useCallback((ref) => {
    if (ref.current) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);

  const clearJustCompletedBanner = useCallback(() => {
    clearTimer(justCompletedTimerRef);
    setJustCompletedCount(0);
  }, [clearTimer]);

  const bumpJustCompleted = useCallback(() => {
    setJustCompletedCount((c) => c + 1);
    clearTimer(justCompletedTimerRef);
    justCompletedTimerRef.current = setTimeout(() => {
      setJustCompletedCount(0);
      justCompletedTimerRef.current = null;
    }, 2500);
  }, [clearTimer]);

  /* -------------------------- Token/Supabase -------------------------- */
  const getSupabase = useCallback(
    async (fresh = false) => {
      const token = fresh
        ? await getToken({ template: "supabase", skipCache: true })
        : await getToken({ template: "supabase" });

      if (!token) return null;
      return createClerkSupabaseClient(token);
    },
    [getToken],
  );

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

  /* -------------------- Visibility Rules -------------------- */
  // ✅ visible if:
  // - pending AND assigned_volunteer_id is null  (public unassigned)
  // - OR assigned_volunteer_id === my volunteerUuid (mine)
  const isVisibleToMe = useCallback(
    (r) => {
      if (!r) return false;
      if (r.status === "pending") return !r.assigned_volunteer_id;
      return !!volunteerUuid && r.assigned_volunteer_id === volunteerUuid;
    },
    [volunteerUuid],
  );

  const normalizeReports = useCallback((arr) => {
    const map = new Map();
    for (const r of arr || []) {
      if (r?.id) map.set(r.id, r);
    }
    const next = Array.from(map.values());
    next.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return next;
  }, []);

  /* -------------------------- Load Reports -------------------------- */
  const loadReports = useCallback(
    async ({ freshToken = false } = {}) => {
      try {
        if (!userId) return;

        const supabase = await getSupabase(freshToken);
        if (!supabase) return;

        let vu = volunteerUuid;
        if (!vu) {
          vu = await resolveVolunteerUuid(supabase);
          if (!vu) return;
          setVolunteerUuid(vu);
        }

        // Fetch:
        // 1) pending unassigned
        // 2) mine (assigned to me)
        const [pendingRes, mineRes] = await Promise.all([
          supabase
            .from("reports")
            .select("*")
            .eq("status", "pending")
            .is("assigned_volunteer_id", null)
            .order("created_at", { ascending: false }),
          supabase
            .from("reports")
            .select("*")
            .eq("assigned_volunteer_id", vu)
            .order("created_at", { ascending: false }),
        ]);

        if (pendingRes.error) throw pendingRes.error;
        if (mineRes.error) throw mineRes.error;

        const merged = normalizeReports([
          ...(pendingRes.data || []),
          ...(mineRes.data || []),
        ]);

        setReports(merged);
      } catch (e) {
        console.log("❌ loadReports error:", e);
      }
    },
    [
      userId,
      getSupabase,
      volunteerUuid,
      resolveVolunteerUuid,
      normalizeReports,
    ],
  );

  /* -------------------------- Realtime Cleanup -------------------------- */
  const cleanupRealtime = useCallback(async () => {
    if (cleanupInProgressRef.current) return;
    cleanupInProgressRef.current = true;

    try {
      // mark intentional close so CLOSED won't trigger reconnect
      intentionalCloseRef.current = true;

      clearTimer(retryTimerRef);

      if (realtimeClientRef.current && channelRef.current) {
        console.log("🧹 Removing channel...");
        await realtimeClientRef.current.removeChannel(channelRef.current);
      }
    } catch (e) {
      console.log("cleanupRealtime error:", e);
    } finally {
      channelRef.current = null;
      realtimeClientRef.current = null;
      cleanupInProgressRef.current = false;

      // release intentional flag in next tick
      setTimeout(() => {
        intentionalCloseRef.current = false;
      }, 0);
    }
  }, [clearTimer]);

  /* -------------------------- Reconnect Backoff -------------------------- */
  const scheduleReconnect = useCallback(
    (reason = "unknown") => {
      if (!mountedRef.current) return;

      const attempt = retryAttemptRef.current + 1;
      retryAttemptRef.current = attempt;

      const base = clamp(900 * Math.pow(1.8, attempt - 1), 900, 12000);
      const waitMs = jitter(base, 0.25);

      clearTimer(retryTimerRef);
      retryTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        // only reconnect if not already connected / connecting
        if (
          realtimeStatus !== "SUBSCRIBED" &&
          realtimeStatus !== "CONNECTING" &&
          !connectLockRef.current
        ) {
          connectRealtime({ force: true, reason });
        }
      }, waitMs);
    },
    [clearTimer, realtimeStatus],
  );

  /* -------------------------- Realtime Connect -------------------------- */
  const connectRealtime = useCallback(
    async ({ force = false, reason = "manual" } = {}) => {
      try {
        if (!userId) return;
        if (!volunteerUuid) return;

        if (connectLockRef.current && !force) return;
        connectLockRef.current = true;

        setRealtimeStatus("CONNECTING");

        // cleanup existing
        await cleanupRealtime();

        // get fresh token for WS
        const token = await getToken({ template: "supabase", skipCache: true });
        if (!token) {
          setRealtimeStatus("disconnected");
          connectLockRef.current = false;
          return;
        }

        const realtime = getRealtimeClient(token);
        realtimeClientRef.current = realtime;

        // stable channel key per volunteer
        const channel = realtime.channel(`reports-${volunteerUuid}`, {
          config: { broadcast: { self: false } },
        });

        const upsertRow = (row, markNew = false) => {
          if (!row?.id) return;
          if (!isVisibleToMe(row)) return;

          setReports((prev) => {
            const exists = prev.some((r) => r.id === row.id);
            const next = exists
              ? prev.map((r) => (r.id === row.id ? { ...r, ...row } : r))
              : [row, ...prev];

            const filtered = next.filter(isVisibleToMe);
            const normalized = normalizeReports(filtered);

            if (markNew) {
              setNewReportId(row.id);
              setTimeout(() => setNewReportId(null), 3000);
            }

            return normalized;
          });
        };

        const removeRow = (id) => {
          if (!id) return;
          setReports((prev) => prev.filter((r) => r.id !== id));
        };

        // Listener 1: pending changes (but show only unassigned)
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "reports",
            filter: "status=eq.pending",
          },
          (payload) => {
            if (!mountedRef.current) return;
            const { eventType, new: newRow, old: oldRow } = payload;

            if (eventType === "DELETE") {
              removeRow(oldRow?.id);
              return;
            }

            // show only truly unassigned pending
            if (
              newRow?.status === "pending" &&
              !newRow?.assigned_volunteer_id
            ) {
              upsertRow(newRow, eventType === "INSERT");
            } else {
              // pending got assigned -> remove from public list
              removeRow(newRow?.id);
            }
          },
        );

        // Listener 2: my cases (assigned to me, any status)
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "reports",
            filter: `assigned_volunteer_id=eq.${volunteerUuid}`,
          },
          (payload) => {
            if (!mountedRef.current) return;
            const { eventType, new: newRow, old: oldRow } = payload;

            if (eventType === "DELETE") {
              removeRow(oldRow?.id);
              return;
            }

            if (eventType === "UPDATE") {
              // if moved from in_progress -> completed, show banner (it will disappear from "all")
              const prevRow = reports.find((r) => r.id === newRow?.id);
              if (
                prevRow?.status === "in_progress" &&
                newRow?.status === "completed"
              ) {
                bumpJustCompleted();
              }
            }

            if (newRow) upsertRow(newRow, false);
          },
        );

        channel.subscribe((status, err) => {
          if (!mountedRef.current) return;

          console.log("📡 Subscription status:", status);

          // ignore CLOSED caused by our own cleanup
          if (status === "CLOSED" && intentionalCloseRef.current) return;

          setRealtimeStatus(status);

          if (status === "SUBSCRIBED") {
            retryAttemptRef.current = 0;
            connectLockRef.current = false;
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            connectLockRef.current = false;
            scheduleReconnect(`status:${status}:${reason}`);
            return;
          }

          if (status === "CLOSED") {
            connectLockRef.current = false;
            // if unexpected close, reconnect
            if (!intentionalCloseRef.current)
              scheduleReconnect(`status:CLOSED:${reason}`);
          }
        });

        channelRef.current = channel;
        console.log("✅ Realtime setup requested");
      } catch (e) {
        console.log("❌ connectRealtime error:", e);
        connectLockRef.current = false;
        setRealtimeStatus("disconnected");
        scheduleReconnect(`exception:${reason}`);
      }
    },
    [
      userId,
      volunteerUuid,
      cleanupRealtime,
      getToken,
      isVisibleToMe,
      normalizeReports,
      scheduleReconnect,
      bumpJustCompleted,
      reports,
    ],
  );

  /* -------------------------- Init -------------------------- */
  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      if (!userId) return;

      setLoading(true);

      // Load once + resolve volunteerUuid
      await loadReports({ freshToken: false });

      // Ensure volunteerUuid exists before connecting
      if (!volunteerUuid) {
        const supabase = await getSupabase(true);
        if (supabase) {
          const vu = await resolveVolunteerUuid(supabase);
          if (vu) setVolunteerUuid(vu);
        }
      }

      setLoading(false);
    };

    init();

    return () => {
      mountedRef.current = false;
      clearTimer(justCompletedTimerRef);
      clearTimer(retryTimerRef);
      cleanupRealtime();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Connect realtime after volunteerUuid ready (run once per uuid)
  useEffect(() => {
    if (!userId) return;
    if (!volunteerUuid) return;

    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    connectRealtime({ force: true, reason: "init" });
  }, [userId, volunteerUuid, connectRealtime]);

  /* -------------------------- Focus Reconnect -------------------------- */
  useFocusEffect(
    useCallback(() => {
      if (!userId || !volunteerUuid) return;

      // refresh list (optional)
      loadReports({ freshToken: false });

      const shouldReconnect =
        realtimeStatus !== "SUBSCRIBED" &&
        realtimeStatus !== "CONNECTING" &&
        !connectLockRef.current;

      if (shouldReconnect) {
        connectRealtime({ force: true, reason: "focus" });
      }

      return () => {};
    }, [userId, volunteerUuid, realtimeStatus, loadReports, connectRealtime]),
  );

  /* -------------------------- UI Helpers -------------------------- */
  useEffect(() => {
    if (realtimeStatus === "SUBSCRIBED") {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    }
  }, [realtimeStatus, pulseAnim]);

  const handleRefresh = async () => {
    setLoading(true);
    await loadReports({ freshToken: false });
    setLoading(false);

    if (realtimeStatus !== "SUBSCRIBED") {
      connectRealtime({ force: true, reason: "pull_to_refresh" });
    }
  };

  const filters = useMemo(() => {
    const pendingCount = reports.filter((r) => r.status === "pending").length;
    const activeCount = reports.filter(
      (r) => r.status === "in_progress",
    ).length;
    const completedCount = reports.filter(
      (r) => r.status === "completed",
    ).length;

    return [
      { id: "all", label: "ทั้งหมด", count: pendingCount + activeCount }, // hide completed in all
      { id: "pending", label: "รอดำเนินการ", count: pendingCount },
      { id: "in_progress", label: "กำลังทำ", count: activeCount },
      { id: "completed", label: "เสร็จสิ้น", count: completedCount },
    ];
  }, [reports]);

  const getStatusStyle = (status) => {
    switch (status) {
      case "pending":
        return {
          bg: "#fee2e2",
          text: "#dc2626",
          icon: "alert-circle",
          label: "รอดำเนินการ",
        };
      case "in_progress":
        return {
          bg: "#dcfce7",
          text: "#16a34a",
          icon: "sync",
          label: "กำลังดำเนินการ",
        };
      case "completed":
        return {
          bg: "#dbeafe",
          text: "#2563eb",
          icon: "checkmark-circle",
          label: "เสร็จสิ้น",
        };
      default:
        return {
          bg: "#f1f5f9",
          text: "#64748b",
          icon: "help-circle",
          label: "ไม่ทราบสถานะ",
        };
    }
  };

  const getTimeAgo = (dateString) => {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "เมื่อสักครู่";
    if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
    if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
    if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
    return past.toLocaleDateString("th-TH");
  };

  const filteredReports = reports.filter((report) => {
    if (selectedFilter === "all") {
      if (report.status === "completed") return false;
    } else {
      if (report.status !== selectedFilter) return false;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        report.animal_type?.toLowerCase().includes(q) ||
        report.detail?.toLowerCase().includes(q) ||
        report.location?.toLowerCase().includes(q)
      );
    }

    return true;
  });

  const getConnectionStatusColor = () => {
    switch (realtimeStatus) {
      case "SUBSCRIBED":
        return "#16a34a";
      case "CHANNEL_ERROR":
      case "TIMED_OUT":
        return "#dc2626";
      default:
        return "#94a3b8";
    }
  };

  const getConnectionStatusText = () => {
    switch (realtimeStatus) {
      case "SUBSCRIBED":
        return "เชื่อมต่อแล้ว";
      case "CHANNEL_ERROR":
        return "เกิดข้อผิดพลาด";
      case "TIMED_OUT":
        return "หมดเวลา";
      case "CLOSED":
        return "ปิดการเชื่อมต่อ";
      case "CONNECTING":
        return "กำลังเชื่อมต่อ...";
      default:
        return "กำลังเชื่อมต่อ...";
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.titleContainer}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>รายงานสัตว์</Text>

          {realtimeStatus === "SUBSCRIBED" && (
            <Animated.View
              style={[
                styles.liveIndicator,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <View
                style={[
                  styles.liveDot,
                  { backgroundColor: getConnectionStatusColor() },
                ]}
              />
              <Text style={styles.liveText}>LIVE</Text>
            </Animated.View>
          )}
        </View>

        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle}>รอคนรับ + เคสของคุณเท่านั้น</Text>

          <View style={styles.statusDot}>
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: getConnectionStatusColor() },
              ]}
            />
            <Text style={styles.statusText}>{getConnectionStatusText()}</Text>
          </View>
        </View>

        {justCompletedCount > 0 && (
          <View style={styles.completedBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
            <Text style={styles.completedBannerText}>
              ปิดเคสสำเร็จแล้ว {justCompletedCount} เคส • ไปดูได้ที่ “เสร็จสิ้น”
            </Text>
            <TouchableOpacity
              onPress={() => {
                clearJustCompletedBanner();
                setSelectedFilter("completed");
              }}
              activeOpacity={0.85}
              style={styles.completedBannerAction}
            >
              <Text style={styles.completedBannerActionText}>ดู</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.filterContainer}>
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            style={[
              styles.filterTab,
              selectedFilter === filter.id && styles.filterTabActive,
            ]}
            onPress={() => setSelectedFilter(filter.id)}
          >
            <Text
              style={[
                styles.filterText,
                selectedFilter === filter.id && styles.filterTextActive,
              ]}
            >
              {filter.label}
            </Text>
            <View
              style={[
                styles.filterBadge,
                selectedFilter === filter.id && styles.filterBadgeActive,
              ]}
            >
              <Text
                style={[
                  styles.filterBadgeText,
                  selectedFilter === filter.id && styles.filterBadgeTextActive,
                ]}
              >
                {filter.count}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderItem = ({ item }) => {
    const statusStyle = getStatusStyle(item.status);
    const isNew = newReportId === item.id;

    return (
      <TouchableOpacity
        style={[
          styles.card,
          item.status === "pending" && styles.cardUrgent,
          isNew && styles.cardNew,
        ]}
        onPress={() =>
          router.push({
            pathname: "/volunteer/report-detail",
            params: { id: item.id },
          })
        }
        activeOpacity={0.7}
      >
        {isNew && (
          <View style={styles.newBadge}>
            <Ionicons name="sparkles" size={12} color="#fff" />
            <Text style={styles.newBadgeText}>ใหม่</Text>
          </View>
        )}

        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View
              style={[
                styles.animalBadge,
                {
                  backgroundColor:
                    item.animal_type === "สุนัข" ? "#dbeafe" : "#fce7f3",
                },
              ]}
            >
              <Ionicons
                name={item.animal_type === "สุนัข" ? "paw" : "fish"}
                size={16}
                color={item.animal_type === "สุนัข" ? "#2563eb" : "#ec4899"}
              />
            </View>
            <Text style={styles.animalType}>{item.animal_type}</Text>
          </View>

          <View
            style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}
          >
            <Ionicons
              name={statusStyle.icon}
              size={12}
              color={statusStyle.text}
            />
            <Text style={[styles.statusTextBadge, { color: statusStyle.text }]}>
              {statusStyle.label}
            </Text>
          </View>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.detail || "ไม่มีรายละเอียด"}
        </Text>

        <View style={styles.locationRow}>
          <Ionicons name="location" size={16} color="#64748b" />
          <Text style={styles.locationText} numberOfLines={1}>
            {item.location || "ไม่ระบุตำแหน่ง"}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Ionicons name="time-outline" size={14} color="#94a3b8" />
            <Text style={styles.infoText}>{getTimeAgo(item.created_at)}</Text>
          </View>

          {item.latitude && item.longitude && (
            <>
              <View style={styles.infoDivider} />
              <View style={styles.infoItem}>
                <Ionicons name="navigate-outline" size={14} color="#94a3b8" />
                <Text style={styles.infoText}>มีพิกัด GPS</Text>
              </View>
            </>
          )}
        </View>

        {item.assigned_volunteer_id && (
          <View style={styles.assignedRow}>
            <Ionicons name="person" size={14} color="#8b5cf6" />
            <Text style={styles.assignedText}>
              {item.status === "pending"
                ? "ยังไม่มีผู้รับผิดชอบ"
                : "เป็นเคสของคุณ"}
            </Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>ดูรายละเอียด</Text>
            <Ionicons name="arrow-forward" size={16} color="#8b5cf6" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Ionicons name="document-text-outline" size={64} color="#cbd5e1" />
      </View>
      <Text style={styles.emptyTitle}>ไม่พบรายงาน</Text>
      <Text style={styles.emptyDesc}>
        ไม่มีเคสที่รอคนรับ หรือเคสของคุณในขณะนี้
      </Text>
    </View>
  );

  if (loading && !isInitializedRef.current) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>กำลังโหลดรายงาน...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredReports}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={handleRefresh}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  loadingText: { marginTop: 12, fontSize: 14, color: "#64748b" },

  listContent: { paddingBottom: 20 },

  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 16,
  },

  titleContainer: { marginBottom: 16 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: { fontSize: 28, fontWeight: "800", color: "#1e293b" },

  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  subtitle: { fontSize: 14, color: "#64748b" },

  statusDot: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusIndicator: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, color: "#94a3b8" },

  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 11, fontWeight: "700", color: "#16a34a" },

  completedBanner: {
    marginTop: 12,
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  completedBannerText: {
    flex: 1,
    fontSize: 12,
    color: "#065f46",
    fontWeight: "600",
  },
  completedBannerAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#d1fae5",
  },
  completedBannerActionText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#065f46",
  },

  filterContainer: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    gap: 6,
  },
  filterTabActive: { backgroundColor: "#8b5cf6" },
  filterText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  filterTextActive: { color: "#fff" },
  filterBadge: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: "center",
  },
  filterBadgeActive: { backgroundColor: "#7c3aed" },
  filterBadgeText: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  filterBadgeTextActive: { color: "#fff" },

  card: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "transparent",
    position: "relative",
    overflow: "hidden",
  },
  cardUrgent: { borderColor: "#fee2e2", backgroundColor: "#fffbfb" },
  cardNew: {
    borderColor: "#8b5cf6",
    borderWidth: 2,
    shadowColor: "#8b5cf6",
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },

  newBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#8b5cf6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    zIndex: 10,
  },
  newBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },

  animalBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  animalType: { fontSize: 13, fontWeight: "600", color: "#475569" },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  statusTextBadge: { fontSize: 11, fontWeight: "700" },

  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 8,
  },

  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  locationText: { fontSize: 14, color: "#64748b", flex: 1 },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  infoItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  infoDivider: {
    width: 1,
    height: 12,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 10,
  },
  infoText: { fontSize: 12, color: "#94a3b8" },

  assignedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  assignedText: { fontSize: 13, color: "#8b5cf6", fontWeight: "600" },

  cardFooter: { marginTop: 12 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f3ff",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  actionButtonText: { fontSize: 14, fontWeight: "600", color: "#8b5cf6" },

  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
  },
});
