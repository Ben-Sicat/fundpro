ALTER TABLE "export_runs" ALTER COLUMN "template_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "starts_on" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_name" text;--> statement-breakpoint
ALTER TABLE "export_runs" ADD COLUMN "template_code" text;--> statement-breakpoint
ALTER TABLE "export_runs" ADD COLUMN "template_name" text;--> statement-breakpoint
ALTER TABLE "export_runs" ADD COLUMN "run_by_name" text;--> statement-breakpoint
ALTER TABLE "fundraisers" ADD COLUMN "tier" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "uploaded_by_name" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "new_record_count" integer;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "exception_count" integer;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "import_exceptions" ADD COLUMN "filename" text;--> statement-breakpoint
ALTER TABLE "import_exceptions" ADD COLUMN "detail" text;