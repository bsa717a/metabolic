import type { NutritionCitation } from '../../content/nutritionSources';

/**
 * External citation. target=_blank asks the iOS WKWebView to hand the URL to
 * the system browser (Capacitor's createWebViewWith handler) instead of
 * navigating the app webview. No native plugin is required.
 */
export function CitationLink({ citation }: { citation: NutritionCitation }) {
  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-block font-medium text-brand-green underline underline-offset-2 hover:opacity-80"
    >
      {citation.title}
    </a>
  );
}
