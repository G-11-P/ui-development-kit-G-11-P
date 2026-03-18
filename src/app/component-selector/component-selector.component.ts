
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ComponentInfo, ConfigService } from 'sailpoint-components';


@Component({
  selector: 'app-component-selector',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSlideToggleModule,
    MatToolbarModule
],
  templateUrl: './component-selector.component.html',
  styleUrl: './component-selector.component.scss'
})
export class ComponentSelectorComponent implements OnInit {
  availableComponents: ComponentInfo[] = [];

  constructor(private configService: ConfigService) {}

  ngOnInit(): void {
    this.availableComponents = this.configService.getAvailableComponents();
  }

  onToggleComponent(componentName: ComponentInfo): void {
    this.configService.toggleComponent(componentName);
  }
}
