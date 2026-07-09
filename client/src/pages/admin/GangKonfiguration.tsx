/**
 * GangKonfiguration – Admin-Seite zur Verwaltung der Gang-Reihenfolge
 *
 * Admins können hier eigene Gang-Namen definieren, umbenennen,
 * aktivieren/deaktivieren und per Drag-and-Drop sortieren.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  GripVertical, Plus, Pencil, Trash2, Check, X, Eye, EyeOff, ChefHat,
} from "lucide-react";

type Course = {
  id: number;
  courseNumber: number;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

function CourseRow({
  course,
  onUpdate,
  onDelete,
  onToggleActive,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  course: Course;
  onUpdate: (id: number, name: string, courseNumber: number) => void;
  onDelete: (id: number) => void;
  onToggleActive: (id: number, isActive: boolean) => void;
  onDragStart: (id: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (targetId: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(course.name);
  const [editCourseNumber, setEditCourseNumber] = useState(course.courseNumber);

  const handleSave = () => {
    if (!editName.trim()) return;
    onUpdate(course.id, editName.trim(), editCourseNumber);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditName(course.name);
    setEditCourseNumber(course.courseNumber);
    setEditing(false);
  };

  return (
    <div
      draggable
      onDragStart={() => onDragStart(course.id)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(course.id)}
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
        course.isActive
          ? "bg-card border-border hover:border-primary/40"
          : "bg-muted/30 border-border/50 opacity-60"
      }`}
    >
      {/* Drag Handle */}
      <GripVertical size={16} className="text-muted-foreground shrink-0" />

      {/* Gang-Nummer Badge */}
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-primary">{course.courseNumber}</span>
      </div>

      {/* Name / Edit */}
      {editing ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Input
            value={editCourseNumber}
            onChange={e => setEditCourseNumber(Number(e.target.value))}
            type="number"
            min={1}
            max={20}
            className="w-16 h-8 text-sm"
            style={{ fontSize: "16px" }}
          />
          <Input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
            autoFocus
            className="flex-1 h-8 text-sm"
            style={{ fontSize: "16px" }}
          />
          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={handleSave}>
            <Check size={14} />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={handleCancel}>
            <X size={14} />
          </Button>
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-medium ${course.isActive ? "text-foreground" : "text-muted-foreground line-through"}`}>
            {course.name}
          </span>
        </div>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setEditing(true)}
            title="Umbenennen"
          >
            <Pencil size={13} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={`h-7 w-7 ${course.isActive ? "text-muted-foreground hover:text-amber-500" : "text-amber-500 hover:text-foreground"}`}
            onClick={() => onToggleActive(course.id, !course.isActive)}
            title={course.isActive ? "Deaktivieren" : "Aktivieren"}
          >
            {course.isActive ? <Eye size={13} /> : <EyeOff size={13} />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(course.id)}
            title="Löschen"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function GangKonfiguration() {
  const utils = trpc.useUtils();
  const { data: courses = [], isLoading } = trpc.course.list.useQuery();

  const [newName, setNewName] = useState("");
  const [newCourseNumber, setNewCourseNumber] = useState<number>(1);
  const [dragId, setDragId] = useState<number | null>(null);

  const upsert = trpc.course.upsert.useMutation({
    onSuccess: () => { utils.course.list.invalidate(); toast.success("Gang gespeichert"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.course.delete.useMutation({
    onSuccess: () => { utils.course.list.invalidate(); toast.success("Gang gelöscht"); },
    onError: (e) => toast.error(e.message),
  });
  const reorder = trpc.course.reorder.useMutation({
    onSuccess: () => utils.course.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const handleAdd = () => {
    if (!newName.trim()) return;
    const maxSort = courses.length > 0 ? Math.max(...(courses as Course[]).map((c: Course) => c.sortOrder)) + 1 : 0;
    upsert.mutate({ courseNumber: newCourseNumber, name: newName.trim(), sortOrder: maxSort, isActive: true });
    setNewName("");
    setNewCourseNumber(courses.length + 2);
  };

  const handleUpdate = (id: number, name: string, courseNumber: number) => {
    const existing = (courses as Course[]).find((c: Course) => c.id === id);
    if (!existing) return;
    upsert.mutate({ id, courseNumber, name, sortOrder: existing.sortOrder, isActive: existing.isActive });
  };

  const handleToggleActive = (id: number, isActive: boolean) => {
    const existing = (courses as Course[]).find((c: Course) => c.id === id);
    if (!existing) return;
    upsert.mutate({ id, courseNumber: existing.courseNumber, name: existing.name, sortOrder: existing.sortOrder, isActive });
  };

  const handleDrop = (targetId: number) => {
    if (!dragId || dragId === targetId) return;
    const dragIdx = (courses as Course[]).findIndex((c: Course) => c.id === dragId);
    const targetIdx = (courses as Course[]).findIndex((c: Course) => c.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;
    const reordered = [...courses];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    const items = reordered.map((c: Course, i: number) => ({ id: c.id, sortOrder: i }));
    reorder.mutate({ items });
    setDragId(null);
  };

  // Suggest next course number
  const nextCourseNumber = courses.length > 0
    ? Math.max(...(courses as Course[]).map((c: Course) => c.courseNumber)) + 1
    : 1;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ChefHat size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Gang-Konfiguration</h1>
          <p className="text-sm text-muted-foreground">
            Definiere eigene Gang-Namen und Reihenfolge für den Küchenmonitor
          </p>
        </div>
      </div>

      {/* Info-Banner */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-700 dark:text-blue-300">
        <strong>Tipp:</strong> Die Gang-Nummer wird beim Bonieren verwendet (z.B. 1 = erster Gang).
        Ziehe die Zeilen per Drag-and-Drop, um die Anzeigereihenfolge im Küchenmonitor anzupassen.
      </div>

      {/* Gang-Liste */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Lädt...</div>
        ) : courses.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Keine Gänge konfiguriert</div>
        ) : (
          (courses as Course[]).map((course: Course) => (
            <CourseRow
              key={course.id}
              course={course}
              onUpdate={handleUpdate}
              onDelete={(id) => deleteMut.mutate({ id })}
              onToggleActive={handleToggleActive}
              onDragStart={setDragId}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            />
          ))
        )}
      </div>

      {/* Neuen Gang hinzufügen */}
      <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Neuen Gang hinzufügen</p>
        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            max={20}
            value={newCourseNumber || nextCourseNumber}
            onChange={e => setNewCourseNumber(Number(e.target.value))}
            placeholder="Nr."
            className="w-20"
            style={{ fontSize: "16px" }}
          />
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
            placeholder="Gang-Name (z.B. Amuse-Bouche)"
            className="flex-1"
            style={{ fontSize: "16px" }}
          />
          <Button onClick={handleAdd} disabled={!newName.trim() || upsert.isPending}>
            <Plus size={16} className="mr-1" />
            Hinzufügen
          </Button>
        </div>
      </div>

      {/* Aktive Gänge Übersicht */}
      <div className="rounded-xl border p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Aktive Gänge</p>
        <div className="flex flex-wrap gap-2">
          {(courses as Course[]).filter((c: Course) => c.isActive).map((c: Course) => (
            <Badge key={c.id} variant="secondary" className="text-xs">
              {c.courseNumber}. {c.name}
            </Badge>
          ))}
          {(courses as Course[]).filter((c: Course) => c.isActive).length === 0 && (
            <span className="text-sm text-muted-foreground">Keine aktiven Gänge</span>
          )}
        </div>
      </div>
    </div>
  );
}
