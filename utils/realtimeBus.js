// utils/realtimeBus.js
// ✅ Works in Expo / React Native (No Node "events")

class RealtimeBus {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event].add(callback);

    // return unsubscribe
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event].delete(callback);
  }

  emit(event, payload) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach((cb) => {
      try {
        cb(payload);
      } catch (e) {
        console.error("RealtimeBus listener error:", e);
      }
    });
  }

  clear(event) {
    if (!event) {
      this.listeners = {};
      return;
    }
    delete this.listeners[event];
  }
}

export const realtimeBus = new RealtimeBus();

export const RT_EVENTS = {
  ADOPTION_REQUESTS_CHANGED: "ADOPTION_REQUESTS_CHANGED",
  REPORTS_CHANGED: "REPORTS_CHANGED",
  NOTIFICATIONS_CHANGED: "NOTIFICATIONS_CHANGED",
};
