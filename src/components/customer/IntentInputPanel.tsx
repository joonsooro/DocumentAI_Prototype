/**
 * F-11 — Business-intent input form.
 *
 * Plain HTML form; the customer types prose intent and submits. Submit
 * fires onSubmit(text) — the route owns the wiring to F-04 compile.
 */
interface IntentInputPanelProps {
  readonly initialValue?: string;
  readonly disabled?: boolean;
  readonly onSubmit: (intent: string) => void;
}

export function IntentInputPanel({
  initialValue = '',
  disabled = false,
  onSubmit,
}: IntentInputPanelProps) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const ta = form.elements.namedItem('intent') as HTMLTextAreaElement | null;
    if (!ta) return;
    const text = ta.value.trim();
    if (text.length === 0) return;
    onSubmit(text);
  }

  return (
    <section data-testid="customer-intent-panel" style={panelStyle}>
      <h2 style={headingStyle}>What should this configuration extract?</h2>
      <form onSubmit={handleSubmit}>
        <textarea
          name="intent"
          data-testid="customer-intent-textarea"
          defaultValue={initialValue}
          placeholder="e.g. extract supplier, PO, payable amount; exclude no-commercial-value sample lines"
          disabled={disabled}
          rows={6}
          style={textareaStyle}
        />
        <div style={{ marginTop: 12 }}>
          <button
            type="submit"
            data-testid="customer-intent-submit"
            disabled={disabled}
            style={buttonStyle}
          >
            Compile configuration
          </button>
        </div>
      </form>
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #d9d9d9',
  borderRadius: 4,
  padding: '20px 24px',
  marginBottom: 16,
};

const headingStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 500,
  margin: '0 0 12px',
  color: '#32363a',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  border: '1px solid #ccc',
  borderRadius: 4,
  boxSizing: 'border-box',
};

const buttonStyle: React.CSSProperties = {
  background: '#0070f3',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '8px 18px',
  fontSize: 14,
  cursor: 'pointer',
};
