export type ResultsReadyLinks = {
  progress: string;
  nutrition: string;
  exercise: string;
};

export function buildResultsReadyLinks(clientUrl: string): ResultsReadyLinks {
  const baseUrl = clientUrl.replace(/\/$/, '');
  return {
    progress: `${baseUrl}/progress`,
    nutrition: `${baseUrl}/nutrition`,
    exercise: `${baseUrl}/exercise`
  };
}

export function buildResultsReadySmsMessage(options: {
  clientFirstName: string;
  coachName: string;
  links: ResultsReadyLinks;
}) {
  const greeting = options.clientFirstName.trim() || 'there';
  const coachLabel = options.coachName.trim() || 'Your coach';

  return [
    `Master Metabolic: Hi ${greeting}, ${coachLabel} says your latest results are ready.`,
    `Progress: ${options.links.progress}`,
    `Nutrition: ${options.links.nutrition}`,
    `Exercise: ${options.links.exercise}`,
    'Reply STOP to opt out.'
  ].join('\n');
}
