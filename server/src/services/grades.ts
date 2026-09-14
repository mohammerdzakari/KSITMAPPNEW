/**
 * Katsina polytechnic style grading scheme, applied to any score a lecturer
 * records so that CGPA is always derived from stored results.
 */
export interface Grade {
  grade: string;
  points: number;
}

export function scoreToGrade(score: number): Grade {
  if (score >= 75) return { grade: 'A', points: 4 };
  if (score >= 65) return { grade: 'B', points: 3.5 };
  if (score >= 55) return { grade: 'C', points: 3 };
  if (score >= 45) return { grade: 'D', points: 2.5 };
  if (score >= 40) return { grade: 'E', points: 2 };
  return { grade: 'F', points: 0 };
}

export const GRADE_SCALE = [
  { grade: 'A', range: '75 - 100', points: 4 },
  { grade: 'B', range: '65 - 74', points: 3.5 },
  { grade: 'C', range: '55 - 64', points: 3 },
  { grade: 'D', range: '45 - 54', points: 2.5 },
  { grade: 'E', range: '40 - 44', points: 2 },
  { grade: 'F', range: '0 - 39', points: 0 },
];
