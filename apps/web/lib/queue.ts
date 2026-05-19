import { Queue } from "bullmq";
import IORedis from "ioredis";

let queue: Queue | null = null;

export function getDocumentQueue() {
  if (queue) return queue;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  queue = new Queue("document-processing", { connection });
  return queue;
}

export async function enqueueDocumentJob(input: { jobId: string; workspaceId: string; sourceFileId: string }) {
  const documentQueue = getDocumentQueue();
  if (!documentQueue) return { enqueued: false, reason: "REDIS_URL is not configured" };
  await documentQueue.add("process-document", input, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 100,
    removeOnFail: 500
  });
  return { enqueued: true };
}
