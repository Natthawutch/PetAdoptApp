import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { supabase } from "../../config/supabaseClient";
import Colors from "../../constants/Colors";
import Category from "./category";
import Petlistitem from "./petlistitem";

export default function Petlistbycategory() {
  const [petList, setPetList] = useState([]);
  const [loader, setLoader] = useState(false);
  const [category, setCategory] = useState("Dogs");

  useEffect(() => {
    GetPetList(category);
  }, [category]);

  const GetPetList = async (selectedCategory) => {
    setLoader(true);
    try {
      const { data, error } = await supabase
        .from("pets")
        .select("*")
        .eq("category", selectedCategory)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching pets:", error);
      } else {
        setPetList(data || []);
      }
    } catch (err) {
      console.error(err);
    }
    setLoader(false);
  };

  const onRefresh = () => {
    GetPetList(category);
  };

  return (
    <View style={{ flex: 1 }}>
      <Category category={(value) => setCategory(value)} />
      {loader && petList.length === 0 ? (
        <ActivityIndicator
          size="large"
          color={Colors.PURPLE}
          style={{ marginTop: 50 }}
        />
      ) : (
        <FlatList
          data={petList}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <Petlistitem pet={item} />}
          refreshControl={
            <RefreshControl refreshing={loader} onRefresh={onRefresh} />
          }
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}
    </View>
  );
}
