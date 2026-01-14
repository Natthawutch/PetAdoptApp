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
          style={styles.card}
        />
        <PetSubInfoCard
          icon={require("./../../assets/images/bone.png")}
          title={"Breed"}
          value={pet?.breed || "Mixed"}
          style={styles.card}
        />
      </View>
      <View style={styles.row}>
        <PetSubInfoCard
          icon={require("./../../assets/images/sex.png")}
          title={"Sex"}
          value={pet?.sex || "Unknown"}
          style={styles.card}
        />
        <PetSubInfoCard
          icon={require("./../../assets/images/weight.png")}
          title={"Weight"}
          value={pet?.weight ? `${pet.weight} kg` : "Not specified"}
          style={styles.card}
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
    gap: 8, // สำหรับ React Native 0.71+
  },
  card: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
});
