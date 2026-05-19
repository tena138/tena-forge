import { promises as fs } from "node:fs";
import path from "node:path";

import type { BillingCycle, PaidPlanType, SelectedPackageIds } from "@/lib/plan-pricing";

export type SubscriptionOrderRecord = {
  id: string;
  userId: string | null;
  planType: PaidPlanType;
  billingCycle: BillingCycle;
  selectedPackages: SelectedPackageIds;
  amountKRW: number;
  currency: "KRW";
  status: "ready" | "paid" | "failed" | "canceled";
  portonePaymentId: string;
  orderName: string;
  createdAt: string;
  updatedAt: string;
  paymentSnapshot?: unknown;
};

export type EnterpriseInquiryRecord = {
  id: string;
  companySize: string;
  companyName: string;
  lastName: string;
  firstName: string;
  email: string;
  phone: string;
  interest: string;
  message: string;
  status: "new" | "contacted" | "closed";
  createdAt: string;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const ORDERS_FILE = path.join(DATA_DIR, "subscription-orders.json");
const INQUIRIES_FILE = path.join(DATA_DIR, "enterprise-inquiries.json");

async function readJsonArray<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T[];
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeJsonArray<T>(filePath: string, records: T[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(records, null, 2), "utf8");
}

export async function saveSubscriptionOrder(record: SubscriptionOrderRecord) {
  const records = await readJsonArray<SubscriptionOrderRecord>(ORDERS_FILE);
  const index = records.findIndex((item) => item.portonePaymentId === record.portonePaymentId || item.id === record.id);
  if (index >= 0) records[index] = record;
  else records.push(record);
  await writeJsonArray(ORDERS_FILE, records);
  return record;
}

export async function findSubscriptionOrderByPaymentId(paymentId: string) {
  const records = await readJsonArray<SubscriptionOrderRecord>(ORDERS_FILE);
  return records.find((record) => record.portonePaymentId === paymentId) || null;
}

export async function updateSubscriptionOrder(paymentId: string, patch: Partial<SubscriptionOrderRecord>) {
  const records = await readJsonArray<SubscriptionOrderRecord>(ORDERS_FILE);
  const index = records.findIndex((record) => record.portonePaymentId === paymentId);
  if (index < 0) return null;
  records[index] = { ...records[index], ...patch, updatedAt: new Date().toISOString() };
  await writeJsonArray(ORDERS_FILE, records);
  return records[index];
}

export async function saveEnterpriseInquiry(record: EnterpriseInquiryRecord) {
  const records = await readJsonArray<EnterpriseInquiryRecord>(INQUIRIES_FILE);
  records.push(record);
  await writeJsonArray(INQUIRIES_FILE, records);
  // TODO: Forward to CRM/email automation when the production integration is selected.
  return record;
}
