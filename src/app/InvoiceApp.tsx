// The SIMULATED invoicing app ("Nexus Finance" — a fake generic product, not real
// software). All local state is UI theatre; correctness/advancement is decided by
// convex/sessions.ts, never here.

import {
  useCallback,
  useReducer,
  useState,
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
  { id: "dashboard", label: "Dashboard", area: "Overview" },
  {
    id: "supplier-invoices",
    label: "Supplier Invoices",
    area: "Payables",
  },
  { id: "purchase-orders", label: "Purchase Orders", area: "Procurement" },
  { id: "payments", label: "Payments", area: "Payables" },
  { id: "suppliers", label: "Suppliers", area: "Directory" },
  { id: "reports", label: "Reports", area: "Analytics" },
] as const;

type NavSection = (typeof NAV)[number]["id"];
type WorkspaceSection = Exclude<NavSection, "supplier-invoices">;

interface WorkspacePage {
  title: string;
  description: string;
  metrics: readonly {
    title: string;
    value: string;
    note: string;
  }[];
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}

const WORKSPACE_PAGES: Record<WorkspaceSection, WorkspacePage> = {
  dashboard: {
    title: "Accounts Payable overview",
    description: "Today’s workload across invoices, approvals and payments.",
    metrics: [
      { title: "Invoices this month", value: "24", note: "AED 248,341.15" },
      { title: "Pending approval", value: "1", note: "AED 7,930.00" },
      { title: "Payments due", value: "8", note: "next seven days" },
    ],
    columns: ["Recent activity", "Owner", "When", "Status"],
    rows: [
      ["INV-2039 approved", "Omar K.", "10:24", "Approved"],
      ["INV-2040 sent for review", "Layla A.", "09:46", "Pending"],
      ["PAY-884 bank file prepared", "Mariam H.", "Yesterday", "Ready"],
    ],
  },
  "purchase-orders": {
    title: "Purchase orders",
    description: "Open commitments awaiting delivery or invoice matching.",
    metrics: [
      { title: "Open orders", value: "6", note: "AED 91,460.00" },
      { title: "Awaiting receipt", value: "2", note: "action required" },
      { title: "Matched", value: "18", note: "this month" },
    ],
    columns: ["Purchase order", "Supplier", "Amount (AED)", "Status"],
    rows: [
      ["PO-1138", "Al Masa Trading LLC", "12,500.00", "Open"],
      ["PO-1137", "Desert Rose Logistics LLC", "7,930.00", "Received"],
      ["PO-1132", "Emirates Office Supplies FZ-LLC", "2,150.75", "Matched"],
    ],
  },
  payments: {
    title: "Payments",
    description: "Approved supplier payments and their processing status.",
    metrics: [
      { title: "Scheduled", value: "8", note: "AED 143,820.40" },
      { title: "Needs review", value: "1", note: "bank details" },
      { title: "Paid this month", value: "12", note: "AED 214,860.40" },
    ],
    columns: ["Payment", "Supplier", "Due date", "Status"],
    rows: [
      ["PAY-884", "Gulf Horizon Contracting LLC", "18 Mar 2025", "Ready"],
      ["PAY-883", "Emirates Office Supplies FZ-LLC", "20 Mar 2025", "Scheduled"],
      ["PAY-879", "Desert Rose Logistics LLC", "14 Mar 2025", "Paid"],
    ],
  },
  suppliers: {
    title: "Supplier directory",
    description: "Registered suppliers available for purchasing and payment.",
    metrics: [
      { title: "Active suppliers", value: "42", note: "four added this year" },
      { title: "TRN verified", value: "40", note: "95 percent" },
      { title: "Needs review", value: "2", note: "profile details" },
    ],
    columns: ["Supplier", "TRN", "Location", "Status"],
    rows: [
      ["Al Masa Trading LLC", "100234567800003", "Dubai", "Active"],
      ["Gulf Horizon Contracting LLC", "100884512700003", "Abu Dhabi", "Active"],
      ["Emirates Office Supplies FZ-LLC", "100471209900003", "Dubai", "Active"],
      ["Desert Rose Logistics LLC", "100662330400003", "Sharjah", "Review"],
    ],
  },
  reports: {
    title: "Reports",
    description: "Current finance reports prepared from the workspace data.",
    metrics: [
      { title: "Available reports", value: "6", note: "finance workspace" },
      { title: "Updated today", value: "4", note: "latest data" },
      { title: "Scheduled", value: "2", note: "monthly delivery" },
    ],
    columns: ["Report", "Period", "Last updated", "Status"],
    rows: [
      ["Accounts payable ageing", "March 2025", "Today, 10:30", "Ready"],
      ["Supplier spend summary", "Q1 2025", "Today, 09:15", "Ready"],
      ["VAT input register", "March 2025", "Yesterday", "Ready"],
      ["Payment forecast", "Next 30 days", "Today, 08:40", "Ready"],
    ],
  },
};

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
  const [activeSection, setActiveSection] =
    useState<NavSection>("supplier-invoices");
  const [searchQuery, setSearchQuery] = useState("");
  const formActive = state.screen === "form";
  const invoiceSectionActive = activeSection === "supplier-invoices";
  const sectionMeta = NAV.find((item) => item.id === activeSection) ?? NAV[0];

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

  const navigate = (section: NavSection) => {
    setActiveSection(section);
    setSearchQuery("");
    dispatch({ type: "close-supplier-menu" });
  };

  const openNewInvoice = () => {
    setActiveSection("supplier-invoices");
    setSearchQuery("");
    dispatch({ type: "new-invoice" });
  };

  return (
    <div
      className="nx-app"
      onClickCapture={onClickCapture}
      onKeyDown={(e) => {
        if (e.key === "Escape") dispatch({ type: "close-supplier-menu" });
      }}
    >
      <aside className="nx-sidebar">
        <button
          type="button"
          className="nx-brand"
          onClick={() => navigate("dashboard")}
          aria-label="Open dashboard"
        >
          <span className="nx-brand-mark">NF</span>
          <span className="nx-brand-text">
            <strong>Nexus Finance</strong>
            <small>Accounts Payable</small>
          </span>
        </button>
        <nav className="nx-nav" aria-label="Finance workspace">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nx-nav-item${item.id === activeSection ? " is-active" : ""}`}
              aria-current={item.id === activeSection ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              {item.label}
            </button>
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
            {sectionMeta.area} <span>/</span> <strong>{sectionMeta.label}</strong>
          </div>
          <div className="nx-topbar-actions">
            <input
              type="search"
              className="nx-search"
              aria-label={`Search ${sectionMeta.label}`}
              placeholder="Search this section…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <button
              {...tutorAttrs("new-invoice-button")}
              type="button"
              className="nx-btn nx-btn--primary"
              onClick={openNewInvoice}
            >
              + {label("new-invoice-button").labelEn}
            </button>
          </div>
        </header>

        <div className="nx-content">
          <div className="nx-workspace">
            <div
              className={`nx-view${invoiceSectionActive ? " is-active" : ""}`}
              aria-hidden={!invoiceSectionActive}
              {...(!invoiceSectionActive ? { inert: true } : {})}
            >
              {/* Both layers stay mounted so every registry id always resolves to a
                  real node with a real rect; only one is visible/interactive. */}
              <div className="nx-stage">
                <RegisterLayer
                  state={state}
                  active={!formActive}
                  searchQuery={searchQuery}
                />
                <FormLayer
                  state={state}
                  active={formActive}
                  dispatch={dispatch}
                  report={report}
                />
              </div>
            </div>
            <div
              className={`nx-view${!invoiceSectionActive ? " is-active" : ""}`}
              aria-hidden={invoiceSectionActive}
              {...(invoiceSectionActive ? { inert: true } : {})}
            >
              {!invoiceSectionActive && (
                <WorkspaceLayer
                  section={activeSection}
                  searchQuery={searchQuery}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspaceLayer({
  section,
  searchQuery,
}: {
  section: NavSection;
  searchQuery: string;
}) {
  if (section === "supplier-invoices") return null;

  const page = WORKSPACE_PAGES[section];
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const rows = normalizedQuery
    ? page.rows.filter((row) =>
        row.some((cell) => cell.toLowerCase().includes(normalizedQuery)),
      )
    : page.rows;

  return (
    <section className="nx-page" aria-labelledby={`nx-page-${section}`}>
      <header className="nx-page-head">
        <div>
          <h1 id={`nx-page-${section}`}>{page.title}</h1>
          <p>{page.description}</p>
        </div>
        <span className="nx-chip">
          {rows.length} {rows.length === 1 ? "record" : "records"}
        </span>
      </header>

      <div className="nx-metrics">
        {page.metrics.map((metric) => (
          <Metric key={metric.title} {...metric} />
        ))}
      </div>

      <div className="nx-card">
        <table className="nx-table">
          <thead>
            <tr>
              {page.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join("-")}>
                {row.map((cell, index) => (
                  <td key={`${index}-${cell}`}>
                    {index === row.length - 1 ? (
                      <span className="nx-status">{cell}</span>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="nx-no-results" colSpan={page.columns.length}>
                  No records match “{searchQuery.trim()}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RegisterLayer({
  state,
  active,
  searchQuery,
}: {
  state: AppState;
  active: boolean;
  searchQuery: string;
}) {
  const allRows = state.submitted
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
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const rows = normalizedQuery
    ? allRows.filter((row) =>
        Object.values(row).some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ),
      )
    : allRows;

  return (
    <section
      className={`nx-layer${active ? " is-active" : ""}`}
      aria-hidden={!active}
      {...(!active ? { inert: true } : {})}
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
            {rows.length === 0 && (
              <tr>
                <td className="nx-no-results" colSpan={4}>
                  No invoices match “{searchQuery.trim()}”.
                </td>
              </tr>
            )}
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
      aria-hidden={!active}
      {...(!active ? { inert: true } : {})}
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
          <button
            type="button"
            className="nx-btn nx-btn--ghost"
            onClick={() => dispatch({ type: "save-draft" })}
          >
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
