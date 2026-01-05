import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, takeUntil } from 'rxjs';

import { ColabCardComponent } from '../colab-card/colab-card.component';
import { 
  DiscourseService, 
  ColabPost, 
  ColabCategory,
  DEPLOYABLE_CATEGORIES 
} from '../../services/discourse.service';

export interface CategoryDisplay {
  id: ColabCategory;
  title: string;
  viewAllRoute?: string;
}

@Component({
  selector: 'app-colab-section',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ColabCardComponent
  ],
  templateUrl: './colab-section.component.html',
  styleUrl: './colab-section.component.scss'
})
export class ColabSectionComponent implements OnInit, OnDestroy, OnChanges {
  @Input() category!: CategoryDisplay;
  @Input() limit = 5;
  @Input() expanded = false;
  
  @Output() viewAll = new EventEmitter<ColabCategory>();
  @Output() deploy = new EventEmitter<{ post: ColabPost; category: ColabCategory }>();

  posts: ColabPost[] = [];
  loading = true;
  error = false;
  deployingPostId: number | null = null;

  private destroy$ = new Subject<void>();

  constructor(private discourseService: DiscourseService) {}

  ngOnInit(): void {
    this.loadPosts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['limit'] && !changes['limit'].firstChange) || (changes['expanded'] && !changes['expanded'].firstChange)) {
      this.loadPosts();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPosts(): void {
    this.loading = true;
    this.error = false;

    this.discourseService.getPostsByCategory(this.category.id, this.limit)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (posts) => {
          this.posts = posts;
          this.loading = false;
        },
        error: () => {
          this.error = true;
          this.loading = false;
        }
      });
  }

  get isDeployable(): boolean {
    return DEPLOYABLE_CATEGORIES.includes(this.category.id);
  }

  onViewAll(): void {
    this.viewAll.emit(this.category.id);
  }

  onDeploy(post: ColabPost): void {
    this.deployingPostId = post.id;
    this.deploy.emit({ post, category: this.category.id });
  }

  isPostDeploying(postId: number): boolean {
    return this.deployingPostId === postId;
  }

  clearDeployingState(): void {
    this.deployingPostId = null;
  }

  trackByPostId(index: number, post: ColabPost): number {
    return post.id;
  }
}




