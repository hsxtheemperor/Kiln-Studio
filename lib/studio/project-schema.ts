import { z } from "zod";

const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const timestamp = Date.parse(value);
    return (
      Number.isFinite(timestamp) &&
      new Date(timestamp).toISOString().slice(0, 10) === value
    );
  });

export const ProjectUpdateSchema = z
  .object({
    deadline_date: CalendarDateSchema.nullable().optional(),
    project_manager_id: z.string().uuid().nullable().optional(),
    status: z.literal("completed").optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
