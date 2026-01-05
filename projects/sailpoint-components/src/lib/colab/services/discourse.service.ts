import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ElectronApiFactoryService } from '../../services/electron-api-factory.service';
import { 
  FilterConfig, 
  ColabPost, 
  ColabCategory,
  ColabPostsResponse,
  ColabTopicRawResponse,
  ColabTopicResponse,
  DiscourseUserTitleResponse
} from '../../services/web-api.service';

// Re-export types for convenience
export { FilterConfig, ColabPost, ColabCategory } from '../../services/web-api.service';

// Additional types used internally
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

export const CATEGORY_CONFIGS: Record<ColabCategory, FilterConfig> = {
  'workflows': { category: 'colab', tags: ['workflows'] },
  'saas-connectors': { category: 'colab-saas-connectors', tags: [] },
  'saas-connector-customizers': { category: 'saas-connector-customizers', tags: [] },
  'community-tools': { category: 'colab-community-tools', tags: [] },
  'rules': { category: 'colab-rules', tags: ['identity-security-cloud'] },
  'transforms': { category: 'colab-transforms', tags: [] },
  'iiq-plugins': { category: 'colab-iiq-plugins', tags: [] }
};

// Categories that support deployment
export const DEPLOYABLE_CATEGORIES: ColabCategory[] = [
  'saas-connectors',
  'workflows',
  'transforms',
  'saas-connector-customizers'
];

/**
 * Service for interacting with the SailPoint Developer Community Discourse forum.
 * 
 * This service uses the ElectronApiFactoryService to work in both Electron and Web modes:
 * - In Electron mode: Uses IPC handlers that make requests from the main process
 * - In Web mode: Makes direct HTTP requests to the Discourse API
 * 
 * Following the pattern documented at:
 * https://developer.sailpoint.com/docs/tools/ui-development-kit/extending-services
 */
@Injectable({
  providedIn: 'root'
})
export class DiscourseService {
  private titleCache = new Map<string, string>();

  constructor(private apiFactory: ElectronApiFactoryService) {}

  /**
   * Get marketplace posts for a specific filter configuration
   */
  getMarketplacePosts(filter: FilterConfig, limit?: number): Observable<ColabPost[]> {
    return from(this.apiFactory.getApi().getColabPosts(filter, limit)).pipe(
      map((response: ColabPostsResponse) => {
        if (response.success && response.data) {
          return response.data;
        }
        console.error('Error fetching marketplace posts:', response.error);
        return [];
      }),
      catchError(error => {
        console.error('Error fetching marketplace posts:', error);
        return of([]);
      })
    );
  }

  /**
   * Get posts for a specific CoLab category
   */
  getPostsByCategory(category: ColabCategory, limit?: number): Observable<ColabPost[]> {
    return from(this.apiFactory.getApi().getColabPostsByCategory(category, limit)).pipe(
      map((response: ColabPostsResponse) => {
        if (response.success && response.data) {
          return response.data;
        }
        console.error('Error fetching posts by category:', response.error);
        return [];
      }),
      catchError(error => {
        console.error('Error fetching posts by category:', error);
        return of([]);
      })
    );
  }

  /**
   * Get the raw markdown content for a topic
   */
  getTopicRaw(topicId: number): Observable<string> {
    return from(this.apiFactory.getApi().getColabTopicRaw(topicId)).pipe(
      map((response: ColabTopicRawResponse) => {
        if (response.success && response.data !== undefined) {
          return response.data;
        }
        console.error('Error fetching topic raw:', response.error);
        return '';
      }),
      catchError(error => {
        console.error('Error fetching topic raw:', error);
        return of('');
      })
    );
  }

  /**
   * Get topic details
   */
  getTopic(topicId: number): Observable<Record<string, unknown> | null> {
    return from(this.apiFactory.getApi().getColabTopic(topicId)).pipe(
      map((response: ColabTopicResponse): Record<string, unknown> | null => {
        if (response.success && response.data) {
          return response.data as Record<string, unknown>;
        }
        console.error('Error fetching topic:', response.error);
        return null;
      }),
      catchError(error => {
        console.error('Error fetching topic:', error);
        return of(null);
      })
    );
  }

  /**
   * Get user group title
   */
  getUserTitle(primaryGroupName: string): Observable<string> {
    // Check local cache first
    if (this.titleCache.has(primaryGroupName)) {
      return of(this.titleCache.get(primaryGroupName)!);
    }

    return from(this.apiFactory.getApi().getDiscourseUserTitle(primaryGroupName)).pipe(
      map((response: DiscourseUserTitleResponse) => {
        const title = response.success && response.data !== undefined ? response.data : '';
        this.titleCache.set(primaryGroupName, title);
        return title;
      }),
      catchError(() => {
        this.titleCache.set(primaryGroupName, '');
        return of('');
      })
    );
  }

  /**
   * Check if a category supports deployment
   */
  isDeployableCategory(category: ColabCategory): boolean {
    return DEPLOYABLE_CATEGORIES.includes(category);
  }

  /**
   * Get the filter configuration for a category
   */
  getCategoryConfig(category: ColabCategory): FilterConfig {
    return CATEGORY_CONFIGS[category];
  }

  /**
   * Get all available categories
   */
  getAvailableCategories(): ColabCategory[] {
    return Object.keys(CATEGORY_CONFIGS) as ColabCategory[];
  }

  /**
   * Get all deployable categories
   */
  getDeployableCategories(): ColabCategory[] {
    return DEPLOYABLE_CATEGORIES;
  }
}
