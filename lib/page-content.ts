/**
 * Editable page content for Home, About, Contact.
 * Stored in Firestore `pages` collection (docs: home, about, contact).
 */

export type HomeContent = {
  heroHeadline: string;
  heroTrustBadges: string[];
  howItWorksSubline: string;
  howItWorks: { step: number; title: string; description: string }[];
  recentProjectsHeadline: string;
  recentProjectsSubline: string;
  testimonialsHeadline: string;
  testimonialsSubline: string;
  faqHeadline: string;
  faqItems: { question: string; answer: string }[];
  ctaHeadline: string;
  ctaSubline: string;
  ctaButtonLabel: string;
};

export type AboutContent = {
  heroTitle: string;
  heroSubline: string;
  whoWeAreTitle: string;
  whoWeAreParagraphs: string[];
  valuesTitle: string;
  values: { title: string; description: string }[];
  ctaTitle: string;
  ctaSubline: string;
  /** Phone number for CTA (e.g. "0497 777 755") */
  phone: string;
};

export type ContactContent = {
  heroTitle: string;
  heroSubline: string;
  getInTouchTitle: string;
  getInTouchSubtitle: string;
  introParagraph: string;
  phone: string;
  email: string;
  abn: string;
  licenceNo: string;
  serviceArea: string;
  hours: string;
};

export type PageContentMap = {
  home: HomeContent;
  about: AboutContent;
  contact: ContactContent;
};

export type PageId = keyof PageContentMap;

export const DEFAULT_HOME_CONTENT: HomeContent = {
  heroHeadline: "We've got you covered.",
  heroTrustBadges: ["Licensed & Insured", "10 Year Warranty", "Free Quotes", "5-Star Reviews"],
  howItWorksSubline: "Simple, transparent process from quote to completion.",
  howItWorks: [
    { step: 1, title: "Request Quote", description: "Call us or fill in the form. We'll arrange a time that suits you." },
    { step: 2, title: "Inspection / Scope", description: "We inspect and provide a clear written quote. No obligation." },
    { step: 3, title: "Complete & Warranty", description: "We complete the work to a high standard. Written warranty available." },
  ],
  recentProjectsHeadline: "Recent Projects",
  recentProjectsSubline: "A sample of our roofing and gutter work across Sydney.",
  testimonialsHeadline: "What Our Customers Say",
  testimonialsSubline: "Real feedback from homeowners we've worked with.",
  faqHeadline: "Frequently Asked Questions",
  faqItems: [
    { question: "Are you licensed and insured?", answer: "Yes. We are fully licensed for roofing and gutter work and carry public liability and other relevant insurance. We can provide certificates on request." },
    { question: "How quickly can I get a quote?", answer: "We aim to provide a written quote within 24–48 hours of the inspection. For urgent jobs we can often attend the same or next day." },
    { question: "Do you offer warranty on your work?", answer: "Yes. Written warranty available. We stand behind our workmanship and use quality materials with manufacturer warranties where applicable." },
    { question: "What areas do you service?", answer: "We service all of Sydney. Contact us to confirm your suburb." },
    { question: "Do you do emergency repairs?", answer: "Yes. We offer emergency and urgent roof and gutter repairs. Call now for priority help." },
    { question: "What payment options do you accept?", answer: "We accept bank transfer, cheque and card. Payment terms can be discussed at quote stage for larger jobs." },
  ],
  ctaHeadline: "Ready for a Free Quote?",
  ctaSubline: "We've got you covered. Get in touch today.",
  ctaButtonLabel: "Get a Free Quote",
};

export const DEFAULT_ABOUT_CONTENT: AboutContent = {
  heroTitle: "About Roofix",
  heroSubline: "Licensed, insured roofing and gutter specialists you can trust.",
  whoWeAreTitle: "Who We Are",
  whoWeAreParagraphs: [
    "Roofix specialises in roofing and gutters for homes and small commercial properties. We offer new installations, repairs, inspections and maintenance – all carried out by licensed, insured tradespeople who take pride in doing the job right.",
    "We believe in clear quotes, on-time work and standing behind what we do. Whether you need a full roof replacement, new gutters or a quick repair, we're here to help.",
  ],
  valuesTitle: "What We Stand For",
  values: [
    { title: "Quality", description: "We use quality materials and work to a high standard so your roof and gutters last." },
    { title: "Reliability", description: "We turn up on time, quote clearly, and communicate so you know what to expect." },
    { title: "Trust", description: "Licensed, insured and warranty-backed. We stand behind our work." },
  ],
  ctaTitle: "Ready to Get Started?",
  ctaSubline: "Get a free quote or give us a call to discuss your project.",
  phone: "0497 777 755",
};

export const DEFAULT_CONTACT_CONTENT: ContactContent = {
  heroTitle: "Contact Us",
  heroSubline: "Get a free quote or ask a question. We're here to help.",
  getInTouchTitle: "Get in touch",
  getInTouchSubtitle: "Roofix – Roofing & Gutters",
  introParagraph: "Fill in the form and we'll get back to you within 24 hours. For urgent enquiries, call us.",
  phone: "0497 777 755",
  email: "info@roofix.com.au",
  abn: "53 653 752 651",
  licenceNo: "399493C",
  serviceArea: "All of Sydney",
  hours: "Monday – Friday, 7am – 5pm",
};

export const DEFAULT_PAGE_CONTENT: PageContentMap = {
  home: DEFAULT_HOME_CONTENT,
  about: DEFAULT_ABOUT_CONTENT,
  contact: DEFAULT_CONTACT_CONTENT,
};

export function getDefaultPageContent<K extends PageId>(pageId: K): PageContentMap[K] {
  return DEFAULT_PAGE_CONTENT[pageId] as PageContentMap[K];
}
