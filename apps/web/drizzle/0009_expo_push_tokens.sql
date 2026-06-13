CREATE TABLE "expo_push_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "clerk_user_id" varchar(255) NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_at" timestamp DEFAULT now() NOT NULL
);
