import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Colors from "../constants/Colors";

export default function AdoptionRequestCard({ request, onApprove, onReject }) {
  const { pets, status } = request;

  const statusColor =
    status === "approved"
      ? Colors.GREEN
      : status === "rejected"
      ? Colors.RED
      : Colors.ORANGE;

  return (
    <View style={styles.card}>
      <Image source={{ uri: pets?.image_url }} style={styles.image} />

      <View style={{ flex: 1 }}>
        <Text style={styles.petName}>{pets?.name}</Text>
        <Text style={[styles.status, { color: statusColor }]}>
          สถานะ: {status}
        </Text>

        {status === "pending" && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.approve]}
              onPress={onApprove}
            >
              <Text style={styles.btnText}>รับเลี้ยง</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.reject]}
              onPress={onReject}
            >
              <Text style={styles.btnText}>ปฏิเสธ</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  image: {
    width: 70,
    height: 70,
    borderRadius: 12,
    marginRight: 12,
  },
  petName: {
    fontSize: 18,
    fontWeight: "600",
  },
  status: {
    marginTop: 4,
    fontSize: 14,
  },
  actions: {
    flexDirection: "row",
    marginTop: 10,
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginRight: 8,
  },
  approve: {
    backgroundColor: Colors.GREEN,
  },
  reject: {
    backgroundColor: Colors.RED,
  },
  btnText: {
    color: "#fff",
    fontWeight: "600",
  },
});
