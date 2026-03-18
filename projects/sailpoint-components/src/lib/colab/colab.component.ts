
import { Component, OnDestroy, ViewChildren, QueryList } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpClientModule } from '@angular/common/http';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { firstValueFrom } from 'rxjs';

import { ColabSectionComponent, CategoryDisplay } from './components/colab-section/colab-section.component';
import { ColabCardComponent } from './components/colab-card/colab-card.component';
import { ColabPost, ColabCategory, DiscourseService } from './services/discourse.service';
import { ElectronApiFactoryService } from '../services/electron-api-factory.service';
import { SailPointSDKService } from '../sailpoint-sdk.service';
import { deployWorkflow } from './deployment-helpers/workflow-deployment';
import { deploySaaSConnector } from './deployment-helpers/connector-deployment';
import { deployTransform } from './deployment-helpers/transform-deployment';
import { deployConnectorCustomizer } from './deployment-helpers/customizer-deployment';

// Define the categories to display
const COLAB_CATEGORIES: CategoryDisplay[] = [
  { id: 'workflows', title: 'Workflows' },
  { id: 'saas-connectors', title: 'SaaS Connectors' },
  { id: 'saas-connector-customizers', title: 'SaaS Connector Customizers' },
  { id: 'community-tools', title: 'Community Tools' },
  { id: 'rules', title: 'Rules' },
  { id: 'transforms', title: 'Transforms' },
  { id: 'iiq-plugins', title: 'IIQ Plugins' }
];

@Component({
  selector: 'app-colab',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSnackBarModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    HttpClientModule,
    ColabSectionComponent,
    ColabCardComponent
],
  templateUrl: './colab.component.html',
  styleUrl: './colab.component.scss'
})
export class ColabComponent implements OnDestroy {
  title = 'CoLab Marketplace';
  categories = COLAB_CATEGORIES;
  private expandedCategories = new Set<ColabCategory>();
  
  searchTerm = '';
  searching = false;
  searchError: string | null = null;
  searchResults: Array<{ post: ColabPost; category: ColabCategory }> = [];
  private searchCache = new Map<ColabCategory, ColabPost[]>();
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private isCachingInProgress = false;

  @ViewChildren(ColabSectionComponent) sections!: QueryList<ColabSectionComponent>;

  constructor(
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private discourseService: DiscourseService,
    private apiFactory: ElectronApiFactoryService,
    private sdkService: SailPointSDKService
  ) {
    // Set up debounced search
    this.searchSubject.pipe(
      debounceTime(500), // Wait 500ms after user stops typing
      distinctUntilChanged(), // Only trigger if value actually changed
      takeUntil(this.destroy$)
    ).subscribe(term => {
      void this.performSearch(term);
    });
  }


  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Handle view all for a category - opens the developer website
   */
  onViewAll(category: ColabCategory): void {
    if (this.expandedCategories.has(category)) {
      this.expandedCategories.delete(category);
    } else {
      this.expandedCategories.add(category);
    }
  }

  /**
   * Handle deploy action for a post
   * This is where you'll implement the deployment logic for each category type
   */
  async onDeploy(event: { post: ColabPost; category: ColabCategory }): Promise<void> {
    const { post, category } = event;
    
    console.log(`Deploying ${category}:`, post);

    try {
      // Get the raw content to extract deployment information
      const rawContent = await firstValueFrom(this.discourseService.getTopicRaw(post.id));
      
      // Create dependencies object for deployment helpers
      const deps = {
        dialog: this.dialog,
        snackBar: this.snackBar,
        discourseService: this.discourseService,
        apiFactory: this.apiFactory,
        sdkService: this.sdkService
      };
      
      // Route to appropriate deployment handler based on category
      switch (category) {
        case 'workflows':
          await deployWorkflow(post, deps, rawContent);
          break;
        case 'saas-connectors':
          await deploySaaSConnector(post, deps, rawContent);
          break;
        case 'saas-connector-customizers':
          await deployConnectorCustomizer(post, deps);
          break;
        case 'transforms':
          await deployTransform(post, deps, rawContent);
          break;
        default:
          this.showMessage(`Deployment not supported for ${category}`, 'warning');
      }
    } catch (error) {
      console.error('Deployment error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.showMessage(`Failed to deploy: ${errorMessage}`, 'error');
    } finally {
      // Clear the deploying state on the section
      this.clearDeployingState(category);
    }
  }

  /**
   * Clear the deploying state for a category's section
   */
  private clearDeployingState(category: ColabCategory): void {
    const section = this.sections?.find(s => s.category.id === category);
    if (section) {
      section.clearDeployingState();
    }
  }

  /**
   * Show a snackbar message
   */
  private showMessage(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): void {
    const panelClass = {
      success: 'snackbar-success',
      error: 'snackbar-error',
      warning: 'snackbar-warning',
      info: 'snackbar-info'
    };

    this.snackBar.open(message, 'Dismiss', {
      duration: 5000,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: [panelClass[type]]
    });
  }

  /**
   * Open the getting started guide
   */
  openGettingStarted(): void {
    window.open('https://developer.sailpoint.com/discuss/t/developer-community-colab-getting-started-guide/11230', '_blank');
  }

  trackByCategory(index: number, category: CategoryDisplay): string {
    return category.id;
  }

  /**
   * Get limit for category based on expansion state
   */
  getLimitFor(category: ColabCategory): number | undefined {
    return this.expandedCategories.has(category) ? undefined : 5;
  }

  /**
   * Check if category is expanded
   */
  isExpanded(category: ColabCategory): boolean {
    return this.expandedCategories.has(category);
  }

  /**
   * Handle search input changes - triggers debounced search
   */
  onSearchChange(term: string): void {
    this.searchTerm = term;
    const trimmed = term.trim();

    if (trimmed.length < 2) {
      this.searchResults = [];
      this.searchError = null;
      this.searching = false;
      return;
    }

    this.searching = true;
    this.searchError = null;
    this.searchSubject.next(trimmed);
  }

  /**
   * Perform the actual search after debounce
   */
  private async performSearch(term: string): Promise<void> {
    try {
      await this.ensureSearchCache();
      this.applySearch(term);
    } catch (error) {
      console.error('Search error:', error);
      this.searchError = 'Failed to search CoLab items. Please try again.';
      this.searchResults = [];
    } finally {
      this.searching = false;
    }
  }

  /**
   * Ensure we have cached all posts for search across categories
   * Uses sequential loading with delays to avoid rate limiting
   */
  private async ensureSearchCache(): Promise<void> {
    // If already cached, return immediately
    if (this.searchCache.size === this.categories.length) {
      return;
    }

    // If caching is already in progress, wait for it
    if (this.isCachingInProgress) {
      // Wait for caching to complete (poll every 200ms)
      while (this.isCachingInProgress) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      return;
    }

    this.isCachingInProgress = true;

    try {
      // Load categories sequentially with delays to avoid rate limiting
      for (let i = 0; i < this.categories.length; i++) {
        const category = this.categories[i];
        
        // Skip if already cached
        if (this.searchCache.has(category.id)) {
          continue;
        }

        try {
          // Add delay between requests (except for first one)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay between requests
          }

          const posts = await firstValueFrom(
            this.discourseService.getPostsByCategory(category.id)
          );
          this.searchCache.set(category.id, posts ?? []);
        } catch (error: any) {
          // Handle 429 (Too Many Requests) errors
          if (error?.status === 429 || error?.message?.includes('429')) {
            console.warn(`Rate limited for category ${category.id}, waiting longer...`);
            // Wait longer before retrying
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Retry once
            try {
              const posts = await firstValueFrom(
                this.discourseService.getPostsByCategory(category.id)
              );
              this.searchCache.set(category.id, posts ?? []);
            } catch (retryError) {
              console.error(`Failed to load category ${category.id} after retry:`, retryError);
              this.searchCache.set(category.id, []); // Set empty array to mark as attempted
            }
          } else {
            console.error(`Error loading category ${category.id}:`, error);
            this.searchCache.set(category.id, []); // Set empty array to mark as attempted
          }
        }
      }
    } finally {
      this.isCachingInProgress = false;
    }
  }

  /**
   * Filter cached posts based on term
   */
  private applySearch(term: string): void {
    const lower = term.toLowerCase();
    const results: Array<{ post: ColabPost; category: ColabCategory }> = [];

    for (const [category, posts] of this.searchCache.entries()) {
      for (const post of posts) {
        const haystack = `${post.title} ${post.excerpt} ${post.tags?.join(' ')}`.toLowerCase();
        if (haystack.includes(lower)) {
          results.push({ post, category });
        }
      }
    }

    this.searchResults = results;
  }

  /**
   * Check if a category supports deployment
   */
  isDeployable(category: ColabCategory): boolean {
    return this.discourseService.isDeployableCategory(category);
  }
}
