import api from '@/services/api';

export interface ForumPost {
  id: string;
  title: string;
  content: string;
  tags: string[];
  is_resolved: boolean;
  view_count: number;
  reply_count: string;
  vote_count: string;
  created_by: string;
  author_name: string;
  author_avatar: string | null;
  created_at: string;
  updated_at: string;
  last_reply_at: string | null;
  last_reply_author: string | null;
  last_reply_avatar: string | null;
}

export interface ForumReply {
  id: string;
  post_id: string;
  content: string;
  is_accepted: boolean;
  created_by: string;
  author_name: string;
  author_avatar: string | null;
  created_at: string;
  vote_count: string;
}

export interface ForumPostDetail extends ForumPost {
  replies: ForumReply[];
}

export interface Article {
  id: string;
  module_id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string[];
  is_published: boolean;
  status: string;
  doc_type: 'article' | 'file';
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  file_mime: string | null;
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  author_name: string;
  created_at: string;
  updated_at: string;
  ticket_id: string | null;
}

export const forumService = {
  getPosts: (moduleId: string, q?: string, filter?: string) =>
    api.get('/tickets/knowledge-posts', { params: { module_id: moduleId, ...(q ? { q } : {}), ...(filter ? { filter } : {}) } })
      .then((r: any) => r.data as ForumPost[]),

  getPost: (id: string) =>
    api.get(`/tickets/knowledge-posts/${id}`).then((r: any) => r.data as ForumPostDetail),

  createPost: (dto: { module_id: string; title: string; content: string; tags?: string[] }) =>
    api.post('/tickets/knowledge-posts', dto).then((r: any) => r.data),

  deletePost: (id: string) =>
    api.delete(`/tickets/knowledge-posts/${id}`).then((r: any) => r.data),

  createReply: (postId: string, content: string) =>
    api.post(`/tickets/knowledge-posts/${postId}/replies`, { content }).then((r: any) => r.data),

  acceptReply: (postId: string, replyId: string) =>
    api.post(`/tickets/knowledge-posts/${postId}/replies/${replyId}/accept`).then((r: any) => r.data),

  deleteReply: (postId: string, replyId: string) =>
    api.delete(`/tickets/knowledge-posts/${postId}/replies/${replyId}`).then((r: any) => r.data),
};

export const docsService = {
  getArticles: (moduleId: string, q?: string, includeDrafts = false) =>
    api.get('/tickets/knowledge', { params: { module_id: moduleId, ...(q ? { q } : {}), ...(includeDrafts ? { include_drafts: 'true' } : {}) } })
      .then((r: any) => r.data as Article[]),

  getArticle: (id: string) =>
    api.get(`/tickets/knowledge/${id}`).then((r: any) => r.data as Article),

  createArticle: (dto: any) =>
    api.post('/tickets/knowledge', dto).then((r: any) => r.data),

  uploadDoc: (formData: FormData) =>
    api.post('/tickets/knowledge/upload-doc', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r: any) => r.data),

  updateArticle: (id: string, dto: any) =>
    api.patch(`/tickets/knowledge/${id}`, dto).then((r: any) => r.data),

  deleteArticle: (id: string) =>
    api.delete(`/tickets/knowledge/${id}`).then((r: any) => r.data),

  voteArticle: (id: string, value: 1 | -1) =>
    api.post(`/tickets/knowledge/${id}/vote`, { value }).then((r: any) => r.data),
};
