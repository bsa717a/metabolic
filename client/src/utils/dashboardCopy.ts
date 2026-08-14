function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function timeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

const TAGLINES = [
  'Focus. Fuel. Follow the plan.',
  'Eat clean. Move daily. Stay consistent.',
  'Discipline beats motivation.',
  'One meal, one rep, one day at a time.',
  'Consistency compounds.',
  'Show up. Log it. Win the day.',
  'Plan the work. Work the plan.',
  'Progress over perfection.',
  'Do the basics, brilliantly.',
  'Fuel smart. Train hard. Recover well.',
  'Own your metabolism today.',
  'Small choices stack into big results.',
  'Trust the process. Track the proof.',
  'Habits first. Outcomes follow.'
];

function buildGreetings(name: string): string[] {
  const period = timeOfDay();
  const timed =
    period === 'morning'
      ? [`Good morning, ${name}`, `Rise and grind, ${name}`, `Morning, ${name} — let's go`]
      : period === 'afternoon'
        ? [`Good afternoon, ${name}`, `Afternoon check-in, ${name}`, `Hey ${name}, still winning the day?`]
        : period === 'evening'
          ? [`Good evening, ${name}`, `Evening, ${name} — finish strong`, `Wrap the day well, ${name}`]
          : [`Burning the midnight oil, ${name}?`, `Late night, ${name}? Stay on plan`, `Night owl mode, ${name}`];

  return [
    ...timed,
    `Ready when you are, ${name}`,
    `What's up, ${name}?`,
    `Let's get after it, ${name}`,
    `The plan awaits, ${name}`,
    `${name}, time to execute`,
    `Make it count, ${name}`,
    `No zero days, ${name}`,
    `Main character energy today, ${name}?`,
    `${name}, protein won't log itself`,
    `Hydrate then dominate, ${name}`,
    `${name}, one rep closer`,
    `Look who's consistent — hi ${name}`,
    `${name}, your future self is cheering`,
    `Trust the process, ${name}`,
    `${name}, show up like you mean it`
  ];
}

export function pickDashboardCopy(firstName?: string) {
  const name = firstName?.trim() || 'there';
  return {
    title: pickRandom(buildGreetings(name)),
    subtitle: pickRandom(TAGLINES)
  };
}

export function pickCoachHomeGreeting(firstName?: string) {
  const name = firstName?.trim() || 'there';
  const period = timeOfDay();
  const greeting =
    period === 'morning'
      ? 'Good morning'
      : period === 'afternoon'
        ? 'Good afternoon'
        : period === 'evening'
          ? 'Good evening'
          : 'Hey';
  return { greeting, name };
}
