# Kiln Studio: Feature List

Everything discussed for Kiln Studio, in one place. Status is not tracked here.

## Core
- Public inquiry form with server-side validation, honeypot spam protection, rate limiting, and atomic storage of each inquiry with its brief
- Admin and designer workspaces: inquiry inbox with status and priority, priority queue, explicit acceptance step that creates a project
- Accepted inquiry becomes a tracked project with a manager, a deadline, and its own channel
- Supabase (PostgreSQL, Auth) as the primary database
- Permissions enforced in the database with Row Level Security, including an activity log readable only by studio members
- Database migrations covered by pgTAP tests, rebuilt from scratch and run on every push through GitHub Actions
- Finance interface (schema first)

## Upstash Redis
- Caching
- Rate limiting
- User presence: online status and typing indicators

## Upstash QStash
- Queue slow HTTP work, such as image-upload headers during inquiries

## Upstash Vector
- Store user-opted inquiry data
- Similarity matching to score inquiries and suggest which high-value ones to pick first
- Train/improve scoring from the opted-in data

## Upstash Workflow
- Inquiry pipeline: save to Supabase, generate embedding, upsert to Vector, notify team (Slack or email), with per-step retries
- Lead pipeline: receive lead data from Box, anonymize, generate embedding, check Vector for similar existing leads, upsert to Supabase and link the Vector ID
- Agentic workflows for better automations
- Workflow behind the in-website AI chatbot

## Upstash Box
- Automated lead generation

## AI
- In-website AI chatbot helper for clients

## Team Communication
- Persistent team chat on the website, with messages stored in Supabase
- Full Slack integration into the website (two-way sync)
- Slack message storage in Supabase to get past Slack Free's 90-day history limit
- Presence (online/typing) alongside the chat, via Redis