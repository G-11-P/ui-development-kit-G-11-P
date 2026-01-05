/**
 * Discourse API Integration for CoLab Marketplace
 * 
 * This module handles all communication with the SailPoint Developer Community Discourse forum.
 * It fetches CoLab posts, topics, and user information for display in the UI Development Kit.
 */

const DISCOURSE_BASE_URL = 'https://developer.sailpoint.com/discuss/';
const DEVELOPER_DOMAIN = 'developer.sailpoint.com';

// Types
export interface FilterConfig {
  category: string;
  tags: string[];
}

export interface ColabPost {
  id: number;
  creatorName: string;
  excerpt: string;
  creatorImage: string;
  creatorTitle: string;
  tags: string[];
  image: string;
  link: string;
  title: string;
  views: number;
  liked: number;
  replies: number;
  solution: boolean;
  readTime: number;
  slug: string;
}

export interface DiscourseUser {
  id: number;
  username: string;
  name?: string;
  avatar_template: string;
  primary_group_name?: string;
  title?: string;
}

export interface DiscourseTopic {
  id: number;
  title: string;
  slug: string;
  posts_count: number;
  created_at: string;
  views: number;
  like_count: number;
  has_accepted_answer: boolean;
  image_url: string;
  excerpt: string;
  tags: string[];
  posters: Array<{
    description: string;
    user_id: number;
  }>;
}

export interface DiscourseResponse {
  users: DiscourseUser[];
  topic_list: {
    topics: DiscourseTopic[];
  };
}

export interface GroupResponse {
  group?: {
    title?: string;
  };
}

export type ColabCategory = 
  | 'workflows'
  | 'saas-connectors'
  | 'saas-connector-customizers'
  | 'community-tools'
  | 'rules'
  | 'transforms'
  | 'iiq-plugins';

// Category configuration mapping
const CATEGORY_CONFIGS: Record<ColabCategory, FilterConfig> = {
  'workflows': { category: 'colab', tags: ['workflows'] },
  'saas-connectors': { category: 'colab-saas-connectors', tags: [] },
  'saas-connector-customizers': { category: 'saas-connector-customizers', tags: [] },
  'community-tools': { category: 'colab-community-tools', tags: [] },
  'rules': { category: 'colab-rules', tags: ['identity-security-cloud'] },
  'transforms': { category: 'colab-transforms', tags: [] },
  'iiq-plugins': { category: 'colab-iiq-plugins', tags: [] }
};

// Cache for user titles
const titleCache = new Map<string, string>();

/**
 * Get marketplace posts for a specific filter configuration
 */
export async function getMarketplacePosts(
  filter: FilterConfig, 
  limit?: number
): Promise<{ success: boolean; data?: ColabPost[]; error?: string }> {
  try {
    let filterCategory = 'colab';
    if (filter.category && filter.category !== 'colab') {
      filterCategory += `/${filter.category}`;
    }

    const tagsQuery = filter.tags.length > 0 ? `?tags=${filter.tags.join('+')}` : '';
    const url = `${DISCOURSE_BASE_URL}c/${filterCategory}/l/latest.json${tagsQuery}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: DiscourseResponse = await response.json();
    const posts = processTopics(data, limit);

    return { success: true, data: posts };
  } catch (error) {
    console.error('Error fetching marketplace posts:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch marketplace posts' 
    };
  }
}

/**
 * Get posts by CoLab category name
 */
export async function getColabPostsByCategory(
  category: ColabCategory, 
  limit?: number
): Promise<{ success: boolean; data?: ColabPost[]; error?: string }> {
  const config = CATEGORY_CONFIGS[category];
  if (!config) {
    return { success: false, error: `Unknown category: ${category}` };
  }
  return getMarketplacePosts(config, limit);
}

/**
 * Get the raw markdown content for a topic
 */
export async function getTopicRaw(
  topicId: number
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const response = await fetch(`${DISCOURSE_BASE_URL}raw/${topicId}.json`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    return { success: true, data: text };
  } catch (error) {
    console.error('Error fetching topic raw:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch topic content' 
    };
  }
}

/**
 * Get topic details by ID
 */
export async function getTopic(
  topicId: number
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await fetch(`${DISCOURSE_BASE_URL}t/${topicId}.json`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching topic:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch topic' 
    };
  }
}

/**
 * Get user group title
 */
export async function getUserTitle(
  primaryGroupName: string
): Promise<{ success: boolean; data?: string; error?: string }> {
  // Check cache first
  if (titleCache.has(primaryGroupName)) {
    return { success: true, data: titleCache.get(primaryGroupName) };
  }

  try {
    const response = await fetch(`${DISCOURSE_BASE_URL}g/${primaryGroupName}.json`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: GroupResponse = await response.json();
    const title = data.group?.title || '';
    titleCache.set(primaryGroupName, title);
    return { success: true, data: title };
  } catch (error) {
    console.error('Error fetching user title:', error);
    titleCache.set(primaryGroupName, '');
    return { success: true, data: '' }; // Return empty string on error, not failure
  }
}

// Helper functions

function processTopics(data: DiscourseResponse, limit?: number): ColabPost[] {
  if (!data?.topic_list?.topics) {
    return [];
  }

  const posts: ColabPost[] = [];
  const topics = limit ? data.topic_list.topics.slice(0, limit) : data.topic_list.topics;

  for (const topic of topics) {
    if (topic.tags && topic.tags.length > 0) {
      const poster = findOriginalPoster(topic, data.users);
      posts.push(createColabPost(topic, poster));
    }
  }

  return posts;
}

function findOriginalPoster(topic: DiscourseTopic, users: DiscourseUser[]): DiscourseUser | undefined {
  for (const poster of topic.posters || []) {
    if (poster.description?.includes('Original Poster')) {
      return users.find(user => user.id === poster.user_id);
    }
  }
  return users[0]; // Fallback to first user
}

function createColabPost(topic: DiscourseTopic, user?: DiscourseUser): ColabPost {
  return {
    id: topic.id,
    creatorName: user?.name || user?.username || 'Unknown',
    excerpt: styleExcerpt(topic.excerpt),
    creatorImage: getAvatarUrl(user?.avatar_template || ''),
    creatorTitle: user?.title || '',
    tags: topic.tags || [],
    image: topic.image_url || '',
    link: `${DISCOURSE_BASE_URL}t/${topic.slug}/${topic.id}`,
    title: shortenTitle(topic.title),
    views: topic.views || 0,
    liked: topic.like_count || 0,
    replies: topic.posts_count || 0,
    solution: topic.has_accepted_answer || false,
    readTime: 5,
    slug: topic.slug
  };
}

function shortenTitle(title: string): string {
  return title.length > 63 ? title.substring(0, 62) + '...' : title;
}

function styleExcerpt(excerpt: string | undefined): string {
  if (!excerpt) return '';

  // Remove any strings that have colons between them (emojis)
  let cleaned = excerpt.replace(/:[^:]*:/g, '');

  // Get text between "Description" and "Legal Agreement"
  const match = cleaned.match(/Description([\s\S]*?)Legal Agreement/);
  if (match) {
    cleaned = match[1].trim();
  }

  // Remove HTML entities and truncate
  cleaned = cleaned.replace('&hellip;', '');
  return cleaned.length > 150 ? cleaned.slice(0, 100) + '...' : cleaned;
}

function getAvatarUrl(avatarTemplate: string): string {
  if (!avatarTemplate) return '';
  
  // Handle relative URLs (starting with /)
  if (avatarTemplate.startsWith('/')) {
    return `https://${DEVELOPER_DOMAIN}${avatarTemplate.replace('{size}', '120')}`;
  }
  
  // For absolute URLs, validate the domain properly
  try {
    const url = new URL(avatarTemplate.replace('{size}', '120'));
    // Only trust URLs from the exact developer.sailpoint.com domain
    if (url.hostname === DEVELOPER_DOMAIN) {
      return url.toString();
    }
  } catch (error) {
    // Invalid URL, return empty string
    console.warn('Invalid avatar URL:', avatarTemplate);
  }
  
  // If it's not from our trusted domain or invalid, return empty string
  return '';
}




