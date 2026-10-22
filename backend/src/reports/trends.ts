export interface Point {
  date: string;
  value: number;
  status: string;
  rangeLow: number | null;
  rangeHigh: number | null;
  reportId: string;
}

/** How far outside the normal range a value is (0 = inside), as a fraction of the limit it crossed. */
function deviation(p: Point): number {
  if (p.rangeLow != null && p.value < p.rangeLow) return (p.rangeLow - p.value) / (p.rangeLow || 1);
  if (p.rangeHigh != null && p.value > p.rangeHigh) return (p.value - p.rangeHigh) / (p.rangeHigh || 1);
  return 0;
}

/** Compares the last two readings. Used for the "getting better / worse" label on the website. */
export function trendOf(points: Point[]) {
  if (points.length < 2) return { trend: 'new', trendBn: 'নতুন (তুলনা করার মতো আগের রিপোর্ট নেই)' };
  const prev = deviation(points[points.length - 2]);
  const last = deviation(points[points.length - 1]);
  if (prev === 0 && last === 0) return { trend: 'stable', trendBn: 'স্বাভাবিক সীমার মধ্যে আছে' };
  if (last < prev - 0.02) return { trend: 'improving', trendBn: 'আগের চেয়ে ভালোর দিকে' };
  if (last > prev + 0.02) return { trend: 'worsening', trendBn: 'আগের চেয়ে সীমা থেকে আরও দূরে' };
  return { trend: 'stable', trendBn: 'প্রায় একই আছে' };
}
