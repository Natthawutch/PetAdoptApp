import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createClerkSupabaseClient } from "../../config/supabaseClient";
import { useInboxStore } from "../../store/inboxStore";

export default function Header() {
  const { user: clerkUser, isLoaded } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();

  const inboxCount = useInboxStore((s) => s.inboxCount);

  const [loading, setLoading] = useState(true);
  const [locationText, setLocationText] = useState("กำลังตรวจสอบตำแหน่ง...");

  // ✅ ชื่อจาก Supabase
  const [dbFullName, setDbFullName] = useState(null);

  const avatar = useMemo(
    () => clerkUser?.imageUrl || "https://www.gravatar.com/avatar/?d=mp",
    [clerkUser?.imageUrl],
  );

  // ✅ ดึงชื่อจากตาราง users ด้วย clerk_id (มี retry กัน row ยังไม่ทันถูกสร้าง)
  const loadProfileName = useCallback(async () => {
    try {
      if (!clerkUser?.id) return;

      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token);

      // retry 3 รอบ เผื่อ AuthWrapper upsert ยังไม่เสร็จ
      for (let i = 0; i < 3; i++) {
        const { data, error } = await supabase
          .from("users")
          .select("full_name")
          .eq("clerk_id", clerkUser.id)
          .maybeSingle();

        if (error) throw error;

        if (data?.full_name) {
          setDbFullName(data.full_name);
          return;
        }

        await new Promise((r) => setTimeout(r, 350));
      }

      setDbFullName(null);
    } catch (e) {
      console.error("Header loadProfileName error:", e);
      setDbFullName(null);
    }
  }, [clerkUser?.id, getToken]);

  // ✅ set loading เมื่อ Clerk โหลดเสร็จ
  useEffect(() => {
    if (!isLoaded) return;
    setLoading(false);
  }, [isLoaded]);

  // ✅ สำคัญ: refetch ทุกครั้งที่เข้า/กลับมาหน้านี้ + เมื่อ user.id พร้อม
  useFocusEffect(
    useCallback(() => {
      if (!isLoaded || !clerkUser?.id) return;
      loadProfileName();
    }, [isLoaded, clerkUser?.id, loadProfileName]),
  );

  // (เหมือนเดิม) location
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setLocationText("ไม่สามารถระบุตำแหน่งได้");
          return;
        }

        const location = await Location.getCurrentPositionAsync({});
        const reverseGeocode = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        if (reverseGeocode.length > 0) {
          const { city, region, country } = reverseGeocode[0];
          setLocationText(`${city || region || "ไม่ทราบ"}, ${country || ""}`);
        }
      } catch {
        setLocationText("ไม่สามารถระบุตำแหน่งได้");
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#fff" />
      </View>
    );
  }

  // ✅ ให้ DB เป็นตัวจริง, ถ้า DB ยังไม่มา ให้ใช้ unsafeMetadata.name ก่อน
  const fullName =
    dbFullName ||
    clerkUser?.unsafeMetadata?.name ||
    clerkUser?.fullName ||
    "ผู้ใช้งาน";

  return (
    <View style={styles.container}>
      {/* LEFT */}
      <TouchableOpacity
        style={styles.leftSection}
        onPress={() => router.push("/(tabs)/profile")}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <Image source={{ uri: avatar }} style={styles.avatar} />
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {fullName}
          </Text>

          <View style={styles.locationRow}>
            <Ionicons
              name="location-sharp"
              size={12}
              color="rgba(255,255,255,0.8)"
            />
            <Text style={styles.locationText} numberOfLines={1}>
              {locationText}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* RIGHT */}
      <View style={styles.rightIcons}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.push("/Favorite/favorite")}
        >
          <View style={styles.iconWrapper}>
            <Ionicons name="heart" size={22} color="#fff" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.push("/Inbox/inbox")}
        >
          <View style={styles.iconWrapper}>
            <MaterialCommunityIcons
              name="message-text"
              size={22}
              color="#fff"
            />
            {inboxCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {inboxCount > 99 ? "99+" : inboxCount}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    backgroundColor: "#8B5CF6",
    paddingTop: 50,
    paddingHorizontal: 18,
    paddingBottom: 20,
    alignItems: "center",
    justifyContent: "center",
    height: 100,
  },
  container: {
    backgroundColor: "#8B5CF6",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 18,
    paddingBottom: 20,
    elevation: 4,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  avatarContainer: { marginRight: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "#e5e7eb",
  },
  userInfo: { flex: 1 },
  userName: { color: "#fff", fontSize: 18, fontWeight: "700" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  rightIcons: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconButton: { padding: 4 },
  iconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#EF4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
});
