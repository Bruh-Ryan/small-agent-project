import { useState, useRef, useEffect } from "react";

export default function Composer({ onSubmit, busy }) {
  const [value, setValue] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [busy]);

  function submit() {
    const q = value.trim();
    if (!q || busy) return;
    setValue("");
    onSubmit(q);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder='Ask Wikipedia… (Enter to send, Shift+Enter for newline)'
        aria-label="Query"
      />
      <button type="submit" disabled={busy || !value.trim()}>
        {busy ? "…" : "Send"}
      </button>
    </form>
  );
}
