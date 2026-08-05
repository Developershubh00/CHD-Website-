import { z } from "zod";

// Every submission is posted to BOTH Apps Script deployments on purpose.
// A live test (Aug 2026) confirmed exactly one of them emails
// vikram@creativehomedecorllp.com, but which URL maps to that script is not
// recorded anywhere accessible, so BOTH are kept: posting to the inactive
// one costs nothing, while removing the wrong one would silently lose every
// lead. Do not remove either URL unless a submission starts producing
// duplicate emails (that would mean both scripts became active).
const ENDPOINTS = [
  "https://script.google.com/macros/s/AKfycbzvEYzRXLxRlkzkKqBHSCsPlbilVtiu01vZHcGnl_mgkXD6rOGfBo0yXmSCFIaxf9NNJw/exec",
  "https://script.google.com/macros/s/AKfycbw9Oijwraf6VEU8BHXnzI_wYTTBDF6LXjql32clKyqfAsasvMgPaiKBGVeT2inybPxTWQ/exec",
];

const TIMEOUT_MS = 15000;

export const contactFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  company: z.string().min(2, "Company name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address").max(255),
  country: z.string().min(2, "Country is required").max(100),
  message: z.string().min(10, "Message must be at least 10 characters").max(1000),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

export const quickContactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name (at least 2 characters)").max(100),
  email: z.string().trim().email("Please enter a valid email address").max(255),
  phone: z.string().trim().max(30, "Phone number is too long").optional().or(z.literal("")),
  company: z.string().trim().max(100, "Company name is too long").optional().or(z.literal("")),
  message: z.string().trim().min(10, "Please write a short message (at least 10 characters)").max(1000),
});

export type QuickContactValues = z.infer<typeof quickContactSchema>;

/**
 * Posts the given fields as FormData to every configured Apps Script
 * endpoint. Resolves if at least one request goes through (no-cors means
 * a fulfilled fetch is the strongest success signal available) and rejects
 * only when all of them fail.
 */
export async function submitContact(fields: Record<string, string | undefined>): Promise<void> {
  const results = await Promise.allSettled(
    ENDPOINTS.map((url) => {
      const formData = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) formData.append(key, value);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      return fetch(url, {
        method: "POST",
        mode: "no-cors",
        body: formData,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
    })
  );

  if (!results.some((result) => result.status === "fulfilled")) {
    throw new Error("Could not reach the contact service");
  }
}
