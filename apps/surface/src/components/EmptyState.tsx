interface EmptyStateProps {
  title: string;
  detail: string;
  /** One of the honest production states — never fabricated data. */
  kind?: "waiting" | "not-configured" | "not-available";
}

const KIND_LABEL: Record<NonNullable<EmptyStateProps["kind"]>, string> = {
  waiting: "Waiting for data",
  "not-configured": "Not configured",
  "not-available": "Not available",
};

export function EmptyState({
  title,
  detail,
  kind = "waiting",
}: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state__badge" data-kind={kind}>
        {KIND_LABEL[kind]}
      </div>
      <h2 className="empty-state__title">{title}</h2>
      <p className="empty-state__detail">{detail}</p>
    </div>
  );
}
