"use client";

import { useEffect, useState, useCallback } from "react";
import { QuickLogModal } from "@/components/quick-log-modal";
import {
  ChipSelectField,
  ListField,
  NumberField,
  TextAreaField,
  TextField,
  TimeField,
  type ChipOption,
} from "@/components/log-entry-fields";

const ACCENT = "var(--section-accent)";

export type FieldSpec =
  | { kind: "time"; key: string; label?: string }
  | {
      kind: "number";
      key: string;
      label?: string;
      unit?: string;
      step?: string;
      min?: number;
      placeholder?: string;
    }
  | {
      kind: "chips";
      key: string;
      label?: string;
      options: ChipOption[];
      fill?: boolean;
    }
  | { kind: "text"; key: string; label?: string; placeholder?: string }
  | { kind: "textarea"; key: string; label?: string; placeholder?: string; rows?: number }
  | { kind: "list"; key: string; label?: string; placeholder?: string; rows?: number; hint?: string }
  | { kind: "row"; fields: FieldSpec[] }
  | { kind: "custom"; key: string; render: (values: Record<string, unknown>, set: (k: string, v: unknown) => void) => React.ReactNode };

export type LogEntryValues = Record<string, unknown>;

type Props = {
  open: boolean;
  mode: "create" | "edit";
  title?: string;
  schema: FieldSpec[];
  initialValues: LogEntryValues;
  saving?: boolean;
  /** Optional content rendered between the fields and the action row. */
  extra?: React.ReactNode;
  /** Disable the primary submit button. */
  canSubmit?: (values: LogEntryValues) => boolean;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (values: LogEntryValues) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
};

export function LogEntryModal({
  open,
  mode,
  title,
  schema,
  initialValues,
  saving = false,
  extra,
  canSubmit,
  submitLabel,
  onClose,
  onSubmit,
  onDelete,
}: Props) {
  const [values, setValues] = useState<LogEntryValues>(initialValues);

  // Re-seed when the modal opens or the source row changes.
  useEffect(() => {
    if (open) setValues(initialValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(initialValues)]);

  const set = useCallback((k: string, v: unknown) => {
    setValues((prev) => ({ ...prev, [k]: v }));
  }, []);

  const handleSubmit = useCallback(async () => {
    await onSubmit(values);
  }, [onSubmit, values]);

  const submitOk = canSubmit ? canSubmit(values) : true;
  const heading = title ?? (mode === "edit" ? "Edit Entry" : "New Entry");
  const primaryLabel = saving
    ? "Saving…"
    : submitLabel ?? (mode === "edit" ? "Save Changes" : "Save");

  return (
    <QuickLogModal
      open={open}
      onClose={onClose}
      title={heading}
      accent={ACCENT}
      footer={
        <div className="flex items-center gap-2">
          {mode === "edit" && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={saving}
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-500/15 disabled:opacity-50 dark:text-red-300"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border bg-card py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !submitOk}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
          >
            {primaryLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {schema.map((spec, i) => (
          <FieldRenderer key={"key" in spec ? spec.key : `row-${i}`} spec={spec} values={values} set={set} />
        ))}
        {extra}
      </div>
    </QuickLogModal>
  );
}

function FieldRenderer({
  spec,
  values,
  set,
}: {
  spec: FieldSpec;
  values: LogEntryValues;
  set: (k: string, v: unknown) => void;
}) {
  switch (spec.kind) {
    case "time":
      return (
        <TimeField
          label={spec.label}
          value={(values[spec.key] as string) ?? ""}
          onChange={(v) => set(spec.key, v)}
        />
      );
    case "number":
      return (
        <NumberField
          label={spec.label}
          unit={spec.unit}
          step={spec.step}
          min={spec.min}
          placeholder={spec.placeholder}
          value={
            values[spec.key] == null || values[spec.key] === ""
              ? ""
              : String(values[spec.key])
          }
          onChange={(v) => set(spec.key, v)}
        />
      );
    case "chips":
      return (
        <ChipSelectField
          label={spec.label}
          options={spec.options}
          fill={spec.fill}
          value={(values[spec.key] as string | number) ?? ""}
          onChange={(v) => set(spec.key, v)}
        />
      );
    case "text":
      return (
        <TextField
          label={spec.label}
          placeholder={spec.placeholder}
          value={(values[spec.key] as string) ?? ""}
          onChange={(v) => set(spec.key, v)}
        />
      );
    case "textarea":
      return (
        <TextAreaField
          label={spec.label}
          placeholder={spec.placeholder}
          rows={spec.rows}
          value={(values[spec.key] as string) ?? ""}
          onChange={(v) => set(spec.key, v)}
        />
      );
    case "list":
      return (
        <ListField
          label={spec.label}
          placeholder={spec.placeholder}
          rows={spec.rows}
          hint={spec.hint}
          value={(values[spec.key] as string[]) ?? []}
          onChange={(v) => set(spec.key, v)}
        />
      );
    case "row":
      return (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${spec.fields.length}, minmax(0, 1fr))` }}>
          {spec.fields.map((sub, i) => (
            <FieldRenderer key={"key" in sub ? sub.key : `sub-${i}`} spec={sub} values={values} set={set} />
          ))}
        </div>
      );
    case "custom":
      return <>{spec.render(values, set)}</>;
  }
}
