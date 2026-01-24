import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import "react-native-url-polyfill/auto";

const supabaseUrl = Constants.expoConfig.extra.supabaseUrl;
const supabaseAnonKey = Constants.expoConfig.extra.supabaseAnonKey;

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
   CLERK QUERY CLIENT
   (สร้างใหม่ได้ ปลอดภัย)
========================= */
let latestClerkToken = null;

export const createClerkSupabaseClient = (clerkToken) => {
  if (!clerkToken) throw new Error("Missing Clerk token");
  latestClerkToken = clerkToken;

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
      fetch: async (url, options = {}) => {
        if (!latestClerkToken) throw new Error("Missing Clerk token");
        const headers = new Headers(options.headers || {});
        headers.set("Authorization", `Bearer ${latestClerkToken}`);
        return fetch(url, { ...options, headers });
      },
    },
  });
};

/* =========================
   REALTIME CLIENT (SINGLETON)
   ✅ คืนค่าเป็น SupabaseClient
========================= */
let realtimeClient = null;

export const getRealtimeClient = (clerkToken) => {
  if (!clerkToken) throw new Error("Missing Clerk token");
  latestClerkToken = clerkToken;

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
  }

  // ✅ update auth ให้ socket เดิม
  realtimeClient.realtime.setAuth(clerkToken);

  return realtimeClient;
};

export const resetRealtimeClient = async () => {
  try {
    await realtimeClient?.realtime?.disconnect();
  } catch {}
  realtimeClient = null;
};

export default supabase;
