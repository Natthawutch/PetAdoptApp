import { StyleSheet, Text, View } from "react-native";
import Colors from "../../constants/Colors";

export default function AboutPet({ pet }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>เกี่ยวกับ {pet.name}</Text>

      {pet.about && <Text style={styles.text}>{pet.about}</Text>}

      {/* ลักษณะนิสัย */}
      {pet.personality && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎭 ลักษณะนิสัย</Text>
          <Text style={styles.sectionText}>{pet.personality}</Text>
        </View>
      )}

      {/* ประวัติวัคซีน */}
      {pet.vaccine_history && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💉 ประวัติวัคซีน</Text>
          <Text style={styles.sectionText}>{pet.vaccine_history}</Text>
        </View>
      )}

      {/* สถานะทำหมัน */}
      {pet.is_neutered && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✂️ สถานะทำหมัน</Text>
          <Text style={styles.sectionText}>
            {pet.is_neutered === "Yes" ? "ทำหมันแล้ว" : "ยังไม่ได้ทำหมัน"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontFamily: "outfit-medium",
    fontSize: 20,
    color: Colors.BLACK,
    marginBottom: 12,
  },
  text: {
    fontFamily: "outfit",
    fontSize: 14,
    color: Colors.DARK_GRAY,
    lineHeight: 22,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontFamily: "outfit-medium",
    fontSize: 16,
    color: Colors.BLACK,
    marginBottom: 8,
  },
  sectionText: {
    fontFamily: "outfit",
    fontSize: 14,
    color: Colors.DARK_GRAY,
    lineHeight: 22,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
  },
  statusAvailable: {
    backgroundColor: "#ECFDF5",
    borderColor: "#10B981",
  },
  statusPending: {
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B",
  },
  statusAdopted: {
    backgroundColor: "#FEF2F2",
    borderColor: "#EF4444",
  },
  statusText: {
    fontFamily: "outfit-medium",
    fontSize: 14,
    fontWeight: "600",
  },
});
