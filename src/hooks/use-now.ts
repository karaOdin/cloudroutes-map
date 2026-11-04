import { useEffect, useState } from "react";

/**
 * A clock that re-renders the caller on an interval.
 *
 * Needed because a vehicle's freshness decays with wall time, not with data:
 * without this a bus fetched while moving would read "live" forever until the
 * next refetch, which is exactly the stale-marker problem.
 */
export function useNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);

    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
