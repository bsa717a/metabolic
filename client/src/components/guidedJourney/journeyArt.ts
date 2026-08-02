/** assetId → raster scene URLs. Curriculum references ids only. No SVG scenes. */

type SceneSources = {
  mobile: string;
  desktop: string;
  objectPositionMobile: string;
  objectPositionDesktop: string;
  lqipColor: string;
};

const JOURNEY_ART_VERSION = '5';

const SCENES: Record<string, SceneSources> = {
  'l1-valley-invite': {
    mobile: '/journey/l1-valley-invite-mobile.png',
    desktop: '/journey/l1-valley-invite-desktop.png',
    objectPositionMobile: '40% 60%',
    objectPositionDesktop: '42% 50%',
    lqipColor: '#6a8f5c'
  },
  'l1-valley-arrival': {
    mobile: '/journey/l1-valley-arrival-mobile.png',
    desktop: '/journey/l1-valley-arrival-desktop.png',
    objectPositionMobile: '48% 55%',
    objectPositionDesktop: '50% 48%',
    lqipColor: '#6a8f5c'
  },
  'l1-valley-intro': {
    mobile: '/journey/l1-valley-intro-mobile.png',
    desktop: '/journey/l1-valley-intro-desktop.png',
    objectPositionMobile: '42% 58%',
    objectPositionDesktop: '45% 50%',
    lqipColor: '#6a8f5c'
  },
  'l1-trail-experiencing': {
    mobile: '/journey/l1-trail-experiencing-mobile.png',
    desktop: '/journey/l1-trail-experiencing-desktop.png',
    objectPositionMobile: '44% 62%',
    objectPositionDesktop: '46% 52%',
    lqipColor: '#6a8f5c'
  },
  'l1-trail-reflection': {
    mobile: '/journey/l1-trail-reflection-mobile.png',
    desktop: '/journey/l1-trail-reflection-desktop.png',
    objectPositionMobile: '48% 55%',
    objectPositionDesktop: '50% 48%',
    lqipColor: '#8a9a5c'
  },
  'l1-valley-celebrate': {
    mobile: '/journey/l1-valley-celebrate-mobile.png',
    desktop: '/journey/l1-valley-celebrate-desktop.png',
    objectPositionMobile: '50% 50%',
    objectPositionDesktop: '52% 46%',
    lqipColor: '#8a9a5c'
  }
};

function withVersion(path: string) {
  return `${path}?v=${JOURNEY_ART_VERSION}`;
}

export function getJourneyScene(assetId: string): SceneSources {
  const scene = SCENES[assetId] ?? SCENES['l1-valley-invite']!;
  return {
    ...scene,
    mobile: withVersion(scene.mobile),
    desktop: withVersion(scene.desktop)
  };
}
