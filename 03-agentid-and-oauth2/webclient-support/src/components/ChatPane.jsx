import { useEffect, useRef } from "react";

function Message({ role, text, outcome, streaming }) {
  const roleLabel = role === "user" ? "You" : role === "system" ? "Notice" : "Agent";
  const cls = ["msg", role, outcome].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <div className="msg-role">{roleLabel}</div>
      <div className="msg-body">
        {text}
        {streaming && <span className="cursor" />}
      </div>
    </div>
  );
}

export default function ChatPane({
  avatarLabel,
  avatarVariant,
  name,
  sub,
  badgeLabel,
  badgeVariant,
  messages,
  emptyGlyph,
  emptyText,
  composer,
}) {
  const messagesRef = useRef(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="pane">
      <div className="pane-head">
        <div className="who">
          <span className={"avatar " + avatarVariant}>{avatarLabel}</span>
          <div>
            <div className="name">{name}</div>
            <div className="sub">{sub}</div>
          </div>
        </div>
        <span className={"badge " + badgeVariant}>{badgeLabel}</span>
      </div>
      <div className="messages" ref={messagesRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="glyph">{emptyGlyph}</div>
            {emptyText}
          </div>
        ) : (
          messages.map((m) => <Message key={m.id} {...m} />)
        )}
      </div>
      {composer}
    </div>
  );
}
