export interface KimaiCustomer {
  id: number;
  name: string;
}

export interface KimaiProject {
  id: number;
  name: string;
  customer: number;
}

export interface KimaiActivity {
  id: number;
  name: string;
}

export interface KimaiTimesheetEntry {
  id: number;
  description: string;
  begin: string;
  end: string | null;
  project: number;
  activity: number;
  tags: string[]
}
