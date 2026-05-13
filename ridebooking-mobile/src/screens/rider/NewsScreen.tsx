import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  RefreshControl, Image, TouchableOpacity,
} from 'react-native';
import { fetchNewsPosts, NewsPost } from '../../lib/newsService';

const categoryColor: Record<string, string> = {
  Announcement: '#6366f1',
  Update: '#3b82f6',
  Promo: '#10b981',
  Event: '#f59e0b',
  Important: '#ef4444',
};

export default function NewsScreen() {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchPosts = async () => {
    const data = await fetchNewsPosts();
    setPosts(data);
  };

  useEffect(() => {
    fetchPosts().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
    >
      <Text style={styles.screenTitle}>News & Updates</Text>

      {posts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No announcements yet.</Text>
        </View>
      ) : (
        posts.map((post) => {
          const isOpen = expanded === post.id;
          const color = categoryColor[post.category] ?? '#6b7280';
          return (
            <TouchableOpacity
              key={post.id}
              style={styles.card}
              onPress={() => setExpanded(isOpen ? null : post.id)}
              activeOpacity={0.85}
            >
              {post.image_url && (
                <Image source={{ uri: post.image_url }} style={styles.postImage} />
              )}
              <View style={styles.cardBody}>
                <View style={styles.metaRow}>
                  <View style={[styles.categoryBadge, { backgroundColor: color + '20' }]}>
                    <Text style={[styles.categoryText, { color }]}>{post.category}</Text>
                  </View>
                  <Text style={styles.dateText}>
                    {new Date(post.created_at).toLocaleDateString('en-PH', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </Text>
                </View>
                <Text style={styles.postTitle}>{post.title}</Text>
                {isOpen ? (
                  <>
                    <Text style={styles.postContent}>{post.content}</Text>
                    {post.author_name && (
                      <Text style={styles.authorText}>— {post.author_name}</Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.postExcerpt} numberOfLines={2}>
                    {post.content}
                  </Text>
                )}
                <Text style={styles.readMore}>{isOpen ? 'Show less ↑' : 'Read more ↓'}</Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  screenTitle: { fontSize: 22, fontWeight: '700', color: '#030712', marginBottom: 16, letterSpacing: -0.3 },

  emptyWrap: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 14, color: '#9ca3af' },

  card: {
    backgroundColor: '#fff', borderRadius: 20,
    marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden',
  },
  postImage: { width: '100%', height: 160 },
  cardBody: { padding: 16 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  categoryBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  categoryText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 11, color: '#d1d5db' },
  postTitle: { fontSize: 16, fontWeight: '700', color: '#030712', marginBottom: 6, letterSpacing: -0.2 },
  postExcerpt: { fontSize: 13, color: '#6b7280', lineHeight: 19 },
  postContent: { fontSize: 13, color: '#374151', lineHeight: 20, marginBottom: 8 },
  authorText: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginTop: 4 },
  readMore: { fontSize: 12, color: '#10b981', fontWeight: '600', marginTop: 8 },
});
