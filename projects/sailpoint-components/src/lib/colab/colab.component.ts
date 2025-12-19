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
import { DeploymentSuccessDialogComponent, DeploymentSuccessData } from './components/deployment-success-dialog/deployment-success-dialog.component';
import { SailPointSDKService } from '../sailpoint-sdk.service';

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
    private apiFactory: ElectronApiFactoryService,
    private sdkService: SailPointSDKService
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
    try {
      let topicRawContent = rawContent;

      if (!topicRawContent) {
        console.log(`Fetching raw content for Workflow: ${post.title} (ID: ${post.id})`);
        topicRawContent = await firstValueFrom(this.discourseService.getTopicRaw(post.id));
      }

      if (!topicRawContent) {
        throw new Error('Failed to fetch topic content from Discourse');
      }

      const githubRepoUrl = this.extractGitHubRepoUrl(topicRawContent);
      if (!githubRepoUrl) {
        throw new Error('Could not find GitHub repository link in topic content. Please ensure the topic contains a "Repository Link" field.');
      }

      console.log(`GitHub repository URL extracted: ${githubRepoUrl}`);

      this.showMessage(`Fetching workflow files from GitHub...`, 'info');

      // List all JSON files in the repository
      const filesResult = await this.apiFactory.getApi().listGitHubJsonFiles(githubRepoUrl);

      if (!filesResult.success || !filesResult.files || filesResult.files.length === 0) {
        throw new Error(filesResult.error || 'No JSON workflow files found in repository');
      }

      console.log(`Found ${filesResult.files.length} JSON file(s) in repository`);

      const createdWorkflows: string[] = [];
      const errors: string[] = [];

      // Process each JSON file
      for (const file of filesResult.files) {
        try {
          if (!file.download_url) {
            console.warn(`Skipping ${file.name}: no download URL available`);
            continue;
          }

          this.showMessage(`Processing workflow: ${file.name}...`, 'info');
          console.log(`Fetching content for ${file.name}`);

          // Get the file content
          const contentResult = await this.apiFactory.getApi().getGitHubFileContent(
            file.download_url,
            file.name
          );

          if (!contentResult.success || !contentResult.content) {
            console.error(`Failed to fetch ${file.name}: ${contentResult.error}`);
            errors.push(`${file.name}: ${contentResult.error || 'Failed to fetch content'}`);
            continue;
          }

          // Parse the JSON content
          let workflowData;
          try {
            workflowData = JSON.parse(contentResult.content);
          } catch (parseError) {
            console.error(`Failed to parse ${file.name}:`, parseError);
            errors.push(`${file.name}: Invalid JSON format`);
            continue;
          }

          // Create the workflow using the SDK
          console.log(`Creating workflow from ${file.name}`);
          const response = await this.sdkService.createWorkflow({
            createWorkflowRequestV2025: workflowData
          });

          if (response.data) {
            const workflowName = response.data.name || file.name;
            console.log(`Successfully created workflow: ${workflowName}`);
            createdWorkflows.push(workflowName);
          }
        } catch (fileError: any) {
          console.error(`Error processing ${file.name}:`, fileError);
          errors.push(`${file.name}: ${fileError.message || 'Unknown error'}`);
        }
      }

      // Show results
      if (createdWorkflows.length > 0) {
        const workflowNames = createdWorkflows.join(', ');
        
        // Show success dialog
        this.dialog.open(DeploymentSuccessDialogComponent, {
          width: '500px',
          data: {
            connectorName: `${createdWorkflows.length} Workflow${createdWorkflows.length > 1 ? 's' : ''}`,
            connectorId: workflowNames,
            version: undefined
          } as DeploymentSuccessData
        });

        this.showMessage(
          `Successfully deployed ${createdWorkflows.length} workflow${createdWorkflows.length > 1 ? 's' : ''} from "${post.title}"`,
          'success'
        );
      }

      if (errors.length > 0) {
        const errorMessage = `Some workflows failed to deploy:\n${errors.join('\n')}`;
        console.error(errorMessage);
        if (createdWorkflows.length === 0) {
          throw new Error(errorMessage);
        } else {
          this.showMessage(`Deployed ${createdWorkflows.length} workflow(s), but ${errors.length} failed`, 'warning');
        }
      }

      if (createdWorkflows.length === 0 && errors.length === 0) {
        throw new Error('No workflows were deployed');
      }

    } catch (error: any) {
      console.error('Error deploying Workflow:', error);
      this.showMessage(`Failed to deploy Workflow: ${error.message || error}`, 'error');
      throw error;
    }
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
   * Supports both direct URLs and markdown link format [text](url)
   */
  private extractGitHubRepoUrl(rawContent: string): string | null {
    if (!rawContent) {
      return null;
    }

    // Pattern to match the Repository Link row in the markdown table
    // Format can be:
    // 1. Direct URL: :hammer_and_wrench: | **Repository Link** | https://github.com/...
    // 2. Markdown link: :hammer_and_wrench: | **Repository Link** | [text](https://github.com/...)
    
    // First, try to match markdown link format with URL in parentheses
    const markdownLinkPattern = /:hammer_and_wrench:\s*\|\s*\*\*Repository\s+Link\*\*\s*\|\s*\[[^\]]+\]\((https?:\/\/github\.com\/[^\)]+)\)/i;
    const markdownMatch = rawContent.match(markdownLinkPattern);
    
    if (markdownMatch && markdownMatch[1]) {
      return markdownMatch[1].trim();
    }

    // Then try direct URL format (original pattern)
    const directUrlPattern = /:hammer_and_wrench:\s*\|\s*\*\*Repository\s+Link\*\*\s*\|\s*(https?:\/\/github\.com\/[^\s|\n\r]+)/i;
    const directMatch = rawContent.match(directUrlPattern);
    
    if (directMatch && directMatch[1]) {
      return directMatch[1].trim();
    }

    // Fallback: Try to find any GitHub URL in a table row that mentions "Repository"
    const fallbackPattern = /[^\|]*Repository[^\|]*\|\s*(?:\[[^\]]+\]\()?(https?:\/\/github\.com\/[^\s|\)\n\r]+)/i;
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
      
      // Generate connector alias from post title (sanitize it)
      const connectorAlias = this.sanitizeConnectorName(post.title);

      // Upload connector from GitHub (handles everything: fetch artifact, download, create, upload)
      this.showMessage(`Deploying connector "${connectorAlias}" from GitHub...`, 'info');
      const uploadResult = await this.apiFactory.getApi().uploadConnector(githubRepoUrl, connectorAlias);

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to deploy connector');
      }

      // Show success dialog
      this.dialog.open(DeploymentSuccessDialogComponent, {
        width: '500px',
        data: {
          connectorName: connectorAlias,
          version: uploadResult.version,
          connectorId: uploadResult.connectorId
        } as DeploymentSuccessData
      });

      // Also show a snackbar for quick feedback
      this.showMessage(
        `Successfully deployed "${post.title}"`, 
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
