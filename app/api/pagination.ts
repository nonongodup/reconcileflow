export function paginate<T>(items: T[], page: number, pageSize: number) {
  const safePage = Math.max(1, page), safeSize = Math.min(100, Math.max(1, pageSize));
  const start = (safePage - 1) * safeSize;
  return { items: items.slice(start, start + safeSize), page: safePage, pageSize: safeSize, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / safeSize)) };
}
