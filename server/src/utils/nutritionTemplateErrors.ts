export function nutritionTemplateApplyErrorStatus(message: string) {
  if (
    message === 'Plan does not match your profile' ||
    message === 'Complete your profile before applying a plan'
  ) {
    return 403;
  }
  return 400;
}
