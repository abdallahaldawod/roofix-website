"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { X } from "lucide-react";

type KeywordChipsProps = {
  label: string;
  chips: string[];
  onChange: (chips: string[]) => void;
  placeholder?: string;
};

export function KeywordChips({ label, chips, onChange, placeholder }: KeywordChipsProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addChip(raw: string) {
    const value = raw.trim().replace(/,$/, "").trim();
    if (value && !chips.includes(value)) {
      onChange([...chips, value]);
    }
    setInputValue("");
  }

  function removeChip(chip: string) {
    onChange(chips.filter((c) => c !== chip));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addChip(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && chips.length > 0) {
      removeChip(chips[chips.length - 1]);
    }
  }

  function handleBlur() {
    if (inputValue.trim()) {
      addChip(inputValue);
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-neutral-700">{label}</p>
      <div
        className="flex min-h-[42px] cursor-text flex-wrap gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 focus-within:border-neutral-400 focus-within:ring-1 focus-within:ring-neutral-400"
        onClick={() => inputRef.current?.focus()}
        role="presentation"
      >
        {chips.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700"
          >
            {chip}
            <button
              type="button"
              aria-label={`Remove ${chip}`}
              onClick={(e) => {
                e.stopPropagation();
                removeChip(chip);
              }}
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-300 hover:text-neutral-900"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="min-w-[120px] flex-1 border-0 bg-transparent p-0 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
          placeholder={chips.length === 0 ? (placeholder ?? "Type and press Enter to add") : ""}
        />
      </div>
      <p className="mt-1 text-xs text-neutral-400">Press Enter or comma to add a keyword.</p>
    </div>
  );
}
