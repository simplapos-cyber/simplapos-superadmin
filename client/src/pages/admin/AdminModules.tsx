import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle, Clock, Lock, Play, ShoppingCart, Puzzle } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Aktiv", icon: CheckCircle, color: "text-green-600", badgeVariant: "default" },
  trial: { label: "Testphase", icon: Clock, color: "text-amber-600", badgeVariant: "outline" },
  trial_expired: { label: "Abgelaufen", icon: Lock, color: "text-red-600", badgeVariant: "destructive" },
  inactive: { label: "Nicht aktiv", icon: Lock, color: "text-muted-foreground", badgeVariant: "secondary" },
  not_subscribed: { label: "Verfügbar", icon: Puzzle, color: "text-muted-foreground", badgeVariant: "secondary" },
};

export default function AdminModules() {
  const utils = trpc.useUtils();
  // listModules returns all MODULES merged with dbRecord (status, quantity, trialEndsAt)
  const { data: allModules, isLoading } = trpc.restaurantAdmin.listModules.useQuery();
  const { data: accessPhase } = trpc.subscriptions.myAccessPhase.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const isRestricted = accessPhase?.phase === 'restricted';
  const startTrial = trpc.restaurantAdmin.startTrial.useMutation({
    onSuccess: () => {
      utils.restaurantAdmin.listModules.invalidate();
      utils.restaurantAdmin.overview.invalidate();
      toast.success("Testphase gestartet! Sie haben 7 Tage vollen Zugang zum Testen.");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="container py-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  // The listModules endpoint returns MODULES spread with dbRecord, status, quantity, trialEndsAt
  // Each item has: id, name, description, category, priceMonthly, priceOneTime, isRequired, isPerUnit, unitLabel?, maxUnits?, dbRecord, status, quantity, trialEndsAt, trialStartedAt
  const modules = allModules || [];

  const activeModules = modules.filter(m => m.status === "active");
  const trialModules = modules.filter(m => m.status === "trial");
  const expiredModules = modules.filter(m => m.status === "trial_expired");
  const availableToTry = modules.filter(m => m.status === "not_subscribed" && !m.isRequired);

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Module & Erweiterungen</h1>
        <p className="text-muted-foreground">Verwalten Sie Ihre aktiven Module und entdecken Sie neue Funktionen</p>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            Aktiv ({activeModules.length})
          </TabsTrigger>
          <TabsTrigger value="trial">
            Testphase ({trialModules.length})
          </TabsTrigger>
          {expiredModules.length > 0 && (
            <TabsTrigger value="expired">
              Abgelaufen ({expiredModules.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="available">
            Verfügbar ({availableToTry.length})
          </TabsTrigger>
        </TabsList>

        {/* Active Modules */}
        <TabsContent value="active" className="mt-6">
          {activeModules.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Puzzle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Keine aktiven Module</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeModules.map(m => (
                <ModuleCard key={m.id} module={m} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Trial Modules */}
        <TabsContent value="trial" className="mt-6">
          {trialModules.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Keine Module in der Testphase</p>
                <p className="text-sm mt-1">Starten Sie eine kostenlose 7-Tage-Testphase unter "Verfügbar"</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trialModules.map(m => (
                <ModuleCard key={m.id} module={m} showTrialInfo />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Expired Modules */}
        <TabsContent value="expired" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {expiredModules.map(m => (
              <ModuleCard key={m.id} module={m} showUpgrade />
            ))}
          </div>
        </TabsContent>

        {/* Available Modules */}
        <TabsContent value="available" className="mt-6">
          {isRestricted && availableToTry.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-800">
              <strong>Eingeschränkter Zugang:</strong> Die ersten 7 Tage mit vollem Zugriff sind abgelaufen. Sie können jetzt nur noch die Module nutzen, die Sie beim Onboarding ausgewählt haben. Alle anderen Module sind deaktiviert. Buchen Sie zusätzliche Module, um sie dauerhaft zu nutzen.
            </div>
          )}
          {availableToTry.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Sie haben bereits alle verfügbaren Module</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableToTry.map(m => (
                <Card key={m.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{m.name}</CardTitle>
                      <Badge variant="secondary">
                        CHF {m.priceMonthly}/Mt.
                        {m.priceOneTime > 0 && ` + ${m.priceOneTime} einmalig`}
                      </Badge>
                    </div>
                    <CardDescription>{m.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startTrial.mutate({ moduleId: m.id })}
                        disabled={startTrial.isPending}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        7 Tage testen
                      </Button>
                      <Button size="sm" onClick={() => toast.info("Bitte kontaktieren Sie uns für ein Upgrade Ihres Vertrags.")}>
                        <ShoppingCart className="h-4 w-4 mr-1" />
                        Kaufen
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ModuleCardProps {
  module: {
    id: string;
    name: string;
    description: string;
    priceMonthly: number;
    priceOneTime: number;
    status: string;
    quantity: number;
    trialEndsAt: Date | null;
    isPerUnit?: boolean;
    [key: string]: unknown;
  };
  showTrialInfo?: boolean;
  showUpgrade?: boolean;
}

function ModuleCard({ module: m, showTrialInfo, showUpgrade }: ModuleCardProps) {
  const config = STATUS_CONFIG[m.status] || STATUS_CONFIG.inactive;
  const Icon = config.icon;
  const daysLeft = m.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(m.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <Card className={m.status === "trial_expired" ? "border-red-200" : m.status === "trial" ? "border-amber-200" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon className={`h-5 w-5 ${config.color}`} />
            {m.name}
          </CardTitle>
          <Badge variant={config.badgeVariant}>{config.label}</Badge>
        </div>
        <CardDescription>{m.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          {m.quantity > 1 && (
            <p className="text-muted-foreground">Menge: {m.quantity}</p>
          )}
          <p className="text-muted-foreground">
            CHF {m.priceMonthly}/Mt.
            {m.priceOneTime > 0 && ` + CHF ${m.priceOneTime} einmalig`}
          </p>
          {showTrialInfo && m.trialEndsAt && (
            <p className={daysLeft <= 2 ? "text-red-600 font-medium" : "text-amber-600"}>
              Testphase endet in {daysLeft} Tag{daysLeft !== 1 ? "en" : ""} ({new Date(m.trialEndsAt).toLocaleDateString("de-CH")})
            </p>
          )}
          {showUpgrade && (
            <div className="pt-2">
              <Button size="sm" onClick={() => toast.info("Bitte kontaktieren Sie uns für ein Upgrade Ihres Vertrags.")}>
                <ShoppingCart className="h-4 w-4 mr-1" />
                Jetzt freischalten
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
