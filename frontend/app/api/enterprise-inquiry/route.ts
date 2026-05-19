import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { saveEnterpriseInquiry } from "@/lib/server/subscription-store";

const inquirySchema = z.object({
  companySize: z.string().min(1),
  companyName: z.string().min(1),
  lastName: z.string().min(1),
  firstName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().regex(/^[0-9+\-\s()]{7,20}$/),
  interest: z.string().min(1),
  message: z.string().min(10),
});

export async function POST(request: NextRequest) {
  try {
    const payload = inquirySchema.parse(await request.json());
    const record = await saveEnterpriseInquiry({
      id: randomUUID(),
      ...payload,
      status: "new",
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({
      ok: true,
      id: record.id,
      message: "문의가 접수되었습니다. 담당자가 확인 후 연락드리겠습니다.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.issues ? "필수 항목을 올바르게 입력해주세요." : "문의 접수에 실패했습니다." },
      { status: 400 }
    );
  }
}
