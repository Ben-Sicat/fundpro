CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"location_id" uuid,
	"description" text,
	CONSTRAINT "agents_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"detail" jsonb,
	"contains_pii" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pledge_id" uuid NOT NULL,
	"import_batch_id" uuid,
	"status_id" integer NOT NULL,
	"reason" text,
	"reason_desc" text,
	"status_date" date NOT NULL,
	"bank_batch_no" text,
	"attempt_no" integer,
	"anniversary" integer,
	"raw_row" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charity_id" uuid NOT NULL,
	"campaign_code" text,
	"fund_code" text,
	"appeal_code" text,
	"program_code" text,
	"event_code" text,
	CONSTRAINT "campaigns_natural_key" UNIQUE("charity_id","campaign_code","fund_code","appeal_code","program_code","event_code")
);
--> statement-breakpoint
CREATE TABLE "charities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"source_code" text,
	"invoice_prefix" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charities_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "clawbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"report_month" text,
	"clawback_date" date,
	"confirmed" boolean DEFAULT false NOT NULL,
	"confirmed_by" uuid,
	"netted_in_run" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clawbacks_reason_check" CHECK ("clawbacks"."reason" in ('cancelled', 'unrealized', 'failed_final'))
);
--> statement-breakpoint
CREATE TABLE "commission_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"charity_id" uuid,
	"trigger_rule" text NOT NULL,
	"trigger_n" integer,
	"amount" numeric(12, 2),
	"pct_of_pledge" numeric(5, 2),
	"realization_window_days" integer,
	"clawback_on" text[],
	"effective_from" date DEFAULT now() NOT NULL,
	CONSTRAINT "commission_plans_trigger_rule_check" CHECK ("commission_plans"."trigger_rule" in ('on_submission', 'on_first_approval', 'on_n_billings'))
);
--> statement-breakpoint
CREATE TABLE "donors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"first_name" text,
	"last_name" text,
	"full_name" text NOT NULL,
	"chinese_name" text,
	"national_id" text,
	"gender" text,
	"dob" date,
	"language" text,
	"spoken_language" text,
	"email" text,
	"tel_mobile" text,
	"tel_home" text,
	"tel_office" text,
	"address_1" text,
	"address_2" text,
	"address_3" text,
	"address_4" text,
	"postcode" text,
	"city" text,
	"state" text,
	"country" text,
	"postal_mail_ok" boolean,
	"email_ok" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"schedule_id" uuid,
	"run_by" uuid,
	"filters_applied" jsonb,
	"row_count" integer,
	"file_name" text,
	"contains_pii" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"cadence" text NOT NULL,
	"cadence_detail" jsonb,
	"delivery" text NOT NULL,
	"recipients" jsonb NOT NULL,
	"charity_scope" uuid,
	"approved_by" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_dataset" text NOT NULL,
	"columns" jsonb NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"file_format" text DEFAULT 'xlsx' NOT NULL,
	"pii_level" text DEFAULT 'full' NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"visibility" text DEFAULT 'everyone' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "export_templates_base_dataset_check" CHECK ("export_templates"."base_dataset" in ('pledges', 'billing_events', 'lifecycle', 'payouts', 'invoices')),
	CONSTRAINT "export_templates_pii_level_check" CHECK ("export_templates"."pii_level" in ('full', 'masked', 'none'))
);
--> statement-breakpoint
CREATE TABLE "fundraiser_leaders" (
	"fundraiser_id" uuid NOT NULL,
	"leader_id" uuid NOT NULL,
	"effective_from" date DEFAULT now() NOT NULL,
	"effective_to" date,
	CONSTRAINT "fundraiser_leaders_fundraiser_id_leader_id_effective_from_pk" PRIMARY KEY("fundraiser_id","leader_id","effective_from")
);
--> statement-breakpoint
CREATE TABLE "fundraisers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"employee_code" text,
	"recruiter_code" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fundraisers_employee_code_unique" UNIQUE("employee_code")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"filename" text,
	"uploaded_by" uuid,
	"row_count" integer,
	"matched_count" integer,
	"unmatched_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_source_type_check" CHECK ("import_batches"."source_type" in ('status_report', 'apps_upload', 'migration'))
);
--> statement-breakpoint
CREATE TABLE "import_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"serial_no" text,
	"problem" text NOT NULL,
	"raw_row" jsonb NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_note" text,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_exceptions_problem_check" CHECK ("import_exceptions"."problem" in ('no_matching_pledge', 'name_mismatch', 'pan_mismatch', 'unknown_status_id', 'parse_error'))
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"pledge_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"line_type" text DEFAULT 'charge' NOT NULL,
	CONSTRAINT "invoice_lines_line_type_check" CHECK ("invoice_lines"."line_type" in ('charge', 'clawback_credit'))
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charity_id" uuid NOT NULL,
	"invoice_no" text NOT NULL,
	"batch_no" text,
	"invoiced_date" date,
	"total" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_no_unique" UNIQUE("invoice_no")
);
--> statement-breakpoint
CREATE TABLE "leaders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fundraiser_id" uuid,
	"full_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"country" text,
	CONSTRAINT "locations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pledge_id" uuid NOT NULL,
	"instrument_type" text NOT NULL,
	"masked_pan" text,
	"card_type" text,
	"expiry" text,
	"cardholder_name" text,
	"issuing_bank" text,
	"account_number" text,
	"bank_code" text,
	"branch_code" text,
	"giro_ref_num" text,
	"chq_mo_po" text,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pledge_id" uuid NOT NULL,
	"fundraiser_id" uuid NOT NULL,
	"payroll_run_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"condition_applied" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"excluded_reason" text,
	"payout_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_pledge_fundraiser_key" UNIQUE("pledge_id","fundraiser_id"),
	CONSTRAINT "payouts_status_check" CHECK ("payouts"."status" in ('pending', 'approved', 'paid', 'clawed_back', 'excluded'))
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_date" date NOT NULL,
	"cutoff_start" date NOT NULL,
	"cutoff_end" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_status_check" CHECK ("payroll_runs"."status" in ('draft', 'approved', 'paid'))
);
--> statement-breakpoint
CREATE TABLE "pledge_on_behalf" (
	"pledge_id" uuid PRIMARY KEY NOT NULL,
	"biz_name" text,
	"designation" text,
	"title" text,
	"first_name" text,
	"last_name" text,
	"address_1" text,
	"address_2" text,
	"address_3" text,
	"address_4" text,
	"postcode" text,
	"city" text,
	"state" text,
	"gender" text,
	"dob" date,
	"email" text,
	"relationship" text,
	"tel" text
);
--> statement-breakpoint
CREATE TABLE "pledges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_no" text NOT NULL,
	"donor_id" uuid NOT NULL,
	"charity_id" uuid NOT NULL,
	"fundraiser_id" uuid,
	"agent_id" uuid,
	"location_id" uuid,
	"campaign_id" uuid,
	"site_id" uuid,
	"channel" text,
	"country" text,
	"profile_type" text,
	"pledge_type" text,
	"dobo_type" text,
	"principal" text,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"frequency" text NOT NULL,
	"processing_bank" text,
	"signup_date" date,
	"submitted_at" date,
	"debit_date" date,
	"verified_at" date,
	"cancellation_date" date,
	"verification_method" text,
	"verification_caller" text,
	"verified" boolean DEFAULT false NOT NULL,
	"recruiter_batch_no" text,
	"anniversary" integer,
	"app_status" text,
	"current_status_id" integer,
	"current_status_date" date,
	"cancelled" boolean DEFAULT false NOT NULL,
	"unrealized_report_month" text,
	"cs_template_submitted_at" date,
	"cs_team_action_at" date,
	"remarks" text,
	"other_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pledges_serial_no_unique" UNIQUE("serial_no")
);
--> statement-breakpoint
CREATE TABLE "site_assignments" (
	"site_id" uuid NOT NULL,
	"fundraiser_id" uuid NOT NULL,
	"assigned_on" date,
	CONSTRAINT "site_assignments_site_id_fundraiser_id_pk" PRIMARY KEY("site_id","fundraiser_id")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charity_id" uuid,
	"location_id" uuid,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "status_codes" (
	"status_id" integer PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"classification" text NOT NULL,
	CONSTRAINT "status_codes_classification_check" CHECK ("status_codes"."classification" in ('approved', 'failed_retryable', 'failed_final', 'cancelled', 'other'))
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"password_hash" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"charity_id" uuid,
	"permissions" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_pledge_id_pledges_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_status_id_status_codes_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."status_codes"("status_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_charity_id_charities_id_fk" FOREIGN KEY ("charity_id") REFERENCES "public"."charities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clawbacks" ADD CONSTRAINT "clawbacks_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clawbacks" ADD CONSTRAINT "clawbacks_netted_in_run_payroll_runs_id_fk" FOREIGN KEY ("netted_in_run") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plans" ADD CONSTRAINT "commission_plans_charity_id_charities_id_fk" FOREIGN KEY ("charity_id") REFERENCES "public"."charities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_runs" ADD CONSTRAINT "export_runs_template_id_export_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."export_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_runs" ADD CONSTRAINT "export_runs_schedule_id_export_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."export_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_schedules" ADD CONSTRAINT "export_schedules_template_id_export_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."export_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_schedules" ADD CONSTRAINT "export_schedules_charity_scope_charities_id_fk" FOREIGN KEY ("charity_scope") REFERENCES "public"."charities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraiser_leaders" ADD CONSTRAINT "fundraiser_leaders_fundraiser_id_fundraisers_id_fk" FOREIGN KEY ("fundraiser_id") REFERENCES "public"."fundraisers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraiser_leaders" ADD CONSTRAINT "fundraiser_leaders_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_exceptions" ADD CONSTRAINT "import_exceptions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_pledge_id_pledges_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_charity_id_charities_id_fk" FOREIGN KEY ("charity_id") REFERENCES "public"."charities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaders" ADD CONSTRAINT "leaders_fundraiser_id_fundraisers_id_fk" FOREIGN KEY ("fundraiser_id") REFERENCES "public"."fundraisers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_pledge_id_pledges_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_pledge_id_pledges_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_fundraiser_id_fundraisers_id_fk" FOREIGN KEY ("fundraiser_id") REFERENCES "public"."fundraisers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledge_on_behalf" ADD CONSTRAINT "pledge_on_behalf_pledge_id_pledges_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_charity_id_charities_id_fk" FOREIGN KEY ("charity_id") REFERENCES "public"."charities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_fundraiser_id_fundraisers_id_fk" FOREIGN KEY ("fundraiser_id") REFERENCES "public"."fundraisers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_current_status_id_status_codes_status_id_fk" FOREIGN KEY ("current_status_id") REFERENCES "public"."status_codes"("status_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_assignments" ADD CONSTRAINT "site_assignments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_assignments" ADD CONSTRAINT "site_assignments_fundraiser_id_fundraisers_id_fk" FOREIGN KEY ("fundraiser_id") REFERENCES "public"."fundraisers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_charity_id_charities_id_fk" FOREIGN KEY ("charity_id") REFERENCES "public"."charities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_charity_id_charities_id_fk" FOREIGN KEY ("charity_id") REFERENCES "public"."charities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_action_created_at_idx" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "billing_events_pledge_status_date_idx" ON "billing_events" USING btree ("pledge_id","status_date");--> statement-breakpoint
CREATE INDEX "billing_events_import_batch_id_idx" ON "billing_events" USING btree ("import_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_natural_key" ON "billing_events" USING btree ("pledge_id","status_id","status_date");--> statement-breakpoint
CREATE INDEX "donors_email_lower_idx" ON "donors" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "donors_national_id_idx" ON "donors" USING btree ("national_id");--> statement-breakpoint
CREATE INDEX "donors_tel_mobile_idx" ON "donors" USING btree ("tel_mobile");--> statement-breakpoint
CREATE INDEX "payment_methods_pledge_id_idx" ON "payment_methods" USING btree ("pledge_id");--> statement-breakpoint
CREATE INDEX "pledges_donor_id_idx" ON "pledges" USING btree ("donor_id");--> statement-breakpoint
CREATE INDEX "pledges_fundraiser_id_idx" ON "pledges" USING btree ("fundraiser_id");--> statement-breakpoint
CREATE INDEX "pledges_site_id_idx" ON "pledges" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "pledges_current_status_id_idx" ON "pledges" USING btree ("current_status_id");--> statement-breakpoint
CREATE INDEX "pledges_signup_date_idx" ON "pledges" USING btree ("signup_date");--> statement-breakpoint
CREATE INDEX "pledges_debit_date_idx" ON "pledges" USING btree ("debit_date");