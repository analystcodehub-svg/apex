# Coaching Class Landing Page (Node.js + Express)

A responsive online coaching class landing page built with Node.js and Express, modeled after the split-panel booklet layout of Oda Class's `study-everywhere/topper` experience.

## Features
- **Split-Panel Booklet UI (Desktop) & Fixed Checkout Sheet (Mobile):**
  - Left scrollable story panel with top hero banner, cycling live enrollment bubbles, 5 promotional showcase cards, and sticky scroll indicator.
  - Right enrollment panel with award badge, course title & schedule, interactive Class 1–12 selector (with sold-out state for Classes 10–12), bonus materials & trust cards, and sticky fee footer (`₹29` vs `₹499`).
- **Full Enrollment Backend (`server.js`):**
  - `GET /api/course` — Serves course configuration, dynamic student count, remaining seats, image paths, and live bubbles.
  - `POST /api/send-otp` & `POST /api/verify-otp` — Phone verification flow with demo OTP output for local testing.
  - `POST /api/enroll` — Persists confirmed registrations to `data/enrollments.json` and increments the student counter.
  - `GET /api/enrollments` — Lists recorded enrollments.

## Running Locally
```bash
npm install
npm start
```
Then open `http://localhost:3000`.

## Replacing Dummy Images Later
All placeholder images live in `public/images/` and are configured in `data/course.json`:
- `public/images/banner.svg` (`750×564`) — Top hero banner
- `public/images/intro-1.svg` (`750×1000`) — Course overview card
- `public/images/intro-2.svg` (`750×836`) — Master teachers / dual-teacher card
- `public/images/intro-3.svg` (`750×866`) — Live classroom preview card
- `public/images/intro-4.svg` (`750×1074`) — 6-day roadmap & topper results card
- `public/images/intro-5.svg` (`750×1000`) — Parent testimonials & trust stats card
- `public/images/ed-tech.svg` (`750×116`) — Top award badge on right panel
- `public/images/extra-materials.svg` (`686×250`) — Bonus study materials card
- `public/images/trusted-by.svg` (`686×210`) — Parent trust summary card

Drop your `.png`/`.jpg` files into `public/images/` and update their paths in `data/course.json` (no code changes needed).
