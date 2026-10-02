import { Button } from '../ui/Button';

export function DownloadPlanPdfButton({ busy = false, onClick }: { busy?: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      data-testid="plan-pdf-button"
      aria-label="Download meal and exercise plan PDF"
      title="Download meal and exercise plan PDF"
      disabled={busy}
      onClick={onClick}
    >
      {busy ? 'Preparing PDF…' : 'Plan PDF'}
    </Button>
  );
}
