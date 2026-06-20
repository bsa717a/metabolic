import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DASHBOARD_TUTORIAL_STEPS, resolveTutorialStep } from './dashboardTutorialSteps';
import { TutorialCard, getTutorialCardPosition } from './TutorialCard';
import { TutorialSpotlight, getSpotlightRect, type SpotlightRect } from './TutorialSpotlight';
import { useTutorial } from './TutorialContext';

export function DashboardTutorial() {
  const location = useLocation();
  const { isActive, completeTour, skipTour, cancelTour, setCurrentStepId } = useTutorial();
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  const step = DASHBOARD_TUTORIAL_STEPS[stepIndex];
  const displayStep = resolveTutorialStep(step);

  const updateGeometry = useCallback(() => {
    if (!isActive || !step) {
      setRect(null);
      return;
    }

    if (step.isFinale || !step.target) {
      setRect(null);
      return;
    }

    const element = document.querySelector(step.target);
    if (!element) {
      setRect(null);
      return;
    }

    element.scrollIntoView({
      block: step.placement === 'side' ? 'nearest' : 'center',
      behavior: 'smooth'
    });
    window.setTimeout(() => {
      setRect(getSpotlightRect(element));
    }, 280);
  }, [isActive, step]);

  useEffect(() => {
    if (isActive && location.pathname !== '/') {
      cancelTour();
    }
  }, [isActive, location.pathname, cancelTour]);

  useEffect(() => {
    if (!isActive) {
      setStepIndex(0);
      setRect(null);
      setCurrentStepId(null);
      return;
    }
    setCurrentStepId(step?.id ?? null);
    updateGeometry();
  }, [isActive, step?.id, setCurrentStepId, updateGeometry, step]);

  useEffect(() => {
    if (!isActive) return;

    const handleResize = () => updateGeometry();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [isActive, updateGeometry]);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void skipTour();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, skipTour]);

  if (!isActive || location.pathname !== '/' || !step) {
    return null;
  }

  const cardPosition = getTutorialCardPosition(rect, step.placement ?? 'below');

  const handleNext = () => {
    if (step.isFinale) {
      void completeTour();
      return;
    }
    if (stepIndex < DASHBOARD_TUTORIAL_STEPS.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }
    void completeTour();
  };

  return (
    <>
      <TutorialSpotlight rect={step.isFinale ? null : rect} />
      <TutorialCard
        step={displayStep}
        stepIndex={stepIndex}
        position={cardPosition}
        onNext={handleNext}
        onSkip={() => void skipTour()}
        showSkip={!step.isFinale}
      />
    </>
  );
}
