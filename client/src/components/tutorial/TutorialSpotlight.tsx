export type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const PADDING = 8;

export function getSpotlightRect(element: Element | null): SpotlightRect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    top: Math.max(0, rect.top - PADDING),
    left: Math.max(0, rect.left - PADDING),
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2
  };
}

export function TutorialSpotlight({ rect }: { rect: SpotlightRect | null }) {
  if (!rect) {
    return <div className="fixed inset-0 z-[60] bg-slate-950/60 pointer-events-auto" aria-hidden />;
  }

  return (
    <div className="fixed inset-0 z-[60] pointer-events-auto" aria-hidden>
      <div
        className="absolute rounded-2xl ring-[3px] ring-brand-green shadow-[0_0_0_9999px_rgba(2,6,23,0.6),0_0_24px_4px_rgba(34,197,94,0.35)]"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        }}
      />
    </div>
  );
}
