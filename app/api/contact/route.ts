import { submitContactForm } from "@/app/contact/actions";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const result = await submitContactForm({ success: false }, formData);
  return NextResponse.json(result);
}
