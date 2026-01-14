// app/(tabs)/notifications.jsx  (or wherever your Notifications screen is)
import { useAuth, useUser } from "@clerk/clerk-expo";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createClerkSupabaseClient } from "../../config/supabaseClient";

export default function Notifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Keep one Supabase client + one realtime channel per user
  const supabaseRef = useRef(null);
  const channelRef = useRef(null);

  /* =======================
     Ensure Supabase Client
     - Creates ONE client per user
     - IMPORTANT: set realtime auth token
  ======================= */
  const ensureSupabase = useCallback(async () => {
    if (!user?.id) return null;
    if (supabaseRef.current) return supabaseRef.current;

    const token = await getToken({ template: "supabase" });
    if (!token) throw new Error("Missing supabase token from Clerk");

    const supabase = createClerkSupabaseClient(token);

    // ✅ CRITICAL: Realtime must be authorized too
    await supabase.realtime.setAuth(token);

    supabaseRef.current = supabase;
    return supabase;
  }, [user?.id, getToken]);

  /* =======================
     Fetch Requests
  ======================= */
  const fetchRequests = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const supabase = await ensureSupabase();
      if (!supabase) return;

      const { data, error } = await supabase
        .from("adoption_requests")
        .select(
          `
          id,
          status,
          created_at,
          pets (
            name
          )
        `
        )
        .eq("owner_id", user.id) // owner_id is TEXT (Clerk user id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Fetch requests error:", error);
      } else {
        setRequests(data || []);
      }
    } catch (e) {
      console.error("❌ Fetch requests exception:", e);
    } finally {
      setLoading(false);
    }
  }, [user?.id, ensureSupabase]);

  /* =======================
     Initial Load / User Change
  ======================= */
  useEffect(() => {
    // Reset client + channel when user changes
    supabaseRef.current = null;

    if (channelRef.current) {
      channelRef.current = null;
    }

    if (user?.id) {
      fetchRequests();
    } else {
      setRequests([]);
      setLoading(false);
    }
  }, [user?.id, fetchRequests]);

  /* =======================
     Realtime Subscription
  ======================= */
  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    (async () => {
      try {
        const supabase = await ensureSupabase();
        if (!supabase || cancelled) return;

        // Remove existing channel if any
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }

        const channel = supabase
          .channel(`adoption-requests-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "adoption_requests",
              filter: `owner_id=eq.${user.id}`,
            },
            (payload) => {
              console.log("📡 Realtime payload:", payload);
              fetchRequests();
            }
          )
          .subscribe((status) => {
            console.log("📡 Realtime status:", status);
          });

        channelRef.current = channel;
      } catch (e) {
        console.error("❌ Realtime setup exception:", e);
      }
    })();

    return () => {
      cancelled = true;
      const supabase = supabaseRef.current;
      if (supabase && channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user?.id, ensureSupabase, fetchRequests]);

  /* =======================
     Render Item
  ======================= */
  const renderItem = ({ item }) => {
    const statusText = {
      pending: "รอดำเนินการ",
      approved: "อนุมัติแล้ว",
      rejected: "ปฏิเสธแล้ว",
    };

    const statusColor = {
      pending: "#ff9800",
      approved: "#4caf50",
      rejected: "#f44336",
    };

    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => router.push(`/requests/${item.id}`)}
        activeOpacity={0.85}
      >
        <View style={styles.row}>
          <LinearGradient colors={["#667eea", "#764ba2"]} style={styles.icon}>
            <Text style={{ fontSize: 20 }}>🐶</Text>
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              คำขอรับเลี้ยง {item.pets?.name || "สัตว์เลี้ยง"}
            </Text>

            <Text
              style={[
                styles.subtitle,
                { color: statusColor[item.status] || "#555" },
              ]}
            >
              สถานะ: {statusText[item.status] || item.status}
            </Text>

            <Text style={styles.time}>
              {new Date(item.created_at).toLocaleString("th-TH")}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={["#667eea", "#764ba2"]}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <Text style={styles.headerTitle}>การแจ้งเตือน</Text>
        <Text style={styles.headerSub}>แตะเพื่อจัดการคำขอ</Text>
      </LinearGradient>

      {/* List */}
      <FlatList
        data={requests}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshing={loading}
        onRefresh={fetchRequests}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {loading ? "กำลังโหลด..." : "ยังไม่มีคำขอรับเลี้ยง"}
          </Text>
        }
      />
    </View>
  );
}

/* =======================
   Styles
======================= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#fff" },
  headerSub: { color: "rgba(255,255,255,0.8)", marginTop: 4 },

  item: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  row: { flexDirection: "row", gap: 12 },

  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  title: { fontSize: 16, fontWeight: "700" },
  subtitle: { marginTop: 4, fontWeight: "600" },
  time: { fontSize: 12, color: "#999", marginTop: 6 },

  emptyText: {
    textAlign: "center",
    marginTop: 40,
    color: "#999",
  },
});
