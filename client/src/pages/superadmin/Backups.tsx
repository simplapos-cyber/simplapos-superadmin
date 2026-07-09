import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  Database,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  RefreshCw,
  HardDrive,
  Calendar,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "–";
  return new Date(date).toLocaleString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return (
    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1">
      <CheckCircle2 className="w-3 h-3" /> Erfolgreich
    </Badge>
  );
  if (status === "failed") return (
    <Badge className="bg-red-500/10 text-red-400 border-red-500/20 gap-1">
      <XCircle className="w-3 h-3" /> Fehlgeschlagen
    </Badge>
  );
  return (
    <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 gap-1">
      <Clock className="w-3 h-3 animate-spin" /> Läuft...
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  if (type === "scheduled") return <Badge variant="outline" className="text-xs">Automatisch</Badge>;
  if (type === "manual") return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">Manuell</Badge>;
  return <Badge variant="outline" className="text-xs">Pre-Migration</Badge>;
}

export default function Backups() {
  const [isTriggering, setIsTriggering] = useState(false);
  const [isSettingUpCron, setIsSettingUpCron] = useState(false);

  const { data: stats, refetch: refetchStats } = trpc.backup.stats.useQuery();
  const { data: backups, isLoading, refetch: refetchBackups } = trpc.backup.list.useQuery({ limit: 50 });

  const setupCron = trpc.backup.setupCron.useMutation({
    onMutate: () => setIsSettingUpCron(true),
    onSuccess: (result) => {
      setIsSettingUpCron(false);
      if (result.alreadyExists) {
        toast.info("Automatischer Backup-Cron ist bereits aktiv ✅");
      } else {
        toast.success("✅ Automatischer Backup-Cron eingerichtet – täglich 03:00 UTC");
      }
    },
    onError: (err) => {
      setIsSettingUpCron(false);
      toast.error(`❌ Cron-Setup fehlgeschlagen: ${err.message}`);
    },
  });

  const triggerManual = trpc.backup.triggerManual.useMutation({
    onMutate: () => setIsTriggering(true),
    onSuccess: (result) => {
      setIsTriggering(false);
      toast.success(`✅ Backup erfolgreich – ${result.totalRecords?.toLocaleString()} Datensätze gesichert (${formatBytes(result.sizeBytes || 0)})`);      
      refetchStats();
      refetchBackups();
    },
    onError: (err) => {
      setIsTriggering(false);
      toast.error(`❌ Backup fehlgeschlagen: ${err.message}`);
    },
  });

  const timeSinceLastBackup = stats?.lastBackupAt
    ? (() => {
        const diff = Date.now() - new Date(stats.lastBackupAt).getTime();
        const hours = Math.floor(diff / 3600000);
        if (hours < 1) return "Vor weniger als 1 Stunde";
        if (hours < 24) return `Vor ${hours} Stunden`;
        const days = Math.floor(hours / 24);
        return `Vor ${days} Tag${days > 1 ? "en" : ""}`;
      })()
    : "Noch kein Backup";

  const isBackupOverdue = stats?.lastBackupAt
    ? Date.now() - new Date(stats.lastBackupAt).getTime() > 25 * 3600000 // > 25h
    : true;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Shield className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Datenbank-Backups</h1>
            <p className="text-sm text-muted-foreground">
              DSGVO/nDSG-konform · AES-256-CBC · OR Art. 958f (10 Jahre)
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setupCron.mutate()}
            disabled={isSettingUpCron}
            title="Automatischen täglichen Backup-Cron einrichten (03:00 UTC)"
          >
            {isSettingUpCron ? <Clock className="w-4 h-4 mr-1 animate-spin" /> : <Calendar className="w-4 h-4 mr-1" />}
            Cron aktivieren
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetchStats(); refetchBackups(); }}
          >
            <RefreshCw className="w-4 h-4 mr-1" /> Aktualisieren
          </Button>
          <Button
            onClick={() => triggerManual.mutate()}
            disabled={isTriggering}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isTriggering ? (
              <><Clock className="w-4 h-4 mr-2 animate-spin" /> Backup läuft...</>
            ) : (
              <><Play className="w-4 h-4 mr-2" /> Jetzt sichern</>
            )}
          </Button>
        </div>
      </div>

      {/* Warnung wenn Backup überfällig */}
      {isBackupOverdue && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-medium">Backup überfällig</p>
            <p className="text-sm opacity-80">
              {stats?.lastBackupAt
                ? `Letztes Backup: ${timeSinceLastBackup}. Automatisches Backup läuft täglich um 03:00 UTC.`
                : "Noch kein Backup erstellt. Klicke auf 'Jetzt sichern' für das erste Backup."}
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Database className="w-4 h-4" />
              <span className="text-xs">Gesamt</span>
            </div>
            <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">Backups erstellt</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs">Erfolgreich</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{stats?.successful ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {stats?.total ? `${Math.round((stats.successful / stats.total) * 100)}% Erfolgsrate` : "–"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs">Letztes Backup</span>
            </div>
            <p className="text-sm font-semibold">{timeSinceLastBackup}</p>
            <p className="text-xs text-muted-foreground">{formatDate(stats?.lastBackupAt ?? null)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <HardDrive className="w-4 h-4" />
              <span className="text-xs">Letzte Grösse</span>
            </div>
            <p className="text-2xl font-bold">{formatBytes(stats?.lastBackupSize ?? 0)}</p>
            <p className="text-xs text-muted-foreground">Verschlüsselt</p>
          </CardContent>
        </Card>
      </div>

      {/* Rechtliche Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border">
          <Lock className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold">AES-256-CBC Verschlüsselung</p>
            <p className="text-xs text-muted-foreground">DSGVO Art. 32 / nDSG Art. 8 konform</p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border">
          <Calendar className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold">10 Jahre Aufbewahrung</p>
            <p className="text-xs text-muted-foreground">OR Art. 958f (Buchführungspflicht)</p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border">
          <Shield className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold">Täglich 03:00 UTC</p>
            <p className="text-xs text-muted-foreground">Automatisch, mit Push-Benachrichtigung</p>
          </div>
        </div>
      </div>

      {/* Backup-Liste */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" />
            Backup-Verlauf
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Lädt...</div>
          ) : !backups?.length ? (
            <div className="p-8 text-center">
              <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">Noch keine Backups vorhanden</p>
              <p className="text-sm text-muted-foreground mt-1">Klicke auf "Jetzt sichern" für das erste Backup</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Dateiname</TableHead>
                  <TableHead>Grösse</TableHead>
                  <TableHead>Erstellt</TableHead>
                  <TableHead>Aufbewahrung bis</TableHead>
                  <TableHead>Ausgelöst von</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((backup: any) => (
                  <TableRow key={backup.id}>
                    <TableCell><StatusBadge status={backup.status} /></TableCell>
                    <TableCell><TypeBadge type={backup.type} /></TableCell>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate" title={backup.filename}>
                      {backup.filename}
                    </TableCell>
                    <TableCell className="text-sm">
                      {backup.sizeBytes > 0 ? formatBytes(backup.sizeBytes) : "–"}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(backup.createdAt)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(backup.retentionUntil)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{backup.triggeredBy}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Prüfsummen-Info */}
      {backups && backups.length > 0 && backups[0].checksum && (
        <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/20 border">
          <span className="font-medium">Letzter Backup-Fingerabdruck (SHA-256):</span>{" "}
          <span className="font-mono">{backups[0].checksum}</span>
        </div>
      )}
    </div>
  );
}
