import { supabase } from "../supabase";
import type { ContactFormInput } from "./validation";

export async function submitContactMessage(input: ContactFormInput, honeypot: string) {
  const fields = {
    name: input.name.trim(),
    email: input.email.trim(),
    subject: input.subject.trim(),
    body: input.body.trim(),
  };
  const { error } = await supabase.rpc("submit_contact_message", {
    sender_name: fields.name,
    sender_email: fields.email,
    message_subject: fields.subject,
    message_body: fields.body,
    honeypot,
  });

  // Keep the old intake working while the new RPC is absent from a preview database.
  if (error?.code === "PGRST202" || error?.code === "42883") {
    return (await supabase.from("contact_messages").insert(fields)).error;
  }
  return error;
}

export function isContactRateLimitError(error: { code: string }): boolean {
  return error.code === "PT429" || error.code === "P0001";
}
