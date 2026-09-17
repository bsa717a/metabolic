import { AI_FEATURES_DISABLED_COPY } from '../../content/aiConsentCopy';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export function AiDisabledNotice({
  onReview,
  className
}: {
  onReview?: () => void;
  className?: string;
}) {
  return (
    <Card className={className ?? 'border-brand-gold/30 bg-brand-gold/5 p-5'}>
      <h3 className="text-base font-bold text-app-text">AI features are off</h3>
      <p className="mt-2 text-sm text-app-text-muted">{AI_FEATURES_DISABLED_COPY}</p>
      {onReview ? (
        <div className="mt-4">
          <Button type="button" onClick={onReview}>
            Review AI permission
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
