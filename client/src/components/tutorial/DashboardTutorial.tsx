import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTutorial } from './TutorialContext';
import { TutorialPresenterVideo } from './TutorialPresenterVideo';

export function DashboardTutorial() {
  const location = useLocation();
  const { isActive, completeTour, skipTour, cancelTour } = useTutorial();

  useEffect(() => {
    if (isActive && location.pathname !== '/') {
      cancelTour();
    }
  }, [isActive, location.pathname, cancelTour]);

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

  if (!isActive || location.pathname !== '/') {
    return null;
  }

  return (
    <TutorialPresenterVideo
      onSkip={() => void skipTour()}
      onComplete={() => void completeTour()}
    />
  );
}
