export interface IEvent {
  id: string; // Subscription ID
  name: string; // Event name (e.g., "login", "timer")
  subscriber: string; // DBRef of the subscriber (e.g., "#1")
  handler: string; // Script code to execute
  context?: Record<string, unknown>; // Optional context data
}
