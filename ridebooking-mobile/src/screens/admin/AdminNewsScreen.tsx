import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  SafeAreaView, RefreshControl, Modal, ScrollView, Alert, TextInput, Switch,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useProfile } from '../../contexts/AuthContext';
import { NewsPost, NEWS_CATEGORIES } from '../../lib/newsService';

type Filter = 'all' | 'published' | 'draft' | 'archived';
const FILTERS: Filter[] = ['all', 'published', 'draft', 'archived'];

interface PostForm {
  title: string;
  content: string;
  category: string;
  published: boolean;
}
const EMPTY_FORM: PostForm = { title: '', content: '', category: 'Announcement', published: false };

export default function AdminNewsScreen() {
  const { profile } = useProfile();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [form, setForm] = useState<PostForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('news_posts')
      .select('id, title, content, image_url, category, author_name, author_avatar, published, is_archived, created_at')
      .order('created_at', { ascending: false });
    setPosts((data ?? []) as NewsPost[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = posts.filter(p => {
    if (filter === 'published') return p.published && !p.is_archived;
    if (filter === 'draft') return !p.published && !p.is_archived;
    if (filter === 'archived') return p.is_archived;
    return true;
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (post: NewsPost) => {
    setForm({ title: post.title, content: post.content, category: post.category, published: post.published });
    setEditingId(post.id);
    setShowForm(true);
  };

  const savePost = async () => {
    if (!form.title.trim() || !form.content.trim()) { Alert.alert('Required', 'Title and content are required.'); return; }
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category,
        published: form.published,
        author_name: profile.full_name ?? 'Admin',
        author_avatar: profile.avatar_url,
      };
      if (editingId) {
        const { error } = await supabase.from('news_posts').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('news_posts').insert({ ...payload, is_archived: false });
        if (error) throw error;
      }
      setShowForm(false);
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  const togglePublished = async (post: NewsPost) => {
    try {
      await supabase.from('news_posts').update({ published: !post.published }).eq('id', post.id);
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const archivePost = async (post: NewsPost) => {
    Alert.alert('Archive Post', `Archive "${post.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive', onPress: async () => {
          try { await supabase.from('news_posts').update({ is_archived: true, published: false }).eq('id', post.id); await load(); }
          catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  const deletePost = async (post: NewsPost) => {
    Alert.alert('Delete Post', `Permanently delete "${post.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await supabase.from('news_posts').delete().eq('id', post.id); await load(); }
          catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{ flex: 1 }} color="#10b981" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.pageTitle}>News Feed</Text>
        <TouchableOpacity style={s.addBtn} onPress={openCreate}><Text style={s.addBtnText}>+ Post</Text></TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={s.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} style={[s.filterBtn, filter === f && s.filterBtnActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)} ({posts.filter(p => f === 'all' ? true : f === 'published' ? p.published && !p.is_archived : f === 'draft' ? !p.published && !p.is_archived : p.is_archived).length})</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#10b981" />}
        renderItem={({ item }) => (
          <View style={[s.card, item.is_archived && s.cardArchived]}>
            <View style={s.cardHeader}>
              <View style={s.catBadge}><Text style={s.catText}>{item.category}</Text></View>
              <Switch
                value={item.published}
                onValueChange={() => togglePublished(item)}
                trackColor={{ true: '#10b981' }}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </View>
            <Text style={s.postTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={s.postContent} numberOfLines={2}>{item.content}</Text>
            <View style={s.cardFooter}>
              <Text style={s.dateText}>{new Date(item.created_at).toLocaleDateString()}</Text>
              <View style={s.footerBtns}>
                <TouchableOpacity style={s.editBtn} onPress={() => openEdit(item)}><Text style={s.editBtnText}>Edit</Text></TouchableOpacity>
                {!item.is_archived && <TouchableOpacity style={s.archiveBtn} onPress={() => archivePost(item)}><Text style={s.archiveBtnText}>Archive</Text></TouchableOpacity>}
                <TouchableOpacity style={s.deleteBtn} onPress={() => deletePost(item)}><Text style={s.deleteBtnText}>Del</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No posts found</Text>}
        contentContainerStyle={s.list}
      />

      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingId ? 'Edit Post' : 'New Post'}</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalContent}>
            <Text style={s.fieldLabel}>Title *</Text>
            <TextInput style={s.input} value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} placeholder="Post title" placeholderTextColor="#9ca3af" />

            <Text style={s.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {NEWS_CATEGORIES.map(cat => (
                <TouchableOpacity key={cat} style={[s.catBtn, form.category === cat && s.catBtnActive]} onPress={() => setForm(f => ({ ...f, category: cat }))}>
                  <Text style={[s.catBtnText, form.category === cat && s.catBtnTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={s.fieldLabel}>Content *</Text>
            <TextInput
              style={[s.input, { minHeight: 120, textAlignVertical: 'top' }]}
              value={form.content}
              onChangeText={v => setForm(f => ({ ...f, content: v }))}
              placeholder="Write your post content…"
              placeholderTextColor="#9ca3af"
              multiline
            />

            <View style={s.toggleRow}>
              <Text style={s.fieldLabel}>Published</Text>
              <Switch value={form.published} onValueChange={v => setForm(f => ({ ...f, published: v }))} trackColor={{ true: '#10b981' }} />
            </View>

            <TouchableOpacity style={[s.saveBtn, submitting && s.disabled]} disabled={submitting} onPress={savePost}>
              <Text style={s.saveBtnText}>{editingId ? 'Save Changes' : 'Create Post'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#030712' },
  addBtn: { backgroundColor: '#030712', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  filterBar: { paddingHorizontal: 16, marginBottom: 4 },
  filterContent: { gap: 8 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: 'transparent' },
  filterBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  filterText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  filterTextActive: { color: '#10b981' },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardArchived: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  catBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  catText: { fontSize: 10, fontWeight: '600', color: '#6b7280' },
  postTitle: { fontSize: 15, fontWeight: '700', color: '#030712', marginBottom: 4 },
  postContent: { fontSize: 13, color: '#6b7280', marginBottom: 10 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { fontSize: 11, color: '#9ca3af' },
  footerBtns: { flexDirection: 'row', gap: 6 },
  editBtn: { backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  editBtnText: { fontSize: 11, fontWeight: '600', color: '#3b82f6' },
  archiveBtn: { backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  archiveBtnText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  deleteBtn: { backgroundColor: '#fef2f2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  deleteBtnText: { fontSize: 11, fontWeight: '600', color: '#ef4444' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
  modalContent: { padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#030712' },
  closeBtn: { fontSize: 20, color: '#9ca3af', paddingHorizontal: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: '#e5e7eb', color: '#030712' },
  catBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: 'transparent' },
  catBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  catBtnText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  catBtnTextActive: { color: '#10b981' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  saveBtn: { backgroundColor: '#030712', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
