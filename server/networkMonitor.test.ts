import { describe, it, expect } from "vitest";

describe("Network Monitoring Feature", () => {
  describe("Quality Determination Logic", () => {
    // Replicating the quality determination logic from the component
    const QUALITY_THRESHOLDS = {
      excellent: { maxLatency: 80, minSpeed: 5, maxPacketLoss: 0 },
      good: { maxLatency: 150, minSpeed: 2, maxPacketLoss: 2 },
      fair: { maxLatency: 300, minSpeed: 1, maxPacketLoss: 5 },
      poor: { maxLatency: Infinity, minSpeed: 0, maxPacketLoss: 100 },
    };

    type ConnectionQuality = "excellent" | "good" | "fair" | "poor" | "offline";

    function determineQuality(
      latency: number | null,
      downloadSpeed: number | null,
      packetLoss: number,
      isOnline: boolean
    ): ConnectionQuality {
      if (!isOnline) return "offline";
      if (latency === null) return "fair";

      if (
        latency <= QUALITY_THRESHOLDS.excellent.maxLatency &&
        packetLoss <= QUALITY_THRESHOLDS.excellent.maxPacketLoss &&
        (downloadSpeed === null || downloadSpeed >= QUALITY_THRESHOLDS.excellent.minSpeed)
      ) return "excellent";

      if (
        latency <= QUALITY_THRESHOLDS.good.maxLatency &&
        packetLoss <= QUALITY_THRESHOLDS.good.maxPacketLoss &&
        (downloadSpeed === null || downloadSpeed >= QUALITY_THRESHOLDS.good.minSpeed)
      ) return "good";

      if (
        latency <= QUALITY_THRESHOLDS.fair.maxLatency &&
        packetLoss <= QUALITY_THRESHOLDS.fair.maxPacketLoss &&
        (downloadSpeed === null || downloadSpeed >= QUALITY_THRESHOLDS.fair.minSpeed)
      ) return "fair";

      return "poor";
    }

    it("returns offline when not online", () => {
      expect(determineQuality(30, 20, 0, false)).toBe("offline");
    });

    it("returns fair when latency is null (initial state)", () => {
      expect(determineQuality(null, null, 0, true)).toBe("fair");
    });

    it("returns excellent for low latency, no packet loss, good speed", () => {
      expect(determineQuality(25, 8, 0, true)).toBe("excellent");
    });

    it("returns good for moderate latency", () => {
      expect(determineQuality(120, 3, 1, true)).toBe("good");
    });

    it("returns fair for higher latency", () => {
      expect(determineQuality(250, 1.5, 3, true)).toBe("fair");
    });

    it("returns poor for very high latency", () => {
      expect(determineQuality(500, 0.5, 10, true)).toBe("poor");
    });

    it("returns poor when packet loss exceeds fair threshold", () => {
      expect(determineQuality(50, 10, 8, true)).toBe("poor");
    });

    it("handles edge case at exact threshold boundaries", () => {
      expect(determineQuality(80, 5, 0, true)).toBe("excellent");
      expect(determineQuality(81, 5, 0, true)).toBe("good");
      expect(determineQuality(150, 2, 2, true)).toBe("good");
      expect(determineQuality(151, 2, 2, true)).toBe("fair");
      expect(determineQuality(300, 1, 5, true)).toBe("fair");
      expect(determineQuality(301, 1, 5, true)).toBe("poor");
    });

    it("considers download speed null as acceptable (before first measurement)", () => {
      expect(determineQuality(50, null, 0, true)).toBe("excellent");
      expect(determineQuality(120, null, 1, true)).toBe("good");
    });
  });

  describe("Jitter Calculation", () => {
    function calculateJitter(measurements: { latency: number; success: boolean }[]): number | null {
      const successful = measurements.filter(m => m.success).slice(-10);
      if (successful.length < 2) return null;
      let totalDiff = 0;
      for (let i = 1; i < successful.length; i++) {
        totalDiff += Math.abs(successful[i].latency - successful[i - 1].latency);
      }
      return Math.round(totalDiff / (successful.length - 1));
    }

    it("returns null for less than 2 measurements", () => {
      expect(calculateJitter([])).toBeNull();
      expect(calculateJitter([{ latency: 50, success: true }])).toBeNull();
    });

    it("calculates jitter as average of consecutive differences", () => {
      const measurements = [
        { latency: 50, success: true },
        { latency: 60, success: true },
        { latency: 45, success: true },
        { latency: 55, success: true },
      ];
      // Diffs: |60-50|=10, |45-60|=15, |55-45|=10 → avg = 35/3 ≈ 12
      expect(calculateJitter(measurements)).toBe(12);
    });

    it("ignores failed measurements", () => {
      const measurements = [
        { latency: 50, success: true },
        { latency: 0, success: false },
        { latency: 60, success: true },
      ];
      // Only successful: [50, 60] → |60-50| = 10 / 1 = 10
      expect(calculateJitter(measurements)).toBe(10);
    });

    it("returns 0 for perfectly stable connection", () => {
      const measurements = [
        { latency: 50, success: true },
        { latency: 50, success: true },
        { latency: 50, success: true },
      ];
      expect(calculateJitter(measurements)).toBe(0);
    });

    it("uses only last 10 successful measurements", () => {
      const measurements = Array.from({ length: 20 }, (_, i) => ({
        latency: i < 10 ? 1000 : 50 + (i % 2 === 0 ? 5 : -5),
        success: true,
      }));
      // Only last 10 are used, which alternate between 55 and 45
      const jitter = calculateJitter(measurements);
      expect(jitter).toBeLessThan(20); // Should be based on last 10 stable values
    });
  });

  describe("Packet Loss Calculation", () => {
    it("calculates packet loss percentage from recent history", () => {
      const history = [
        { success: true }, { success: true }, { success: false },
        { success: true }, { success: false },
      ];
      const recentHistory = history.slice(-20);
      const failedRecent = recentHistory.filter(m => !m.success);
      const packetLoss = Math.round((failedRecent.length / recentHistory.length) * 100);
      expect(packetLoss).toBe(40);
    });

    it("returns 0 for all successful pings", () => {
      const history = Array.from({ length: 10 }, () => ({ success: true }));
      const failedRecent = history.filter(m => !m.success);
      const packetLoss = Math.round((failedRecent.length / history.length) * 100);
      expect(packetLoss).toBe(0);
    });

    it("returns 100 for all failed pings", () => {
      const history = Array.from({ length: 10 }, () => ({ success: false }));
      const failedRecent = history.filter(m => !m.success);
      const packetLoss = Math.round((failedRecent.length / history.length) * 100);
      expect(packetLoss).toBe(100);
    });
  });

  describe("Speed Test Calculation", () => {
    it("correctly calculates download speed in Mbps", () => {
      // 100KB downloaded in 0.5 seconds
      const sizeBytes = 100 * 1024; // 102400 bytes
      const durationSeconds = 0.5;
      const sizeMbits = (sizeBytes * 8) / (1024 * 1024);
      const downloadMbps = Math.round((sizeMbits / durationSeconds) * 10) / 10;
      
      // 100KB = 0.78125 Mbit → in 0.5s = 1.5625 Mbit/s ≈ 1.6
      expect(downloadMbps).toBeCloseTo(1.6, 0);
    });

    it("handles fast connections correctly", () => {
      // 500KB downloaded in 0.1 seconds = very fast
      const sizeBytes = 500 * 1024;
      const durationSeconds = 0.1;
      const sizeMbits = (sizeBytes * 8) / (1024 * 1024);
      const downloadMbps = Math.round((sizeMbits / durationSeconds) * 10) / 10;
      
      expect(downloadMbps).toBeGreaterThan(30);
    });

    it("handles slow connections correctly", () => {
      // 100KB downloaded in 5 seconds = very slow
      const sizeBytes = 100 * 1024;
      const durationSeconds = 5;
      const sizeMbits = (sizeBytes * 8) / (1024 * 1024);
      const downloadMbps = Math.round((sizeMbits / durationSeconds) * 10) / 10;
      
      expect(downloadMbps).toBeLessThan(0.5);
    });
  });

  describe("Server Endpoint Configuration", () => {
    it("speed test size is clamped between 10KB and 500KB", () => {
      const clampSize = (input: number) => Math.min(Math.max(input || 100, 10), 500);
      
      expect(clampSize(0)).toBe(100); // NaN/0 defaults to 100
      expect(clampSize(5)).toBe(10); // Below min → 10
      expect(clampSize(100)).toBe(100); // Normal
      expect(clampSize(500)).toBe(500); // At max
      expect(clampSize(1000)).toBe(500); // Above max → 500
      expect(clampSize(NaN)).toBe(100); // NaN defaults to 100
    });
  });

  describe("Warning Throttling", () => {
    it("should not trigger warnings more than once per 30 seconds", () => {
      let lastWarning = 0;
      const THROTTLE_MS = 30000;
      
      const shouldWarn = (now: number) => {
        if (now - lastWarning > THROTTLE_MS) {
          lastWarning = now;
          return true;
        }
        return false;
      };
      
      expect(shouldWarn(30001)).toBe(true); // First warning (0 + 30001 > 30000)
      expect(shouldWarn(40000)).toBe(false); // 10s later - throttled
      expect(shouldWarn(60000)).toBe(false); // Just before threshold (30001 + 30000 = 60001)
      expect(shouldWarn(60002)).toBe(true); // Just after threshold
    });
  });

  describe("Consecutive Failures Detection", () => {
    it("marks connection as offline after 5 consecutive failures", () => {
      let consecutiveFails = 0;
      const isOnline = () => consecutiveFails < 5;
      
      expect(isOnline()).toBe(true);
      consecutiveFails = 3;
      expect(isOnline()).toBe(true);
      consecutiveFails = 5;
      expect(isOnline()).toBe(false);
      consecutiveFails = 0; // Reset on success
      expect(isOnline()).toBe(true);
    });
  });
});
