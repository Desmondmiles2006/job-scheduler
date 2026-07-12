import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "now";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/** Ticks down to `target` every second. Renders nothing if target is null. */
export function Countdown({ target }: { target: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return null;

  return <span className="mono">{formatRemaining(new Date(target).getTime() - now)}</span>;
}

/** "runs in Xm Ys" for a future runAt, "eligible now" once it has passed. */
export function RunAtCountdown({ runAt }: { runAt: string }) {
  const isPast = new Date(runAt).getTime() <= Date.now();
  if (isPast) {
    return <span className="row-meta">eligible now</span>;
  }
  return (
    <span className="row-meta">
      runs in <Countdown target={runAt} />
    </span>
  );
}

/** "lease expires in Xm Ys" for a claimed/running job's lockedUntil. */
export function LeaseCountdown({ lockedUntil }: { lockedUntil: string | null }) {
  if (!lockedUntil) return null;
  return (
    <span className="row-meta">
      lease expires in <Countdown target={lockedUntil} />
    </span>
  );
}
