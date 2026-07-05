export const PUBLIC_PLANS = [
  {
    id: 'starter' as const,
    name: 'Starter',
    price: 'Free',
    description: 'Get started with the basics.',
    recommended: false,
    bullets: [
      'Basic food logging',
      'Basic progress tracking',
      'Limited dashboard',
      'Meal planning preview',
      'One intro virtual coach experience',
      'Limited AI coach questions'
    ]
  },
  {
    id: 'self_guided' as const,
    name: 'Self-Guided Metabolic',
    price: '$19/month',
    description: 'The recommended path for most members.',
    recommended: true,
    bullets: [
      'Personalized calorie and macro targets',
      'Weekly nutrition plan',
      'Meal planning and reminders',
      'Full progress dashboard',
      'Weekly virtual coach check-in',
      'Basic recipe and restaurant guidance',
      'Plan adjustments over time'
    ]
  },
  {
    id: 'plus' as const,
    name: 'Metabolic Plus',
    price: '$59/month',
    description: 'Deeper insights and adaptive coaching.',
    recommended: false,
    bullets: [
      'Everything in Self-Guided',
      'Deeper weekly analysis',
      'Advanced progress reports',
      'Food pattern and habit scoring',
      '“Why am I stuck?” analysis',
      'More detailed virtual coach sessions',
      'More AI coach access',
      'Adaptive recommendations'
    ]
  }
] as const;
