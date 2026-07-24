export interface JobTouchResult {
  number: number | null;
  completed: boolean;
  commented: boolean;
  error?: string;
}
