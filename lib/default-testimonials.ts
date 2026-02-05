/**
 * Default testimonials shown on the website when Firestore is empty.
 * Used as fallback on the home page and for "Import default testimonials" in control centre.
 */

import type { Testimonial } from "@/lib/firestore-types";

export const DEFAULT_TESTIMONIALS: Omit<Testimonial, "id">[] = [
  { quote: "Roofix replaced our entire roof and the team was professional from start to finish. Clear quote, on time, and the roof looks great.", author: "Sarah M.", location: "Northern Beaches", rating: 5 },
  { quote: "We had a leak that other companies couldn't fix. Roofix found the cause and fixed it properly. Highly recommend.", author: "James T.", location: "Eastern Suburbs", rating: 5 },
  { quote: "Fast quote, fair price, and they cleaned up after themselves. Will use again for gutter work.", author: "Lisa K.", location: "Inner West", rating: 5 },
];
