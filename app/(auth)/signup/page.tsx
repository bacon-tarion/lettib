"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/app/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creating account…" : "Create account"}
    </Button>
  );
}

const initialState = { error: undefined as string | undefined };

function SignupForm() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan");
  const validPlan =
    plan === "pro" || plan === "power" || plan === "lifetime" ? plan : null;
  const [state, formAction] = useFormState(signUp, initialState);

  return (
    <Card className="w-full max-w-sm shadow-sm">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl">Create an account</CardTitle>
        <CardDescription>
          Start your multi-AI workspace. Bring your own API keys.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {validPlan && (
            <input type="hidden" name="plan" value={validPlan} />
          )}
          {state?.error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {state.error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="display_name">Name</Label>
            <Input
              id="display_name"
              name="display_name"
              type="text"
              placeholder="Your name"
              autoComplete="name"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <SubmitButton />
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <Card className="w-full max-w-sm shadow-sm">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
