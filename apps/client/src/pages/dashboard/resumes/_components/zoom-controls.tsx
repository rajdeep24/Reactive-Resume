import { t } from "@lingui/macro";
import { MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";
import { Button, Tooltip } from "@reactive-resume/ui";
import { motion } from "framer-motion";

type Props = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
};

export const ZoomControls = ({ zoom, onZoomIn, onZoomOut, onResetZoom }: Props) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-6 right-6 z-50"
    >
      <div className="flex flex-col items-center gap-2 rounded-lg bg-background/95 backdrop-blur-sm border shadow-lg p-2">
        <Tooltip content={t`Zoom In`}>
          <Button
            size="icon"
            variant="ghost"
            onClick={onZoomIn}
            disabled={zoom >= 1.5}
            className="h-8 w-8"
          >
            <MagnifyingGlassPlus size={16} />
          </Button>
        </Tooltip>

        <div className="text-xs text-muted-foreground font-mono min-w-[3ch] text-center">
          {Math.round(zoom * 100)}%
        </div>

        <Tooltip content={t`Zoom Out`}>
          <Button
            size="icon"
            variant="ghost"
            onClick={onZoomOut}
            disabled={zoom <= 0.5}
            className="h-8 w-8"
          >
            <MagnifyingGlassMinus size={16} />
          </Button>
        </Tooltip>

        {zoom !== 1 && (
          <Tooltip content={t`Reset Zoom`}>
            <Button size="sm" variant="outline" onClick={onResetZoom} className="h-6 px-2 text-xs">
              Reset
            </Button>
          </Tooltip>
        )}
      </div>
    </motion.div>
  );
};
