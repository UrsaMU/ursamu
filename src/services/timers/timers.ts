import { ITimer } from "../../@types/ITimer";
import { dbojs } from "../Database/database";
import { force } from "../commands/force";
import { IContext } from "../../@types/IContext";

class TimerService {
  private timers: Map<number, NodeJS.Timeout>;
  private checkInterval: NodeJS.Timeout;

  constructor() {
    this.timers = new Map();
    
    // Check for due timers every minute
    this.checkInterval = setInterval(() => this.checkTimers(), 60000);
    
    // Initial load of timers
    this.loadTimers();
  }

  private async loadTimers() {
    const timers = await dbojs.find({ active: true }) as ITimer[];
    for (const timer of timers) {
      this.scheduleTimer(timer);
    }
  }

  private scheduleTimer(timer: ITimer) {
    const now = Date.now();
    const delay = timer.executeAt - now;

    if (delay <= 0) {
      // Timer is due, execute immediately
      this.executeTimer(timer);
      return;
    }

    const timeoutId = setTimeout(() => this.executeTimer(timer), delay);
    this.timers.set(timer.id, timeoutId);
  }

  private async executeTimer(timer: ITimer) {
    try {
      // Get the player who created the timer
      const player = await dbojs.findOne({ id: timer.data?.dbref });
      if (!player) {
        console.error(`Timer ${timer.id} - Creator (dbref #${timer.data?.dbref}) not found`);
        return;
      }

      // Create a context for the command execution
      const ctx: IContext = {
        socket: { cid: player.id } as any,
        msg: timer.script,
        data: timer.data
      };

      // Execute the timer's script using force
      await force(ctx, timer.script);

      if (timer.recurring && timer.interval) {
        // Update timer for next execution
        timer.lastRun = Date.now();
        timer.executeAt = Date.now() + timer.interval;
        await dbojs.update({ id: timer.id }, timer);
        this.scheduleTimer(timer);
      } else {
        // One-time timer completed, mark as inactive
        timer.active = false;
        await dbojs.update({ id: timer.id }, timer);
      }
    } catch (error) {
      console.error(`Error executing timer ${timer.id}:`, error);
    }
  }

  private async checkTimers() {
    const now = Date.now();
    const dueTimers = await dbojs.find({
      active: true,
      executeAt: { $lte: now }
    }) as ITimer[];

    for (const timer of dueTimers) {
      this.executeTimer(timer);
    }
  }

  async createTimer(script: string, executeAt: number, dbref: number, options: {
    recurring?: boolean;
    interval?: number;
    data?: any;
  } = {}) {
    // Get the next available ID
    const count = await dbojs.count({});
    const id = count + 1;

    const timer: ITimer = {
      id,
      script,
      executeAt,
      recurring: options.recurring || false,
      interval: options.interval,
      active: true,
      data: {
        ...options.data,
        dbref // Store who created the timer
      },
      flags: ''
    };

    await dbojs.insert(timer);
    this.scheduleTimer(timer);
    return timer;
  }

  async cancelTimer(id: number) {
    const timeoutId = this.timers.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timers.delete(id);
    }

    await dbojs.update({ id }, { active: false });
  }

  async getTimer(id: number) {
    return await dbojs.findOne({ id }) as ITimer | null;
  }

  async listActiveTimers() {
    return await dbojs.find({ active: true }) as ITimer[];
  }

  shutdown() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    for (const timeoutId of this.timers.values()) {
      clearTimeout(timeoutId);
    }
    
    this.timers.clear();
  }
}

export const timers = new TimerService();
