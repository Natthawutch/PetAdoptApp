import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Linking,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { createClerkSupabaseClient } from "../../config/supabaseClient";

export default function VolunteerMap() {
  const { getToken } = useAuth();
  const router = useRouter();

  const [myPos, setMyPos] = useState(null);
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState("active"); // active | pending | all

  const title = useMemo(() => {
    if (filter === "pending") return "รอดำเนินการบนแผนที่";
    if (filter === "all") return "เคสทั้งหมดบนแผนที่";
    return "เคสที่ต้องช่วย";
  }, [filter]);

  // location (ครั้งเดียว)
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        setMyPos({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    })();
  }, []);

  // fetch reports (เรียกซ้ำได้)
  const fetchReports = useCallback(async () => {
    const token = await getToken({ template: "supabase" });
    const supabase = createClerkSupabaseClient(token);

    let q = supabase
      .from("reports")
      .select(
        "id, animal_type, location, detail, status, latitude, longitude, created_at",
      )
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    // ✅ status ตรงกับ schema คุณ
    if (filter === "pending") q = q.eq("status", "pending");
    if (filter === "active") q = q.in("status", ["pending", "in_progress"]);
    // all = ไม่กรอง

    const { data, error } = await q;
    if (error) {
      console.log("❌ map fetch reports error:", error);
      return;
    }
    setReports(data || []);
  }, [getToken, filter]);

  // โหลดครั้งแรก + เปลี่ยน filter
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // ✅ กลับมาหน้า map ทีไร โหลดใหม่ (หลังรับเคส)
  useFocusEffect(
    useCallback(() => {
      fetchReports();
    }, [fetchReports]),
  );

  const openDirections = (lat, lng) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    Linking.openURL(url);
  };

  const initialRegion = myPos
    ? { ...myPos, latitudeDelta: 0.05, longitudeDelta: 0.05 }
    : {
        latitude: 13.7563,
        longitude: 100.5018,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color="#0f172a" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{title}</Text>
          <Text style={styles.h2}>
            แสดงเคสจากตาราง reports (มีพิกัด latitude/longitude)
          </Text>
        </View>

        {/* ✅ รีเฟรช */}
        <TouchableOpacity onPress={fetchReports} style={styles.iconBtn}>
          <Ionicons name="refresh" size={20} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <Chip
          text="กำลังช่วย"
          active={filter === "active"}
          onPress={() => setFilter("active")}
        />
        <Chip
          text="รอดำเนินการ"
          active={filter === "pending"}
          onPress={() => setFilter("pending")}
        />
        <Chip
          text="ทั้งหมด"
          active={filter === "all"}
          onPress={() => setFilter("all")}
        />
      </View>

      <MapView
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
      >
        {reports.map((r) => (
          <Marker
            key={r.id}
            coordinate={{ latitude: r.latitude, longitude: r.longitude }}
            title={`${r.animal_type || "สัตว์"} • ${r.status}`}
            description={r.location || r.detail || ""}
            onCalloutPress={() => openDirections(r.latitude, r.longitude)}
          />
        ))}
      </MapView>
    </View>
  );
}

function Chip({ text, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null]}
      activeOpacity={0.9}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
        {text}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  h1: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  h2: { marginTop: 2, fontSize: 12, color: "#64748b" },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    paddingHorizontal: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#eef2ff", borderColor: "#c7d2fe" },
  chipText: { fontSize: 12, fontWeight: "800", color: "#334155" },
  chipTextActive: { color: "#4f46e5" },
  map: { flex: 1 },
});
