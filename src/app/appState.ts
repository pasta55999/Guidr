// Local UI state for the SIMULATED invoicing app ("Nexus Finance").
//
// This is deliberately ephemeral theatre: nothing here is persisted to Convex.
// Lesson progress / click judgement is owned by convex/sessions.ts and is not
// modelled here at all.

export interface SupplierOption {
  /** Stable local key. Only Al Masa carries a data-tutor-id (see registry). */
  key: string;
  labelEn: string;
  labelAr: string;
  trn: string;
}

export const SUPPLIER_OPTIONS: readonly SupplierOption[] = [
  {
    key: "al-masa",
    labelEn: "Al Masa Trading LLC",
    labelAr: "شركة الماسة للتجارة",
    trn: "TRN 100234567800003",
  },
  {
    key: "gulf-horizon",
    labelEn: "Gulf Horizon Contracting LLC",
    labelAr: "أفق الخليج للمقاولات",
    trn: "TRN 100884512700003",
  },
  {
    key: "emirates-office",
    labelEn: "Emirates Office Supplies FZ-LLC",
    labelAr: "الإمارات للقرطاسية",
    trn: "TRN 100471209900003",
  },
  {
    key: "desert-rose",
    labelEn: "Desert Rose Logistics LLC",
    labelAr: "وردة الصحراء للخدمات اللوجستية",
    trn: "TRN 100662330400003",
  },
];

export interface SubmittedInvoice {
  number: string;
  supplierEn: string;
  amount: string;
  description: string;
  submittedAt: string;
}

export interface AppState {
  /** "list" = invoice register + empty state, "form" = blank/filled invoice form. */
  screen: "list" | "form";
  supplierMenuOpen: boolean;
  supplierKey: string | null;
  amount: string;
  description: string;
  taxRate: string;
  attachments: string[];
  /** Set once submit succeeds; drives the success banner + register row. */
  submitted: SubmittedInvoice | null;
  /** Transient inline message, e.g. from a decoy control. */
  notice: string | null;
  /** Sequential invoice counter, so the success state shows a credible number. */
  nextSeq: number;
}

export const initialAppState: AppState = {
  screen: "list",
  supplierMenuOpen: false,
  supplierKey: null,
  amount: "",
  description: "",
  taxRate: "5",
  attachments: [],
  submitted: null,
  notice: null,
  nextSeq: 2041,
};

export type AppAction =
  | { type: "new-invoice" }
  | { type: "toggle-supplier-menu" }
  | { type: "close-supplier-menu" }
  | { type: "select-supplier"; key: string }
  | { type: "set-amount"; value: string }
  | { type: "set-description"; value: string }
  | { type: "set-tax-rate"; value: string }
  | { type: "attach" }
  | { type: "discard" }
  | { type: "submit" }
  | { type: "dismiss-notice" }
  | { type: "reset" };

export function supplierLabel(
  key: string | null,
  lang: "en" | "ar" = "en",
): string | null {
  const found = SUPPLIER_OPTIONS.find((s) => s.key === key);
  if (!found) return null;
  return lang === "ar" ? found.labelAr : found.labelEn;
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "new-invoice":
      return {
        ...state,
        screen: "form",
        supplierMenuOpen: false,
        submitted: null,
        supplierKey: null,
        amount: "",
        description: "",
        attachments: [],
        notice: null,
      };

    case "toggle-supplier-menu":
      return {
        ...state,
        supplierMenuOpen: !state.supplierMenuOpen,
        notice: null,
      };

    case "close-supplier-menu":
      return state.supplierMenuOpen
        ? { ...state, supplierMenuOpen: false }
        : state;

    case "select-supplier":
      return {
        ...state,
        supplierKey: action.key,
        supplierMenuOpen: false,
        notice: null,
      };

    case "set-amount":
      return { ...state, amount: action.value, notice: null };

    case "set-description":
      return { ...state, description: action.value, notice: null };

    case "set-tax-rate":
      return { ...state, taxRate: action.value, notice: null };

    // Decoy: plausible, visible, and deliberately inconsequential.
    case "attach":
      return state.attachments.length > 0
        ? { ...state, notice: "Only one attachment is allowed per invoice." }
        : {
            ...state,
            attachments: ["supplier-invoice-scan.pdf"],
            notice: null,
          };

    // Decoy: never actually destroys the learner's work mid-lesson.
    case "discard":
      return {
        ...state,
        notice: "Discard needs supervisor approval in this workspace.",
      };

    case "submit": {
      if (state.screen !== "form") return state;
      if (state.submitted) {
        return { ...state, notice: "This invoice has already been submitted." };
      }
      const number = `INV-${state.nextSeq}`;
      return {
        ...state,
        submitted: {
          number,
          supplierEn: supplierLabel(state.supplierKey) ?? "Unassigned supplier",
          amount: state.amount.trim() === "" ? "0.00" : state.amount.trim(),
          description: state.description,
          submittedAt: "Today",
        },
        nextSeq: state.nextSeq + 1,
        supplierMenuOpen: false,
        notice: null,
      };
    }

    case "dismiss-notice":
      return state.notice === null ? state : { ...state, notice: null };

    case "reset":
      return { ...initialAppState, nextSeq: state.nextSeq };

    default:
      return state;
  }
}
