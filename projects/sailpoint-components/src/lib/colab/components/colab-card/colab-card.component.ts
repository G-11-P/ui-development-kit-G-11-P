import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ColabPost, ColabCategory } from '../../services/discourse.service';

@Component({
  selector: 'app-colab-card',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './colab-card.component.html',
  styleUrl: './colab-card.component.scss'
})
export class ColabCardComponent {
  @Input() post!: ColabPost;
  @Input() category!: ColabCategory;
  @Input() showDeployButton = false;
  @Input() isDeploying = false;
  
  @Output() viewDetails = new EventEmitter<ColabPost>();
  @Output() deploy = new EventEmitter<ColabPost>();

  get isSailPointDeveloped(): boolean {
    return this.post?.tags?.includes('sailpoint-developed') || false;
  }

  get isSailPointCertified(): boolean {
    return this.post?.tags?.includes('sailpoint-certified') || false;
  }

  onCardClick(): void {
    window.open(this.post.link, '_blank');
  }

  onViewDetails(event: Event): void {
    event.stopPropagation();
    this.viewDetails.emit(this.post);
  }

  onDeploy(event: Event): void {
    event.stopPropagation();
    this.deploy.emit(this.post);
  }

  // SVG placeholder as base64 data URI (SailPoint blue gradient)
  private readonly defaultImageDataUri = `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0033a1"/>
          <stop offset="50%" style="stop-color:#004fb5"/>
          <stop offset="100%" style="stop-color:#0071ce"/>
        </linearGradient>
      </defs>
      <rect fill="url(#grad)" width="400" height="200"/>
      <text x="200" y="100" fill="rgba(255,255,255,0.3)" font-family="sans-serif" font-size="48" text-anchor="middle" dominant-baseline="middle">CoLab</text>
    </svg>
  `)}`;

  private readonly defaultAvatarDataUri = `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="60" fill="#e0e0e0"/>
      <circle cx="60" cy="45" r="20" fill="#9e9e9e"/>
      <ellipse cx="60" cy="95" rx="35" ry="25" fill="#9e9e9e"/>
    </svg>
  `)}`;

  getDefaultImage(): string {
    return this.defaultImageDataUri;
  }

  getDefaultAvatar(): string {
    return this.defaultAvatarDataUri;
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = this.getDefaultImage();
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = this.getDefaultAvatar();
  }
}

