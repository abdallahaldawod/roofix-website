"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useState } from "react";
import CustomSelect from "@/components/CustomSelect";
import FieldError from "@/components/FieldError";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { submitContactForm } from "@/app/contact/actions";
import { trackLeadSubmit } from "@/lib/analytics/ga4";
import TrackedPhoneLink from "@/components/TrackedPhoneLink";

const DEFAULT_SERVICE_OPTIONS = [
  "New Roof",
  "Re-Roof",
  "Roof Restoration",
  "Gutters",
  "Repairs",
  "Inspections",
  "Other",
];

const PROJECT_TYPE_OPTIONS = [
  "Residential",
  "Commercial",
  "Strata",
];

type FormState = {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  formData?: {
    name: string;
    email: string;
    suburb: string;
    message: string;
    phone: string;
    projectType: string;
    service: string;
  };
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full min-h-[44px] rounded-lg btn-accent disabled:opacity-50 sm:w-auto px-5 py-2.5 font-semibold active:scale-[0.98]"
    >
      {pending ? "Sending…" : "Send message"}
    </button>
  );
}

type ContactFormProps = {
  /** Service options for the dropdown (e.g. from Firestore). Falls back to default list if empty. */
  serviceOptions?: string[];
};

export default function ContactForm(props?: ContactFormProps) {
  const serviceOptions = (props?.serviceOptions?.length ? props.serviceOptions! : DEFAULT_SERVICE_OPTIONS);
  const [state, formAction] = useActionState(submitContactForm, { success: false });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [suburb, setSuburb] = useState("");
  const [message, setMessage] = useState("");
  const [projectType, setProjectType] = useState("");
  const [service, setService] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    setFieldErrors(state.fieldErrors ?? {});
  }, [state.fieldErrors]);

  useEffect(() => {
    if (state.success) trackLeadSubmit();
  }, [state.success]);

  useEffect(() => {
    if (state.formData) {
      setName(state.formData.name);
      setEmail(state.formData.email);
      setSuburb(state.formData.suburb);
      setMessage(state.formData.message);
      setPhone(state.formData.phone);
      setProjectType(state.formData.projectType);
      setService(state.formData.service);
    }
  }, [state.formData]);

  /** Remove readonly on first interaction so Safari doesn't show contact autofill (fields start readonly). */
  const removeReadOnly = (e: React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    e.currentTarget.removeAttribute("readOnly");
  };

  function clearFieldError(field: keyof NonNullable<FormState["fieldErrors"]>) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  if (state.success) {
    return (
      <div className="relative flex min-h-0 flex-1 items-center overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 to-white p-4 shadow-sm sm:p-5">
        <div className="absolute right-0 top-0 h-20 w-20 translate-x-5 -translate-y-5 rounded-full bg-emerald-100/60" aria-hidden />
        <div className="relative w-full text-left">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-md shadow-emerald-500/25">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-base font-bold tracking-tight text-neutral-900 sm:text-lg">
            Message sent
          </h3>
          <p className="mt-1 text-sm leading-snug text-neutral-600">
            Thanks for getting in touch. We&apos;ll get back to you within 24 hours.
          </p>
          <p className="mt-1.5 text-xs text-neutral-500">
            Need a quicker response? Call us on{" "}
            <TrackedPhoneLink href="tel:0497777755" location="contact_success" className="font-semibold text-emerald-600 hover:text-emerald-700 hover:underline">
              0497 777 755
            </TrackedPhoneLink>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-3" autoComplete="nope">
      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-neutral-700">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="nope"
          readOnly
          placeholder="Your name"
          value={name}
          onFocus={removeReadOnly}
          onMouseDown={removeReadOnly}
          onTouchStart={removeReadOnly}
          onChange={(e) => {
            setName(e.target.value);
            clearFieldError("name");
          }}
          className="mt-0.5 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm placeholder:text-sm focus:border-accent focus:ring-1 focus:ring-accent"
          aria-invalid={!!fieldErrors?.name}
          aria-describedby={fieldErrors?.name ? "name-error" : undefined}
        />
        {fieldErrors?.name && (
          <FieldError id="name-error" message={fieldErrors.name} />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-neutral-700">
            Phone <span className="text-red-500">*</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            autoComplete="nope"
            readOnly
            placeholder="04XX XXX XXX"
            onFocus={removeReadOnly}
            onMouseDown={removeReadOnly}
            onTouchStart={removeReadOnly}
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
              clearFieldError("phone");
            }}
            className="mt-0.5 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm placeholder:text-sm focus:border-accent focus:ring-1 focus:ring-accent"
            aria-invalid={!!fieldErrors?.phone}
            aria-describedby={fieldErrors?.phone ? "phone-error" : undefined}
          />
          {fieldErrors?.phone && (
            <FieldError id="phone-error" message={fieldErrors.phone} />
          )}
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="nope"
            readOnly
            placeholder="you@example.com"
            value={email}
            onFocus={removeReadOnly}
            onMouseDown={removeReadOnly}
            onTouchStart={removeReadOnly}
            onChange={(e) => {
              setEmail(e.target.value);
              clearFieldError("email");
            }}
            className="mt-0.5 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm placeholder:text-sm focus:border-accent focus:ring-1 focus:ring-accent"
            aria-invalid={!!fieldErrors?.email}
            aria-describedby={fieldErrors?.email ? "email-error" : undefined}
          />
          {fieldErrors?.email && (
            <FieldError id="email-error" message={fieldErrors.email} />
          )}
        </div>
      </div>
      <div data-address-api="server" data-cursor-element-id="cursor-el-1">
        <label htmlFor="suburb" className="block text-sm font-medium text-neutral-700">
          Address <span className="text-red-500">*</span>
        </label>
        <AddressAutocomplete
          id="suburb"
          name="suburb"
          required
          placeholder="Start typing your suburb or address"
          value={suburb}
          readOnly
          onFocus={removeReadOnly}
          onMouseDown={removeReadOnly}
          onTouchStart={removeReadOnly}
          className="mt-0.5 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm placeholder:text-sm focus:border-accent focus:ring-1 focus:ring-accent"
          aria-label="Address or suburb (suggestions from our server)"
          aria-describedby={fieldErrors?.suburb ? "suburb-error" : undefined}
          aria-invalid={!!fieldErrors?.suburb}
          onChange={(e) => {
            setSuburb(e.target.value);
            clearFieldError("suburb");
          }}
        />
        {fieldErrors?.suburb && (
          <FieldError id="suburb-error" message={fieldErrors.suburb} />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="projectType" className="block text-sm font-medium text-neutral-700">
            Project type <span className="text-red-500">*</span>
          </label>
          <CustomSelect
            id="projectType"
            name="projectType"
            placeholder="Select project type"
            options={PROJECT_TYPE_OPTIONS}
            value={projectType}
            onChange={(v) => {
              setProjectType(v);
              clearFieldError("projectType");
            }}
            required
            aria-invalid={!!fieldErrors?.projectType}
            aria-describedby={fieldErrors?.projectType ? "projectType-error" : undefined}
            error={fieldErrors?.projectType}
          />
        </div>
        <div>
          <label htmlFor="service" className="block text-sm font-medium text-neutral-700">
            Services Required <span className="text-red-500">*</span>
          </label>
          <CustomSelect
            id="service"
            name="service"
            placeholder="Select a service"
            options={serviceOptions}
            value={service}
            onChange={(v) => {
              setService(v);
              clearFieldError("service");
            }}
            required
            aria-invalid={!!fieldErrors?.service}
            aria-describedby={fieldErrors?.service ? "service-error" : undefined}
            error={fieldErrors?.service}
          />
        </div>
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-neutral-700">
          Message <span className="text-neutral-400">(optional)</span>
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={3}
          placeholder="Tell us about your project or enquiry..."
          value={message}
          className="mt-0.5 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm placeholder:text-sm focus:border-accent focus:ring-1 focus:ring-accent"
          aria-invalid={!!fieldErrors?.message}
          aria-describedby={fieldErrors?.message ? "message-error" : undefined}
          onChange={(e) => {
            setMessage(e.target.value);
            clearFieldError("message");
          }}
        />
        {fieldErrors?.message && (
          <FieldError id="message-error" message={fieldErrors.message} />
        )}
      </div>
      <div>
        <label htmlFor="documents" className="block text-sm font-medium text-neutral-700">
          Upload documents <span className="text-neutral-500 font-normal">(optional)</span>
        </label>
        <input
          id="documents"
          name="documents"
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic"
          className="mt-0.5 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-200 focus:border-accent focus:ring-1 focus:ring-accent"
          aria-describedby="documents-hint"
        />
        <p id="documents-hint" className="mt-0.5 text-xs text-neutral-500">
          Photos and PDF files. Max 5MB per file.
        </p>
      </div>
      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
