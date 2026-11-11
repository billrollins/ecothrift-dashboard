import api from './client';

/** One person's numbers for a day or for the week (Monday to the picked day). Money comes as strings. */
export interface ProcessingNumbers {
  items: number;
  dollars: string;
  /** Hours on Processing punches; null = no clock entry, so the per-hour cells are blank. */
  hours: string | null;
  items_per_hour: string | null;
  dollars_per_hour: string | null;
  average_tag: string | null;
  big_items: number;
  /** Share of their tag dollars from big items, 0 to 100. */
  big_share: number | null;
  tag_errors: number;
  to_restoration: number;
}

export interface ProcessingPerson {
  user_id: number;
  name: string;
  is_new: boolean;
  first_check_in: string | null;
  day: ProcessingNumbers;
  week: ProcessingNumbers;
}

export interface ProcessingPace {
  items_per_hour: string | null;
  dollars_per_hour: string | null;
}

export interface ProcessingCommandCenter {
  date: string;
  today: string;
  week_start: string;
  /** Leads and the owner see every processor; anyone else gets their own line. */
  can_see_everyone: boolean;
  me: number;
  big_item_price: string;
  new_hire_days: number;
  goal: { week: string | null; day: string | null; work_days: number[] };
  room: { day_dollars: string; week_dollars: string; day_average: ProcessingPace; week_average: ProcessingPace };
  people: ProcessingPerson[];
}

/** The whole page in one call (Dash Update #87). */
export async function getProcessingCommandCenter(date?: string, mine = false): Promise<ProcessingCommandCenter> {
  const { data } = await api.get<ProcessingCommandCenter>('/inventory/processing-command-center/', {
    params: { ...(date ? { date } : {}), ...(mine ? { mine: 1 } : {}) },
  });
  return data;
}
