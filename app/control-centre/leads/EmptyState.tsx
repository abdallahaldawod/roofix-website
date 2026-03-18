"use client";

type EmptyStateProps = {
  onAddSource: () => void;
};

export function EmptyState({ onAddSource }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 py-16 shadow-sm">
      <p className="text-center text-base font-medium text-neutral-900">No lead sources yet</p>
      <p className="mt-2 max-w-sm text-center text-sm text-neutral-600">
        Add your first source to start automating leads
      </p>
      <button
        type="button"
        onClick={onAddSource}
        className="mt-6 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover"
      >
        Add Source
      </button>
    </div>
  );
}
