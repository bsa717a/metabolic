export function exerciseRequiresGym(item: { requiresGym?: boolean | null }): boolean {
  return Boolean(item.requiresGym);
}

export function filterExerciseCatalog<T extends { name: string; requiresGym?: boolean | null }>(
  catalog: T[],
  options: { query?: string; hideGym?: boolean } = {}
): T[] {
  const query = options.query?.trim().toLowerCase() ?? '';
  return catalog.filter((item) => {
    if (options.hideGym && exerciseRequiresGym(item)) return false;
    if (query && !item.name.toLowerCase().includes(query)) return false;
    return true;
  });
}
