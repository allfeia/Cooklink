CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_url" text NOT NULL,
	"canonical_key" varchar(255) NOT NULL,
	"status" varchar(32) NOT NULL,
	"error_code" varchar(64),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_key" varchar(255) NOT NULL,
	"recipe" jsonb NOT NULL,
	CONSTRAINT "recipes_canonical_key_unique" UNIQUE("canonical_key")
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" varchar(32) NOT NULL,
	"language" varchar(8) NOT NULL,
	"transcript_text" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transcripts_video_id_unique" UNIQUE("video_id")
);
--> statement-breakpoint
CREATE TABLE "video_metadata" (
	"video_id" varchar(32) PRIMARY KEY NOT NULL,
	"platform" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"channel_name" text,
	"duration_seconds" integer NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_video_id_video_metadata_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video_metadata"("video_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_jobs_canonical_key" ON "jobs" USING btree ("canonical_key");