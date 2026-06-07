import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SignupForm } from "./signup-form";

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
