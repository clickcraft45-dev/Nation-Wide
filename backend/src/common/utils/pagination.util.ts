const DEFAULT_PAGE_SIZE = 25;

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// undefined skip/take (both fields) means "no pagination requested — return everything,"
// preserving exact prior behavior for every existing caller that doesn't pass page/pageSize.
// Passing either field switches the caller into paginated mode.
export function resolvePagination(
  params: PaginationParams,
): { skip: number; take: number } | undefined {
  if (params.page === undefined && params.pageSize === undefined) {
    return undefined;
  }
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  return { skip: (page - 1) * pageSize, take: pageSize };
}
