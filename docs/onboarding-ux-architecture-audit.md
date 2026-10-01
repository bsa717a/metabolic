# MetabolicOS Onboarding UX & Architecture Audit

**Date:** September 2026  
**Scope:** First-run experience, user onboarding, coach workflows, architecture blockers for scale  
**Objective:** Identify what prevents Derek from successfully onboarding real people onto MetabolicOS

---

## A. Executive Summary

MetabolicOS is a well-architected coaching/nutrition/exercise platform with a solid foundation: Prisma-backed PostgreSQL, Firebase Auth, React SPA with thoughtful component organization, and multi-channel engagement (web, SMS/MMS, push notifications). The onboarding flow features a clever virtual coach-led chat that collects user data conversationally.

**However, several gaps will cause friction or outright failure when onboarding real users:**

1. **No email verification** — Users can sign up with any email address. This creates risk for account recovery, coach communications, and data integrity.

2. **Coach-client linking is fragile** — Coach codes are manually typed strings with no invite flow, no confirmation, and no way for clients to discover their coach.

3. **Post-onboarding disorientation** — After the virtual coach chat, users land on the dashboard with no clear "what to do first" guidance beyond an optional tutorial.

4. **Missing error recovery paths** — Network failures during onboarding, email delivery issues, and SMS opt-in failures have no graceful degradation.

5. **Timezone requirement without fallback** — Onboarding blocks on timezone, but the flow doesn't clearly explain why or provide a default.

The product's core loops (meal planning, food logging, exercise tracking) are functional, but the **critical path from signup → first meaningful action** needs hardening.

**Recommended immediate priority:** Fix email verification and coach invite flow before scaling.

---

## B. Onboarding Blockers (Ranked P0/P1/P2)

### P0 — Critical: Will Cause User Loss or Data Issues

#### B.1 No Email Verification

| Aspect | Detail |
|--------|--------|
| **What breaks** | Users can sign up with any email, including typos or emails they don't control |
| **Who it hits** | All users; coach communications fail silently |
| **Evidence** | `client/src/services/auth.ts:20-27` — `createUserWithEmailAndPassword` with no verification step; `server/src/auth/resolveAppUser.ts:110-120` — user created immediately on first auth |
| **User symptom** | Coach emails never arrive; password reset impossible; potential duplicate accounts |
| **Fix** | Enable Firebase email verification; block app access until verified; add resend verification UI |
| **Effort** | **S** (Small) — Firebase has built-in support |

#### B.2 Coach-Client Linking Has No Invite Flow

| Aspect | Detail |
|--------|--------|
| **What breaks** | Clients must know and correctly type a coach code to link; no invite links, no confirmation |
| **Who it hits** | All coached users; coaches trying to onboard clients |
| **Evidence** | `client/src/components/onboarding/OnboardingFields.tsx:289-316` — free-text coach code input; `server/src/services/coachSupportService.ts` — `findCoachByCode` silently fails on mismatch |
| **User symptom** | Client thinks they're linked to a coach but aren't; coach doesn't see client |
| **Fix** | Create shareable invite links (`/join?coach=ABC123`); show confirmation ("You're connecting with Coach Name"); require coach acceptance |
| **Effort** | **M** (Medium) — New endpoint + UI changes |

#### B.3 Onboarding Requires Timezone But Doesn't Explain Why

| Aspect | Detail |
|--------|--------|
| **What breaks** | Onboarding cannot complete without timezone; error is generic |
| **Who it hits** | Users who skip or don't understand the timezone field |
| **Evidence** | `server/src/services/onboardingService.ts:253-256` — throws "A timezone is required to finish setup" |
| **User symptom** | Setup fails with unclear error; user abandons |
| **Fix** | Auto-detect timezone (already done in `detectedTimezone()`); pre-fill field; explain why it matters (meal reminders) |
| **Effort** | **S** |

---

### P1 — High: Will Cause Significant Friction

#### B.4 Post-Onboarding Disorientation

| Aspect | Detail |
|--------|--------|
| **What breaks** | After virtual coach chat completes, user lands on dashboard with no clear next step |
| **Who it hits** | All new users |
| **Evidence** | `client/src/components/onboarding/NewUserOnboardingFlow.tsx:76-85` — navigates to `/` with optional `showCoachWelcome`; `client/src/pages/DashboardPage.tsx:206-220` — empty state exists but only for no-program case |
| **User symptom** | "What do I do now?"; high bounce risk in first 5 minutes |
| **Fix** | Add first-session success checklist ("Log your first meal", "Set water goal", "Review today's workout"); highlight one primary CTA |
| **Effort** | **M** |

#### B.5 Welcome Email Can Fail Silently

| Aspect | Detail |
|--------|--------|
| **What breaks** | Welcome email failure is caught and logged but doesn't retry or notify |
| **Who it hits** | Users whose ISP blocks Resend; misconfigured email |
| **Evidence** | `server/src/auth/resolveAppUser.ts:14-19` — `try/catch` swallows error |
| **User symptom** | No welcome email; user thinks signup failed |
| **Fix** | Queue emails with retry; add "Resend welcome email" in account settings; monitor delivery rate |
| **Effort** | **M** |

#### B.6 No Progress Indicator in Onboarding Chat

| Aspect | Detail |
|--------|--------|
| **What breaks** | Users don't know how many questions remain in virtual coach chat |
| **Who it hits** | All users during onboarding |
| **Evidence** | `client/src/components/onboarding/coachOnboardingFlow.ts` — stages defined but no progress exposed to UI |
| **User symptom** | "Is this almost done?"; abandonment mid-flow |
| **Fix** | Add step indicator (e.g., "Step 3 of 7") or progress bar |
| **Effort** | **S** |

#### B.7 SMS Opt-In Is Buried and Unclear

| Aspect | Detail |
|--------|--------|
| **What breaks** | SMS reminders require opt-in but the flow is separate from onboarding |
| **Who it hits** | Users who want text reminders but don't find the setting |
| **Evidence** | `client/src/pages/SmsOptInPage.tsx` — standalone page; `client/src/components/sms/SmsRemindersIntroModal.tsx` — appears after dashboard load, easily dismissed |
| **User symptom** | Never receives SMS reminders; lower engagement |
| **Fix** | Include SMS opt-in as explicit step in onboarding chat; confirm phone number with verification code |
| **Effort** | **M** |

---

### P2 — Medium: Will Cause Minor Friction or Edge Case Issues

#### B.8 Tutorial Skipping Loses Context

| Aspect | Detail |
|--------|--------|
| **What breaks** | Dashboard tutorial auto-starts but can be dismissed; no way to restart |
| **Who it hits** | Users who skip tutorial, then want guidance |
| **Evidence** | `client/src/components/tutorial/TutorialContext.tsx` — `hasAutoStarted` prevents re-trigger; no "Restart tutorial" UI found |
| **User symptom** | "How do I use this?"; support requests |
| **Fix** | Add "Restart tutorial" in help menu or settings |
| **Effort** | **S** |

#### B.9 Virtual Coach Selection Has No Preview

| Aspect | Detail |
|--------|--------|
| **What breaks** | Users pick a coach based on avatar and brief description; no sample conversation |
| **Who it hits** | Users uncertain about coach fit |
| **Evidence** | `client/src/components/onboarding/OnboardingCoachPicker.tsx` — shows name/vibe/image only |
| **User symptom** | Regret after selection; coach switching not obvious |
| **Fix** | Add "Preview a conversation" modal; make coach switching more prominent |
| **Effort** | **S** |

#### B.10 Imported/Seed Users Can Collide with Real Signups

| Aspect | Detail |
|--------|--------|
| **What breaks** | Placeholder Firebase UIDs (`seed-*`, `legacy-*`) get claimed on first real login by email match |
| **Who it hits** | Users whose email was pre-seeded for demo |
| **Evidence** | `server/src/auth/resolveAppUser.ts:39-82` — `claimImportedAccountByEmail` and `absorbEmptyFirebaseUidHolder` |
| **User symptom** | Unexpected pre-filled data or merge conflicts |
| **Fix** | Clear documentation for coaches; add migration cleanup script; consider separate demo environment |
| **Effort** | **S** |

#### B.11 Body Fat Field Has No Visual Estimate Aid

| Aspect | Detail |
|--------|--------|
| **What breaks** | Users asked for body fat percentage with only a help tooltip |
| **Who it hits** | Users who don't know their body fat |
| **Evidence** | `client/src/components/onboarding/OnboardingFields.tsx:119-146` — help text mentions calipers/calculator |
| **User symptom** | Guesses wildly or skips; inaccurate targets |
| **Fix** | Add visual body fat reference chart or link to online estimator |
| **Effort** | **S** |

---

## C. UX Recommendations (Expert)

### C.1 First-Session Success Path

**Current state:** User completes onboarding chat → lands on dashboard → sees data but no call-to-action.

**Recommended flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│  ONBOARDING CHAT COMPLETE                                       │
│  ↓                                                              │
│  "Your First Day" checklist modal (auto-dismiss after 3 items): │
│  ☐ Review today's meal plan                                     │
│  ☐ Log your first meal (or mark as eaten)                       │
│  ☐ Check today's workout                                        │
│  ☐ Tap the water bottle to log hydration                        │
│  ↓                                                              │
│  Dashboard with highlighted first action (pulsing border/badge) │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:** Add `firstDayChecklistShown` to `AppUser`; render `FirstDayChecklist` component in `AppShell` after `SmsRemindersIntroModal`.

### C.2 Empty States

**Files reviewed:**
- `client/src/components/dashboard/TodayNutrition.tsx`
- `client/src/components/dashboard/TodayExercise.tsx`
- `client/src/pages/NutritionPage.tsx`

**Gaps:**
- Empty meal list shows generic message; should show "Build your first meal" CTA
- Empty exercise list doesn't explain rest days vs. uninitialized plans
- Weight trend chart with no data could prompt "Log your first weight"

**Recommendation:** Audit all empty states; ensure each has:
1. Friendly explanation of why it's empty
2. Single primary action to fix it
3. Link to help/tutorial if relevant

### C.3 Progressive Disclosure

**Problem:** Settings and advanced features are discoverable only through exploration.

**Recommendation:**
- Phase 1 (Day 1-7): Show only essential features (log meals, track weight, basic workout)
- Phase 2 (Day 8+): Unlock "Level Up" gamification, guided journey
- Phase 3 (Week 3+): Surface advanced features (macros, meal prep, shopping list)

This is partially implemented via the Level system but not enforced in navigation.

### C.4 Copy & Tone

**Strengths:** Tutorial copy is excellent ("Your metabolism called. It has notes." — engaging, on-brand).

**Gaps:**
- Error messages are technical ("A timezone is required to finish setup")
- Onboarding chat is coach-persona-aware but some prompts feel generic

**Recommendation:** Create copy style guide; audit all error messages for tone consistency.

### C.5 Trust & Credibility

**Missing elements:**
- No testimonials or social proof on login/pricing pages
- No explanation of data privacy (where is my data stored?)
- No "Powered by [credentials]" for AI features

**Recommendation:** Add footer trust badges; privacy summary in onboarding; "How AI works" explainer.

### C.6 Coach Workflow

**Current state:** Coaches find clients via the Coach page (`/coach`); clients are listed if `CoachAssignment` exists.

**Gaps:**
- No dashboard for coaches showing "pending client requests"
- No notification when a new client links via coach code
- No batch actions (email all clients, schedule group check-ins)

**Recommendation for MVP:**
1. Add "Pending invites" section to Coach page
2. Push notification / email when client links
3. Quick "Send welcome message" button per client

---

## D. Software Architecture Recommendations

### D.1 Authentication & Session

**Current:** Firebase Auth with ID token passed to API; no refresh token handling in client.

**Risks:**
- Token expiration during long sessions causes silent failures
- No session invalidation on password change

**Recommendation:**
- Add token refresh listener in `client/src/services/auth.ts`
- Implement server-side session tracking for sensitive operations (role changes)

### D.2 Email Reliability

**Current:** Resend API with synchronous send in request path.

**Risks:**
- Transient Resend failures block signup (partially mitigated by catch)
- No delivery tracking or bounce handling
- No retry queue

**Recommendation:**
- Implement async email queue (BullMQ or similar)
- Add Resend webhook for bounce/complaint handling
- Store email events in `CommunicationRecipient.status`

### D.3 Observability for Onboarding Funnel

**Current:** Logging to console; no structured analytics.

**Missing:**
- Signup → onboarding start → completion funnel
- Drop-off points in onboarding chat
- Time-to-first-action metrics

**Recommendation:**
- Add event tracking (`analytics.track('onboarding_step', { step, coachId })`)
- Create dashboard in Mixpanel/Amplitude or simple Postgres events table
- Key metrics: signup rate, onboarding completion rate, 7-day retention

### D.4 Data Model Gaps

**Observations:**
- `User.status` has `INVITED` but no invite flow uses it
- `CoachAssignment.status` is managed but no lifecycle hooks
- `PlanTier` and `SubscriptionStatus` exist but Stripe integration is minimal

**Recommendation:**
- Implement invite flow using `INVITED` status
- Add `CoachAssignment` lifecycle events (invited, accepted, completed)
- Complete Stripe subscription webhooks before monetization

### D.5 Feature Flags / Environment Config

**Current:** `server/src/config/env.ts` uses Zod schema with defaults; `BETA_SIGNUP_PLAN` controls tier.

**Gaps:**
- No runtime feature flags (requires redeploy to change)
- No per-user feature toggles

**Recommendation:**
- Add `AppSetting` table entries for feature flags
- Create `useFeatureFlag('guided_journey_enabled')` hook
- Consider LaunchDarkly or Flagsmith for scale

### D.6 Deploy & Scale Risks

**Current:** Cloud Run + Cloud SQL; migrations run on startup.

**Risks:**
- Startup migration on every deploy can cause downtime
- No connection pooling evident (PgBouncer)
- No rate limiting on public endpoints (`/sms/webhook`)

**Recommendation:**
- Separate migration CI step (already in `run-cloud-migrations.sh`, ensure it runs)
- Add PgBouncer or use Cloud SQL connection pooling
- Implement rate limiting middleware for webhooks

---

## E. Suggested 2-Week Hardening Plan

### Week 1: Critical Path

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| 1-2 | Enable Firebase email verification | `client/src/services/auth.ts`, new `VerifyEmailPage.tsx` | Signup requires verified email; resend link works |
| 2-3 | Pre-fill timezone from browser | `client/src/components/onboarding/setupForm.ts` | Timezone auto-filled; clear label explains purpose |
| 3-4 | Add progress indicator to onboarding chat | `client/src/components/onboarding/CoachOnboardingChat.tsx`, `coachOnboardingFlow.ts` | "Step X of Y" visible throughout |
| 4-5 | Create coach invite links | `server/src/routes/coachRoutes.ts`, new `JoinCoachPage.tsx` | `/join?coach=ABC` shows coach name, confirms link |
| 5 | Add "What to do first" post-onboarding | `client/src/components/onboarding/FirstDayChecklist.tsx` | Modal appears after setup; links to first actions |

### Week 2: Hardening & Observability

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| 1-2 | Audit and improve empty states | `TodayNutrition.tsx`, `TodayExercise.tsx`, etc. | Each empty state has CTA and explanation |
| 2-3 | Add onboarding funnel analytics | New `client/src/services/analytics.ts` | Events tracked for each onboarding step |
| 3-4 | Implement email queue with retry | `server/src/services/emailQueue.ts` | Welcome email retried 3x on failure |
| 4-5 | Add "Restart tutorial" option | `client/src/components/layout/Topbar.tsx` | Help menu includes tutorial restart |
| 5 | Coach notification on client link | `server/src/services/coachSupportService.ts` | Coach receives email/push when client joins |

---

## F. What Is Already Strong

1. **Component architecture** — Well-organized React components with clear separation (`components/`, `pages/`, `services/`). Easy to navigate and extend.

2. **Virtual coach onboarding** — The conversational onboarding via coach personas is creative and engaging. The coach flow state machine (`coachOnboardingFlow.ts`) is well-designed.

3. **Tutorial system** — The dashboard tutorial with personality-driven copy is excellent. The step-based approach with data attributes (`data-tour`) is maintainable.

4. **Multi-channel engagement** — SMS/MMS via Twilio, push notifications, and email are all integrated. The reminder system (`smsReminderService.ts`) is thoughtful.

5. **Gamification foundation** — Levels, badges, streaks, and the Guided Journey provide engagement hooks. The data model supports this well.

6. **Feedback widget** — Built-in bug/idea reporting with diagnostics collection. This will be valuable for iterating with real users.

7. **Role-based access** — Clear `Role` enum with proper guards in both client (`isCoachRole`, `isAdminRole`) and server (`requireAuth`).

8. **Type safety** — Consistent use of TypeScript and Zod validation. Prisma provides type-safe database access.

9. **Conventional Commits + Release Please** — Automated changelog and versioning is in place. Good CI hygiene.

10. **Responsive design** — Mobile-first with dedicated `MobileBottomNav`, wake lock for meal logging, and PWA support for home screen install.

---

## Appendix: Files Referenced

| Area | Key Files |
|------|-----------|
| Auth | `client/src/services/auth.ts`, `server/src/auth/requireAuth.ts`, `server/src/auth/resolveAppUser.ts` |
| Onboarding | `client/src/pages/FirstTimeSetupPage.tsx`, `client/src/components/onboarding/*.tsx`, `server/src/services/onboardingService.ts`, `server/src/routes/onboardingRoutes.ts` |
| Coach | `client/src/pages/CoachPage.tsx`, `server/src/routes/coachRoutes.ts`, `server/src/services/coachService.ts` |
| Email | `server/src/services/emailService.ts`, `server/src/services/emailTransport.ts` |
| Data Model | `server/prisma/schema.prisma` |
| Config | `server/src/config/env.ts`, `client/.env.example` |
| Tutorial | `client/src/components/tutorial/*` |
| Feedback | `client/src/components/feedback/FeedbackWidget.tsx` |

---

*This audit is based on codebase review as of v0.20.0. Test with real users in a staging environment before implementing changes.*
