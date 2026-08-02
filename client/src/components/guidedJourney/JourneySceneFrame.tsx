import { clsx } from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import { getJourneyScene } from './journeyArt';

type SceneVariant = 'invite' | 'panorama' | 'immersive';
type PanelPlacement = 'trailhead' | 'trailhead-tall' | 'center-low' | 'stack';

/**
 * Raster world is primary (PNG/WebP). Compact HTML panel floats at the trailhead.
 * No SVG scenes. No blur veils over the artwork.
 */
export function JourneySceneFrame({
  assetId,
  variant,
  children,
  className,
  trail,
  stageLabel,
  panelPlacement = 'trailhead'
}: {
  assetId: string;
  variant: SceneVariant;
  children?: ReactNode;
  className?: string;
  trail?: ReactNode;
  stageLabel?: string;
  panelPlacement?: PanelPlacement;
}) {
  const scene = getJourneyScene(assetId);

  const sizeClass =
    variant === 'invite'
      ? 'min-h-[min(72vh,580px)] h-[min(72vh,580px)] lg:min-h-[540px] lg:h-[580px]'
      : variant === 'panorama'
        ? 'min-h-[min(68vh,520px)] aspect-[16/11] lg:min-h-[500px] lg:aspect-[21/9]'
        : 'min-h-[min(78vh,640px)] aspect-[3/4] sm:aspect-[4/5] lg:min-h-[560px] lg:aspect-[16/10]';

  const panelClass =
    panelPlacement === 'stack'
      ? 'relative z-[2] mt-auto w-full max-w-sm px-4 pb-5 sm:px-6'
      : panelPlacement === 'center-low'
        ? 'absolute z-[2] bottom-[10%] left-1/2 w-[min(100%-2.5rem,20rem)] -translate-x-1/2 sm:bottom-[12%]'
        : panelPlacement === 'trailhead-tall'
          ? clsx(
              'absolute z-[2] top-[8%] bottom-[8%] left-[5%] flex w-[min(100%-2rem,20rem)] flex-col',
              'sm:top-[9%] sm:bottom-[9%] sm:left-[9%] sm:w-[20.5rem]',
              'lg:top-[10%] lg:bottom-[10%] lg:left-[12%] lg:w-[22rem]'
            )
          : clsx(
              'absolute z-[2] bottom-[8%] left-[6%] w-[min(100%-2.5rem,18.5rem)]',
              'sm:bottom-[10%] sm:left-[10%] sm:w-[19rem]',
              'lg:bottom-[12%] lg:left-[13%] lg:w-[20rem]',
              'max-h-[46%] overflow-y-auto overscroll-contain'
            );

  return (
    <section
      className={clsx(
        'journey-world relative w-full overflow-hidden rounded-[1.75rem]',
        'shadow-[0_20px_50px_rgba(31,41,51,0.12)]',
        sizeClass,
        className
      )}
      style={{ background: scene.lqipColor }}
      aria-label={stageLabel}
    >
      <picture>
        <source media="(min-width: 1024px)" srcSet={scene.desktop} />
        <img
          src={scene.mobile}
          alt=""
          aria-hidden="true"
          decoding="async"
          loading={variant === 'invite' ? 'lazy' : 'eager'}
          fetchPriority={variant === 'invite' ? 'auto' : 'high'}
          className="absolute inset-0 h-full w-full object-cover max-lg:[object-position:var(--gj-pos-m)] lg:[object-position:var(--gj-pos-d)]"
          style={
            {
              '--gj-pos-m': scene.objectPositionMobile,
              '--gj-pos-d': scene.objectPositionDesktop
            } as CSSProperties
          }
        />
      </picture>

      <div className="absolute inset-0 z-[1]">{trail}</div>
      <div className={panelClass}>{children}</div>
    </section>
  );
}
