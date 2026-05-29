import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { OnboardingForm } from "@/components/forms/onboarding-form";
import { AuthShell } from "@/components/auth-shell";

export default async function OnboardingPage() {
  // If the user already belongs to an org, skip onboarding.
  const ctx = await getOrgContext(true);
  if (ctx) redirect("/dashboard");

  return (
    <AuthShell
      title="Set up your portfolio"
      subtitle="Name your organization to get started"
    >
      <OnboardingForm />
    </AuthShell>
  );
}
