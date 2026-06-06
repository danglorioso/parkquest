DROP TABLE IF EXISTS "follows";--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" serial PRIMARY KEY NOT NULL,
	"requester_id" varchar(255) NOT NULL,
	"recipient_id" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "friendships_requester_id_recipient_id_unique" UNIQUE("requester_id","recipient_id")
);
