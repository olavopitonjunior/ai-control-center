import type { SectionId } from "../nav";
import { SECTIONS } from "../nav";
import { useApp } from "../state/AppState";
import { EmptyState } from "../components/EmptyState";
import { Overview } from "./Overview";
import { Sessions } from "./Sessions";
import { Usage } from "./Usage";
import { Limits } from "./Limits";
import { Automations } from "./Automations";
import { System } from "./System";
import { Insights } from "./Insights";
import { Settings } from "./Settings";

/** Route a section id to its screen. Settings is always available; the rest require a
 * selected machine and render honest empty/offline states otherwise. */
export function Screen({ id }: { id: SectionId }) {
  const { selected } = useApp();
  const section = SECTIONS.find((s) => s.id === id)!;

  const body = (() => {
    if (id === "settings") return <Settings />;
    if (!selected) {
      return (
        <EmptyState
          kind="not-configured"
          title="No machine selected"
          detail="Add a monitored machine in Settings, then pick it from the selector above."
        />
      );
    }
    switch (id) {
      case "overview":
        return <Overview />;
      case "sessions":
        return <Sessions />;
      case "usage":
        return <Usage />;
      case "limits":
        return <Limits />;
      case "automations":
        return <Automations />;
      case "system":
        return <System />;
      case "insights":
        return <Insights />;
      default:
        return null;
    }
  })();

  return (
    <section className="screen" aria-labelledby={`screen-${id}`}>
      <header className="screen__header">
        <h1 id={`screen-${id}`} className="screen__title">
          {section.label}
        </h1>
        <p className="screen__purpose">{section.purpose}</p>
      </header>
      {body}
    </section>
  );
}
