/**
 * Citations for the nutrition formulas already shown in
 * NutritionTargetCalculationExplainer. Step titles must match
 * targetService.buildFormulaTargetBreakdown. Do not describe a different equation.
 */

export const NOT_MEDICAL_ADVICE =
  'This is not medical advice. Consult a healthcare professional before you change how you eat.';

export const SOURCES_PATH = '/nutrition/sources';

export type NutritionCitation = {
  title: string;
  url: string;
};

/** Keys are the step titles produced by the server breakdown. */
export const FORMULA_STEP_CITATIONS: Record<string, { plain: string; citation: NutritionCitation }> = {
  'Basal metabolic rate (BMR)': {
    plain:
      'This step is the simplified Mifflin–St Jeor equation: for men, 10 × weight (kg) + 6.25 × height (cm) − 5 × age + 5; for women, the same equation with − 161.',
    citation: {
      title:
        'Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr. 1990;51(2):241–247.',
      url: 'https://doi.org/10.1093/ajcn/51.2.241'
    }
  },
  'Total daily energy expenditure (TDEE)': {
    plain:
      'TDEE is BMR times a stored activity factor: 1.2, 1.375, 1.55, 1.725, or 1.9 for activity levels 1 through 5. If activity is missing, level 2 (1.375) is used.',
    citation: {
      title:
        'Mifflin-St Jeor Equation Calculator. Medscape. Lists the same activity factors: sedentary × 1.2, lightly active × 1.375, moderately active × 1.55, active × 1.725, very active × 1.9.',
      url: 'https://reference.medscape.com/calculator/846/mifflin-st-jeor-equation-calculator'
    }
  },
  'Calorie target': {
    plain:
      'The app subtracts a stored percentage from TDEE. The default is 20% (deficitPct). If that result is under the stored floor (default 1,200 kcal), the target is raised to the floor. The 20% and the floor are app settings. The NHLBI guide describes a moderate deficit of about 500 to 1,000 kcal per day for roughly 1 to 2 pounds a week. The CDC Diabetes Prevention Program guide says not to eat fewer than 1,200 kcal a day.',
    citation: {
      title:
        'National Heart, Lung, and Blood Institute. The Practical Guide: Identification, Evaluation, and Treatment of Overweight and Obesity in Adults. NIH Publication 00-4084.',
      url: 'https://www.nhlbi.nih.gov/files/docs/guidelines/prctgd_c.pdf'
    }
  },
  Protein: {
    plain:
      'Protein is body weight in pounds times a stored factor (default 0.9 g per pound, about 2.0 g per kg), then held between stored limits (default 80 g and 220 g) and at or below 45% of calories. The 0.9 g/lb factor sits at the top of the ISSN range for exercising adults. The gram limits and the 45% cap are app settings.',
    citation: {
      title:
        'Jäger R, et al. International Society of Sports Nutrition position stand: protein and exercise. J Int Soc Sports Nutr. 2017;14:20. Recommends 1.4–2.0 g protein per kg per day for most exercising people.',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/'
    }
  },
  'Carbs and fat': {
    plain:
      'Carbohydrate and fat grams use the Atwater general factors of 4 kcal per gram of carbohydrate and 9 kcal per gram of fat (protein also uses 4). Of the calories left after protein, a stored share (default 55%) goes to carbohydrate and the rest to fat. That 55/45 split is an app setting.',
    citation: {
      title:
        'USDA FoodData Central. Foundation Foods documentation. Energy is calculated with the Atwater general factors of 4, 9, and 4 kcal/g for protein, fat, and carbohydrate.',
      url: 'https://fdc.nal.usda.gov/Foundation_Foods_Documentation/'
    }
  }
};

export const CALORIE_FLOOR_CITATION: NutritionCitation = {
  title:
    'Centers for Disease Control and Prevention. National Diabetes Prevention Program. Lifestyle Coach Facilitation Guide: Core. “No one should eat fewer than 1,200 calories per day.”',
  url: 'https://stacks.cdc.gov/view/cdc/146495'
};

export type MethodologyNote = {
  title: string;
  plain: string;
  citation?: NutritionCitation;
};

export const OTHER_METHODOLOGY: MethodologyNote[] = [
  {
    title: 'Calorie floor',
    plain:
      'calorieFloor is a stored constant (default 1,200 kcal). The formula raises a lower result up to that floor. It is the same 1,200 kcal lower bound stated in the CDC Diabetes Prevention Program coach guide.',
    citation: CALORIE_FLOOR_CITATION
  },
  {
    title: 'Meal plan scaling',
    plain:
      'Each meal goal is that meal’s stored share of the daily calorie and macro targets. The default shares are breakfast 22%, snack 13%, lunch 22%, snack 13%, dinner 22%, and evening snack 8%. Slot calories are round(day calories × share ÷ total share). Macros are split the same way. This only divides the daily targets above. It is not a separate medical equation.'
  },
  {
    title: 'AI meal suggestions',
    plain:
      'Suggestions are fitted to the meal’s calorie target from that split. One is marked in range within 10% of the target and dropped when it is more than 35% away. Those bands are app rules. They do not use a different calorie equation.'
  },
  {
    title: 'Hydration',
    plain:
      'The number on the water goal is the ounces saved for you (64 oz if none is set). When the assistant estimates a typical intake, it uses an in-app rule of about 0.5 oz per pound of body weight, rounded to the nearest 8 oz, with a mentioned range of 0.5–0.67 oz per pound. Activity level 4–5 multiplies the estimate by 1.12, level 3 by 1.05, and levels 1–2 by 0.95. That half-body-weight rule is not a National Academies dietary reference, so it has no citation here.'
  },
  {
    title: 'Weight-loss pace',
    plain:
      'The app does not show a separate pounds-per-week formula. The pace is the calorie-target step: TDEE minus the stored deficit percent (default 20%).'
  },
  {
    title: 'Compliance',
    plain:
      'The coach roster’s compliance percent is the average of meals completed ÷ meals planned and exercises completed ÷ exercises planned, when those were planned. It is a logging score, not a metabolic or medical calculation.'
  },
  {
    title: 'Missing age or activity',
    plain:
      'If birth date is missing, the formula uses age 40. If activity is missing, it uses level 2, lightly active, multiplier 1.375. Both are app fallbacks.'
  }
];
