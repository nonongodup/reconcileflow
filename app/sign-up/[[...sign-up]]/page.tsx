"use client";
import { SignUp } from "@clerk/nextjs";
export default function SignUpPage() {
  return <main className="auth-page"><section className="auth-card clerk-card"><SignUp path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl="/#/workspace" /></section></main>;
}
