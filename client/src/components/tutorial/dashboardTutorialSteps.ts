export type TutorialPlacement = 'below' | 'above' | 'center' | 'side';

export type DashboardTutorialStep = {
  id: string;
  target?: string;
  quip: string;
  title: string;
  body: string;
  cta: string;
  placement?: TutorialPlacement;
  isFinale?: boolean;
};

export const DASHBOARD_TUTORIAL_STEPS: DashboardTutorialStep[] = [
  {
    id: 'welcome',
    target: '[data-tour="welcome"]',
    quip: 'Your metabolism called. It has notes.',
    title: 'You made it inside. Nice.',
    body: "This is HQ — where meals get logged, weights get tracked, and your future self writes passive-aggressive thank-you notes. Quick lap of the dashboard. No pop quiz at the end. (Fine. Tiny pop quiz.)",
    cta: 'Next →'
  },
  {
    id: 'macros-remaining',
    target: '[data-tour="macros-remaining"]',
    quip: 'Math, but make it food.',
    title: "Today's spending limit",
    body: "Calories and protein remaining — not a moral report card, more like a bank account that resets at midnight. Blow it on pizza? Log the pizza. We're adults with spreadsheets now.",
    cta: 'Next →'
  },
  {
    id: 'topbar-hydration',
    target: '[data-tour="topbar-hydration"]',
    quip: 'Hydrate or diedrate. (Kidding. Mostly.)',
    title: 'Drama in a bottle',
    body: 'Tap to log water. Bottle fills up. Empty bottle? Zero judgment. Full bottle? Hydration streak unlocked. Your kidneys sent a friend request.',
    cta: 'Next →',
    placement: 'below'
  },
  {
    id: 'topbar-level',
    target: '[data-tour="topbar-level"]',
    quip: 'Ring of progress, not Lord of the Rings.',
    title: 'Level 1. We all start here.',
    body: "That ring is your quest progress — fills as you knock out tasks. Tap for the checklist. Finish enough and you level up like it's 2008 Xbox Live, except the achievement is not finishing Halo on Legendary. It's your health. (Arguably harder.)",
    cta: 'Next →',
    placement: 'below'
  },
  {
    id: 'topbar-streaks',
    target: '[data-tour="topbar-streaks"]',
    quip: 'Streaks: the only fire you should play with.',
    title: 'Fire good. Chain sad. (Recoverable.)',
    body: "Flame = consecutive days you logged food like a responsible legend. Miss a day? Grace days exist — we're tough on habits, soft on humans. (Water streak lives next to the bottle. These numbers are demo mode. Yours start at zero. We're doing a little street magic for the tour.)",
    cta: 'Next →',
    placement: 'below'
  },
  {
    id: 'topbar-badge',
    target: '[data-tour="topbar-badge"]',
    quip: 'Trophy case loading…',
    title: 'Digital flex, earned honestly',
    body: "Badges for logging your first meal, surviving seven days straight, admitting you ate something different from the plan. Tap to browse the full trophy case. No participation trophies. (Okay maybe one. We're not heartless.)",
    cta: 'Next →',
    placement: 'below'
  },
  {
    id: 'today-nutrition',
    target: '[data-tour="today-nutrition"]',
    quip: 'Confess your meals here.',
    title: 'Confession booth, but for lunch',
    body: 'Planned meals live here. Ate exactly what we said? Log it. Ate a surprise burrito? Log that too — honesty earns badges, denial earns nothing. AI lookup is for menu paralysis at restaurants.',
    cta: 'Next →',
    placement: 'side'
  },
  {
    id: 'today-exercise',
    target: '[data-tour="today-exercise"]',
    quip: 'Rep city, population: you.',
    title: 'Rep city. Population: you.',
    body: "Today's workout at a glance. Check off exercises as you go. Rest days are strategy, not surrender — but this card is for the days you're moving on purpose. Your couch will still be there.",
    cta: 'Next →',
    placement: 'side'
  },
  {
    id: 'macro-progress',
    target: '[data-tour="macro-progress"]',
    quip: 'The big picture, in three rings.',
    title: 'Your blueprint at a glance',
    body: 'Start, current, and goal — weight and body fat in three tidy rings. Tap it to open the full Metabolic Blueprint. This is the long game; the needle moves in weeks, not hours.',
    cta: 'Next →',
    placement: 'side'
  },
  {
    id: 'weight-trend',
    target: '[data-tour="weight-trend"]',
    quip: 'The scale is a liar on Tuesdays.',
    title: 'Zoom out. Breathe.',
    body: "Your current weight, plus how far you've moved since you started. Green arrow down = trending your way. Daily blips are drama queens; the direction tells the truth. (No panic-scrolling on the scale at 11pm. We've all been there.)",
    cta: 'Next →',
    placement: 'side'
  },
  {
    id: 'sms-quick-log',
    target: '[data-tour="sms-quick-log"]',
    quip: "Text it in. We won't judge. Much.",
    title: 'For when your hands are full (of food)',
    body: "Text or snap what you ate. AI logs it. Perfect for drive-through confessions and \"I'll remember later\" — which, historically, you did not remember later.",
    cta: 'Next →',
    placement: 'side'
  },
  {
    id: 'finale',
    quip: 'Graduation day. No cap and gown.',
    title: 'Tutorial complete. Metabolism: loading…',
    body: "Log meals. Drink water. Protect the streak like it's Wi-Fi at a coffee shop. Collect badges with zero shame. Level up. Small habits + annoying consistency = results that make people ask what you're \"doing differently.\" (Logging. You're logging.)",
    cta: 'Unleash me →',
    isFinale: true,
    placement: 'center'
  }
];

export const DASHBOARD_TUTORIAL_STEP_COUNT = DASHBOARD_TUTORIAL_STEPS.length;

export function resolveTutorialStep(step: DashboardTutorialStep): DashboardTutorialStep {
  if (step.id !== 'nav-tiles') return step;

  const grid = document.querySelector('[data-tour="nav-tiles"]');
  const count = grid?.querySelectorAll('a').length;
  if (!count) {
    return { ...step, title: 'Your shortcuts. One tap.' };
  }

  return {
    ...step,
    title: `${count} door${count === 1 ? '' : 's'}. One you.`
  };
}
