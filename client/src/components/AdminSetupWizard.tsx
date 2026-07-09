/**
 * AdminSetupWizard v2 – Onboarding-Wizard mit persistentem Schritt-Fortschritt
 *
 * - Öffnet sich automatisch beim Login wenn das Onboarding nicht abgeschlossen ist
 * - Bleibt beim letzten offenen Schritt stehen (persistenter Fortschritt in DB)
 * - Modulabhängige Schritte (Lager, Mitarbeiter nur wenn Modul gebucht)
 * - Logo-Upload inline im Wizard
 * - Kann jederzeit geschlossen und über Floating-Button wieder geöffnet werden
 */
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Sparkles, Image, LayoutGrid, UtensilsCrossed, Package, Users,
  CheckCircle2, ChevronRight, ChevronLeft, X, Upload, ExternalLink,
  SkipForward, Loader2,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles, Image, LayoutGrid, UtensilsCrossed, Package, Users, CheckCircle2,
};

interface WizardStep {
  key: string;
  title: string;
  description: string;
  icon: string;
  optional: boolean;
  actionPath: string | null;
  inlineAction: string | null;
  status: "pending" | "done" | "skipped";
  completedAt: number | null;
}

export function AdminSetupWizard() {
  const [, navigate] = useLocation();
  
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { data: progress, refetch } = trpc.adminSetup.getProgress.useQuery(undefined, {
    retry: false,
    staleTime: 0,
  });

  const updateStep = trpc.adminSetup.updateStep.useMutation({ onSuccess: () => refetch() });
  const markCompleted = trpc.adminSetup.markCompleted.useMutation({ onSuccess: () => refetch() });

  useEffect(() => {
    if (progress && !progress.isCompleted) {
      setIsOpen(true);
      setCurrentIndex(progress.currentStepIndex);
    }
  }, [progress?.isCompleted, progress?.currentStepIndex]);

  if (!progress) return null;

  if (!isOpen) {
    if (!progress.isCompleted) {
      return (
        <button
          onClick={() => { setIsOpen(true); setCurrentIndex(progress.currentStepIndex); }}
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-violet-700 transition-all"
        >
          <Sparkles className="h-4 w-4" />
          Einrichtung fortsetzen ({progress.progress.completed}/{progress.progress.total})
        </button>
      );
    }
    return null;
  }

  const steps: WizardStep[] = progress.steps;
  const step = steps[currentIndex];
  if (!step) return null;

  const IconComponent = ICON_MAP[step.icon] ?? Sparkles;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === steps.length - 1;
  const progressPercent = progress.progress.total > 0
    ? Math.round((progress.progress.completed / progress.progress.total) * 100)
    : 0;

  async function handleDone() {
    if (step.key === "done") {
      await markCompleted.mutateAsync();
      setIsOpen(false);
      toast.success("Einrichtung abgeschlossen!", { description: "Dein Restaurant ist bereit." });
      return;
    }
    await updateStep.mutateAsync({ stepKey: step.key, status: "done" });
    if (currentIndex < steps.length - 1) setCurrentIndex(currentIndex + 1);
  }

  async function handleSkip() {
    await updateStep.mutateAsync({ stepKey: step.key, status: "skipped" });
    if (currentIndex < steps.length - 1) setCurrentIndex(currentIndex + 1);
  }

  function handleNavigate() {
    if (step.actionPath) {
      setIsOpen(false);
      navigate(step.actionPath);
    }
  }

  async function handleLogoUpload() {
    if (!logoFile) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", logoFile);
      const res = await fetch("/api/restaurant/upload-logo", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload fehlgeschlagen");
      await updateStep.mutateAsync({ stepKey: "logo", status: "done" });
      toast.success("Logo hochgeladen!", { description: "Dein Logo wurde gespeichert." });
      setLogoFile(null);
      if (currentIndex < steps.length - 1) setCurrentIndex(currentIndex + 1);
    } catch {
      toast.error("Fehler", { description: "Logo-Upload fehlgeschlagen." });
    } finally {
      setLogoUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 px-6 pt-6 pb-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-80">Einrichtungs-Assistent</span>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1 hover:bg-white/20 transition-colors"
              title="Schliessen – du kannst jederzeit weitermachen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-1">
            <div className="flex justify-between text-xs opacity-70 mb-1">
              <span>{progress.progress.completed} von {progress.progress.total} Schritte abgeschlossen</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/30 overflow-hidden">
              <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </div>

        {/* Schritt-Indikatoren */}
        <div className="flex gap-1 px-6 py-3 bg-gray-50 border-b overflow-x-auto">
          {steps.map((s, idx) => {
            const StepIcon = ICON_MAP[s.icon] ?? Sparkles;
            const isCurrent = idx === currentIndex;
            const isDone = s.status === "done";
            return (
              <button
                key={s.key}
                onClick={() => setCurrentIndex(idx)}
                className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-all ${
                  isCurrent ? "bg-violet-100 text-violet-700"
                  : isDone ? "text-green-600 hover:bg-green-50"
                  : "text-gray-400 hover:bg-gray-100"
                }`}
                title={s.title}
              >
                <div className={`flex items-center justify-center w-7 h-7 rounded-full border-2 ${
                  isCurrent ? "border-violet-500 bg-violet-50"
                  : isDone ? "border-green-500 bg-green-50"
                  : "border-gray-200 bg-white"
                }`}>
                  {isDone ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <StepIcon className="h-3 w-3" />}
                </div>
                <span className="text-[10px] font-medium leading-tight text-center max-w-[48px] truncate">
                  {s.title.split(" ")[0]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Schritt-Inhalt */}
        <div className="px-6 py-6">
          <div className="flex items-start gap-4 mb-4">
            <div className={`flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl ${
              step.status === "done" ? "bg-green-100 text-green-600" : "bg-violet-100 text-violet-600"
            }`}>
              {step.status === "done" ? <CheckCircle2 className="h-6 w-6" /> : <IconComponent className="h-6 w-6" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{step.title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{step.description}</p>
              {step.optional && (
                <span className="inline-block mt-1 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Optional</span>
              )}
            </div>
          </div>

          {/* Inline Logo-Upload */}
          {step.inlineAction === "logo_upload" && step.status !== "done" && (
            <div className="mt-4 space-y-3">
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
              {logoFile ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-violet-200 bg-violet-50">
                  <img src={URL.createObjectURL(logoFile)} alt="Logo Vorschau"
                    className="h-12 w-12 object-contain rounded-lg border bg-white" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{logoFile.name}</p>
                    <p className="text-xs text-gray-500">{(logoFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button onClick={() => setLogoFile(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => logoInputRef.current?.click()}
                  className="w-full flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-dashed border-violet-200 hover:border-violet-400 hover:bg-violet-50 transition-colors">
                  <Upload className="h-8 w-8 text-violet-400" />
                  <span className="text-sm text-gray-600">Logo auswählen (PNG, JPG, SVG)</span>
                </button>
              )}
              {logoFile && (
                <Button onClick={handleLogoUpload} disabled={logoUploading} className="w-full bg-violet-600 hover:bg-violet-700">
                  {logoUploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird hochgeladen…</> : <><Upload className="h-4 w-4 mr-2" />Logo hochladen</>}
                </Button>
              )}
            </div>
          )}

          {/* Bereits erledigt */}
          {step.status === "done" && step.key !== "done" && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-xl px-4 py-3">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>Dieser Schritt ist bereits abgeschlossen.</span>
            </div>
          )}

          {/* Navigations-Button */}
          {step.actionPath && step.status !== "done" && (
            <Button onClick={handleNavigate} variant="outline"
              className="mt-4 w-full border-violet-200 text-violet-700 hover:bg-violet-50">
              <ExternalLink className="h-4 w-4 mr-2" />
              Jetzt einrichten
              <ChevronRight className="h-4 w-4 ml-auto" />
            </Button>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center gap-3">
          {!isFirst && (
            <Button variant="ghost" size="sm" onClick={() => setCurrentIndex(currentIndex - 1)} className="text-gray-500">
              <ChevronLeft className="h-4 w-4 mr-1" />Zurück
            </Button>
          )}
          <div className="flex-1" />
          {step.optional && step.status !== "done" && step.key !== "done" && (
            <Button variant="ghost" size="sm" onClick={handleSkip} disabled={updateStep.isPending} className="text-gray-400 hover:text-gray-600">
              <SkipForward className="h-4 w-4 mr-1" />Überspringen
            </Button>
          )}
          {step.key === "done" ? (
            <Button onClick={handleDone} disabled={markCompleted.isPending} className="bg-green-600 hover:bg-green-700 text-white">
              {markCompleted.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Einrichtung abschliessen
            </Button>
          ) : step.status === "done" ? (
            <Button onClick={() => !isLast && setCurrentIndex(currentIndex + 1)} disabled={isLast} className="bg-violet-600 hover:bg-violet-700 text-white">
              Weiter<ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : step.inlineAction === "logo_upload" ? (
            !logoFile ? (
              <Button onClick={() => { updateStep.mutateAsync({ stepKey: step.key, status: "skipped" }); setCurrentIndex(currentIndex + 1); }}
                variant="outline" size="sm" className="text-gray-500">
                Ohne Logo weiter<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : null
          ) : step.actionPath ? (
            <Button onClick={handleDone} disabled={updateStep.isPending} className="bg-violet-600 hover:bg-violet-700 text-white">
              {updateStep.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Als erledigt markieren
            </Button>
          ) : (
            <Button onClick={handleDone} disabled={updateStep.isPending} className="bg-violet-600 hover:bg-violet-700 text-white">
              {updateStep.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Weiter<ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminSetupWizard;
