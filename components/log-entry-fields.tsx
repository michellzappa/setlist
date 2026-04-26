"use client";

import { TimeInput } from "@/components/time-input";

const ACCENT = "var(--section-accent)";

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export function FieldShell({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      {children}
    </div>
  );
}

export function TimeField({
  value,
  onChange,
  label = "Time",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <FieldShell label={label}>
      <TimeInput value={value} onChange={onChange} className={inputClass} />
    </FieldShell>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  unit,
  step,
  min = 0,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  step?: string;
  min?: number;
  placeholder?: string;
}) {
  return (
    <FieldShell label={label}>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          step={step ?? "any"}
          min={min}
          placeholder={placeholder ?? (unit ? unit : undefined)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
        {unit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
    </FieldShell>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <FieldShell label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <FieldShell label={label}>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </FieldShell>
  );
}

export type ChipOption = {
  value: string | number;
  label: string;
  emoji?: string;
  title?: string;
};

export function ChipSelectField({
  label,
  value,
  onChange,
  options,
  fill = true,
}: {
  label?: string;
  value: string | number;
  onChange: (v: string | number) => void;
  options: ChipOption[];
  /** Stretch chips to fill the row evenly. */
  fill?: boolean;
}) {
  return (
    <FieldShell label={label}>
      <div className={fill ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-1.5"}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              title={opt.title}
              className={`${fill ? "flex-1" : ""} rounded-md border border-border px-3 py-2 text-xs font-medium transition-colors`}
              style={
                active
                  ? { backgroundColor: ACCENT, color: "white", borderColor: ACCENT }
                  : undefined
              }
            >
              {opt.emoji && <span className="mr-1">{opt.emoji}</span>}
              {opt.label}
            </button>
          );
        })}
      </div>
    </FieldShell>
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FieldShell label={label}>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export type SelectOption = {
  value: string;
  label: string;
  emoji?: string;
};

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "—",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  return (
    <FieldShell label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.emoji ? `${opt.emoji} ` : ""}
            {opt.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function ListField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  hint,
}: {
  label?: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <FieldShell label={label}>
      <textarea
        rows={rows}
        value={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
        placeholder={placeholder}
        className={inputClass}
      />
      {hint && (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </FieldShell>
  );
}
