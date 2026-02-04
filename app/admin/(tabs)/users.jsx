import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
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
    banned: { bg: "#020617", text: "#f8fafc", border: "#0f172a" },
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

  // Ban modal state (cross-platform)
  const [banModalVisible, setBanModalVisible] = useState(false);
  const [banTarget, setBanTarget] = useState(null);
  const [banReason, setBanReason] = useState("");

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
          status,
          banned_at,
          banned_reason,
          deleted_at,
          created_at
        `,
        )
        .neq("role", "admin")
        .is("deleted_at", null)
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
            status: r.status,
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
                  status: payload.new?.status ?? payload.old?.status,
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
    const banned = users.filter((u) => u.status === "banned").length;
    return { total, unverified, volunteers, banned };
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

  const openBanModal = (u) => {
    setBanTarget(u);
    setBanReason(u?.banned_reason || "");
    setBanModalVisible(true);
  };

  const closeBanModal = () => {
    setBanModalVisible(false);
    setBanTarget(null);
    setBanReason("");
  };

  const banUser = async (u, reason) => {
    try {
      setUpdatingId(u.id);
      const supabase = await getSupabase();
      if (!supabase) return;

      const payload = {
        status: "banned",
        banned_at: new Date().toISOString(),
        banned_reason: (reason || "").trim() || "ไม่ระบุ",
      };

      const { error } = await supabase
        .from("users")
        .update(payload)
        .eq("id", u.id);
      if (error) throw error;

      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, ...payload } : x)),
      );
    } catch (e) {
      console.error("banUser error:", e);
      Alert.alert("เกิดข้อผิดพลาด", "แบนไม่สำเร็จ");
    } finally {
      setUpdatingId(null);
    }
  };

  const unbanUser = async (u) => {
    try {
      setUpdatingId(u.id);
      const supabase = await getSupabase();
      if (!supabase) return;

      const payload = {
        status: "active",
        banned_at: null,
        banned_reason: null,
      };

      const { error } = await supabase
        .from("users")
        .update(payload)
        .eq("id", u.id);
      if (error) throw error;

      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, ...payload } : x)),
      );
    } catch (e) {
      console.error("unbanUser error:", e);
      Alert.alert("เกิดข้อผิดพลาด", "ปลดแบนไม่สำเร็จ");
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleBan = (u) => {
    if (!u?.id) return;
    const isBanned = u.status === "banned";

    if (isBanned) {
      Alert.alert(
        "ปลดแบนผู้ใช้",
        `ปลดแบน ${u.full_name || u.email || "ผู้ใช้"} ?`,
        [
          { text: "ยกเลิก", style: "cancel" },
          {
            text: "ปลดแบน",
            style: "default",
            onPress: () => unbanUser(u),
          },
        ],
      );
      return;
    }

    // Ban: ask reason
    // iOS has Alert.prompt, but Android doesn't. We'll use our modal for all platforms.
    openBanModal(u);
  };

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
    const isBanned = item.status === "banned";

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
            {isBanned && <Badge label="🚫 ถูกแบน" tone="banned" />}
          </View>

          {!!isBanned && !!item.banned_reason && (
            <Text style={styles.banReason} numberOfLines={2}>
              เหตุผล: {item.banned_reason}
            </Text>
          )}

          {DEBUG && (
            <Text style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>
              id: {item.id} | {item.email} | role: {item.role} | status:{" "}
              {item.status}
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

          <TouchableOpacity
            style={[
              styles.banBtn,
              isUpdating && { opacity: 0.6 },
              isBanned ? styles.unbanBtn : styles.banBtnDanger,
            ]}
            disabled={isUpdating}
            onPress={() => toggleBan(item)}
          >
            <Ionicons
              name={isBanned ? "lock-open" : "lock-closed"}
              size={16}
              color={isBanned ? "#166534" : "#991b1b"}
            />
            <Text
              style={[
                styles.banBtnText,
                { color: isBanned ? "#166534" : "#991b1b" },
              ]}
            >
              {isBanned ? "ปลดแบน" : "แบน"}
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
          <View style={styles.summaryPill}>
            <Text style={styles.summaryText}>ถูกแบน</Text>
            <Text style={styles.summaryNum}>{counts.banned}</Text>
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

      {/* Ban reason modal (works on iOS/Android) */}
      <Modal
        visible={banModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeBanModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeBanModal} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>แบนผู้ใช้</Text>
          <Text style={styles.modalSub}>
            ผู้ใช้: {banTarget?.full_name || banTarget?.email || "-"}
          </Text>

          <Text style={styles.modalLabel}>
            เหตุผล (บังคับใส่ได้/ไม่ใส่ก็ได้)
          </Text>
          <TextInput
            value={banReason}
            onChangeText={setBanReason}
            placeholder="เช่น สแปม / ข้อมูลไม่ถูกต้อง / พฤติกรรมไม่เหมาะสม"
            placeholderTextColor="#94a3b8"
            style={styles.modalInput}
            multiline
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnGhost]}
              onPress={closeBanModal}
            >
              <Text style={styles.modalBtnGhostText}>ยกเลิก</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnDanger]}
              onPress={async () => {
                const u = banTarget;
                const reason = banReason;
                closeBanModal();
                if (u) await banUser(u, reason);
              }}
            >
              <Text style={styles.modalBtnDangerText}>แบน</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  summaryRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  summaryPill: {
    flexGrow: 1,
    minWidth: "22%",
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

  banReason: {
    marginTop: 8,
    fontSize: 12,
    color: "#475569",
    fontWeight: "700",
  },

  actions: { justifyContent: "center", paddingLeft: 4, gap: 8 },

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

  banBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  banBtnText: { fontSize: 12, fontWeight: "900" },

  banBtnDanger: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
  },
  unbanBtn: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
  },

  empty: {
    textAlign: "center",
    marginTop: 40,
    color: "#64748b",
    fontWeight: "700",
  },

  // Modal
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(2, 6, 23, 0.45)",
  },
  modalCard: {
    marginTop: 140,
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },
  modalSub: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748b",
    fontWeight: "700",
  },
  modalLabel: {
    marginTop: 12,
    fontSize: 12,
    color: "#0f172a",
    fontWeight: "900",
  },
  modalInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    minHeight: 80,
    fontSize: 13,
    color: "#0f172a",
    fontWeight: "700",
    backgroundColor: "#f8fafc",
  },
  modalActions: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalBtnGhost: {
    backgroundColor: "#fff",
    borderColor: "#e2e8f0",
  },
  modalBtnGhostText: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 12,
  },
  modalBtnDanger: {
    backgroundColor: "#ef4444",
    borderColor: "#ef4444",
  },
  modalBtnDangerText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },
});
