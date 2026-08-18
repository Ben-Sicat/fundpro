ALTER TABLE "pledges" ADD COLUMN "frequency_raw" text;--> statement-breakpoint
ALTER TABLE "pledges" ADD COLUMN "current_classification" text;--> statement-breakpoint
ALTER TABLE "pledges" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "pledges" ADD COLUMN "cancellation_source" text;--> statement-breakpoint
ALTER TABLE "pledges" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "pledges" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pledges" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pledges" ADD COLUMN "failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pledges" ADD COLUMN "attempts_to_success" integer;