import { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../config/supabaseClient"; // เชื่อมต่อ Supabase
import Colors from "../../constants/Colors";

export default function Category({ category }) {
  const [categoryList, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("Dogs");

  useEffect(() => {
    GetCategories();
  }, []);

  const GetCategories = async () => {
    const { data, error } = await supabase.from("category").select("*");

    if (error) {
      console.error("Error fetching categories:", error.message);
      return;
    }

    if (data) {
      const desiredOrder = ["Dogs", "Cats", "Birds", "Rabbits"];

      // เรียงลำดับหมวดหมู่ตาม desiredOrder
      const orderedCategories = desiredOrder
        .map((name) => data.find((item) => item.name === name))
        .filter(Boolean);

      // หมวดหมู่ที่ไม่ได้อยู่ใน desiredOrder ต่อท้าย
      const otherCategories = data.filter(
        (item) => !desiredOrder.includes(item.name)
      );

      const sortedData = [...orderedCategories, ...otherCategories];

      setCategories(sortedData);
    }
  };

  return (
    <View style={{ marginTop: 20 }}>
      <Text style={{ fontFamily: "outfit-medium", fontSize: 20 }}>
        Category
      </Text>
      <FlatList
        data={categoryList}
        keyExtractor={(item, index) => index.toString()}
        horizontal={true} // เลื่อนแนวนอน
        showsHorizontalScrollIndicator={false} // ซ่อน scrollbar
        renderItem={({ item }) => (
          <View style={{ alignItems: "center" }}>
            <TouchableOpacity
              onPress={() => {
                setSelectedCategory(item?.name);
                category(item?.name);
              }}
              style={[
                styles.container,
                selectedCategory === item?.name &&
                  styles.selectedCategoryContainer,
              ]}
            >
              <Image
                source={{ uri: item?.imageurl }}
                style={{ width: 40, height: 40 }}
              />
            </TouchableOpacity>
            <Text
              style={{
                fontFamily: "outfit",
                textAlign: "center",
                marginTop: 5,
              }}
            >
              {item?.name}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.LIGHT_PURPLE,
    padding: 15,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 15,
    borderColor: Colors.LIGHT_PURPLE,
    margin: 5,
  },
  selectedCategoryContainer: {
    backgroundColor: Colors.PURPLE,
    borderColor: Colors.PURPLE,
  },
});
