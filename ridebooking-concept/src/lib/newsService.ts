// ─── News Feed Service ────────────────────────────────────────────────────────

import { supabase, supabaseAdmin } from './supabase';

export const NEWS_CATEGORIES = ['Announcement', 'Update', 'Promo', 'Event', 'Important'] as const;
export type NewsCategory = typeof NEWS_CATEGORIES[number];

export type NewsAudience = 'all' | 'user' | 'rider';

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
  is_archived: boolean;
  visible_to: NewsAudience;
  created_at: string;
  updated_at: string;
}

/** Public feed: published + non-archived. Admin pass includeAll=true. */
export async function fetchNewsPosts(includeAll = false): Promise<NewsPost[]> {
  let query = supabase
    .from('news_posts')
    .select('*')
    .order('created_at', { ascending: false });
  if (!includeAll) {
    query = query.eq('published', true).eq('is_archived', false);
  }
  const { data, error } = await query;
  if (error) console.error('fetchNewsPosts:', error);
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
  visibleTo: NewsAudience = 'all',
): Promise<NewsPost | null> {
  const { data, error } = await supabase
    .from('news_posts')
    .insert({ title, content, category, image_url: imageUrl, author_id: authorId, author_name: authorName, author_avatar: authorAvatar, published, is_archived: false, visible_to: visibleTo })
    .select();
  if (error || !data?.length) { console.error('createNewsPost:', error); return null; }
  return data[0] as NewsPost;
}

export async function updateNewsPost(
  id: string,
  updates: Partial<Pick<NewsPost, 'title' | 'content' | 'category' | 'image_url' | 'published' | 'is_archived' | 'visible_to'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('news_posts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error('updateNewsPost:', error); return false; }
  return true;
}

export async function deleteNewsPost(id: string): Promise<boolean> {
  const { error } = await supabase.from('news_posts').delete().eq('id', id);
  if (error) console.error('deleteNewsPost:', error);
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
