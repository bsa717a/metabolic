export function joinClientUrl(base: string, path: string) {
  const root = base.replace(/\/$/, '');
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${root}${normalized}`;
}
