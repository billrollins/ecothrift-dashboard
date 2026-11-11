import api from './client';

/** One person's numbers for a day or for the week (Monday to the picked day). Money comes as strings. */
export interface ProcessingNumbers {
  items: number;
  dollars: string;
  /** Hours on Processing punches; null = no clock entry, so the per-hour cells are blank. */
  hours: string | null;
  /** Pace counts only days with a punch; null with no punch, or with hours and no check-ins of their own. */
  items_per_hour: string | null;
  dollars_per_hour: string | null;
  /** Checked in on a day with no punch: in the items and dollars, left out of the pace. */
  items_off_clock: number;
  average_tag: string | null;
  big_items: number;
  /** Share of their tag dollars from big items, 0 to 100. */
  big_share: number | null;
  tag_errors: number;
  /** Of those, already fixed in PR Fix-it. */
  tag_errors_fixed?: number;
  to_restoration: number;
}

export interface ProcessingDay {
  date: string;
  items: number;
  dollars: string;
  hours: string | null;
  items_per_hour: string | null;
  dollars_per_hour: string | null;
}

export interface ProcessingPerson {
  user_id: number;
  name: string;
  is_new: boolean;
  first_check_in: string | null;
  /** Hire date, only for a new person with no check-in yet. */
  hired: string | null;
  /** The owner: checks in now and then without a Processing punch, which is not a missed punch. */
  is_owner: boolean;
  /** The week one day at a time (Monday to the picked day). */
  days: ProcessingDay[];
  day: ProcessingNumbers;
  week: ProcessingNumbers;
}

export interface ProcessingPace {
  items_per_hour: string | null;
  dollars_per_hour: string | null;
  /** How many people's lines the pace rests on. With one it is no yardstick. */
  people: number;
}

export interface ProcessingWhole {
  items: number;
  /** Checked in on a day nobody was on the Processing clock: in the items, not in the pace. */
  items_off_clock?: number;
  hours: string | null;
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
  room: {
    day_dollars: string;
    week_dollars: string;
    day_average: ProcessingPace;
    week_average: ProcessingPace;
    /** Every check-in over every Processing hour. */
    day_whole: ProcessingWhole;
    week_whole: ProcessingWhole;
    /** Someone clocked hours with no check-ins of their own, so lines may hold other people's items. */
    shared_sign_in: { day: boolean; week: boolean };
    by_day: { date: string; dollars: string }[];
  };
  people: ProcessingPerson[];
}

/** The whole page in one call (Dash Update #87). */
export async function getProcessingCommandCenter(date?: string, mine = false): Promise<ProcessingCommandCenter> {
  const { data } = await api.get<ProcessingCommandCenter>('/inventory/processing-command-center/', {
    params: { ...(date ? { date } : {}), ...(mine ? { mine: 1 } : {}) },
  });
  return data;
}
