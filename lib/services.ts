export type ServiceIcon =
  | "roof"
  | "gutter"
  | "repair"
  | "inspection"
  | "maintenance"
  | "emergency"
  | "strata";

export type Service = {
  slug: string;
  title: string;
  description: string;
  icon: ServiceIcon;
  content: string[];
};

export const SERVICES: Service[] = [
  {
    slug: "new-roof",
    title: "New Roof",
    description:
      "New roof installations in metal and tile for residential and commercial properties across Sydney.",
    icon: "roof",
    content: [
      "We install new roofs with quality metal and tile systems to suit your home, climate and budget. Whether you're building new or adding an extension, we work with you to choose the right product and colour.",
      "Our team is licensed and experienced in both metal and tile roofing. We handle everything from preparation and batten replacement to flashing and ridge capping, so your new roof is built to last.",
      "We service all of Sydney and provide a clear written quote. Written warranty available on our workmanship.",
    ],
  },
  {
    slug: "re-roof",
    title: "Re-Roof",
    description:
      "Complete re-roofing services for ageing or damaged roofs, including removal and compliant installation.",
    icon: "roof",
    content: [
      "A full reroof gives your home a new lease of life. We strip the existing roof, inspect and repair the substrate where needed, then install your new metal or tile roof to a high standard.",
      "We work with leading metal and tile products and can advise on the best option for your property. Our reroofs include proper flashing, ridge capping and ventilation so the finished job lasts.",
      "Licensed, insured and with written warranty available. Get a free quote for your reroof across Sydney.",
    ],
  },
  {
    slug: "roof-restoration",
    title: "Roof Restoration",
    description:
      "Roof restoration services including repairs, cleaning and recoating to extend the life of your roof.",
    icon: "roof",
    content: [
      "Roof restoration brings your existing roof back to top condition. We clean, repair and recoat metal and tile roofs to improve appearance, weatherproofing and longevity.",
      "Our restoration process includes pressure cleaning, repointing, replacement of broken tiles or damaged sheets, and application of quality coatings. Ideal when a full replacement isn't needed.",
      "We service all of Sydney. Get a free quote for your roof restoration.",
    ],
  },
  {
    slug: "gutters",
    title: "Gutters",
    description:
      "Gutter and downpipe installation in aluminium, steel and PVC for effective water management.",
    icon: "gutter",
    content: [
      "Gutters and downpipes direct water away from your roof and walls, protecting your home from moisture and damage. We supply and install aluminium, steel and PVC systems tailored to your property.",
      "Whether you need a full replacement or a new gutter run, we measure accurately, quote clearly and install to a high standard. We also repair and replace damaged sections and downpipes.",
      "We've got you covered across Sydney. Licensed, insured and with written warranty available. Get a free quote.",
    ],
  },
  {
    slug: "repairs",
    title: "Repairs",
    description:
      "Roof repair services covering leaks, tile replacement, flashing and structural issues.",
    icon: "repair",
    content: [
      "Roof and gutter repairs done properly save you money and stress. We track down the cause of leaks, replace broken or missing tiles, repair and replace flashings, and fix structural issues so the repair lasts.",
      "We don't just patch over problems—we diagnose and fix the underlying cause. That means less call-backs and a roof you can rely on.",
      "Licensed, insured and with written warranty available. For urgent repairs across Sydney, call us for a free quote.",
    ],
  },
  {
    slug: "inspections",
    title: "Inspections",
    description:
      "Professional roof and gutter inspections with written reports for maintenance, sales or storm damage.",
    icon: "inspection",
    content: [
      "A professional roof and gutter inspection gives you a clear picture of condition and any issues. We inspect the roof surface, flashings, gutters and downpipes, and provide a written report with findings and recommendations.",
      "Inspections are ideal before buying a property, after storms or severe weather, or for peace of mind. We can identify leaks, damage, wear and maintenance needs so you can plan with confidence.",
      "We service all of Sydney. Get in touch to book an inspection and receive your written report.",
    ],
  },
];

export function getServiceBySlug(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

export function getAllServiceSlugs(): string[] {
  return SERVICES.map((s) => s.slug);
}
