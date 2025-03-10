export interface IMail {
  id: string;
  from: string;
  to: string[];
  message: string;
  subject: string;
  cc?: string[];
  bcc?: string[];
  date: number;
}
