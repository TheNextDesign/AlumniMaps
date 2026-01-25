# AlumniMaps 🌍

A premium, $0-cost alumni mapping platform built with React, Leaflet, and Serverless Postgres.

## 🚀 Features
- **Zero Cost**: Runs entirely on free tiers (Vercel + Supabase/Neon).
- **No Login**: Public access for maximum engagement.
- **Privacy Focused**: Phone numbers hidden by default (optional).
- **Premium UI**: Glassmorphism, dark mode, and smooth animations.

## 🛠️ Tech Stack
- **Frontend**: React (Vite) + Leaflet (Map)
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: PostgreSQL (Supabase Free Tier)

## 📦 Setup Guide (0 Rupees)

### 1. Database Setup (Supabase)
1. Go to [Supabase.com](https://supabase.com) and create a free project.
2. Go to the **SQL Editor** in the side menu.
3. Open `db_setup.sql` from this project, copy the content, and run it in Supabase.
4. Go to **Project Settings -> Database** and copy the **Connection String (URI)**.
   - It looks like: `postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`
   - *Note: Use the "Transaction" (Port 6543) connection string for Serverless.*

### 2. Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the local server (Frontend + Backend):
   ```bash
   # You need to provide the generic database URL env var
   # Replace the URL below with YOUR Supabase URL
   npx vercel dev --env DATABASE_URL="postgres://..."
   ```
   *If asked to link to a Vercel project, say Yes (or just hit Enter).*

### 3. Deployment (Public)
1. Run the deploy command:
   ```bash
   npx vercel deploy
   ```
2. Set the Environment Variable in Vercel Project Settings:
   - Key: `DATABASE_URL`
   - Value: Your Supabase Connection String.

## ⚠️ Important Notes
- **Geocoding**: We use OSM Nominatim implicitly via user entry (Phase 2 will add auto-complete). For now, accurate typing of City is requested.
- **Privacy**: The data is user-submitted and public.

## 🎨 Customization
- Edit `src/index.css` to change the color scheme.
- Edit `src/App.jsx` to modify the fields.
