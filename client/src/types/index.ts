export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'COACH' | 'USER' | 'VIEWER';
export type UserStatus = 'ACTIVE' | 'INVITED' | 'DISABLED';
export type AppUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  phone?: string;
  gender?: string | null;
  birthDate?: string | null;
};
export type UserDemographics = { gender: string | null; birthDate: string | null };
export type UserSummary = Pick<AppUser, 'id' | 'firstName' | 'lastName' | 'email'>;
export type AdminUser = AppUser & {
  status: UserStatus;
  createdAt: string;
  coachCode?: string | null;
  coachRequestedAt?: string | null;
  assignedCoach?: UserSummary | null;
};
export type Food = { id: string; name: string; servingSize: number; servingUnit: string; calories: number; protein: number; carbs: number; fat: number; brand?: string };
export type FoodSource = 'MANUAL' | 'AI' | 'IMPORTED' | 'VERIFIED';
export type FoodVisibility = 'GLOBAL' | 'USER';
export type AdminFood = Food & {
  source: FoodSource;
  visibility: FoodVisibility;
  aiGenerated: boolean;
  verified: boolean;
  createdAt: string;
  brand?: string | null;
};
export type ReviewFood = AdminFood & {
  inputText: string | null;
  confidence: number | null;
  createdBy: Pick<AppUser, 'id' | 'firstName' | 'lastName' | 'email'> | null;
};
export type MealItem = { id: string; type: 'PLANNED' | 'ACTUAL'; linkedPlannedItemId?: string | null; foodId?: string | null; nameSnapshot: string; quantity: number; unit: string; calories: number; protein: number; carbs: number; fat: number };
export type Meal = { id: string; mealNumber: number; name: string; plannedTime?: string; status: string; plannedCalories: number; plannedProtein: number; plannedCarbs: number; plannedFat: number; actualCalories: number; actualProtein: number; actualCarbs: number; actualFat: number; items: MealItem[] };
export type ShoppingListItem = { name: string; unit: string; quantity: number; occurrenceCount: number };
export type GroceryListItem = {
  id: string;
  plannedName: string;
  plannedQuantity: number;
  plannedUnit: string;
  occurrenceCount: number;
  groceryDescription: string;
  groceryCategory: string;
  storeLocation: string | null;
  notes: string | null;
};
export type GroceryListSection = { title: string; items: GroceryListItem[] };
export type ShoppingListResult = {
  startDate: string;
  endDate: string;
  plannedDayCount: number;
  itemCount: number;
  storeName: string | null;
  intro: string | null;
  enriched: boolean;
  sections: GroceryListSection[];
  note: string;
};
export type ExerciseCatalogItem = {
  id: string;
  name: string;
  category?: string | null;
  bodyPart?: string | null;
  description?: string | null;
  howToVideoUrl?: string | null;
  defaultSets?: number | null;
  defaultReps?: number | null;
  defaultDurationMinutes?: number | null;
  defaultDistance?: number | null;
};
export type AdminExercise = ExerciseCatalogItem & {
  createdAt: string;
};
export const EXERCISE_CATEGORIES = ['Strength', 'Cardio', 'Recovery'] as const;
export const EXERCISE_BODY_PARTS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Forearms',
  'Core',
  'Legs',
  'Glutes',
  'Calves',
  'Full Body'
] as const;
export type ScheduledExercise = {
  id: string;
  status: string;
  sets?: number | null;
  reps?: number | null;
  durationMinutes?: number | null;
  distance?: number | null;
  weight?: number | null;
  exercise: {
    name: string;
    category?: string | null;
    bodyPart?: string | null;
    description?: string | null;
    howToVideoUrl?: string | null;
  };
};
/** @deprecated Use ScheduledExercise — kept for dashboard compatibility */
export type Exercise = ScheduledExercise;
export type ProgramMetric = { id: string; metricType: string; startValue: number; currentValue: number; goalValue: number; unit: string };
export type ProgramMetricSnapshotValue = { metricType: string; currentValue: number; unit: string };
export type ProgramMetricSnapshot = { id: string; date: string; values: ProgramMetricSnapshotValue[] };
export type ProgressPhotoSet = {
  id: string;
  date: string;
  frontUrl: string | null;
  sideUrl: string | null;
  backUrl: string | null;
};
export type Program = { id: string; userId: string; name: string; status: string; startDate: string; targetEndDate?: string; metrics: ProgramMetric[] };
export type NutritionTemplateMealItem = {
  id: string;
  foodId?: string | null;
  nameSnapshot: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};
export type NutritionTemplateMeal = {
  id: string;
  mealNumber: number;
  name: string;
  plannedTime?: string | null;
  items: NutritionTemplateMealItem[];
};
export type NutritionPlanTemplateSummary = {
  id: string;
  name: string;
  description?: string | null;
  visibility: FoodVisibility;
  calorieTarget: number;
  proteinTarget: number;
  carbTarget: number;
  fatTarget: number;
  mealCount: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};
export type NutritionPlanTemplate = NutritionPlanTemplateSummary & {
  createdById?: string | null;
  meals: NutritionTemplateMeal[];
};
export type ExerciseTemplateItem = {
  id: string;
  exerciseId: string;
  sortOrder: number;
  sets?: number | null;
  reps?: number | null;
  durationMinutes?: number | null;
  distance?: number | null;
  weight?: number | null;
  exercise: {
    name: string;
    category?: string | null;
    bodyPart?: string | null;
    description?: string | null;
  };
};
export type ExercisePlanTemplateSummary = {
  id: string;
  name: string;
  description?: string | null;
  visibility: FoodVisibility;
  exerciseCount: number;
  createdAt: string;
  updatedAt: string;
};
export type ExercisePlanTemplate = ExercisePlanTemplateSummary & {
  createdById?: string | null;
  items: ExerciseTemplateItem[];
};
export type Dashboard = { program: Program | null; dailyLog: any; meals: Meal[]; exercises: Exercise[]; summary: { currentWeight: number; caloriesRemaining: number; proteinRemaining: number; nextMeal: string; exercisesLeft: number; goalProgress: number } | null; weightTrend: { date: string; weight: number }[] };
export type CoachClient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  textPhone?: string | null;
  status: UserStatus;
  assignedAt: string;
  activeProgram: { id: string; name: string; startDate: string; currentWeight: number | null; metricCount: number } | null;
  latestDailyLog: {
    date: string;
    mealsCompleted: number;
    mealsPlanned: number;
    exercisesCompleted: number;
    exercisesPlanned: number;
  } | null;
  latestProgressSnapshot: {
    snapshotDate: string;
    weight: number | null;
    completionStatus: string;
  } | null;
  nextCheckInAt: string | null;
};
export type ClientGroup = {
  id: string;
  name: string;
  description: string | null;
  memberIds: string[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};
export type CoachCalendarEventType =
  | 'daily_log'
  | 'exercise_plan'
  | 'metric_snapshot'
  | 'progress_snapshot'
  | 'program_start'
  | 'program_end'
  | 'check_in';
export type CoachCalendarEvent = {
  id: string;
  date: string;
  type: CoachCalendarEventType;
  userId: string;
  userName: string;
  title: string;
  detail?: string;
  checkInId?: string;
  startsAt?: string;
  durationMinutes?: number;
};
export type CoachCalendarResponse = {
  start: string;
  end: string;
  events: CoachCalendarEvent[];
};
export type CoachCheckIn = {
  id: string;
  userId: string;
  userName: string;
  startsAt: string;
  durationMinutes: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
export type BloodPanelStatus = 'low' | 'normal' | 'high' | 'unknown';
export type BloodPanelTrend = 'up' | 'down' | 'same';
export type BloodPanelMetricValue = {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  status: BloodPanelStatus | null;
  previousValue: number | null;
  trend: BloodPanelTrend | null;
  referenceRange: { low: string; normal: string; high: string } | null;
  description: string | null;
};
export type BloodPanelSummary = {
  id: string;
  labDate: string;
  labProvider: string | null;
  notes: string | null;
  enteredBy: { id: string; name: string } | null;
  metrics: BloodPanelMetricValue[];
};
export type ProgressSummaryMetric = {
  id: string;
  metricType: string;
  label: string;
  startValue: number;
  currentValue: number;
  goalValue: number;
  unit: string;
  deltaFromStart: number;
  deltaToGoal: number;
};
export type ProgressSummary = {
  generatedAt: string;
  client: { id: string; name: string; email: string };
  program: {
    id: string;
    name: string;
    status: string;
    startDate: string;
    targetEndDate: string | null;
  };
  metrics: ProgressSummaryMetric[];
  latestSnapshot: {
    id: string;
    date: string;
    values: { metricType: string; label: string; currentValue: number; unit: string }[];
  } | null;
  metricSnapshots: {
    id: string;
    date: string;
    values: { metricType: string; label: string; currentValue: number; unit: string }[];
  }[];
  progressPhotos: {
    id: string;
    date: string;
    frontUrl: string | null;
    sideUrl: string | null;
    backUrl: string | null;
    photoCount: number;
  }[];
  weightTrend: { date: string; weight: number }[];
  bodyCompositionTrend: {
    date: string;
    weight: number | null;
    bodyFat: number | null;
    waist: number | null;
  }[];
  bloodPanels: BloodPanelSummary[];
};
