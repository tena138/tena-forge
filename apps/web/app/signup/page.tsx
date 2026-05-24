import { SignupConsentForm } from "@/components/signup-consent-form";

export const dynamic = "force-dynamic";

export default function SignupPage({ searchParams }: { searchParams: { message?: string } }) {
  const message = searchParams.message ? decodeURIComponent(searchParams.message) : "";

  return <SignupConsentForm message={message} />;
}
