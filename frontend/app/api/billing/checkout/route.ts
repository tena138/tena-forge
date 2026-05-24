import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Use backend PortOne billing-key checkout at /api/saas/billing/checkout." },
    { status: 410 },
  );
}
