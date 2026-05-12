import { supabase } from './supabase';

export const NEWS_CATEGORIES = ['Announcement', 'Update', 'Promo', 'Event', 'Important'] as const;
export type NewsCategory = typeof NEWS_CATEGORIES[number];

export interface NewsPost {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  category: string;
  author_name: string;
  author_avatar: string | null;
  published: boolean;
  is_archived: boolean;
  created_at: string;
}

export async function fetchNewsPosts(): Promise<NewsPost[]> {
  const { data, error } = await supabase
    .from('news_posts')
    .select('id, title, content, image_url, category, author_name, author_avatar, published, is_archived, created_at')
    .eq('published', true)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) { console.error('fetchNewsPosts:', error); return []; }
  return (data as NewsPost[]) ?? [];
}
