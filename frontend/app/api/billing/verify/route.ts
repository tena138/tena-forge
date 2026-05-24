import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Use backend PortOne billing-key confirmation at /api/saas/billing/confirm-billing-key." },
    { status: 410 },
  );
}
