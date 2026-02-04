import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import "react-native-url-polyfill/auto";

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase env: supabaseUrl / supabaseAnonKey");
}

/* =========================
   PUBLIC (ANON) CLIENT
========================= */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/* =========================
   CLERK TOKEN STORE (GLOBAL)
========================= */
let clerkTokenStore = null;

export const setClerkToken = (token) => {
  clerkTokenStore = token ?? null;
};

export const getClerkToken = () => clerkTokenStore;

export const clearClerkToken = () => {
  clerkTokenStore = null;
};

/* =========================
   CLERK AUTH CLIENT (PER REQUEST)
   - ใช้สำหรับ query/insert/update ผ่าน REST
========================= */
export const createClerkSupabaseClient = (clerkToken) => {
  if (!clerkToken) throw new Error("Missing Clerk token");

  // เก็บ token ล่าสุดไว้เผื่อจุดอื่นใช้
  setClerkToken(clerkToken);

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
    global: {
      headers: {
        Authorization: `Bearer ${clerkToken}`,
        apikey: supabaseAnonKey,
      },
    },
  });
};

/* =========================
   REALTIME CLIENT (SINGLETON) - FIXED
   ✅ setAuth ทันทีตั้งแต่สร้าง client
   ✅ token เปลี่ยน -> setAuth อย่างเดียว (ไม่ disconnect/connect เอง)
========================= */
let realtimeClient = null;
let realtimeToken = null;

export const getRealtimeClient = (clerkToken) => {
  if (!clerkToken) throw new Error("Missing Clerk token");

  if (!realtimeClient) {
    realtimeClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    });

    // ✅ สำคัญมาก: ตั้ง auth ให้ realtime socket ตั้งแต่ครั้งแรก
    realtimeClient.realtime.setAuth(clerkToken);
    realtimeToken = clerkToken;

    console.log("✅ Realtime client created + authed");
    return realtimeClient;
  }

  // ✅ token เปลี่ยน -> setAuth อย่างเดียวพอ (Supabase จะจัดการ reconnect ให้)
  if (clerkToken !== realtimeToken) {
    realtimeToken = clerkToken;
    console.log("🔄 Realtime token changed, setAuth...");
    realtimeClient.realtime.setAuth(clerkToken);
  }

  return realtimeClient;
};

/* =========================
   RESET REALTIME CLIENT
========================= */
export const resetRealtimeClient = async () => {
  try {
    if (realtimeClient?.removeAllChannels) {
      await realtimeClient.removeAllChannels();
    }

    if (realtimeClient?.realtime) {
      await realtimeClient.realtime.disconnect();
      console.log("✅ Realtime client disconnected");
    }
  } catch (error) {
    console.error("❌ Disconnect error:", error);
  } finally {
    realtimeClient = null;
    realtimeToken = null;
  }
};

export default supabase;
