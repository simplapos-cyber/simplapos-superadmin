/**
 * SoundAlertToggle – Kompakter Toggle für den Soundalarm
 *
 * Zeigt ein Lautsprecher-Icon. Klick aktiviert/deaktiviert den Ton.
 * Hover zeigt einen Lautstärkeregler.
 */
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SoundAlertToggleProps {
  enabled: boolean;
  volume: number;
  onToggle: (v: boolean) => void;
  onVolumeChange: (v: number) => void;
  onTestSound?: () => void;
}

export function SoundAlertToggle({
  enabled,
  volume,
  onToggle,
  onVolumeChange,
  onTestSound,
}: SoundAlertToggleProps) {
  return (
    <Popover>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className={`h-8 w-8 p-0 ${enabled ? "text-foreground" : "text-muted-foreground"}`}
                aria-label={enabled ? "Ton deaktivieren" : "Ton aktivieren"}
              >
                {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {enabled ? "Ton an – klicken zum Deaktivieren" : "Ton aus – klicken zum Aktivieren"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent className="w-56 p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Alarmton</span>
            <Button
              size="sm"
              variant={enabled ? "default" : "outline"}
              className="h-7 px-3 text-xs"
              onClick={() => onToggle(!enabled)}
            >
              {enabled ? "An" : "Aus"}
            </Button>
          </div>

          {enabled && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Lautstärke</span>
                  <span className="text-xs text-muted-foreground">{Math.round(volume * 100)}%</span>
                </div>
                <Slider
                  value={[volume]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={([v]) => onVolumeChange(v)}
                  className="w-full"
                />
              </div>

              {onTestSound && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs"
                  onClick={onTestSound}
                >
                  Ton testen
                </Button>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
