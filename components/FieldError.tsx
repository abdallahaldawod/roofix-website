type FieldErrorProps = {
  id?: string;
  message: string;
};

export default function FieldError({ id, message }: FieldErrorProps) {
  return (
    <div
      id={id}
      role="alert"
      className="relative mt-2 flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
    >
      {/* Pointer: upward triangle from top-left, same border as box */}
      <span
        className="absolute left-4 top-0 block h-0 w-0 -translate-y-full border-[6px] border-transparent border-b-neutral-200"
        aria-hidden
      />
      <span
        className="absolute left-[17px] top-0 -mt-px block h-0 w-0 -translate-y-full border-[5px] border-transparent border-b-white"
        aria-hidden
      />
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-base font-bold leading-none text-white"
        aria-hidden
      >
        !
      </span>
      <p className="text-sm font-medium text-neutral-900">{message}</p>
    </div>
  );
}
