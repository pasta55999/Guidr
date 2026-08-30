// Field components for the simulated invoicing app. Presentational: they take a
// semantic element id and stamp it as data-tutor-id (TUTOR_ATTR) so the overlay
// can find them, and they report changes with the raw event target so the caller
// can resolve the id through the contracts helper.

import type { ReactNode } from "react";
import {
  TUTOR_ATTR,
  type TutorElementId,
} from "../contracts/elements";
import { SUPPLIER_OPTIONS, supplierLabel } from "./appState";

export type ChangeReporter = (value: string, target: EventTarget | null) => void;

/**
 * Stamps the frozen TUTOR_ATTR onto a DOM node. Returned from a function (rather
 * than spread as an inline literal) so JSX excess-property checking stays happy
 * while the id itself is still type-checked against the registry.
 */
export function tutorAttrs(id: TutorElementId) {
  return { [TUTOR_ATTR]: id };
}

interface FieldProps {
  labelEn: string;
  labelAr?: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}

export function Field({ labelEn, labelAr, hint, wide, children }: FieldProps) {
  return (
    <div className={`nx-field${wide ? " nx-field--wide" : ""}`}>
      <span className="nx-label">
        {labelEn}
        {labelAr && (
          <span className="nx-label-ar" lang="ar" dir="rtl">
            {labelAr}
          </span>
        )}
      </span>
      {children}
      {hint && <span className="nx-hint">{hint}</span>}
    </div>
  );
}

interface TextFieldProps {
  elementId: TutorElementId;
  labelEn: string;
  labelAr?: string;
  value: string;
  onValueChange: ChangeReporter;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  hint?: string;
  multiline?: boolean;
  wide?: boolean;
  inputMode?: "text" | "decimal";
}

export function TextField({
  elementId,
  labelEn,
  labelAr,
  value,
  onValueChange,
  placeholder,
  prefix,
  suffix,
  hint,
  multiline,
  wide,
  inputMode = "text",
}: TextFieldProps) {
  const tutorAttr = tutorAttrs(elementId);
  return (
    <Field labelEn={labelEn} labelAr={labelAr} hint={hint} wide={wide}>
      <div className="nx-input-wrap">
        {prefix && <span className="nx-affix">{prefix}</span>}
        {multiline ? (
          <textarea
            {...tutorAttr}
            className="nx-input nx-input--area"
            rows={3}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onValueChange(e.target.value, e.target)}
          />
        ) : (
          <input
            {...tutorAttr}
            className="nx-input"
            type="text"
            inputMode={inputMode}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onValueChange(e.target.value, e.target)}
          />
        )}
        {suffix && <span className="nx-affix nx-affix--end">{suffix}</span>}
      </div>
    </Field>
  );
}

interface SupplierSelectProps {
  elementId: TutorElementId;
  /** Only Al Masa is a registry element; the rest are plausible filler. */
  optionElementId: TutorElementId;
  optionKey: string;
  labelEn: string;
  labelAr?: string;
  open: boolean;
  selectedKey: string | null;
  onToggle: () => void;
  onSelect: (key: string) => void;
}

export function SupplierSelect({
  elementId,
  optionElementId,
  optionKey,
  labelEn,
  labelAr,
  open,
  selectedKey,
  onToggle,
  onSelect,
}: SupplierSelectProps) {
  const selected = supplierLabel(selectedKey);
  return (
    <Field labelEn={labelEn} labelAr={labelAr} wide>
      {/* The menu is a SIBLING of the tagged trigger, so clicks on untagged
          options never resolve to supplier-dropdown. */}
      <div className="nx-select-shell">
        <button
          {...tutorAttrs(elementId)}
          type="button"
          className={`nx-select${open ? " is-open" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className={selected ? "nx-select-value" : "nx-select-ph"}>
            {selected ?? "Select a supplier"}
          </span>
          <span className="nx-caret" aria-hidden="true" />
        </button>

        {open && (
          <ul className="nx-menu" role="listbox">
            {SUPPLIER_OPTIONS.map((s) => {
              const isTarget = s.key === optionKey;
              const attrs = isTarget ? tutorAttrs(optionElementId) : {};
              return (
                <li key={s.key}>
                  <button
                    {...attrs}
                    type="button"
                    role="option"
                    aria-selected={s.key === selectedKey}
                    className={`nx-option${s.key === selectedKey ? " is-selected" : ""}`}
                    onClick={() => onSelect(s.key)}
                  >
                    <span className="nx-option-main">
                      <span className="nx-option-en">{s.labelEn}</span>
                      <span className="nx-option-ar" lang="ar" dir="rtl">
                        {s.labelAr}
                      </span>
                    </span>
                    <span className="nx-option-trn">{s.trn}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Field>
  );
}
