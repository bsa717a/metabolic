export type PresenterSlot = 'center' | 'exercise' | 'nutrition';

export type PresenterSize = 'large' | 'small';

export type PresenterKeyframe = {
  at: number;
  slot: PresenterSlot;
  size: PresenterSize;
};

export const PRESENTER_VIDEO_SRC = '/tutorial/presenter.mp4';

export const PRESENTER_TIMELINE: PresenterKeyframe[] = [
  { at: 0, slot: 'center', size: 'large' },
  { at: 22, slot: 'exercise', size: 'small' },
  { at: 32, slot: 'nutrition', size: 'small' },
  { at: 39, slot: 'center', size: 'large' }
];

const NAV_TILES_SELECTOR = '[data-tour="nav-tiles"]';

const SLOT_TARGETS: Record<Exclude<PresenterSlot, 'center'>, string> = {
  exercise: '[data-tour="today-exercise"]',
  nutrition: '[data-tour="today-nutrition"]'
};

/** Square 1:1 — width and height are equal. */
const VIDEO_ASPECT = 1;

export function getActiveKeyframe(currentTime: number): PresenterKeyframe {
  let active = PRESENTER_TIMELINE[0]!;
  for (const keyframe of PRESENTER_TIMELINE) {
    if (currentTime >= keyframe.at) active = keyframe;
    else break;
  }
  return active;
}

function getNavigationSectionBottom() {
  const navTiles = document.querySelector(NAV_TILES_SELECTOR);
  if (navTiles) return navTiles.getBoundingClientRect().bottom;
  const header = document.querySelector('header');
  return (header ? header.getBoundingClientRect().bottom : 72) + 240;
}

function getVideoDimensions(size: PresenterSize) {
  const viewportWidth = window.innerWidth;
  const width =
    size === 'large'
      ? Math.min(560, Math.max(260, viewportWidth * 0.72))
      : Math.min(280, Math.max(168, viewportWidth * 0.36));
  return { width, height: width * VIDEO_ASPECT };
}

export function resolvePresenterLayout(keyframe: PresenterKeyframe): {
  top: number;
  left: number;
  width: number;
  height: number;
} {
  const { width, height } = getVideoDimensions(keyframe.size);
  const margin = 16;
  const navSectionBottom = getNavigationSectionBottom();

  if (keyframe.slot === 'center') {
    return {
      top: navSectionBottom + margin,
      left: (window.innerWidth - width) / 2,
      width,
      height
    };
  }

  const target = document.querySelector(SLOT_TARGETS[keyframe.slot]);
  if (!target) {
    return {
      top: navSectionBottom + margin,
      left: (window.innerWidth - width) / 2,
      width,
      height
    };
  }

  const rect = target.getBoundingClientRect();
  const horizontalBias = keyframe.slot === 'exercise' ? 0.72 : 0.28;
  const left = clamp(
    rect.left + rect.width * horizontalBias - width / 2,
    margin,
    window.innerWidth - width - margin
  );
  const top = clamp(rect.top + 8, margin, window.innerHeight - height - margin);

  return { top, left, width, height };
}

export function scrollSlotIntoView(slot: PresenterSlot) {
  if (slot === 'center') {
    document.querySelector(NAV_TILES_SELECTOR)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  const target = document.querySelector(SLOT_TARGETS[slot]);
  target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
