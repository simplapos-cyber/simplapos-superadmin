import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, Users as UsersIcon, Shield } from "lucide-react";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  superadmin: { label: "Superadmin", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  admin: { label: "Admin", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  kellner: { label: "Kellner", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  koch: { label: "Koch", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  buchhalter: { label: "Buchhalter", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  gast: { label: "Gast", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" },
  partner: { label: "Partner", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  user: { label: "Benutzer", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" },
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Aktiv", variant: "default" },
  inactive: { label: "Inaktiv", variant: "secondary" },
  suspended: { label: "Gesperrt", variant: "destructive" },
  pending: { label: "Ausstehend", variant: "outline" },
};

export default function Users() {
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  const { data: users, isLoading } = trpc.users.list.useQuery(
    search ? { search } : undefined
  );

  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => { utils.users.list.invalidate(); toast.success("Benutzer aktualisiert"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Benutzer</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {users?.length ?? 0} Benutzer registriert
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Name oder E-Mail suchen..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : users?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <UsersIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">Keine Benutzer gefunden</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Benutzer</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Registriert</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((u: any) => {
                    const role = ROLE_LABELS[u.role ?? "user"] ?? ROLE_LABELS.user;
                    const status = STATUS_LABELS[(u as any).status ?? "active"] ?? STATUS_LABELS.active;
                    const initials = u.name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={(u as any).avatarUrl} />
                              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">{u.name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{u.email ?? "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${role.color}`}>
                            {u.role === "superadmin" && <Shield className="h-3 w-3" />}
                            {role.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString("de-CH") : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={u.role ?? "user"}
                              onValueChange={(v) => updateMutation.mutate({ id: u.id, role: v as any })}
                            >
                              <SelectTrigger className="h-7 text-xs w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="superadmin">Superadmin</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="kellner">Kellner</SelectItem>
                                <SelectItem value="koch">Koch</SelectItem>
                                <SelectItem value="buchhalter">Buchhalter</SelectItem>
                                <SelectItem value="gast">Gast</SelectItem>
                                <SelectItem value="partner">Partner</SelectItem>
                                <SelectItem value="user">Benutzer</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select
                              value={(u as any).status ?? "active"}
                              onValueChange={(v) => updateMutation.mutate({ id: u.id, status: v as any })}
                            >
                              <SelectTrigger className="h-7 text-xs w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">Aktiv</SelectItem>
                                <SelectItem value="inactive">Inaktiv</SelectItem>
                                <SelectItem value="suspended">Gesperrt</SelectItem>
                                <SelectItem value="pending">Ausstehend</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
