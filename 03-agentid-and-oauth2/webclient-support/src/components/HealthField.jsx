export default function HealthField({ label, url, onUrlChange, onUrlBlur, status, inputAriaLabel }) {
  const dotClass = status.state === "up" ? "dot-ok" : status.state === "down" ? "dot-deny" : "dot-idle";
  const chipClass = status.state === "up" ? "up" : status.state === "down" ? "down" : "checking";

  return (
    <div className="config-row">
      <span className="config-label">
        <span className={"dot " + dotClass} />
        {label}
      </span>
      <div className="url-field">
        <input
          type="text"
          value={url}
          spellCheck={false}
          aria-label={inputAriaLabel}
          onChange={(e) => onUrlChange(e.target.value)}
          onBlur={onUrlBlur}
        />
        <span className={"health-chip " + chipClass}>{status.label}</span>
      </div>
    </div>
  );
}
