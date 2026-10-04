"use client";

import { useState } from "react";
import { CalendarDays, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isoToLocalDate, isoToLong, isoToShort, toLocalIso } from "@/lib/dates";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  /** Allow picking future days (default: past and today only). */
  allowFuture?: boolean;
};

/** Single date as YYYY-MM-DD, shown like "Oct 2, 2026". */
export function DatePicker({ id, value, onChange, className, allowFuture = false }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" className={cn("justify-start font-normal", className)}>
          <CalendarDays className="text-neutral-500" />
          {value ? isoToLong(value) : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ? isoToLocalDate(value) : undefined}
          defaultMonth={value ? isoToLocalDate(value) : undefined}
          onSelect={(d) => {
            if (d) onChange(toLocalIso(d));
            setOpen(false);
          }}
          disabled={allowFuture ? undefined : { after: new Date() }}
        />
      </PopoverContent>
    </Popover>
  );
}

export type DateRange = { from: string | null; to: string | null };

type DateRangeButtonProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  label?: string;
};

/** "Filter by date" button that opens a range calendar; one click picks a single day. */
export function DateRangeButton({ value, onChange, label = "Filter by date" }: DateRangeButtonProps) {
  const [open, setOpen] = useState(false);
  const active = value.from !== null;
  const text = !active
    ? label
    : value.to && value.to !== value.from
      ? `${isoToShort(value.from!)} – ${isoToShort(value.to)}`
      : isoToLong(value.from!);

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("font-normal", active && "border-neutral-400 bg-neutral-50")}>
            <CalendarDays className="text-neutral-500" />
            {text}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            numberOfMonths={1}
            selected={
              value.from
                ? { from: isoToLocalDate(value.from), to: value.to ? isoToLocalDate(value.to) : undefined }
                : undefined
            }
            onSelect={(range) =>
              onChange({
                from: range?.from ? toLocalIso(range.from) : null,
                to: range?.to ? toLocalIso(range.to) : range?.from ? toLocalIso(range.from) : null,
              })
            }
            disabled={{ after: new Date() }}
          />
        </PopoverContent>
      </Popover>
      {active && (
        <Button variant="ghost" size="icon-sm" aria-label="Clear date filter" onClick={() => onChange({ from: null, to: null })}>
          <X />
        </Button>
      )}
    </div>
  );
}
