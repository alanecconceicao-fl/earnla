export interface Project {
  id: string;
  name: string;
  hourlyRate: number;
  tracksWorkedHours: boolean;
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
  hours: number;
  hourlyRate: number;
  hoursWorked: number | null;
  date: string;
  bonusAmount: number;
  othersAmount: number;
}

export interface Tax {
  id: string;
  name: string;
  percentage: number;
  monthlyRoof: number | null;
}

export interface EarningsState {
  settings: { currency: "USD"; weekStart: number; taxesInitialized: boolean };
  projects: Project[];
  tasks: Task[];
  weeklyBonuses: Record<string, number>;
  weeklyActualPaid: Record<string, number>;
  taxes: Tax[];
  taxFreeWeeks: Record<string, boolean>;
}

export function emptyState(): EarningsState {
  return {
    settings: { currency: "USD", weekStart: 1, taxesInitialized: true },
    projects: [], tasks: [], weeklyBonuses: {}, weeklyActualPaid: {}, taxes: [], taxFreeWeeks: {},
  };
}
