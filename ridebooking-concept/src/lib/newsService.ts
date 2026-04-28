// ─── News Feed Service ────────────────────────────────────────────────────────
//
// Required Supabase migration (run once in SQL editor):
// ──────────────────────────────────────────────────────
// create table if not exists news_posts (
//   id           uuid primary key default gen_random_uuid(),
//   title        text not null,
//   content      text not null,
//   image_url    text,
//   category     text not null default 'Announcement',
//   author_id    uuid references auth.users(id) on delete set null,
//   author_name  text not null,
//   author_avatar text,
//   published    boolean not null default true,
//   created_at   timestamptz default now() not null,
//   updated_at   timestamptz default now() not null
// );
// alter table news_posts enable row level security;
// create policy "anyone can read published" on news_posts for select using (published = true);
// create policy "authenticated read all" on news_posts for select using (auth.role() = 'authenticated');

import { supabase, supabaseAdmin } from './supabase';

export const NEWS_CATEGORIES = ['Announcement', 'Update', 'Promo', 'Event', 'Important'] as const;
export type NewsCategory = typeof NEWS_CATEGORIES[number];

export interface NewsPost {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  category: string;
  author_id: string | null;
  author_name: string;
  author_avatar: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchNewsPosts(includeUnpublished = false): Promise<NewsPost[]> {
  let query = supabase
    .from('news_posts')
    .select('*')
    .order('created_at', { ascending: false });
  if (!includeUnpublished) query = query.eq('published', true);
  const { data } = await query;
  return (data as NewsPost[]) ?? [];
}

export async function createNewsPost(
  title: string,
  content: string,
  category: string,
  imageUrl: string | null,
  authorId: string,
  authorName: string,
  authorAvatar: string | null,
  published: boolean,
): Promise<NewsPost | null> {
  const { data, error } = await supabaseAdmin
    .from('news_posts')
    .insert({ title, content, category, image_url: imageUrl, author_id: authorId, author_name: authorName, author_avatar: authorAvatar, published })
    .select()
    .single();
  if (error) { console.error('createNewsPost:', error); return null; }
  return data as NewsPost;
}

export async function updateNewsPost(
  id: string,
  updates: Partial<Pick<NewsPost, 'title' | 'content' | 'category' | 'image_url' | 'published'>>,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('news_posts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error('updateNewsPost:', error); return false; }
  return true;
}

export async function deleteNewsPost(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from('news_posts').delete().eq('id', id);
  return !error;
}

export async function uploadNewsImage(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const path = `news/${Date.now()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from('documents')
    .upload(path, file, { upsert: true });
  if (error) { console.error('uploadNewsImage:', error); return null; }
  const { data } = supabaseAdmin.storage.from('documents').getPublicUrl(path);
  return data.publicUrl;
}
