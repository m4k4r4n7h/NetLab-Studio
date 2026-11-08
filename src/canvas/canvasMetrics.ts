export interface CanvasMetrics {
  width: number;
  height: number;
}

const FALLBACK_WIDTH = 960;
const FALLBACK_HEIGHT = 600;
const CHROME_WIDTH = 688;
const CHROME_HEIGHT = 270;
const MIN_CANVAS_WIDTH = 520;
const MIN_CANVAS_HEIGHT = 380;

export function getCanvasMetrics(): CanvasMetrics {
  if (typeof document !== 'undefined') {
    const canvas = document.querySelector<SVGSVGElement>('[data-testid="topology-canvas"]');
    const canvasBounds = canvas?.getBoundingClientRect();
    if (canvasBounds && canvasBounds.width > 0 && canvasBounds.height > 0) {
      return {
        width: Math.round(canvasBounds.width),
        height: Math.round(canvasBounds.height)
      };
    }

    const shell = document.querySelector<HTMLElement>('.canvas-shell');
    const shellBounds = shell?.getBoundingClientRect();
    if (shellBounds && shellBounds.width > 0 && shellBounds.height > 0) {
      return {
        width: Math.round(shellBounds.width),
        height: Math.round(shellBounds.height)
      };
    }
  }

  if (typeof window !== 'undefined') {
    return {
      width: Math.max(MIN_CANVAS_WIDTH, window.innerWidth - CHROME_WIDTH),
      height: Math.max(MIN_CANVAS_HEIGHT, window.innerHeight - CHROME_HEIGHT)
    };
  }

  return { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT };
}
