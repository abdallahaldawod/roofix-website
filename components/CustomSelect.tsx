"use client";

import { useState, useRef, useEffect } from "react";
import FieldError from "@/components/FieldError";

type CustomSelectProps = {
  id: string;
  name: string;
  placeholder: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  error?: string;
};

export default function CustomSelect({
  id,
  name,
  placeholder,
  options,
  value,
  onChange,
  required = false,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
  error,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const displayValue = value || placeholder;
  const isPlaceholder = !value;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) setHighlightedIndex(-1);
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i < options.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter" && highlightedIndex >= 0 && options[highlightedIndex]) {
      e.preventDefault();
      onChange(options[highlightedIndex]);
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input type="hidden" name={name} value={value} required={required} />
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        aria-required={required}
        className="mt-1 flex w-full items-center justify-between rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-left text-neutral-900 shadow-sm transition-colors focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        style={{ minHeight: "42px" }}
      >
        <span className={isPlaceholder ? "text-sm text-neutral-500" : ""}>{displayValue}</span>
        <svg
          className={`h-5 w-5 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
          style={{
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
          }}
        >
          {options.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={value === opt}
              className={`cursor-pointer px-4 py-2.5 text-sm text-neutral-900 ${
                i === highlightedIndex ? "bg-[#FFF4CC]" : "hover:bg-[#FFF4CC]"
              }`}
              onMouseEnter={() => setHighlightedIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <FieldError id={ariaDescribedby} message={error} />
      )}
    </div>
  );
}
