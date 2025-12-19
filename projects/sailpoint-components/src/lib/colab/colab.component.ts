import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ViewChildren, QueryList } from '@angular/core';
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
    CommonModule,
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
export class ColabComponent implements OnInit, OnDestroy {
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
    private apiFactory: ElectronApiFactoryService
  ) {
    // Set up debounced search
    this.searchSubject.pipe(
      debounceTime(500), // Wait 500ms after user stops typing
      distinctUntilChanged(), // Only trigger if value actually changed
      takeUntil(this.destroy$)
    ).subscribe(term => {
      this.performSearch(term);
    });
  }

  ngOnInit(): void {
    // Component initialization
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
      
      // Route to appropriate deployment handler based on category
      switch (category) {
        case 'workflows':
          await this.deployWorkflow(post, rawContent);
          break;
        case 'saas-connectors':
          await this.deploySaaSConnector(post, rawContent);
          break;
        case 'saas-connector-customizers':
          await this.deploySaaSConnectorCustomizer(post, rawContent);
          break;
        case 'transforms':
          await this.deployTransform(post, rawContent);
          break;
        default:
          this.showMessage(`Deployment not supported for ${category}`, 'warning');
      }
    } catch (error) {
      console.error('Deployment error:', error);
      this.showMessage(`Failed to deploy: ${error}`, 'error');
    } finally {
      // Clear the deploying state on the section
      this.clearDeployingState(category);
    }
  }

  /**
   * Deploy a workflow to the environment
   */
  private async deployWorkflow(post: ColabPost, rawContent?: string): Promise<void> {
    // TODO: Implement workflow deployment
    // This will be implemented based on the deployment approach provided later
    console.log('Deploying workflow:', post.title);
    this.showMessage(`Workflow deployment for "${post.title}" - Coming soon!`, 'info');
  }


  /**
   * Sanitize connector name to be a valid alias
   */
  private sanitizeConnectorName(name: string): string {
    // Remove special characters, replace spaces with hyphens, convert to lowercase
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50); // Limit length
  }

  /**
   * Extract GitHub repository URL from raw Discourse topic content
   * Looks for the "Repository Link" row in the markdown table
   */
  private extractGitHubRepoUrl(rawContent: string): string | null {
    if (!rawContent) {
      return null;
    }

    // Pattern to match the Repository Link row in the markdown table
    // Format: :hammer_and_wrench: | **Repository Link** | https://github.com/...
    // Note: The row may or may not start with a pipe, so we make it optional
    const repositoryLinkPattern = /:hammer_and_wrench:\s*\|\s*\*\*Repository\s+Link\*\*\s*\|\s*(https?:\/\/github\.com\/[^\s|\n\r]+)/i;
    
    const match = rawContent.match(repositoryLinkPattern);
    
    if (match && match[1]) {
      return match[1].trim();
    }

    // Fallback: Try to find any GitHub URL in a table row that mentions "Repository"
    // This pattern doesn't require a leading pipe either
    const fallbackPattern = /[^\|]*Repository[^\|]*\|\s*(https?:\/\/github\.com\/[^\s|\n\r]+)/i;
    const fallbackMatch = rawContent.match(fallbackPattern);
    
    if (fallbackMatch && fallbackMatch[1]) {
      return fallbackMatch[1].trim();
    }

    return null;
  }

  /**
   * Deploy a SaaS Connector to the environment
   */
  private async deploySaaSConnector(post: ColabPost, rawContent?: string): Promise<void> {
    try {
      // Fetch raw topic content from Discourse to extract GitHub location
      let topicRawContent = rawContent;
      
      if (!topicRawContent) {
        console.log(`Fetching raw content for SaaS Connector: ${post.title} (ID: ${post.id})`);
        topicRawContent = await firstValueFrom(this.discourseService.getTopicRaw(post.id));
      }

      if (!topicRawContent) {
        throw new Error('Failed to fetch topic content from Discourse');
      }

      // Extract GitHub repository URL from raw content
      const githubRepoUrl = this.extractGitHubRepoUrl(topicRawContent);
      
      if (!githubRepoUrl) {
        throw new Error('Could not find GitHub repository link in topic content. Please ensure the topic contains a "Repository Link" field.');
      }

      console.log(`GitHub repository URL extracted: ${githubRepoUrl}`);
      
      // Fetch the latest release artifact from GitHub
      const artifactResponse = await this.apiFactory.getApi().getGitHubReleaseArtifact(githubRepoUrl);
      
      if (!artifactResponse.success || !artifactResponse.downloadUrl) {
        throw new Error(artifactResponse.error || 'Failed to fetch GitHub release artifact');
      }

      console.log(`GitHub release artifact found: ${artifactResponse.filename} (${artifactResponse.tagName})`);
      console.log(`Download URL: ${artifactResponse.downloadUrl}`);
      
      // Generate a temporary file path for the downloaded zip
      const path = require('path');
      const os = require('os');
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, artifactResponse.filename || 'connector.zip');

      // Download the zip file
      this.showMessage(`Downloading connector artifact: ${artifactResponse.filename}...`, 'info');
      const downloadResult = await this.apiFactory.getApi().downloadFile(artifactResponse.downloadUrl, tempFilePath);
      
      if (!downloadResult.success) {
        throw new Error(downloadResult.error || 'Failed to download connector artifact');
      }

      // Generate connector alias from post title (sanitize it)
      const connectorAlias = this.sanitizeConnectorName(post.title);

      // Create the connector (environment is fetched internally)
      this.showMessage(`Creating connector "${connectorAlias}"...`, 'info');
      const createResult = await this.apiFactory.getApi().createConnector(connectorAlias);
      
      if (!createResult.success || !createResult.connectorId) {
        throw new Error(createResult.error || 'Failed to create connector');
      }

      // Upload the connector zip file (environment is fetched internally)
      this.showMessage(`Uploading connector version...`, 'info');
      const uploadResult = await this.apiFactory.getApi().uploadConnector(
        createResult.connectorId,
        tempFilePath
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload connector');
      }

      // Clean up temporary file
      try {
        const fs = require('fs');
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary file:', cleanupError);
      }

      this.showMessage(
        `Successfully deployed "${post.title}" as connector "${connectorAlias}" (Version ${uploadResult.version})`, 
        'success'
      );
    } catch (error) {
      console.error('Error deploying SaaS Connector:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.showMessage(`Failed to deploy SaaS Connector: ${errorMessage}`, 'error');
      throw error;
    }
  }

  /**
   * Deploy a SaaS Connector Customizer to the environment
   */
  private async deploySaaSConnectorCustomizer(post: ColabPost, rawContent?: string): Promise<void> {
    // TODO: Implement SaaS Connector Customizer deployment
    // This will be implemented based on the deployment approach provided later
    console.log('Deploying SaaS Connector Customizer:', post.title);
    this.showMessage(`SaaS Connector Customizer deployment for "${post.title}" - Coming soon!`, 'info');
  }

  /**
   * Deploy a Transform to the environment
   */
  private async deployTransform(post: ColabPost, rawContent?: string): Promise<void> {
    // TODO: Implement Transform deployment
    // This will be implemented based on the deployment approach provided later
    console.log('Deploying Transform:', post.title);
    this.showMessage(`Transform deployment for "${post.title}" - Coming soon!`, 'info');
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
