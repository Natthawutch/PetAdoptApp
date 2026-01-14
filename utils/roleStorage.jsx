import AsyncStorage from "@react-native-async-storage/async-storage";

const ROLE_KEY = "@user_role";

export const saveUserRole = async (role) => {
  await AsyncStorage.setItem(ROLE_KEY, role);
};

export const getUserRole = async () => {
  return await AsyncStorage.getItem(ROLE_KEY);
};

export const clearUserRole = async () => {
  await AsyncStorage.removeItem(ROLE_KEY);
};
