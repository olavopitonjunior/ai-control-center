export type SectionId =
  | "overview"
  | "sessions"
  | "usage"
  | "limits"
  | "automations"
  | "system"
  | "insights"
  | "settings";

export interface Section {
  id: SectionId;
  label: string;
  /** One-line description of what this screen will answer, shown in its empty state. */
  purpose: string;
}

export const SECTIONS: Section[] = [
  {
    id: "overview",
    label: "Overview",
    purpose:
      "At-a-glance: which machine, is it online, active agents, closeness to limits, today's usage, system, failing automations.",
  },
  {
    id: "sessions",
    label: "Sessions",
    purpose:
      "Active, idle, and historical AI coding sessions with project, model, duration, tokens, and cost.",
  },
  {
    id: "usage",
    label: "Usage",
    purpose:
      "Tokens and cost by provider, model, agent, and project across Today / 24h / 7d / 30d.",
  },
  {
    id: "limits",
    label: "Limits",
    purpose:
      "Every quota window a provider exposes: used %, remaining %, reset time, countdown, and source quality.",
  },
  {
    id: "automations",
    label: "Automations",
    purpose:
      "Upcoming, running, failed, and historical scheduled tasks / cron / launchd jobs.",
  },
  {
    id: "system",
    label: "System",
    purpose:
      "CPU, RAM, GPU, VRAM, temperatures, disk, network, uptime, processes, and containers.",
  },
  {
    id: "insights",
    label: "Insights",
    purpose:
      "Deterministic insights: usage trends, quota velocity, projected exhaustion, peak hours.",
  },
  {
    id: "settings",
    label: "Settings",
    purpose:
      "Machines, pairing tokens, refresh intervals, Surface Mode, appearance, and data retention.",
  },
];
