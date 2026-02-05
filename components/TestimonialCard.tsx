type TestimonialCardProps = {
  quote: string;
  author: string;
  location?: string;
  rating?: number;
};

export default function TestimonialCard({
  quote,
  author,
  location,
  rating = 5,
}: TestimonialCardProps) {
  return (
    <blockquote className="flex flex-col rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex gap-1 text-accent" aria-hidden="true">
        {Array.from({ length: rating }).map((_, i) => (
          <svg
            key={i}
            className="h-5 w-5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <p className="flex-1 text-neutral-700">&ldquo;{quote}&rdquo;</p>
      <footer className="mt-4 border-t border-neutral-100 pt-4">
        <cite className="not-italic">
          <span className="font-semibold text-neutral-900">{author}</span>
          {location && (
            <span className="ml-1 text-sm text-neutral-500">— {location}</span>
          )}
        </cite>
      </footer>
    </blockquote>
  );
}
