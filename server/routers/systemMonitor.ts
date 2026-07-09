import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as os from "os";
import { execSync } from "child_process";

// Hilfsfunktion: Shell-Befehl sicher ausführen
function sh(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 3000, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

// CPU-Auslastung über 100ms Messung
function getCpuUsage(): number {
  const cpus = os.cpus();
  const start = cpus.map((c) => ({ idle: c.times.idle, total: Object.values(c.times).reduce((a, b) => a + b, 0) }));
  // Synchrone Wartezeit simulieren mit Datum
  const t = Date.now();
  while (Date.now() - t < 100) { /* busy wait */ }
  const cpus2 = os.cpus();
  const end = cpus2.map((c) => ({ idle: c.times.idle, total: Object.values(c.times).reduce((a, b) => a + b, 0) }));
  const diffs = start.map((s, i) => ({
    idle: end[i].idle - s.idle,
    total: end[i].total - s.total,
  }));
  const avgIdle = diffs.reduce((a, b) => a + b.idle, 0) / diffs.length;
  const avgTotal = diffs.reduce((a, b) => a + b.total, 0) / diffs.length;
  return Math.round((1 - avgIdle / avgTotal) * 1000) / 10;
}

export const systemMonitorRouter = router({
  getStats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "superadmin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    // RAM
    const totalRam = Math.round(os.totalmem() / 1024 / 1024);
    const freeRam = Math.round(os.freemem() / 1024 / 1024);
    const usedRam = totalRam - freeRam;
    const ramPercent = Math.round((usedRam / totalRam) * 100);

    // CPU
    const cpuPercent = getCpuUsage();
    const cpuModel = os.cpus()[0]?.model?.trim() ?? "Unbekannt";
    const cpuCores = os.cpus().length;

    // Load Average
    const loadAvg = os.loadavg();

    // Uptime
    const uptimeSec = os.uptime();
    const uptimeDays = Math.floor(uptimeSec / 86400);
    const uptimeHours = Math.floor((uptimeSec % 86400) / 3600);
    const uptimeMin = Math.floor((uptimeSec % 3600) / 60);
    const uptimeStr = uptimeDays > 0
      ? `${uptimeDays}d ${uptimeHours}h ${uptimeMin}m`
      : `${uptimeHours}h ${uptimeMin}m`;

    // Disk
    const diskRaw = sh("df -BM / | awk 'NR==2{print $2,$3,$4,$5}'");
    const [diskTotal, diskUsed, diskFree, diskPercent] = diskRaw.split(" ");

    // Node.js Version
    const nodeVersion = process.version;

    // OS Info
    const osRelease = sh("lsb_release -d 2>/dev/null | cut -f2") || os.version();
    const kernelVersion = sh("uname -r");

    // MySQL Status
    const mysqlStatus = sh("systemctl is-active mysql 2>/dev/null") || sh("systemctl is-active mariadb 2>/dev/null");
    const mysqlVersion = sh("mysql --version 2>/dev/null | awk '{print $5}' | tr -d ','");

    // PM2 Prozesse
    let pm2Processes: Array<{ name: string; status: string; memMb: number; cpu: number; restarts: number; uptime: string }> = [];
    try {
      const pm2Raw = sh("pm2 jlist 2>/dev/null");
      if (pm2Raw) {
        const pm2Data = JSON.parse(pm2Raw) as Array<{
          name: string;
          pm2_env: { status: string; restart_time: number; pm_uptime: number };
          monit: { memory: number; cpu: number };
        }>;
        pm2Processes = pm2Data.map((p) => {
          const uptimeSecs = Math.floor((Date.now() - p.pm2_env.pm_uptime) / 1000);
          const h = Math.floor(uptimeSecs / 3600);
          const m = Math.floor((uptimeSecs % 3600) / 60);
          return {
            name: p.name,
            status: p.pm2_env.status,
            memMb: Math.round(p.monit.memory / 1024 / 1024),
            cpu: p.monit.cpu,
            restarts: p.pm2_env.restart_time,
            uptime: `${h}h ${m}m`,
          };
        });
      }
    } catch { /* ignore */ }

    // Netzwerk-Traffic (kumulativ seit Boot)
    const netRaw = sh("cat /proc/net/dev 2>/dev/null | grep -E 'eth0|ens|enp' | head -1 | awk '{print $2,$10}'");
    const [rxBytes, txBytes] = netRaw.split(" ").map(Number);
    const rxGb = rxBytes ? Math.round(rxBytes / 1024 / 1024 / 1024 * 100) / 100 : 0;
    const txGb = txBytes ? Math.round(txBytes / 1024 / 1024 / 1024 * 100) / 100 : 0;

    // Aktive TCP-Verbindungen
    const tcpConnections = parseInt(sh("ss -tn state established 2>/dev/null | wc -l") || "0") - 1;

    // Letzte Logins
    const lastLogins = sh("last -n 5 -F 2>/dev/null | head -5");

    // App-Version aus package.json
    const appVersion = sh("cat /var/www/simplapos/package.json 2>/dev/null | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d.get('version','?'))\"");

    return {
      timestamp: new Date().toISOString(),
      cpu: {
        percent: cpuPercent,
        model: cpuModel,
        cores: cpuCores,
        loadAvg1: Math.round(loadAvg[0] * 100) / 100,
        loadAvg5: Math.round(loadAvg[1] * 100) / 100,
        loadAvg15: Math.round(loadAvg[2] * 100) / 100,
      },
      ram: {
        totalMb: totalRam,
        usedMb: usedRam,
        freeMb: freeRam,
        percent: ramPercent,
      },
      disk: {
        total: diskTotal ?? "?",
        used: diskUsed ?? "?",
        free: diskFree ?? "?",
        percent: diskPercent ?? "?",
      },
      uptime: uptimeStr,
      network: {
        rxGb,
        txGb,
        tcpConnections: Math.max(0, tcpConnections),
      },
      system: {
        os: osRelease,
        kernel: kernelVersion,
        nodeVersion,
        appVersion: appVersion || "?",
      },
      mysql: {
        status: mysqlStatus === "active" ? "online" : "offline",
        version: mysqlVersion || "8.0",
      },
      pm2: pm2Processes,
    };
  }),
});
