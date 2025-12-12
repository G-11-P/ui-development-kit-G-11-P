import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChildren, QueryList } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { HttpClientModule } from '@angular/common/http';

import { ColabSectionComponent, CategoryDisplay } from './components/colab-section/colab-section.component';
import { ColabPost, ColabCategory, DiscourseService } from './services/discourse.service';

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
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSnackBarModule,
    MatDialogModule,
    HttpClientModule,
    ColabSectionComponent
  ],
  templateUrl: './colab.component.html',
  styleUrl: './colab.component.scss'
})
export class ColabComponent implements OnInit {
  title = 'CoLab Marketplace';
  categories = COLAB_CATEGORIES;
  private expandedCategories = new Set<ColabCategory>();
  
  @ViewChildren(ColabSectionComponent) sections!: QueryList<ColabSectionComponent>;

  constructor(
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private discourseService: DiscourseService
  ) {}

  ngOnInit(): void {
    // Component initialization
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
      const rawContent = await this.discourseService.getTopicRaw(post.id).toPromise();
      
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
   * Deploy a SaaS Connector to the environment
   */
  private async deploySaaSConnector(post: ColabPost, rawContent?: string): Promise<void> {
    // TODO: Implement SaaS Connector deployment
    // This will be implemented based on the deployment approach provided later
    console.log('Deploying SaaS Connector:', post.title);
    this.showMessage(`SaaS Connector deployment for "${post.title}" - Coming soon!`, 'info');
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
}
