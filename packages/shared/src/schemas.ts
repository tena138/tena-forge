import { z } from "zod";

export const jobOptionsSchema = z.object({
  extractionMode: z.enum(["faithful", "fast", "layout-aware"]).default("faithful"),
  generatePreview: z.boolean().default(true),
  templateId: z.string().uuid().optional(),
  includeSolutions: z.boolean().default(false),
  language: z.enum(["ko", "en"]).default("ko")
});

export const createJobSchema = z.object({
  workspace_id: z.string().uuid(),
  source_file_id: z.string().uuid(),
  job_type: z.enum(["problem_extraction", "template_generation", "pdf_generation"]),
  options: jobOptionsSchema.default({
    extractionMode: "faithful",
    generatePreview: true,
    includeSolutions: false,
    language: "ko"
  })
});

export const extractedItemSchema = z.object({
  item_type: z.enum(["problem", "explanation", "passage", "solution", "other"]),
  source_page: z.number().int().min(1),
  content_text: z.string(),
  content_html: z.string().optional(),
  math_latex: z.string().optional(),
  images: z.array(z.string()).default([]),
  subject: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  difficulty: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const aiExtractionResponseSchema = z.object({
  items: z.array(extractedItemSchema)
});

export const templateSchema = z.object({
  workspace_id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  template_html: z.string().min(1),
  template_css: z.string().optional(),
  is_public: z.boolean().default(false)
});
