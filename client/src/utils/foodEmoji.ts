/**
 * Tiny food icons, derived — no stored data. Keyword rules match against the food
 * name (first hit wins, more specific rules first); the food's role is the fallback
 * tier; 🍽️ is the floor. Pure function so AI-created foods get icons automatically.
 */

type Rule = { keywords: string[]; emoji: string };

// Order matters: specific before generic (e.g. "peanut butter" before "peanut"/"butter").
const RULES: Rule[] = [
  { keywords: ['peanut butter', 'nut butter', 'pb2'], emoji: '🥜' },
  { keywords: ['greek yogurt sauce', 'yogurt sauce', 'tzatziki'], emoji: '🥣' },
  { keywords: ['sweet potato'], emoji: '🍠' },
  { keywords: ['cottage cheese'], emoji: '🥣' },
  { keywords: ['string cheese', 'cheese stick'], emoji: '🧀' },
  { keywords: ['pico de gallo', 'salsa'], emoji: '🌶️' },
  { keywords: ['hot sauce', 'sriracha', 'chili', 'jalape'], emoji: '🔥' },
  { keywords: ['protein shake', 'protein powder', 'shake', 'smoothie'], emoji: '🥤' },

  { keywords: ['chicken'], emoji: '🍗' },
  { keywords: ['turkey'], emoji: '🦃' },
  { keywords: ['beef', 'steak', 'burger'], emoji: '🥩' },
  { keywords: ['pork', 'bacon', 'ham', 'sausage', 'carnitas'], emoji: '🥓' },
  { keywords: ['salmon', 'tuna', 'fish', 'cod', 'tilapia', 'mahi'], emoji: '🐟' },
  { keywords: ['shrimp', 'prawn'], emoji: '🍤' },
  { keywords: ['egg'], emoji: '🥚' },
  { keywords: ['tofu', 'tempeh', 'edamame'], emoji: '🧊' },
  { keywords: ['deli', 'lunch meat'], emoji: '🥪' },

  { keywords: ['cracker', 'rice cake', 'pretzel', 'chip'], emoji: '🍘' },
  { keywords: ['rice'], emoji: '🍚' },
  { keywords: ['tortilla', 'wrap', 'burrito', 'taco'], emoji: '🌯' },
  { keywords: ['bread', 'toast', 'sourdough', 'bagel', 'bun', 'roll'], emoji: '🍞' },
  { keywords: ['oat', 'cereal', 'granola'], emoji: '🥣' },
  { keywords: ['pasta', 'noodle', 'spaghetti', 'ramen'], emoji: '🍝' },
  { keywords: ['potato', 'fries', 'hash brown'], emoji: '🥔' },
  { keywords: ['quinoa', 'couscous', 'barley', 'grain'], emoji: '🌾' },
  { keywords: ['pancake', 'waffle', 'kodiak'], emoji: '🥞' },
  { keywords: ['bean', 'lentil', 'chickpea', 'hummus'], emoji: '🫘' },
  { keywords: ['corn'], emoji: '🌽' },
  { keywords: ['pizza'], emoji: '🍕' },
  { keywords: ['sandwich', 'sub '], emoji: '🥪' },
  { keywords: ['soup', 'stew', 'broth'], emoji: '🍲' },
  { keywords: ['salad'], emoji: '🥗' },

  { keywords: ['broccoli'], emoji: '🥦' },
  { keywords: ['pepper', 'capsicum'], emoji: '🫑' },
  { keywords: ['spinach', 'lettuce', 'kale', 'greens', 'arugula', 'cabbage'], emoji: '🥬' },
  { keywords: ['carrot'], emoji: '🥕' },
  { keywords: ['tomato'], emoji: '🍅' },
  { keywords: ['cucumber', 'zucchini', 'pickle'], emoji: '🥒' },
  { keywords: ['onion', 'garlic', 'shallot'], emoji: '🧅' },
  { keywords: ['mushroom'], emoji: '🍄' },
  { keywords: ['green bean', 'asparagus', 'celery', 'brussels'], emoji: '🥬' },
  { keywords: ['cauliflower'], emoji: '🥦' },

  { keywords: ['banana'], emoji: '🍌' },
  { keywords: ['apple'], emoji: '🍎' },
  { keywords: ['berr', 'blueberr', 'strawberr', 'raspberr'], emoji: '🫐' },
  { keywords: ['orange', 'citrus', 'mandarin', 'clementine'], emoji: '🍊' },
  { keywords: ['grape'], emoji: '🍇' },
  { keywords: ['pineapple'], emoji: '🍍' },
  { keywords: ['melon', 'cantaloupe', 'watermelon'], emoji: '🍉' },
  { keywords: ['peach', 'nectarine', 'apricot'], emoji: '🍑' },
  { keywords: ['mango', 'papaya'], emoji: '🥭' },
  { keywords: ['lemon', 'lime'], emoji: '🍋' },
  { keywords: ['pear'], emoji: '🍐' },
  { keywords: ['cherry'], emoji: '🍒' },
  { keywords: ['kiwi'], emoji: '🥝' },
  { keywords: ['fruit'], emoji: '🍎' },

  { keywords: ['avocado', 'guacamole'], emoji: '🥑' },
  { keywords: ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'nut', 'seed'], emoji: '🥜' },
  { keywords: ['cheese'], emoji: '🧀' },
  { keywords: ['yogurt'], emoji: '🥛' },
  { keywords: ['milk', 'dairy'], emoji: '🥛' },
  { keywords: ['butter', 'oil', 'ghee'], emoji: '🧈' },
  { keywords: ['olive'], emoji: '🫒' },
  { keywords: ['coconut'], emoji: '🥥' },
  { keywords: ['chocolate', 'cacao', 'cocoa'], emoji: '🍫' },
  { keywords: ['honey', 'syrup', 'jam', 'jelly'], emoji: '🍯' },
  { keywords: ['coffee', 'espresso', 'latte'], emoji: '☕' },
  { keywords: ['tea', 'matcha'], emoji: '🍵' },
  { keywords: ['water', 'seltzer', 'sparkling'], emoji: '💧' },
  { keywords: ['herb', 'cilantro', 'basil', 'parsley', 'spice', 'seasoning'], emoji: '🌿' }
];

const ROLE_EMOJI: Record<string, string> = {
  PROTEIN: '🥩',
  CARB: '🍚',
  VEGETABLE: '🥦',
  FAT: '🥑',
  FRUIT: '🍎',
  FREE: '🌶️'
};

const DEFAULT_EMOJI = '🍽️';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Multi-word and padded keywords use substring match; stems like "berr" too; else whole-token match. */
function keywordMatches(haystack: string, keyword: string): boolean {
  if (keyword.includes(' ') || keyword.trim() !== keyword) {
    return haystack.includes(keyword);
  }
  if (keyword.endsWith('berr')) {
    return haystack.includes(keyword);
  }
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(keyword)}(?:es|s)?(?:[^a-z0-9]|$)`).test(haystack);
}

export function foodEmoji(name: string | null | undefined, role?: string | null): string {
  const haystack = (name ?? '').toLowerCase();
  if (haystack) {
    for (const rule of RULES) {
      if (rule.keywords.some((keyword) => keywordMatches(haystack, keyword))) return rule.emoji;
    }
  }
  return (role && ROLE_EMOJI[role]) || DEFAULT_EMOJI;
}
