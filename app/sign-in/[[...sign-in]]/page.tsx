"use client";
import { SignIn } from "@clerk/nextjs";
export default function SignInPage() {
  return <main className="auth-page"><section className="auth-card clerk-card"><SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" fallbackRedirectUrl="/#/workspace" /></section></main>;
}
