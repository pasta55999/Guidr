// The SIMULATED invoicing app ("Nexus Finance" — a fake generic product, not real
// software). All local state is UI theatre; correctness/advancement is decided by
// convex/sessions.ts, never here.

import {
  useCallback,
  useReducer,
  type Dispatch,
  type MouseEvent,
} from "react";
import {
  ELEMENT_REGISTRY,
  resolveClickedElementId,
  type TutorElementId,
} from "../contracts/elements";
import {
  appReducer,
  initialAppState,
  supplierLabel,
  type AppAction,
  type AppState,
} from "./appState";
import { SupplierSelect, TextField, tutorAttrs } from "./fields";
import "./app.css";

export interface InvoiceAppProps {
  /**
   * Fires whenever a registry-tagged element is clicked or a tagged input
   * changes. `value` is only present for input changes. Purely a report — this
   * component draws no conclusions from it.
   */
  onTutorAction?: (elementId: TutorElementId, value?: string) => void;
}

const NAV = [
  "Dashboard",
  "Supplier Invoices",
  "Purchase Orders",
  "Payments",
  "Suppliers",
  "Reports",
];

const REGISTER_ROWS = [
  { number: "INV-2038", supplier: "Gulf Horizon Contracting LLC", amount: "18,400.00", status: "Paid" },
  { number: "INV-2039", supplier: "Emirates Office Supplies FZ-LLC", amount: "2,150.75", status: "Approved" },
  { number: "INV-2040", supplier: "Desert Rose Logistics LLC", amount: "7,930.00", status: "Pending" },
];

function label(id: TutorElementId) {
  return ELEMENT_REGISTRY[id];
}

export function InvoiceApp({ onTutorAction }: InvoiceAppProps) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const formActive = state.screen === "form";

  const report = useCallback(
    (target: EventTarget | null, value?: string) => {
      const id = resolveClickedElementId(target);
      if (id) onTutorAction?.(id, value);
    },
    [onTutorAction],
  );

  // Capture phase: a tagged click is reported even if a child stops propagation.
  const onClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      report(event.target);
      if (
        state.supplierMenuOpen &&
        event.target instanceof Element &&
        !event.target.closest(".nx-select-shell")
      ) {
        dispatch({ type: "close-supplier-menu" });
      }
    },
    [report, state.supplierMenuOpen],
  );

  return (
    <div
      className="nx-app"
      onClickCapture={onClickCapture}
      onKeyDown={(e) => {
        if (e.key === "Escape") dispatch({ type: "close-supplier-menu" });
      }}
    >
      <aside className="nx-sidebar">
        <div className="nx-brand">
          <span className="nx-brand-mark">NF</span>
          <span className="nx-brand-text">
            <strong>Nexus Finance</strong>
            <small>Accounts Payable</small>
          </span>
        </div>
        <nav className="nx-nav">
          {NAV.map((item) => (
            <span
              key={item}
              className={`nx-nav-item${item === "Supplier Invoices" ? " is-active" : ""}`}
            >
              {item}
            </span>
          ))}
        </nav>
        <div className="nx-sidebar-foot">
          <span className="nx-avatar">LA</span>
          <span className="nx-brand-text">
            <strong>Layla A.</strong>
            <small>Finance Assistant · Dubai</small>
          </span>
        </div>
      </aside>

      <div className="nx-main">
        <header className="nx-topbar">
          <div className="nx-crumb">
            Payables <span>/</span> <strong>Supplier Invoices</strong>
          </div>
          <div className="nx-topbar-actions">
            <span className="nx-search">Search invoices, suppliers, TRN…</span>
            <button
              {...tutorAttrs("new-invoice-button")}
              type="button"
              className="nx-btn nx-btn--primary"
              onClick={() => dispatch({ type: "new-invoice" })}
            >
              + {label("new-invoice-button").labelEn}
            </button>
          </div>
        </header>

        <div className="nx-content">
          {/* Both layers stay mounted so every registry id always resolves to a
              real node with a real rect; only one is visible/interactive. */}
          <div className="nx-stage">
            <RegisterLayer state={state} active={!formActive} />
            <FormLayer
              state={state}
              active={formActive}
              dispatch={dispatch}
              report={report}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function RegisterLayer({
  state,
  active,
}: {
  state: AppState;
  active: boolean;
}) {
  const rows = state.submitted
    ? [
        {
          number: state.submitted.number,
          supplier: state.submitted.supplierEn,
          amount: state.submitted.amount,
          status: "Submitted",
        },
        ...REGISTER_ROWS,
      ]
    : REGISTER_ROWS;

  return (
    <section
      className={`nx-layer${active ? " is-active" : ""}`}
      inert={!active}
      aria-hidden={!active}
    >
      <div className="nx-metrics">
        <Metric title="Awaiting entry" value="0" note="drafts in progress" />
        <Metric title="Pending approval" value="1" note="AED 7,930.00" />
        <Metric title="Paid this month" value="12" note="AED 214,860.40" />
      </div>

      <div className="nx-card">
        <header className="nx-card-head">
          <h2>Invoice register</h2>
          <span className="nx-chip">March 2025</span>
        </header>

        <table className="nx-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Supplier</th>
              <th className="nx-num">Amount (AED)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.number}>
                <td className="nx-mono">{r.number}</td>
                <td>{r.supplier}</td>
                <td className="nx-num nx-mono">{r.amount}</td>
                <td>
                  <span className={`nx-status nx-status--${r.status.toLowerCase()}`}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="nx-empty">
          <span className="nx-empty-mark" aria-hidden="true" />
          <strong>No draft invoices</strong>
          <p>
            Start a new supplier invoice to record a bill for approval. Use{" "}
            <em>New Invoice</em> in the top right.
          </p>
        </div>
      </div>
    </section>
  );
}

function Metric({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="nx-metric">
      <span className="nx-metric-title">{title}</span>
      <strong className="nx-metric-value">{value}</strong>
      <span className="nx-metric-note">{note}</span>
    </div>
  );
}

function FormLayer({
  state,
  active,
  dispatch,
  report,
}: {
  state: AppState;
  active: boolean;
  dispatch: Dispatch<AppAction>;
  report: (target: EventTarget | null, value?: string) => void;
}) {
  const submitted = state.submitted;
  return (
    <section
      className={`nx-layer${active ? " is-active" : ""}`}
      inert={!active}
      aria-hidden={!active}
    >
      <div className="nx-card nx-card--form">
        <header className="nx-card-head">
          <h2>New supplier invoice</h2>
          <span className={`nx-chip${submitted ? " nx-chip--ok" : ""}`}>
            {submitted ? "Submitted" : "Draft"}
          </span>
        </header>

        {submitted && (
          <div className="nx-banner" role="status">
            <strong>{submitted.number}</strong> submitted to approvals ·{" "}
            {submitted.supplierEn} · AED {submitted.amount}
          </div>
        )}

        {state.notice && <div className="nx-notice">{state.notice}</div>}

        <div className="nx-form">
          <SupplierSelect
            elementId="supplier-dropdown"
            optionElementId="supplier-option-al-masa"
            optionKey="al-masa"
            labelEn={label("supplier-dropdown").labelEn}
            labelAr={label("supplier-dropdown").labelAr}
            open={state.supplierMenuOpen}
            selectedKey={state.supplierKey}
            onToggle={() => dispatch({ type: "toggle-supplier-menu" })}
            onSelect={(key) => dispatch({ type: "select-supplier", key })}
          />

          <TextField
            elementId="amount-input"
            labelEn={label("amount-input").labelEn}
            labelAr={label("amount-input").labelAr}
            value={state.amount}
            placeholder="0.00"
            prefix="AED"
            inputMode="decimal"
            onValueChange={(value, target) => {
              dispatch({ type: "set-amount", value });
              report(target, value);
            }}
          />

          {/* Decoy */}
          <TextField
            elementId="tax-rate-field"
            labelEn={label("tax-rate-field").labelEn}
            value={state.taxRate}
            suffix="%"
            hint="Standard UAE VAT"
            inputMode="decimal"
            onValueChange={(value, target) => {
              dispatch({ type: "set-tax-rate", value });
              report(target, value);
            }}
          />

          <TextField
            elementId="description-input"
            labelEn={label("description-input").labelEn}
            labelAr={label("description-input").labelAr}
            value={state.description}
            placeholder="e.g. Office stationery — March delivery"
            multiline
            wide
            onValueChange={(value, target) => {
              dispatch({ type: "set-description", value });
              report(target, value);
            }}
          />

          <div className="nx-field nx-field--wide">
            <span className="nx-label">Supporting document</span>
            <div className="nx-attach">
              {/* Decoy */}
              <button
                {...tutorAttrs("attachment-button")}
                type="button"
                className="nx-btn nx-btn--ghost"
                onClick={() => dispatch({ type: "attach" })}
              >
                {label("attachment-button").labelEn}
              </button>
              {state.attachments.length === 0 ? (
                <span className="nx-hint">PDF or JPG, up to 10 MB</span>
              ) : (
                state.attachments.map((a) => (
                  <span key={a} className="nx-file">
                    {a}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        <footer className="nx-actions">
          {/* Decoy */}
          <button
            {...tutorAttrs("discard-button")}
            type="button"
            className="nx-btn nx-btn--danger"
            onClick={() => dispatch({ type: "discard" })}
          >
            {label("discard-button").labelEn}
          </button>
          <span className="nx-actions-spacer">
            {state.supplierKey
              ? `Supplier: ${supplierLabel(state.supplierKey)}`
              : "No supplier selected"}
          </span>
          <button type="button" className="nx-btn nx-btn--ghost">
            Save draft
          </button>
          <button
            {...tutorAttrs("submit-invoice-button")}
            type="button"
            className="nx-btn nx-btn--primary"
            onClick={() => dispatch({ type: "submit" })}
          >
            {label("submit-invoice-button").labelEn}
          </button>
        </footer>
      </div>
    </section>
  );
}

export default InvoiceApp;
