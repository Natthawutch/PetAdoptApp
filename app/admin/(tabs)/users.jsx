import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../../config/supabaseClient";

function Badge({ label, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0" },
    admin: { bg: "#fee2e2", text: "#b91c1c", border: "#fecaca" },
    volunteer: { bg: "#e0e7ff", text: "#4338ca", border: "#c7d2fe" },
    verified: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
    unverified: { bg: "#fef3c7", text: "#92400e", border: "#fde68a" },
  };
  const c = tones[tone] || tones.neutral;

  return (
    <View
      style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}
    >
      <Text style={[styles.badgeText, { color: c.text }]}>{label}</Text>
    </View>
  );
}

export default function UsersAdmin() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  const ready = isLoaded && !!user;

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const channelRef = useRef(null);
  const supabaseRef = useRef(null);

  const [updatingId, setUpdatingId] = useState(null);

  const DEBUG = false;

  // stable getToken
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const getSupabase = useCallback(async () => {
    if (!ready) return null;

    const token = await getTokenRef.current({ template: "supabase" });
    if (!token) return null;

    return createClerkSupabaseClient(token);
  }, [ready]);

  const loadUsers = useCallback(async () => {
    if (!ready) return;

    setLoading(true);
    try {
      const supabase = await getSupabase();
      if (!supabase) return;

      const { data, error } = await supabase
        .from("users")
        .select(
          `
          id,
          clerk_id,
          full_name,
          email,
          avatar_url,
          phone,
          role,
          verification_status,
          phone_verified,
          id_verified,
          created_at
        `,
        )
        .neq("role", "admin")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = data ?? [];
      setUsers(rows);

      if (DEBUG) {
        console.log(
          "UsersAdmin loadUsers sample:",
          rows.slice(0, 5).map((r) => ({
            id: r.id,
            email: r.email,
            full_name: r.full_name,
            role: r.role,
          })),
        );
      }
    } catch (e) {
      console.error("UsersAdmin loadUsers error:", e);
    } finally {
      setLoading(false);
    }
  }, [ready, getSupabase]);

  // first load
  useEffect(() => {
    if (!ready) return;
    loadUsers();
  }, [ready, loadUsers]);

  // refresh when screen focused
  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      loadUsers();
    }, [ready, loadUsers]),
  );

  // realtime subscribe
  useEffect(() => {
    if (!ready) return;

    let alive = true;

    const setupRealtime = async () => {
      try {
        const supabase = await getSupabase();
        if (!supabase) return;

        supabaseRef.current = supabase;

        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }

        const channel = supabase
          .channel("users-realtime-admin")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "users" },
            (payload) => {
              if (!alive) return;

              if (DEBUG) {
                console.log("users realtime:", payload.eventType, {
                  id: payload.new?.id ?? payload.old?.id,
                  email: payload.new?.email ?? payload.old?.email,
                  full_name: payload.new?.full_name ?? payload.old?.full_name,
                  role: payload.new?.role ?? payload.old?.role,
                });
              }

              loadUsers();
            },
          )
          .subscribe((status) => {
            if (DEBUG) console.log("users channel status:", status);
          });

        channelRef.current = channel;
      } catch (e) {
        console.error("UsersAdmin setupRealtime error:", e);
      }
    };

    setupRealtime();

    return () => {
      alive = false;
      const supabase = supabaseRef.current;
      const channel = channelRef.current;
      if (supabase && channel) supabase.removeChannel(channel);
      channelRef.current = null;
      supabaseRef.current = null;
    };
  }, [ready, getSupabase, loadUsers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  };

  const counts = useMemo(() => {
    const total = users.length;
    const unverified = users.filter(
      (u) => u.verification_status === "unverified",
    ).length;
    const volunteers = users.filter((u) => u.role === "volunteer").length;
    return { total, unverified, volunteers };
  }, [users]);

  const roleTone = (role) => {
    if (role === "admin") return "admin";
    if (role === "volunteer") return "volunteer";
    return "neutral";
  };

  const roleLabel = (role) => {
    if (role === "volunteer") return "อาสา";
    return "ผู้ใช้";
  };

  const nextRole = (role) => (role === "volunteer" ? "user" : "volunteer");

  const updateUserRole = useCallback(
    async (u) => {
      if (!u?.id) return;

      const newRole = nextRole(u.role);

      Alert.alert(
        "ยืนยันการเปลี่ยนสิทธิ์",
        `เปลี่ยน ${u.full_name || u.email || "ผู้ใช้"} เป็น "${roleLabel(newRole)}" ?`,
        [
          { text: "ยกเลิก", style: "cancel" },
          {
            text: "เปลี่ยน",
            style: "default",
            onPress: async () => {
              try {
                setUpdatingId(u.id);

                const supabase = await getSupabase();
                if (!supabase) return;

                const { error } = await supabase
                  .from("users")
                  .update({ role: newRole })
                  .eq("id", u.id);

                if (error) throw error;

                // optimistic update
                setUsers((prev) =>
                  prev.map((x) =>
                    x.id === u.id ? { ...x, role: newRole } : x,
                  ),
                );
              } catch (e) {
                console.error("updateUserRole error:", e);
                Alert.alert("เกิดข้อผิดพลาด", "เปลี่ยน Role ไม่สำเร็จ");
              } finally {
                setUpdatingId(null);
              }
            },
          },
        ],
      );
    },
    [getSupabase],
  );

  if (!isLoaded) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10, color: "#64748b" }}>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10, color: "#64748b" }}>Redirecting...</Text>
      </View>
    );
  }

  const renderUser = ({ item }) => {
    const isUnverified = item.verification_status === "unverified";
    const isUpdating = updatingId === item.id;

    return (
      <View style={styles.card}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={22} color="#94a3b8" />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <View style={styles.topRow}>
            <Text style={styles.name} numberOfLines={1}>
              {item.full_name || "ไม่มีชื่อ"}
            </Text>
          </View>

          <Text style={styles.email} numberOfLines={1}>
            {item.email || "-"}
          </Text>

          <View style={styles.badgeRow}>
            <Badge label={item.role || "user"} tone={roleTone(item.role)} />
            <Badge
              label={isUnverified ? "ยังไม่ยืนยันตัวตน" : "ยืนยันแล้ว"}
              tone={isUnverified ? "unverified" : "verified"}
            />
            {!!item.phone_verified && <Badge label="Phone ✓" tone="verified" />}
            {!!item.id_verified && <Badge label="ID ✓" tone="verified" />}
          </View>

          {DEBUG && (
            <Text style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>
              id: {item.id} | {item.email} | role: {item.role}
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.roleBtn, isUpdating && { opacity: 0.6 }]}
            disabled={isUpdating}
            onPress={() => updateUserRole(item)}
          >
            <Ionicons name="swap-horizontal" size={16} color="#0f172a" />
            <Text style={styles.roleBtnText}>
              {item.role === "volunteer"
                ? "เปลี่ยนเป็นผู้ใช้"
                : "เปลี่ยนเป็นอาสา"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>👥 จัดการผู้ใช้</Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryText}>ทั้งหมด</Text>
            <Text style={styles.summaryNum}>{counts.total}</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryText}>ยังไม่ยืนยัน</Text>
            <Text style={styles.summaryNum}>{counts.unverified}</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryText}>อาสา</Text>
            <Text style={styles.summaryNum}>{counts.volunteers}</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={renderUser}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>ไม่มีผู้ใช้</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc", paddingTop: 60 },
  centered: { justifyContent: "center", alignItems: "center", paddingTop: 0 },

  header: { paddingHorizontal: 16, paddingBottom: 12 },

  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 10,
  },

  summaryRow: { flexDirection: "row", gap: 10 },
  summaryPill: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryText: { fontSize: 12, color: "#64748b", fontWeight: "800" },
  summaryNum: { fontSize: 14, fontWeight: "900", color: "#0f172a" },

  listContent: { paddingHorizontal: 16, paddingBottom: 24 },

  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e5e7eb",
  },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center" },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  name: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
    flex: 1,
    paddingRight: 8,
  },

  email: { fontSize: 12, color: "#64748b", marginTop: 2 },

  badgeRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },

  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },

  badgeText: { fontSize: 11, fontWeight: "800" },

  actions: { justifyContent: "center", paddingLeft: 4 },

  roleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  roleBtnText: { fontSize: 12, fontWeight: "900", color: "#0f172a" },

  empty: {
    textAlign: "center",
    marginTop: 40,
    color: "#64748b",
    fontWeight: "700",
  },
});
