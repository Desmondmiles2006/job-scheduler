interface StatusPillProps {
  label: string;
  variant: "active" | "paused" | "running" | "neutral" | "scheduled" | "danger";
}

export function StatusPill({ label, variant }: StatusPillProps) {
  const variantClass: Record<StatusPillProps["variant"], string> = {
    active: "pill-active",
    paused: "pill-paused",
    running: "pill-active pill-running",
    neutral: "",
    scheduled: "pill-scheduled",
    danger: "pill-danger",
  };

  return (
    <span className={["pill", variantClass[variant]].filter(Boolean).join(" ")}>
      <span className="pill-dot" />
      {label}
    </span>
  );
}

const JOB_STATUS_MAP: Record<string, StatusPillProps["variant"]> = {
  QUEUED: "neutral",
  SCHEDULED: "scheduled",
  CLAIMED: "running",
  RUNNING: "running",
  COMPLETED: "active",
  FAILED: "danger",
  DEAD_LETTER: "danger",
  CANCELLED: "neutral",
};

export function jobStatusVariant(status: string): StatusPillProps["variant"] {
  return JOB_STATUS_MAP[status] ?? "neutral";
}

export function JobStatusPill({ status }: { status: string }) {
  return <StatusPill label={status.toLowerCase().replace("_", " ")} variant={jobStatusVariant(status)} />;
}
