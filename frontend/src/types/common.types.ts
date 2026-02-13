/**
 * Generic paginated response from DRF-style API endpoints.
 */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
