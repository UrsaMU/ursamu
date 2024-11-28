import { IDBOBJ } from "./IDBObj";

export interface ITimer extends IDBOBJ {
  // When the timer should execute
  executeAt: number;
  // The script to run
  script: string;
  // Whether this timer repeats
  recurring?: boolean;
  // For recurring timers, the interval in milliseconds
  interval?: number;
  // The last time this timer was executed
  lastRun?: number;
  // Whether the timer is currently active
  active: boolean;
  // Optional data to pass to the script
  data?: any;
}
