export function exercisePlanApi(clientId?: string) {
  if (!clientId) {
    return {
      routine: '/api/exercise-routine',
      templates: '/api/exercise-templates',
      plans: '/api/exercise-plans',
      createTemplate: '/api/exercise-templates',
      fromDay: '/api/exercise-templates/from-day',
      template: (id: string) => `/api/exercise-templates/${id}`,
      templateItems: (id: string) => `/api/exercise-templates/${id}/items`,
      templateReorder: (id: string) => `/api/exercise-templates/${id}/reorder`,
      templateItem: (id: string) => `/api/exercise-template-items/${id}`,
      routineDayItem: (weekday: number, templateItemId: string) =>
        `/api/exercise-routine/days/${weekday}/items/${encodeURIComponent(templateItemId)}`
    };
  }

  const base = `/api/coach/users/${encodeURIComponent(clientId)}`;
  return {
    routine: `${base}/exercise-routine`,
    templates: `/api/coach/exercise-templates?clientId=${encodeURIComponent(clientId)}`,
    plans: `/api/coach/exercise-plans?clientId=${encodeURIComponent(clientId)}`,
    createTemplate: `${base}/exercise-templates`,
    fromDay: `${base}/exercise-templates/from-day`,
    template: (id: string) => `${base}/exercise-templates/${id}`,
    templateItems: (id: string) => `${base}/exercise-templates/${id}/items`,
    templateReorder: (id: string) => `${base}/exercise-templates/${id}/reorder`,
    templateItem: (id: string) => `${base}/exercise-template-items/${id}`,
    routineDayItem: (weekday: number, templateItemId: string) =>
      `${base}/exercise-routine/days/${weekday}/items/${encodeURIComponent(templateItemId)}`
  };
}
