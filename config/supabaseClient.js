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
   CLERK AUTH CLIENT (PER REQUEST)
========================= */
export const createClerkSupabaseClient = (clerkToken) => {
  if (!clerkToken) throw new Error("Missing Clerk token");

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
   REALTIME CLIENT (SINGLETON)
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
        params: {
          eventsPerSecond: 10,
        },
      },
      global: {
        headers: {
          Authorization: `Bearer ${clerkToken}`,
          apikey: supabaseAnonKey,
        },
      },
    });

    realtimeToken = clerkToken;
    console.log("✅ Realtime client created");
    return realtimeClient;
  }

  if (clerkToken !== realtimeToken) {
    realtimeToken = clerkToken;

    try {
      console.log("🔄 Realtime token changed, reconnecting...");
      realtimeClient.realtime.setAuth(clerkToken);
      realtimeClient.realtime.disconnect();

      setTimeout(() => {
        realtimeClient?.realtime.connect();
        console.log("✅ Realtime reconnected");
      }, 100);
    } catch (error) {
      console.error("❌ Realtime reconnect error:", error);
    }
  }

  return realtimeClient;
};

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
