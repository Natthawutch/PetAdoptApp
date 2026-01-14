import { Link } from "expo-router";
import { Image, Text, View } from "react-native";
import { Colors } from "../../constants/Colors";

export default function UserItem({ userInfo }) {
  return (
    <Link href={"/chat?id=" + userInfo.docId}>
      <View
        style={{
          marginVertical: 7,
          display: "flex",
          flexDirection: "row",
          gap: 10,
          alignItems: "center",
        }}
      >
        <Image
          source={{ uri: userInfo?.imageUrl }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 99,
          }}
        />
        <Text
          style={{
            fontFamily: "outfit",
            fontSize: 20,
          }}
        >
          {userInfo?.name}
        </Text>
      </View>
      <View
        style={{
          borderWidth: 0.2,
          marginVertical: 7,
          borderColor: Colors.GRAY,
        }}
      ></View>
    </Link>
  );
}
