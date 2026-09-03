export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'COACH' | 'USER' | 'VIEWER';
export type UserStatus = 'ACTIVE' | 'INVITED' | 'DISABLED';
export type PlanSlug = 'starter' | 'self_guided' | 'plus' | 'coach_led';
export type SubscriptionStatusSlug =
  | 'free'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'coach_managed';
export type CoachRelationshipStatusSlug = 'active' | 'completed' | 'released' | 'archived';
export type AppUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  phone?: string;
  gender?: string | null;
  birthDate?: string | null;
  timezone?: string | null;
  dashboardTutorialCompletedAt?: string | null;
  smsRemindersIntroCompletedAt?: string | null;
  coachWelcomeCompletedAt?: string | null;
  selectedVirtualCoachId?: string | null;
  plan: PlanSlug;
  subscriptionStatus: SubscriptionStatusSlug;
  subscriptionStartedAt?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  gracePeriodEndsAt?: string | null;
  nextPlanAfterCoach?: PlanSlug | null;
  assignedCoach?: UserSummary | null;
  coachRequestedAt?: string | null;
  coachRelationshipStatus?: CoachRelationshipStatusSlug | null;
  storeEnabled?: boolean;
  feedbackEnabled?: boolean;
};
export type StoreProductCategory = 'SUPPLEMENT' | 'PROTEIN' | 'EQUIPMENT' | 'OTHER';
export type StoreProduct = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  category: StoreProductCategory;
  priceCents: number;
  currency: string;
};
export type StoreCartItem = {
  productId: string;
  name: string;
  imageUrl: string | null;
  priceCents: number;
  quantity: number;
  lineTotalCents: number;
};
export type StoreCart = { items: StoreCartItem[]; totalCents: number; itemCount: number };
export type StoreOrderStatus = 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELED';
export type StoreOrder = {
  id: string;
  status: StoreOrderStatus;
  totalCents: number;
  currency: string;
  paidAt: string | null;
  createdAt: string;
  items: Array<{ nameSnapshot: string; priceCentsSnapshot: number; quantity: number }>;
};
export type AdminStoreProduct = StoreProduct & {
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
export type FeedbackType = 'BUG' | 'CONFUSING' | 'IDEA';
export type FeedbackStatus = 'NEW' | 'REVIEWING' | 'PLANNED' | 'RESOLVED' | 'CLOSED' | 'DUPLICATE' | 'CANNOT_REPRODUCE';
export type FeedbackSeverity = 'BLOCKING' | 'HIGH' | 'MEDIUM' | 'LOW';
export type FeedbackListRow = {
  id: string;
  reference: string;
  type: FeedbackType;
  status: FeedbackStatus;
  blocking: boolean;
  severity: FeedbackSeverity | null;
  shortDescription: string;
  reporterName: string;
  reporterEmail: string;
  accountType: string;
  source: string;
  category: string | null;
  route: string;
  screenLabel: string | null;
  appVersion: string | null;
  createdAt: string;
  assignedTo: { id: string; name: string } | null;
  hasDiagnostics: boolean;
};
export type FeedbackListResult = {
  reports: FeedbackListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type FeedbackDetail = FeedbackListRow & {
  goal: string;
  detail: string;
  resolutionNote: string | null;
  externalRef: string | null;
  userId: string | null;
  diagnostics: Record<string, unknown> | null;
  diagnosticsPurgedAt: string | null;
  duplicateOf: { id: string; reference: string } | null;
  duplicates: Array<{ id: string; reference: string }>;
  notes: Array<{ id: string; body: string; author: string | null; createdAt: string }>;
  events: Array<{ id: string; kind: string; detail: unknown; actor: string | null; createdAt: string }>;
  similar: FeedbackListRow[];
};
export type FeedbackAssignee = { id: string; name: string };
export type AdminStoreOrder = {
  id: string;
  status: StoreOrderStatus;
  totalCents: number;
  currency: string;
  customer: { firstName: string; lastName: string; email: string };
  shippingName: string | null;
  shippingAddress: Record<string, unknown> | null;
  items: Array<{ nameSnapshot: string; priceCentsSnapshot: number; quantity: number }>;
  paidAt: string | null;
  createdAt: string;
};
export type AdminStoreOrdersPage = {
  orders: AdminStoreOrder[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type UserDemographics = { gender: string | null; birthDate: string | null };
export type UserClientProfile = UserDemographics & {
  heightFeet: number | null;
  heightInches: number | null;
  occupation: string | null;
  activityLevel: number | null;
  medicalConditions: string | null;
  exerciseRestrictions: string | null;
  foodAllergies: string | null;
  dietaryPreferences: string | null;
  clientNotes: string | null;
  canEditClientNotes: boolean;
};
export type UserAccountDetails = UserClientProfile & {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  timezone: string | null;
  smsRemindersEnabled: boolean;
  smsMealRemindersEnabled: boolean;
  smsEveningRecapEnabled: boolean;
};
export type UserSummary = Pick<AppUser, 'id' | 'firstName' | 'lastName' | 'email'>;
export type AdminUser = AppUser & {
  status: UserStatus;
  createdAt: string;
  coachCode?: string | null;
  coachRequestedAt?: string | null;
};

export type CoachSummary = UserSummary & {
  activeCoachLedLicenses?: number;
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
export type MealPrepIngredient = { name: string; totalQuantity: number; unit: string };
export type MealPrepFreshIngredient = {
  name: string;
  quantityPerServing: number;
  unit: string;
  servingCount: number;
  dates: string[];
};
export type MealPrepBatch = {
  id: string;
  label: string;
  occurrenceCount: number;
  dates: string[];
  cookNow: MealPrepIngredient[];
  addFresh: MealPrepFreshIngredient[];
  container: string;
  prepStyle: 'cook' | 'assemble';
  reheat: string | null;
  storageNote: string | null;
};
export type MealPrepPlanResult = {
  startDate: string;
  endDate: string;
  plannedDayCount: number;
  batchCount: number;
  containerCount: number;
  intro: string | null;
  enriched: boolean;
  batches: MealPrepBatch[];
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
  defaultDurationSeconds?: number | null;
  defaultDistance?: number | null;
  requiresGym?: boolean;
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
  /** Prescription scheme, e.g. "10", "15/12/10", "20/17/15". */
  reps?: string | null;
  /** Tempo/speed scheme, e.g. "1/3", "1/2", "1/1". */
  speed?: string | null;
  durationSeconds?: number | null;
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
export type ProgramMetricSnapshot = {
  id: string;
  date: string;
  values: ProgramMetricSnapshotValue[];
  sessionNotes?: string | null;
};
export type ProgressPhotoSet = {
  id: string;
  date: string;
  frontUrl: string | null;
  sideUrl: string | null;
  backUrl: string | null;
};

export type ProgressPhotoPose = 'front' | 'side' | 'back';

export type ProgressPhotoOverlayLine = {
  id: string;
  label?: string;
  points: Array<{ x: number; y: number }>;
};

export type ProgressPhotoOverlayShape =
  | { kind: 'line'; id: string; label?: string; points: Array<{ x: number; y: number }> }
  | { kind: 'oval'; id: string; label?: string; cx: number; cy: number; rx: number; ry: number };

export type ProgressPhotoAnalysis = {
  message: string;
  overlays: {
    before: { lines: ProgressPhotoOverlayLine[]; shapes?: ProgressPhotoOverlayShape[] };
    after: { lines: ProgressPhotoOverlayLine[]; shapes?: ProgressPhotoOverlayShape[] };
  };
  coachId: string;
  pose: ProgressPhotoPose;
  beforeDate: string;
  afterDate: string;
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
  gender?: string | null;
  heightMinInches?: number | null;
  heightMaxInches?: number | null;
  weightMinLbs?: number | null;
  weightMaxLbs?: number | null;
  activityLevelMin?: number | null;
  activityLevelMax?: number | null;
  criteriaComplete?: boolean;
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
  /** Prescription scheme, e.g. "10", "15/12/10", "20/17/15". */
  reps?: string | null;
  /** Tempo/speed scheme, e.g. "1/3", "1/2", "1/1". */
  speed?: string | null;
  durationSeconds?: number | null;
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
  planId?: string | null;
  dayIndex?: number | null;
  planName?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ExercisePlanTemplate = ExercisePlanTemplateSummary & {
  createdById?: string | null;
  items: ExerciseTemplateItem[];
};

export type ExercisePlanSummary = {
  id: string;
  name: string;
  description?: string | null;
  visibility: FoodVisibility;
  dayCount: number;
  days: ExercisePlanTemplateSummary[];
  createdAt: string;
  updatedAt: string;
};

export type ExerciseRoutineDayItemOverride = {
  templateItemId: string;
  sets?: number | null;
  reps?: string | null;
  speed?: string | null;
  durationSeconds?: number | null;
  distance?: number | null;
  weight?: number | null;
};

export type ExerciseRoutineDay = {
  id: string;
  weekday: number;
  templateId: string | null;
  template: ExercisePlanTemplateSummary | null;
  itemOverrides: ExerciseRoutineDayItemOverride[];
};

export type ExerciseRoutine = {
  id: string;
  programId: string;
  exercisePlanId?: string | null;
  exercisePlan?: { id: string; name: string } | null;
  days: ExerciseRoutineDay[];
};
export type DashboardDailyLog = {
  caloriesActual: number | string;
  calorieTarget: number | string;
  proteinActual: number | string;
  proteinTarget: number | string;
  carbsActual: number | string;
  carbTarget: number | string;
  fatActual: number | string;
  fatTarget: number | string;
  exercisesCompleted: number;
  exercisesPlanned: number;
};
export type Dashboard = {
  program: Program | null;
  dailyLog: DashboardDailyLog | null;
  meals: Meal[];
  allMeals?: Meal[];
  exercises: Exercise[];
  /** User's calendar day for this dashboard payload (YYYY-MM-DD). */
  date?: string;
  summary: {
    currentWeight: number;
    caloriesRemaining: number;
    proteinRemaining: number;
    nextMeal: string;
    exercisesLeft: number;
    goalProgress: number;
  } | null;
  weightTrend: { date: string; weight: number }[];
};
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
  nextCheckInId: string | null;
  nextSessionAt: string | null;
  compliancePct: number | null;
  lastActivityAt: string | null;
  needsAttention: boolean;
};
export type CoachSession = {
  id: string;
  coachId: string;
  userId: string;
  occurredAt: string;
  notes: string;
  linkedCheckInId: string | null;
  linkedSnapshotId: string | null;
  createdAt: string;
  updatedAt: string;
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

export type VirtualCoachCheckInStage =
  | 'opening'
  | 'wins'
  | 'obstacles'
  | 'data_reflection'
  | 'pattern'
  | 'focus'
  | 'commitment'
  // kickoff (first-ever check-in) stages
  | 'welcome'
  | 'why'
  | 'goals'
  | 'rhythm'
  | 'first_focus'
  | 'recap';

export type VirtualCoachCheckInKind = 'WEEKLY' | 'KICKOFF';

export type VirtualCoachCheckInMessage = {
  role: 'coach' | 'user';
  content: string;
  at: string;
};

export type VirtualCoachCheckInRecap = {
  kind?: VirtualCoachCheckInKind;
  feelingNote?: string | null;
  win?: string | null;
  pattern?: string | null;
  focus?: string | null;
  supportAction?: string | null;
  nextCheckInDate?: string | null;
  completedAt?: string | null;
};

export type PlanAdvance = {
  planPeriodId: string;
  weekNumber: number;
  effectiveDate: string;
  nutritionTemplateName: string | null;
  templateChanged: boolean;
  /** false = the kickoff confirmed the current week rather than starting a new one. */
  advanced?: boolean;
};

export type PlanPeriodInfo = {
  weekNumber: number | null;
  effectiveDate: string | null;
  endDate: string | null;
  templateName: string | null;
  calorieTarget: number | null;
  proteinTarget?: number | null;
};

export type PlanStatus = {
  state: 'on_plan' | 'coached_no_plan' | 'self_directed';
  mode: 'COACHED' | 'SELF_DIRECTED';
  calorieTarget: number | null;
  proteinTarget: number | null;
  weekNumber: number | null;
  effectiveDate: string | null;
  endDate: string | null;
  nextCheckInDate: string | null;
  planDayIndex: number | null;
};

export type NutritionMacroTargets = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type NutritionTargetFormulaBreakdownStep = {
  title: string;
  detail: string;
};

export type NutritionTargetFormulaBreakdown = {
  formulaName: 'Mifflin-St Jeor';
  profile: {
    genderLabel: string;
    heightLabel: string;
    weightLbs: number;
    ageYears: number;
    ageIsEstimated: boolean;
    activityLevel: number;
    activityLabel: string;
    activityMultiplier: number;
  };
  steps: NutritionTargetFormulaBreakdownStep[];
  result: { calories: number; protein: number; carbs: number; fat: number };
  adjustments: string[];
};

export type NutritionTargetSource = 'FORMULA' | 'OVERRIDE_BAND' | 'COACH' | 'TEMPLATE';

export type UserNutritionTargets = {
  source: NutritionTargetSource | null;
  resolvedTargets: NutritionMacroTargets | null;
  overrideTargets: NutritionMacroTargets;
  formulaBreakdown: NutritionTargetFormulaBreakdown | null;
};

export type CoachClientPlanStatus = PlanStatus & {
  nutritionTemplateName: string | null;
  exerciseTemplateName: string | null;
  targetSource: NutritionTargetSource | null;
  resolvedTargets: NutritionMacroTargets | null;
  overrideTargets: NutritionMacroTargets;
};

export type PlanProposal =
  | { eligible: false; missing: string[]; noMatch: boolean }
  | {
      eligible: true;
      calorieTarget: number;
      proteinTarget: number;
      carbTarget: number;
      fatTarget: number;
      mealsPerDay: number;
    };

export type VirtualCoachCheckInSession = {
  id: string;
  coachId: string;
  kind: VirtualCoachCheckInKind;
  weekStart: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  currentStage: VirtualCoachCheckInStage;
  transcript: VirtualCoachCheckInMessage[];
  recap: VirtualCoachCheckInRecap;
  createdAt: string;
  completedAt?: string | null;
  chips?: string[];
  done?: boolean;
  planAdvance?: PlanAdvance | null;
};

export type VirtualCoachCheckInState = {
  coachId: string | null;
  checkInDay: number;
  checkInDayLabel: string;
  isCheckInDay: boolean;
  nextCheckInDate: string;
  canStart: boolean;
  inProgressSession: VirtualCoachCheckInSession | null;
  latestRecap: VirtualCoachCheckInRecap | null;
  weekStart: string;
};

export type VirtualCoachMemoryFact = {
  id: string;
  text: string;
  source: 'web_chat' | 'check_in' | 'sms';
  createdAt: string;
  updatedAt: string;
};

export type VirtualCoachMemorySessionSummary = {
  id: string;
  source: 'web_chat' | 'check_in' | 'sms';
  summary: string;
  at: string;
};

export type VirtualCoachMemoryView = {
  motivation: string | null;
  latestCheckInFocus: string | null;
  facts: VirtualCoachMemoryFact[];
  sessionSummaries: VirtualCoachMemorySessionSummary[];
  updatedAt: string | null;
};

export type WeeklyReviewDayKind = 'no_plan' | 'future' | 'today' | 'on_plan' | 'partial' | 'over' | 'missed';

export type WeeklyReviewDay = {
  date: string;
  label: string;
  plannedMeals: number;
  onPlanMeals: number;
  modifiedMeals: number;
  missedMeals: number;
  plannedKcal: number;
  actualKcal: number;
  adherencePct: number | null;
  kind: WeeklyReviewDayKind;
};

export type WeeklyReview = {
  weekStart: string;
  weekEnd: string;
  adherencePct: number | null;
  pastPlannedMeals: number;
  pastOnPlanMeals: number;
  modifiedMeals: number;
  missedMeals: number;
  topMissedMeals: { name: string; count: number }[];
  offPlanFoods: { name: string; count: number }[];
  weakestDay: { date: string; label: string; adherencePct: number } | null;
  strongestDay: { date: string; label: string; adherencePct: number } | null;
  proteinGapGrams: number | null;
  proteinActual: number;
  proteinPlanned: number;
  carbsActual: number;
  carbsPlanned: number;
  fatActual: number;
  fatPlanned: number;
  plannedKcal: number;
  actualKcal: number;
  days: WeeklyReviewDay[];
  weightTrend: { date: string; weight: number }[];
  highlights: string[];
};
