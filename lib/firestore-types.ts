/**
 * Shared Firestore document types for projects, services, testimonials, users.
 */

export type ProjectCategory = "roofing" | "gutters" | "repairs";

export type Project = {
  id?: string;
  title: string;
  suburb: string;
  description: string;
  tags: string[];
  category: ProjectCategory;
  imageUrls: string[];
  order?: number;
  createdAt?: { _seconds: number };
  updatedAt?: { _seconds: number };
};

export type ServiceIcon =
  | "roof"
  | "gutter"
  | "repair"
  | "inspection"
  | "maintenance"
  | "emergency"
  | "strata";

export type Service = {
  id?: string;
  slug: string;
  title: string;
  description: string;
  icon: ServiceIcon;
  content: string[];
  /** When false, service is hidden on the public site and contact form. Default true. */
  active?: boolean;
  order?: number;
  createdAt?: { _seconds: number };
  updatedAt?: { _seconds: number };
};

export type Testimonial = {
  id?: string;
  quote: string;
  author: string;
  location?: string;
  rating: number;
  order?: number;
  createdAt?: { _seconds: number };
  updatedAt?: { _seconds: number };
};

export type UserRole = "admin";

export type UserDoc = {
  uid: string;
  email: string;
  role: UserRole;
  createdAt?: { _seconds: number };
};
