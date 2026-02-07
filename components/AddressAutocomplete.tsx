"use client";

import { useState, useRef, useCallback, useEffect } from "react";

const DEBOUNCE_MS = 180;
const MIN_QUERY_LENGTH = 3;
const CACHE_MAX_ENTRIES = 80;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type Prediction = { description: string; place_id: string };

type AddressAutocompleteProps = {
  id: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  value?: string;
  readOnly?: boolean;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLInputElement>) => void;
  onTouchStart?: (e: React.TouchEvent<HTMLInputElement>) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export default function AddressAutocomplete({
  id,
  name,
  required = false,
  placeholder = "Start typing your suburb or address",
  value: valueProp,
  readOnly = false,
  onFocus,
  onMouseDown,
  onTouchStart,
  onChange,
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(valueProp ?? "");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<Map<string, { predictions: Prediction[]; ts: number }>>(new Map());

  useEffect(() => {
    if (valueProp !== undefined) setInputValue(valueProp);
  }, [valueProp]);

  const fetchPredictions = useCallback(async (q: string) => {
    const cacheKey = q.toLowerCase().trim();
    const cached = cacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setPredictions(cached.predictions);
      setHighlightIndex(-1);
      setLoading(false);
      setError(null);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/places/autocomplete?q=${encodeURIComponent(q)}`,
        { signal: abortRef.current.signal }
      );
      const data = await res.json();
      if (!res.ok) {
        setPredictions([]);
        setError((data.details as string) ?? data.error ?? "Something went wrong");
        return;
      }
      const list = data.predictions ?? [];
      setPredictions(list);
      setHighlightIndex(-1);

      if (list.length > 0) {
        const map = cacheRef.current;
        if (map.size >= CACHE_MAX_ENTRIES) {
          const firstKey = map.keys().next().value;
          if (firstKey != null) map.delete(firstKey);
        }
        map.set(cacheKey, { predictions: list, ts: Date.now() });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setPredictions([]);
      setError("Could not load suggestions");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);
      onChange?.(e);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (value.trim().length < MIN_QUERY_LENGTH) {
        setPredictions([]);
        setOpen(false);
        setError(null);
        return;
      }
      debounceRef.current = setTimeout(() => {
        fetchPredictions(value.trim());
        setOpen(true);
      }, DEBOUNCE_MS);
    },
    [onChange, fetchPredictions]
  );

  const selectPlace = useCallback(
    async (pred: Prediction) => {
      setOpen(false);
      setPredictions([]);
      setError(null);
      setInputValue(pred.description);
      if (abortRef.current) abortRef.current.abort();
      setLoading(true);
      let finalValue = pred.description;
      try {
        const res = await fetch(
          `/api/places/details?placeId=${encodeURIComponent(pred.place_id)}`
        );
        const data = await res.json();
        if (res.ok && data.formatted_address) {
          finalValue = data.formatted_address;
          setInputValue(finalValue);
        } else {
          setInputValue(pred.description);
        }
      } catch {
        setInputValue(pred.description);
      } finally {
        setLoading(false);
        onChange?.({ target: { value: finalValue } } as React.ChangeEvent<HTMLInputElement>);
      }
    },
    [onChange]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open || predictions.length === 0) {
        if (e.key === "Escape") setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => (i < predictions.length - 1 ? i + 1 : i));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => (i > 0 ? i - 1 : -1));
        return;
      }
      if (e.key === "Enter" && highlightIndex >= 0 && predictions[highlightIndex]) {
        e.preventDefault();
        selectPlace(predictions[highlightIndex]);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        setHighlightIndex(-1);
      }
    },
    [open, predictions, highlightIndex, selectPlace]
  );

  const showDropdown = open && (predictions.length > 0 || loading || error);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        id={id}
        name={name}
        required={required}
        autoComplete="off"
        readOnly={readOnly}
        placeholder={placeholder}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={onFocus}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onKeyDown={handleKeyDown}
        className={className}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-expanded={!!showDropdown}
        aria-autocomplete="list"
        aria-controls={showDropdown ? `${id}-listbox` : undefined}
        aria-activedescendant={
          highlightIndex >= 0 && predictions[highlightIndex]
            ? `${id}-option-${highlightIndex}`
            : undefined
        }
      />
      {showDropdown && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {loading && (
            <li className="px-4 py-2 text-sm text-neutral-500" role="option">
              Loading…
            </li>
          )}
          {error && !loading && (
            <li className="px-4 py-2 text-sm text-red-600" role="option">
              {error}
            </li>
          )}
          {!loading &&
            !error &&
            predictions.map((p, i) => (
              <li
                key={p.place_id}
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={highlightIndex === i}
                className={`cursor-pointer px-4 py-2 text-sm ${
                  highlightIndex === i
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-700 hover:bg-neutral-50"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectPlace(p);
                }}
              >
                {p.description}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
