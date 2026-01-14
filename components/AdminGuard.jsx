import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { getUserRole } from "../utils/roleStorage";
export default function AdminGuard({ children }) {
  const [role, setRole] = useState(null);

  useEffect(() => {
    getUserRole().then(setRole);
  }, []);

  if (!role) return null;

  if (role !== "admin") {
    return <Redirect href="/(tabs)/home" />;
  }

  return children;
}
