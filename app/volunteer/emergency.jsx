// app/volunteer/emergency.jsx
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
    Linking,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function VolunteerEmergency() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // ✅ เปลี่ยนเป็นเบอร์จริงของทีม/คลินิก
  const CONTACTS = [
    { label: "ผู้ประสานงาน", phone: "0812345678" },
    { label: "สัตวแพทย์/คลินิก", phone: "0899999999" },
  ];

  const callPhone = (phone) => Linking.openURL(`tel:${phone}`);

  const sendSmsWithLocation = async (phone) => {
    try {
      setLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
      const body = `ฉุกเฉินช่วยสัตว์จรจัด! ตอนนี้ฉันอยู่ที่: ${mapUrl}`;

      // iOS/Android รองรับ sms:?body=
      Linking.openURL(`sms:${phone}?body=${encodeURIComponent(body)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.h1}>ติดต่อฉุกเฉิน</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.rowTitle}>
          <Ionicons name="alert-circle" size={18} color="#ef4444" />
          <Text style={styles.title}>กดครั้งเดียวเพื่อขอความช่วยเหลือ</Text>
        </View>
        <Text style={styles.desc}>
          ใช้สำหรับโทร/ส่งพิกัดให้ทีม เมื่อหน้างานเสี่ยงหรือเคสหนัก
        </Text>

        {CONTACTS.map((c) => (
          <View key={c.phone} style={styles.contact}>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactLabel}>{c.label}</Text>
              <Text style={styles.contactPhone}>{c.phone}</Text>
            </View>

            <TouchableOpacity
              style={[styles.btn, styles.btnCall]}
              onPress={() => callPhone(c.phone)}
              activeOpacity={0.9}
            >
              <Ionicons name="call" size={16} color="#fff" />
              <Text style={styles.btnText}>โทร</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnSms, loading && { opacity: 0.6 }]}
              onPress={() => sendSmsWithLocation(c.phone)}
              disabled={loading}
              activeOpacity={0.9}
            >
              <Ionicons name="navigate" size={16} color="#0f172a" />
              <Text style={[styles.btnText, { color: "#0f172a" }]}>
                ส่งพิกัด
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  h1: { fontSize: 18, fontWeight: "900", color: "#0f172a" },

  card: {
    margin: 16,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rowTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 15, fontWeight: "900", color: "#0f172a" },
  desc: { marginTop: 6, fontSize: 13, color: "#64748b" },

  contact: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  contactLabel: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  contactPhone: { marginTop: 2, fontSize: 12, color: "#64748b" },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  btnCall: { backgroundColor: "#ef4444" },
  btnSms: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  btnText: { fontSize: 12, fontWeight: "900", color: "#fff" },
});
