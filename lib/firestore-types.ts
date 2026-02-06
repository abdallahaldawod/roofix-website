/**
 * Shared Firestore document types for projects, services, testimonials, users.
 */

/** Default categories; project filter tabs and project.category can use these or custom values from config. */
export type ProjectCategory = "roofing" | "gutters" | "repairs";

export type Project = {
  id?: string;
  /** URL path segment (e.g. "full-roof-manly"). Stored in Firestore; also used as document ID. */
  slug?: string;
  title: string;
  suburb: string;
  description: string;
  tags: string[];
  /** Category slug for filtering; matches a filter tab value (e.g. roofing, gutters, repairs, or custom). */
  category: string;
  imageUrls: string[];
  order?: number;
  /** Optional: for project detail story (problem → solution → result). */
  roofType?: string;
  roofSizeM2?: number;
  durationDays?: number;
  materials?: string[];
  problem?: string;
  solution?: string;
  result?: string;
  testimonialQuote?: string;
  testimonialAuthor?: string;
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
  | "strata"
  | "home"
  | "building"
  | "building-2"
  | "hammer"
  | "paintbrush"
  | "ruler"
  | "shield"
  | "shield-check"
  | "thermometer"
  | "snowflake"
  | "wind"
  | "sun"
  | "droplet"
  | "wrench"
  | "clipboard-check"
  | "settings"
  | "alert-circle"
  | "key"
  | "lightbulb"
  | "file-check"
  | "eye"
  | "package"
  | "truck"
  | "phone"
  | "mail"
  | "map-pin"
  | "leaf"
  | "tree-pine"
  | "zap"
  | "circle-check"
  | "star"
  | "flame"
  | "layers"
  | "box"
  | "ruler-pencil"
  | "hard-hat"
  | "brush"
  | "spray-can"
  | "droplets"
  | "cloud-rain"
  | "sun-snow"
  | "badge-check"
  | "award"
  | "heart-handshake"
  | "tool"
  | "screwdriver"
  | "drill"
  | "tape-measure"
  | "clipboard-list"
  | "file-text"
  | "calendar"
  | "clock"
  | "users"
  | "user-check"
  | "briefcase"
  | "receipt"
  | "message-square"
  | "camera"
  | "image"
  | "palette"
  | "scissors"
  | "pen-tool"
  | "bookmark"
  | "tag"
  | "link"
  | "external-link"
  | "arrow-right"
  | "thumbs-up"
  | "hand-heart"
  | "circle-dot"
  | "square-check"
  | "gauge"
  | "battery"
  | "plug"
  | "plug-zap"
  | "umbrella"
  | "cloud"
  | "cloud-sun"
  | "cloud-lightning"
  | "thermometer-sun"
  | "droplet-off"
  | "shield-alert"
  | "shield-off"
  | "check-square"
  | "list-checks"
  | "clipboard"
  | "file-plus"
  | "folder"
  | "archive"
  | "inbox"
  | "send"
  | "quote"
  | "message-circle"
  | "phone-call"
  | "headphones"
  | "bell"
  | "megaphone";

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
