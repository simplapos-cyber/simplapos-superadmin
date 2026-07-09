import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { UserPlus, Trash2, Edit, Eye, EyeOff, Shield } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  kellner: "Kellner",
  koch: "Koch",
  buchhalter: "Buchhalter",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Aktiv", variant: "default" },
  inactive: { label: "Inaktiv", variant: "secondary" },
  suspended: { label: "Gesperrt", variant: "destructive" },
};

export default function AdminStaff() {
  const utils = trpc.useUtils();
  const { data: overview } = trpc.restaurantAdmin.overview.useQuery();
  const { data: staff, isLoading } = trpc.restaurantAdmin.listStaff.useQuery();
  const createStaff = trpc.restaurantAdmin.createStaff.useMutation({
    onSuccess: () => {
      utils.restaurantAdmin.listStaff.invalidate();
      utils.restaurantAdmin.overview.invalidate();
      toast.success("Mitarbeiter erfolgreich erstellt");
      setCreateOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateStaff = trpc.restaurantAdmin.updateStaff.useMutation({
    onSuccess: () => {
      utils.restaurantAdmin.listStaff.invalidate();
      toast.success("Mitarbeiter aktualisiert");
      setEditOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteStaff = trpc.restaurantAdmin.deleteStaff.useMutation({
    onSuccess: () => {
      utils.restaurantAdmin.listStaff.invalidate();
      utils.restaurantAdmin.overview.invalidate();
      toast.success("Mitarbeiter gelöscht");
    },
    onError: (err) => toast.error(err.message),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("kellner");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole("kellner");
    setShowPassword(false);
  };

  const totalLicenses = overview?.stats.totalLicenses ?? 1;
  const usedLicenses = staff?.length ?? 0;
  const canAddMore = usedLicenses < totalLicenses;

  const handleCreate = () => {
    if (!name || !email || !password) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    createStaff.mutate({ name, email, password, role: role as any });
  };

  const openEdit = (member: any) => {
    setEditTarget(member);
    setEditName(member.name || "");
    setEditRole(member.role);
    setEditStatus(member.status);
    setEditPassword("");
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editTarget) return;
    const data: any = { id: editTarget.id };
    if (editName !== editTarget.name) data.name = editName;
    if (editRole !== editTarget.role) data.role = editRole;
    if (editStatus !== editTarget.status) data.status = editStatus;
    if (editPassword) data.password = editPassword;
    updateStaff.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="container py-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Mitarbeiter</h1>
          <p className="text-muted-foreground">
            {usedLicenses} von {totalLicenses} Lizenzen verwendet
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button disabled={!canAddMore}>
              <UserPlus className="h-4 w-4 mr-2" />
              Mitarbeiter hinzufügen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neuer Mitarbeiter</DialogTitle>
              <DialogDescription>
                Erstellen Sie einen neuen Mitarbeiter-Account. {totalLicenses - usedLicenses} Lizenz(en) verfügbar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Max Muster" />
              </div>
              <div>
                <Label>E-Mail *</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="max@restaurant.ch" />
              </div>
              <div>
                <Label>Passwort * (min. 6 Zeichen)</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Sicheres Passwort"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Rolle</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrator</SelectItem>
                    <SelectItem value="kellner">Kellner</SelectItem>
                    <SelectItem value="koch">Koch</SelectItem>
                    <SelectItem value="buchhalter">Buchhalter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
              <Button onClick={handleCreate} disabled={createStaff.isPending}>
                {createStaff.isPending ? "Erstelle..." : "Erstellen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* License Info */}
      {!canAddMore && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">Lizenzlimit erreicht</p>
                <p className="text-sm text-amber-600">
                  Sie haben alle {totalLicenses} Lizenzen verwendet. Für weitere Mitarbeiter benötigen Sie zusätzliche POS-Kassen in Ihrem Vertrag.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff Table */}
      <Card>
        <CardHeader>
          <CardTitle>Alle Mitarbeiter</CardTitle>
          <CardDescription>Verwalten Sie Ihre Mitarbeiter und deren Zugriffsrechte</CardDescription>
        </CardHeader>
        <CardContent>
          {!staff || staff.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Noch keine Mitarbeiter registriert</p>
              <p className="text-sm">Erstellen Sie Ihren ersten Mitarbeiter-Account</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member: any) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name || "–"}</TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{ROLE_LABELS[member.role] || member.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_LABELS[member.status]?.variant || "secondary"}>
                          {STATUS_LABELS[member.status]?.label || member.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(member)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(`Mitarbeiter "${member.name}" wirklich löschen?`)) {
                                deleteStaff.mutate({ id: member.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mitarbeiter bearbeiten</DialogTitle>
            <DialogDescription>{editTarget?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>Rolle</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="kellner">Kellner</SelectItem>
                  <SelectItem value="koch">Koch</SelectItem>
                  <SelectItem value="buchhalter">Buchhalter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="inactive">Inaktiv</SelectItem>
                  <SelectItem value="suspended">Gesperrt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Neues Passwort (leer lassen = unverändert)</Label>
              <Input
                type="password"
                value={editPassword}
                onChange={e => setEditPassword(e.target.value)}
                placeholder="Neues Passwort (min. 6 Zeichen)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Abbrechen</Button>
            <Button onClick={handleUpdate} disabled={updateStaff.isPending}>
              {updateStaff.isPending ? "Speichere..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
