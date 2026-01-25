# Supabase Setup Guide for AlumniMaps

## 1. Create a Project
1. Go to [Supabase.com](https://supabase.com) and create a new project.
2. Once created, go to **Project Settings** -> **API**.
3. Copy the **Project URL** and **anon public key**.

## 2. Create the Database Table
Go to the **SQL Editor** in your Supabase dashboard and run the following query to create the table:

```sql
create table alumni_pins (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  full_name text not null,
  school_name text not null,
  batch_year text,
  profession text,
  company text,
  city text not null,
  contact_info text,
  latitude double precision not null,
  longitude double precision not null
);

-- Enable Row Level Security (optional for now, but good practice)
alter table alumni_pins enable row level security;

-- Create policy to allow anyone to read pins (public map)
create policy "Enable read access for all users" on alumni_pins for select using (true);

-- Create policy to allow anyone to insert pins (public form)
create policy "Enable insert for all users" on alumni_pins for insert with check (true);
```

## 3. Connect to App
1. Create a file named `.env` in your project root.
2. Add your keys like this:

```env
VITE_SUPABASE_URL=your_project_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

3. Restart your terminal server (`npm run dev`).
