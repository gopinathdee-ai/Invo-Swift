"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { format, parse } from "date-fns";
import "react-day-picker/dist/style.css";

interface DatePickerInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function DatePickerInput({ value, onChange, placeholder = "YYYY-MM-DD" }: DatePickerInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extract just the date part from ISO strings with timezone
  const cleanValue = value ? (value.includes("T") ? value.split("T")[0] : value) : "";
  const selectedDate = cleanValue ? parse(cleanValue, "yyyy-MM-dd", new Date()) : undefined;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={cleanValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setIsOpen(true)}
        className="w-full px-3 py-2.5 rounded-lg text-sm font-ledger focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer"
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg)",
        }}
        readOnly
      />
      <i
        className="fas fa-calendar absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: "var(--accent)", fontSize: "16px" }}
      />

      {isOpen && (
        <div
          className="absolute top-full mt-2 bg-white rounded-lg shadow-lg p-4 z-50"
          style={{ border: "1px solid var(--border)" }}
        >
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (date) {
                onChange(format(date, "yyyy-MM-dd"));
              }
              setIsOpen(false);
            }}
            disabled={(date) => date > new Date()}
            modifiersStyles={{
              selected: {
                background: "var(--accent)",
                color: "white",
              },
              today: {
                background: "var(--accent-light)",
                color: "var(--accent)",
                fontWeight: "bold",
              },
            }}
          />
        </div>
      )}
    </div>
  );
}
