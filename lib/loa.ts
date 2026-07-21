// Leave of absence — derive current / upcoming / past from the dates against today
// (UTC, day granularity). Dates are 'YYYY-MM-DD' strings, which compare lexicographically.
export function loaState(start: string, end: string): "current" | "upcoming" | "past" {
  const today = new Date().toISOString().slice(0, 10);
  if (end < today) return "past";
  if (start > today) return "upcoming";
  return "current";
}
