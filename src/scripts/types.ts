export interface Bill {
  bill: string;
  title: string;
  status: string;
  description: string;
  url: string;
  lastAction?: string;
  committee?: string;
}
