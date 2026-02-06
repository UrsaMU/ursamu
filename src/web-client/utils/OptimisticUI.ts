import { useState, useCallback } from "preact/hooks";

/**
 * Hook to manage optimistic UI state.
 * @param onAction The actual action to perform (e.g., socket.send).
 */
export function useOptimisticUI(onAction: (action: string) => void) {
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());

  const executeAction = useCallback((action: string, isOptimistic = false) => {
    if (isOptimistic) {
      setPendingActions((prev) => new Set(prev).add(action));
      // In a real app, we'd clear this when the server confirms.
      // For now, we'll clear it after a short timeout to simulate confirmation.
      setTimeout(() => {
        setPendingActions((prev) => {
          const next = new Set(prev);
          next.delete(action);
          return next;
        });
      }, 1000);
    }
    
    onAction(action);
  }, [onAction]);

  return { executeAction, pendingActions };
}
