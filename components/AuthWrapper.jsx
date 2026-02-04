import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter, useSegments } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { createClerkSupabaseClient } from "../config/supabaseClient";
import { saveUserRole } from "../utils/roleStorage";

/**
 * ✅ ปรับ path ตามโปรเจกต์คุณ
 */
const ADMIN_PATH = "/admin/dashboard"; // ถ้าใช้ group (admin) -> "/(admin)/dashboard"
const VOLUNTEER_PATH = "/volunteer";
const USER_HOME_PATH = "/(tabs)/home";

/**
 * ✅ หน้า Public (ไม่ต้อง login ก็เข้าได้)
 */
const PUBLIC_ROUTES = new Set(["login", "register"]);

export default function AuthWrapper({ children }) {
  const { isSignedIn, getToken } = useAuth();
  const { user, isLoaded } = useUser();

  const router = useRouter();
  const segments = useSegments();

  const [loading, setLoading] = useState(true);

  // กัน effect ยิงซ้ำ
  const syncingRef = useRef(false);
  const lastSyncedUserIdRef = useRef(null);

  useEffect(() => {
    const run = async () => {
      if (!isLoaded) return;

      const firstSegment = segments?.[0]; // "login" | "register" | "(tabs)" | ...
      const isPublicRoute = firstSegment
        ? PUBLIC_ROUTES.has(firstSegment)
        : false;

      /* ---------------- SIGNED OUT ---------------- */
      if (!isSignedIn) {
        // reset guard เพื่อให้ login รอบต่อไป redirect ได้
        syncingRef.current = false;
        lastSyncedUserIdRef.current = null;

        setLoading(false);

        // ✅ อนุญาตให้เข้า login/register ได้ (ไม่เด้ง)
        if (!isPublicRoute) {
          router.replace("/login");
        }
        return;
      }

      /* ---------------- SIGNED IN BUT USER NOT READY ---------------- */
      if (!user?.id) {
        setLoading(false);
        return;
      }

      /* ---------------- DEDUPE ---------------- */
      if (syncingRef.current) return;

      // ถ้าซิงค์ user คนเดิมไปแล้ว ไม่ต้องทำซ้ำ
      if (lastSyncedUserIdRef.current === user.id) {
        setLoading(false);
        return;
      }

      syncingRef.current = true;

      try {
        const token = await getToken({ template: "supabase" });
        const supabase = createClerkSupabaseClient(token);

        // ---- Clerk data ----
        const clerkEmail = user.primaryEmailAddress?.emailAddress || "";

        const clerkFullName =
          user?.unsafeMetadata?.name ||
          user?.publicMetadata?.name ||
          [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
          user?.fullName ||
          user?.username ||
          (clerkEmail ? clerkEmail.split("@")[0] : "") ||
          "ผู้ใช้งาน";

        const clerkAvatarUrl =
          user?.imageUrl ||
          user?.profileImageUrl ||
          user?.unsafeMetadata?.avatar_url ||
          user?.publicMetadata?.avatar_url ||
          "";

        // 1) อ่าน row ก่อน
        const { data: existing, error: readErr } = await supabase
          .from("users")
          .select("clerk_id, role")
          .eq("clerk_id", user.id)
          .maybeSingle();

        if (readErr) console.log("❌ read users error:", readErr);

        // 2) ถ้าไม่มีก็ insert (อย่าส่ง role)
        if (!existing) {
          const { error: insertErr } = await supabase.from("users").insert({
            clerk_id: user.id,
            email: clerkEmail,
            full_name: clerkFullName,
            avatar_url: clerkAvatarUrl,
          });

          if (insertErr) console.log("❌ insert users error:", insertErr);
        } else {
          // 3) ถ้ามีก็ update เฉพาะโปรไฟล์ (อย่าแตะ role)
          const { error: updateErr } = await supabase
            .from("users")
            .update({
              email: clerkEmail,
              full_name: clerkFullName,
              avatar_url: clerkAvatarUrl,
            })
            .eq("clerk_id", user.id);

          if (updateErr) console.log("❌ update users error:", updateErr);
        }

        // 4) ดึง role เป็น source of truth
        const { data: roleRow, error: roleErr } = await supabase
          .from("users")
          .select("role")
          .eq("clerk_id", user.id)
          .maybeSingle();

        if (roleErr) {
          console.log("❌ role fetch error:", roleErr);
          router.replace("/login");
          return;
        }

        const role = roleRow?.role;

        if (!role) {
          console.log("❌ role is missing in DB for user:", user.id);
          router.replace("/login");
          return;
        }

        await saveUserRole(role);

        // 5) Redirect ตาม role
        const currentGroup = segments?.[0];

        if (role === "admin") {
          if (currentGroup !== "admin" && currentGroup !== "(admin)") {
            router.replace(ADMIN_PATH);
          }
        } else if (role === "volunteer") {
          if (currentGroup !== "volunteer") {
            router.replace(VOLUNTEER_PATH);
          }
        } else {
          if (currentGroup !== "(tabs)") {
            router.replace(USER_HOME_PATH);
          }
        }

        lastSyncedUserIdRef.current = user.id;
      } catch (err) {
        console.error("❌ AuthWrapper error:", err);
      } finally {
        syncingRef.current = false;
        setLoading(false);
      }
    };

    run();
  }, [isLoaded, isSignedIn, user?.id, segments?.[0]]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <>{children}</>;
}
