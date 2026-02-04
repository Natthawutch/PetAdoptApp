/* ============================
   components/PetDetails/PetSubInfo.jsx
============================ */
import { StyleSheet, View } from "react-native";
import PetSubInfoCard from "./PetSubInfoCard";

export default function PetSubInfo({ pet }) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <PetSubInfoCard
          icon={require("./../../assets/images/calendar.png")}
          title={"Age"}
          value={pet?.age ? `${pet.age} years` : "Unknown"}
        />
        <PetSubInfoCard
          icon={require("./../../assets/images/bone.png")}
          title={"Breed"}
          value={pet?.breed || "Mixed"}
        />
      </View>

      <View style={styles.row}>
        <PetSubInfoCard
          icon={require("./../../assets/images/sex.png")}
          title={"Sex"}
          value={pet?.sex || "Unknown"}
        />

        {/* ✅ Care Type (ใช้ emojiIcon ไม่ต้องมีรูปใหม่) */}
        <PetSubInfoCard
          emojiIcon={pet?.care_type === "ระบบเปิด" ? "🌳" : "🏠"}
          title={"Care Type"}
          value={pet?.care_type ? pet.care_type : "ระบบปิด"}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 5,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    margin: 5,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
});
