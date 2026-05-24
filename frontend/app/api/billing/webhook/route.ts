import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Use backend PortOne billing webhook at /api/saas/billing/webhook." },
    { status: 410 },
  );
}
