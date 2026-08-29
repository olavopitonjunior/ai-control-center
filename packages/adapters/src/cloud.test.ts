import { describe, expect, it } from "vitest";
import {
  normalizeGithubActions,
  normalizeN8n,
  normalizeSupabaseCron,
  normalizeVercelCrons,
} from "./index";

describe("normalizeGithubActions", () => {
  // Shapes from the GitHub Actions REST API.
  const workflows = [
    { id: 1, name: "CI", path: ".github/workflows/ci.yml", state: "active" },
    {
      id: 2,
      name: "Nightly",
      path: ".github/workflows/nightly.yml",
      state: "active",
    },
    {
      id: 3,
      name: "Old",
      path: ".github/workflows/old.yml",
      state: "disabled_manually",
    },
  ];
  const runs = [
    {
      id: 100,
      workflow_id: 1,
      status: "completed",
      conclusion: "success",
      event: "push",
      created_at: "2026-08-28T10:00:00Z",
      run_started_at: "2026-08-28T10:00:05Z",
    },
    {
      id: 101,
      workflow_id: 2,
      status: "completed",
      conclusion: "failure",
      event: "schedule",
      created_at: "2026-08-28T02:00:00Z",
    },
    {
      id: 99,
      workflow_id: 1,
      status: "completed",
      conclusion: "failure",
      event: "push",
      created_at: "2026-08-27T10:00:00Z",
    },
  ];
  const tasks = normalizeGithubActions(
    "olavo/rankd",
    workflows,
    runs,
    "olavo-pc",
  );

  it("maps workflows to tasks with the latest run's result", () => {
    const ci = tasks.find((t) => t.name.includes("CI"))!;
    expect(ci.source).toBe("github-actions");
    expect(ci.status).toBe("SCHEDULED"); // latest run succeeded
    expect(ci.lastResult).toBe("success");
    expect(ci.lastRunAt).toBe("2026-08-28T10:00:05Z"); // newest, not the older failure
  });

  it("flags a failed workflow as ERROR and a disabled one as DISABLED", () => {
    expect(tasks.find((t) => t.name.includes("Nightly"))!.status).toBe("ERROR");
    const old = tasks.find((t) => t.name.includes("Old"))!;
    expect(old.status).toBe("DISABLED");
    expect(old.enabled).toBe(false);
  });

  it("does not fake cron/next-run (not in the workflows API)", () => {
    for (const t of tasks) {
      expect(t.schedule).toBeNull();
      expect(t.nextRunAt).toBeNull();
    }
  });
});

describe("normalizeN8n", () => {
  const workflows = [
    { id: "wf1", name: "Lead Enrichment", active: true },
    { id: "wf2", name: "Disabled Flow", active: false },
  ];
  const executions = [
    {
      id: "e1",
      workflowId: "wf1",
      status: "error",
      startedAt: "2026-08-28T09:00:00Z",
      stoppedAt: "2026-08-28T09:01:00Z",
    },
    {
      id: "e2",
      workflowId: "wf1",
      status: "success",
      startedAt: "2026-08-28T08:00:00Z",
      stoppedAt: "2026-08-28T08:01:00Z",
    },
  ];
  const tasks = normalizeN8n(workflows, executions, "mac");

  it("uses the latest execution and maps status", () => {
    const lead = tasks.find((t) => t.name === "Lead Enrichment")!;
    expect(lead.source).toBe("n8n");
    expect(lead.status).toBe("ERROR"); // latest execution errored
    expect(lead.lastRunAt).toBe("2026-08-28T09:01:00Z");
  });

  it("marks inactive workflows DISABLED", () => {
    expect(tasks.find((t) => t.name === "Disabled Flow")!.status).toBe(
      "DISABLED",
    );
  });

  it("falls back to finished boolean when status is absent", () => {
    const t = normalizeN8n(
      [{ id: "w", name: "Old n8n", active: true }],
      [
        {
          id: "x",
          workflowId: "w",
          finished: true,
          startedAt: "2026-08-28T00:00:00Z",
        },
      ],
      "mac",
    );
    expect(t[0]!.status).toBe("SCHEDULED");
    expect(t[0]!.lastResult).toBe("success");
  });
});

describe("normalizeSupabaseCron", () => {
  it("includes the pg_cron schedule and latest run status", () => {
    const jobs = [
      {
        jobid: 7,
        schedule: "*/5 * * * *",
        command: "call refresh()",
        active: true,
        jobname: "refresh",
      },
    ];
    const runs = [
      {
        jobid: 7,
        status: "failed",
        return_message: "boom",
        start_time: "2026-08-28T09:00:00Z",
        end_time: "2026-08-28T09:00:02Z",
      },
      {
        jobid: 7,
        status: "succeeded",
        start_time: "2026-08-28T08:55:00Z",
        end_time: "2026-08-28T08:55:01Z",
      },
    ];
    const [t] = normalizeSupabaseCron(jobs, runs, "srv");
    expect(t!.source).toBe("supabase");
    expect(t!.schedule).toBe("*/5 * * * *"); // pg_cron exposes the cron expression
    expect(t!.status).toBe("ERROR");
    expect(t!.lastResult).toBe("boom");
  });
});

describe("normalizeVercelCrons", () => {
  it("maps vercel.json cron defs, leaving run status honestly null", () => {
    const [t] = normalizeVercelCrons(
      "rankd",
      [{ path: "/api/cron/sync", schedule: "0 * * * *" }],
      "srv",
    );
    expect(t!.source).toBe("vercel");
    expect(t!.schedule).toBe("0 * * * *");
    expect(t!.lastResult).toBeNull(); // not exposed by the Vercel API
    expect(t!.status).toBe("SCHEDULED");
  });
});
