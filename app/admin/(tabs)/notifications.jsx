import { StyleSheet, Text, View } from "react-native";

export default function AdminNoti() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔔 จัดการแจ้งเตือนระบบ</Text>
      <Text style={styles.text}>ส่ง Notification ไปยังผู้ใช้หรือทั้งหมด</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#FFF8F0", paddingTop: 50 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 10 },
  text: { fontSize: 16, color: "#555" },
});
