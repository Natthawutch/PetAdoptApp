import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
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
function toTime(v) {
  const t = new Date(v || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function formatThaiDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Upsert item into a list already sorted by created_at desc (newest first)
 */
function upsertSortedByCreatedAtDesc(list, item) {
  const id = item?.id;
  if (!id) return list;

  const createdAt = toTime(item.created_at);

  // remove existing
  let arr = list;
  const idx = arr.findIndex((x) => x.id === id);
  if (idx !== -1) {
    const merged = { ...arr[idx], ...item };
    arr = [...arr.slice(0, idx), ...arr.slice(idx + 1)];
    item = merged;
  }

  // binary search insert position
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midTime = toTime(arr[mid]?.created_at);
    if (createdAt > midTime) hi = mid;
    else lo = mid + 1;
  }

  return [...arr.slice(0, lo), item, ...arr.slice(lo)];
}

/* -------------------------- Header (memo) -------------------------- */
const Header = memo(function Header({
  filters,
  selectedFilter,
  setSelectedFilter,
  realtimeStatus,
  pulseAnim,
  getConnectionStatusColor,
  getConnectionStatusText,
  justCompletedCount,
  clearJustCompletedBanner,
}) {
  return (
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
          <Pressable
            key={filter.id}
            onPress={() => setSelectedFilter(filter.id)}
            hitSlop={12}
            pressRetentionOffset={20}
            android_disableSound
            style={({ pressed }) => [
              styles.filterTab,
              selectedFilter === filter.id && styles.filterTabActive,
              pressed && { opacity: 0.9 },
            ]}
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
          </Pressable>
        ))}
      </View>
    </View>
  );
});

export default function VolunteerReports() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const userId = user?.id;

  const [reports, setReports] = useState([]);

  const [loading, setLoading] = useState(true);
  const [searchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [realtimeStatus, setRealtimeStatus] = useState("disconnected");
  const [newReportId, setNewReportId] = useState(null);

  const [volunteerUuid, setVolunteerUuid] = useState(null);

  const [justCompletedCount, setJustCompletedCount] = useState(0);
  const justCompletedTimerRef = useRef(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  const mountedRef = useRef(true);
  const isInitializedRef = useRef(false);

  const realtimeClientRef = useRef(null);
  const channelRef = useRef(null);

  const cleanupInProgressRef = useRef(false);
  const connectLockRef = useRef(false);
  const intentionalCloseRef = useRef(false);

  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef(null);

  const pendingOpsRef = useRef([]);
  const flushRafRef = useRef(null);

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
  const isVisibleToMe = useCallback(
    (r) => {
      if (!r) return false;
      if (r.status === "pending") return !r.assigned_volunteer_id;
      return !!volunteerUuid && r.assigned_volunteer_id === volunteerUuid;
    },
    [volunteerUuid],
  );

  /* -------------------------- Fast Upsert/Remove -------------------------- */
  const enqueueOp = useCallback(
    (op) => {
      pendingOpsRef.current.push(op);
      if (flushRafRef.current) return;

      flushRafRef.current = requestAnimationFrame(() => {
        flushRafRef.current = null;
        const ops = pendingOpsRef.current;
        pendingOpsRef.current = [];

        if (!ops.length) return;

        setReports((prev) => {
          let next = prev;

          for (const x of ops) {
            if (x.type === "remove") {
              const id = x.id;
              if (!id) continue;
              next = next.filter((r) => r.id !== id);
            } else if (x.type === "upsert") {
              const row = x.row;
              if (!row?.id) continue;

              if (!isVisibleToMe(row)) {
                next = next.filter((r) => r.id !== row.id);
                continue;
              }
              next = upsertSortedByCreatedAtDesc(next, row);
            }
          }

          return next;
        });
      });
    },
    [isVisibleToMe],
  );

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

        let merged = [];
        for (const r of [...(pendingRes.data || []), ...(mineRes.data || [])]) {
          merged = upsertSortedByCreatedAtDesc(merged, r);
        }
        setReports(merged);
      } catch (e) {
        console.log("❌ loadReports error:", e);
      }
    },
    [userId, getSupabase, volunteerUuid, resolveVolunteerUuid],
  );

  /* -------------------------- Realtime Cleanup -------------------------- */
  const cleanupRealtime = useCallback(async () => {
    if (cleanupInProgressRef.current) return;
    cleanupInProgressRef.current = true;

    try {
      intentionalCloseRef.current = true;
      clearTimer(retryTimerRef);

      if (realtimeClientRef.current && channelRef.current) {
        await realtimeClientRef.current.removeChannel(channelRef.current);
      }
    } catch (e) {
      console.log("cleanupRealtime error:", e);
    } finally {
      channelRef.current = null;
      realtimeClientRef.current = null;
      cleanupInProgressRef.current = false;

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
        await cleanupRealtime();

        const token = await getToken({ template: "supabase", skipCache: true });
        if (!token) {
          setRealtimeStatus("disconnected");
          connectLockRef.current = false;
          return;
        }

        const realtime = getRealtimeClient(token);
        realtimeClientRef.current = realtime;

        const channel = realtime.channel(`reports-${volunteerUuid}`, {
          config: { broadcast: { self: false } },
        });

        // Listener 1: pending changes (unassigned only)
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
              enqueueOp({ type: "remove", id: oldRow?.id });
              return;
            }

            if (
              newRow?.status === "pending" &&
              !newRow?.assigned_volunteer_id
            ) {
              enqueueOp({ type: "upsert", row: newRow });
              if (eventType === "INSERT") {
                setNewReportId(newRow.id);
                setTimeout(() => setNewReportId(null), 2500);
              }
            } else {
              enqueueOp({ type: "remove", id: newRow?.id });
            }
          },
        );

        // Listener 2: my cases
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
              enqueueOp({ type: "remove", id: oldRow?.id });
              return;
            }

            if (eventType === "UPDATE") {
              setReports((prev) => {
                const prevRow = prev.find((r) => r.id === newRow?.id);
                if (
                  prevRow?.status === "in_progress" &&
                  newRow?.status === "completed"
                ) {
                  bumpJustCompleted();
                }
                return prev;
              });
            }

            if (newRow) enqueueOp({ type: "upsert", row: newRow });
          },
        );

        channel.subscribe((status) => {
          if (!mountedRef.current) return;
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
            if (!intentionalCloseRef.current)
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
      volunteerUuid,
      cleanupRealtime,
      getToken,
      scheduleReconnect,
      bumpJustCompleted,
      enqueueOp,
    ],
  );

  /* -------------------------- Init -------------------------- */
  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      if (!userId) return;

      setLoading(true);
      await loadReports({ freshToken: false });

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
      if (flushRafRef.current) cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
      pendingOpsRef.current = [];
      cleanupRealtime();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (!volunteerUuid) return;
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    connectRealtime({ force: true, reason: "init" });
  }, [userId, volunteerUuid, connectRealtime]);

  useFocusEffect(
    useCallback(() => {
      if (!userId || !volunteerUuid) return;

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
    let pendingCount = 0;
    let activeCount = 0;
    let completedCount = 0;
    for (const r of reports) {
      if (r.status === "pending") pendingCount++;
      else if (r.status === "in_progress") activeCount++;
      else if (r.status === "completed") completedCount++;
    }

    return [
      { id: "all", label: "ทั้งหมด", count: pendingCount + activeCount },
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

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((report) => {
      if (selectedFilter === "all") {
        if (report.status === "completed") return false;
      } else {
        if (report.status !== selectedFilter) return false;
      }

      if (q) {
        return (
          report.animal_type?.toLowerCase().includes(q) ||
          report.detail?.toLowerCase().includes(q) ||
          report.location?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [reports, selectedFilter, searchQuery]);

  const getConnectionStatusColor = useCallback(() => {
    switch (realtimeStatus) {
      case "SUBSCRIBED":
        return "#16a34a";
      case "CHANNEL_ERROR":
      case "TIMED_OUT":
        return "#dc2626";
      default:
        return "#94a3b8";
    }
  }, [realtimeStatus]);

  const getConnectionStatusText = useCallback(() => {
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
  }, [realtimeStatus]);

  const renderItem = useCallback(
    ({ item }) => {
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
              <Text
                style={[styles.statusTextBadge, { color: statusStyle.text }]}
              >
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

          {/* ✅ แสดงวัน/เวลาแบบเต็ม */}
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={14} color="#94a3b8" />
              <Text style={styles.infoText}>
                {formatThaiDateTime(item.created_at)}
              </Text>
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
            <TouchableOpacity style={styles.actionButton} activeOpacity={0.85}>
              <Text style={styles.actionButtonText}>ดูรายละเอียด</Text>
              <Ionicons name="arrow-forward" size={16} color="#8b5cf6" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    },
    [newReportId, router],
  );

  const renderEmpty = useCallback(() => {
    return (
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
  }, []);

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
        ListHeaderComponent={
          <Header
            filters={filters}
            selectedFilter={selectedFilter}
            setSelectedFilter={setSelectedFilter}
            realtimeStatus={realtimeStatus}
            pulseAnim={pulseAnim}
            getConnectionStatusColor={getConnectionStatusColor}
            getConnectionStatusText={getConnectionStatusText}
            justCompletedCount={justCompletedCount}
            clearJustCompletedBanner={clearJustCompletedBanner}
          />
        }
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={handleRefresh}
        extraData={{
          selectedFilter,
          searchQuery,
          justCompletedCount,
          realtimeStatus,
          newReportId,
        }}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        initialNumToRender={8}
        windowSize={7}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
      />
    </View>
  );
}

/* -------------------------- Styles -------------------------- */
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
    zIndex: 10,
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
