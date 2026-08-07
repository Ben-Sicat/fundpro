CREATE TABLE "pledge_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pledge_id" uuid NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fundraisers" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "fundraisers" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "pledge_notes" ADD CONSTRAINT "pledge_notes_pledge_id_pledges_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pledge_notes_pledge_id_idx" ON "pledge_notes" USING btree ("pledge_id");