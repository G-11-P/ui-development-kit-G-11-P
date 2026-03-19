#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get component name from command line arguments
const componentName = process.argv[2];

if (!componentName) {
  console.error('❌ Error: Component name is required');
  console.log('Usage: npm run generate:component <component-name>');
  console.log('Example: npm run generate:component users');
  process.exit(1);
}

// Validate component name
if (!/^[a-z][a-z0-9-]*$/.test(componentName)) {
  console.error('❌ Error: Component name must be lowercase and can contain hyphens');
  console.log('Example: users, user-management, data-sources');
  process.exit(1);
}

// Convert component name to various formats
const componentNameKebab = componentName;
const componentNamePascal = componentName
  .split('-')
  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
  .join('');
const componentNameCamel = componentNamePascal.charAt(0).toLowerCase() + componentNamePascal.slice(1);
const componentDisplayName = componentName
  .split('-')
  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

// Define paths
const projectRoot = path.resolve(__dirname, '..');
const componentDir = path.join(projectRoot, 'projects', 'sailpoint-components', 'src', 'lib', componentNameKebab);
const serviceFile = path.join(projectRoot, 'projects', 'sailpoint-components', 'src', 'lib', 'services', 'config.service.ts');
const routesFile = path.join(projectRoot, 'src', 'app', 'app.routes.ts');
const appComponentFile = path.join(projectRoot, 'src', 'app', 'app.component.html');

console.log(`🚀 Generating component: ${componentNameKebab}`);

// 1. Create component directory
if (fs.existsSync(componentDir)) {
  console.error(`❌ Error: Component '${componentNameKebab}' already exists`);
  process.exit(1);
}

fs.mkdirSync(componentDir, { recursive: true });
console.log(`✅ Created directory: ${componentDir}`);

// 2. Create component files
const componentFiles = {
  [`${componentNameKebab}.component.ts`]: generateComponentTs(),
  [`${componentNameKebab}.component.html`]: generateComponentHtml(),
  [`${componentNameKebab}.component.scss`]: generateComponentScss(),
  [`${componentNameKebab}.component.spec.ts`]: generateComponentSpec()
};

Object.entries(componentFiles).forEach(([filename, content]) => {
  const filePath = path.join(componentDir, filename);
  fs.writeFileSync(filePath, content);
  console.log(`✅ Created: ${filename}`);
});

// 3. Update component selector service
updateComponentSelectorService();

// 4. Update app routes
updateAppRoutes();

// 5. Update app component HTML
updateAppComponentHtml();

// 6. Update public API exports
updatePublicApi();

console.log(`🎉 Component '${componentNameKebab}' generated successfully!`);
console.log(`📝 Next steps:`);
console.log(`   1. Build the project: npm run start`);
console.log(`   2. Enable the component in the component selector`);
console.log(`   3. Implement your component logic in: ${componentDir}`);

// Template generation functions
function generateComponentTs() {
  return `import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';

@Component({
  selector: 'app-${componentNameKebab}',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTableModule,
    MatToolbarModule
  ],
  templateUrl: './${componentNameKebab}.component.html',
  styleUrl: './${componentNameKebab}.component.scss'
})
export class ${componentNamePascal}Component {
  title = '${componentDisplayName}';

  constructor() {}

  // Add your component logic here
}
`;
}

function generateComponentHtml() {
  return `<div class="${componentNameKebab}-container">
  <mat-toolbar color="primary">
    <mat-icon>dashboard</mat-icon>
    <span class="toolbar-title">{{ title }}</span>
  </mat-toolbar>

  <div class="content">
    <mat-card>
      <mat-card-header>
        <mat-card-title>{{ title }} Management</mat-card-title>
        <mat-card-subtitle>Manage your ${componentDisplayName.toLowerCase()}</mat-card-subtitle>
      </mat-card-header>
      
      <mat-card-content>
        <p>Welcome to the ${componentDisplayName} component!</p>
        <p>This is a generated component. You can customize it according to your needs.</p>
      </mat-card-content>
      
      <mat-card-actions>
        <button mat-raised-button color="primary">
          <mat-icon>add</mat-icon>
          Add ${componentDisplayName}
        </button>
        <button mat-button>
          <mat-icon>refresh</mat-icon>
          Refresh
        </button>
      </mat-card-actions>
    </mat-card>
  </div>
</div>
`;
}

function generateComponentScss() {
  return `.${componentNameKebab}-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.toolbar-title {
  margin-left: 16px;
}

.content {
  padding: 24px;
  flex: 1;
  overflow-y: auto;
}

mat-card {
  max-width: 800px;
  margin: 0 auto;
}

mat-card-actions {
  display: flex;
  gap: 8px;
  padding: 16px;
}

mat-card-actions button {
  display: flex;
  align-items: center;
  gap: 8px;
}
`;
}

function generateComponentSpec() {
  return `import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ${componentNamePascal}Component } from './${componentNameKebab}.component';

describe('${componentNamePascal}Component', () => {
  let component: ${componentNamePascal}Component;
  let fixture: ComponentFixture<${componentNamePascal}Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [${componentNamePascal}Component]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(${componentNamePascal}Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have correct title', () => {
    expect(component.title).toBe('${componentDisplayName}');
  });
});
`;
}

// File update functions
function updateComponentSelectorService() {
  const content = fs.readFileSync(serviceFile, 'utf8');
  
  // Find the availableComponents array and add new component
  const componentToAdd = `        {
            name: '${componentNameKebab}',
            displayName: '${componentDisplayName}',
            route: '/${componentNameKebab}',
            icon: 'dashboard',
            description: 'Manage ${componentDisplayName.toLowerCase()} in SailPoint.',
            enabled: false
        }`;

  // Find the last component in the array and add after it
  const regex = /(private availableComponents: ComponentInfo\[\] = \[[\s\S]*?)\s*(\]\s*;)/;
  const match = content.match(regex);
  
  if (match) {
    const beforeClosing = match[1];
    const closing = match[2];
    
    // Check if there are existing components
    const hasExistingComponents = beforeClosing.includes('{');
    const separator = hasExistingComponents ? ',\n' : '\n';
    
    const updatedContent = content.replace(
      regex,
      beforeClosing + separator + componentToAdd + '\n    ' + closing
    );
    
    fs.writeFileSync(serviceFile, updatedContent);
    console.log(`✅ Updated: component-selector.service.ts`);
  } else {
    console.error('❌ Could not find availableComponents array in service file');
  }
}

function updateAppRoutes() {
  const content = fs.readFileSync(routesFile, 'utf8');
  
  // Add import for the new component
  const importLine = `import { ${componentNamePascal}Component } from 'sailpoint-components';`;
  
  // Check if import already exists
  if (!content.includes(importLine)) {
    const importRegex = /(import.*from 'sailpoint-components';)/;
    const importMatch = content.match(importRegex);
    
    if (importMatch) {
      // Add to existing import
      const existingImport = importMatch[1];
      const newImport = existingImport.replace(
        /import\s*{\s*([^}]*)\s*}\s*from 'sailpoint-components';/,
        `import { $1, ${componentNamePascal}Component } from 'sailpoint-components';`
      );
      const updatedContent = content.replace(existingImport, newImport);
      
      // Add route
      addRoute(updatedContent);
    } else {
      console.error('❌ Could not find sailpoint-components import');
    }
  } else {
    addRoute(content);
  }
  
  function addRoute(content) {
    const routeToAdd = `  {
    path: '${componentNameKebab}',
    component: ${componentNamePascal}Component
  },`;
    
    // Find the routes array and add before the catch-all route
    const routeRegex = /(export const appRoutes: Routes = \[[\s\S]*?)(  {\s*path: '\*\*',[\s\S]*?\}\s*\];)/;
    const routeMatch = content.match(routeRegex);
    
    if (routeMatch) {
      const beforeCatchAll = routeMatch[1];
      const catchAll = routeMatch[2];
      
      const updatedContent = content.replace(
        routeRegex,
        beforeCatchAll + routeToAdd + '\n\n' + catchAll
      );
      
      fs.writeFileSync(routesFile, updatedContent);
      console.log(`✅ Updated: app.routes.ts`);
    } else {
      console.error('❌ Could not find routes array in routes file');
    }
  }
}

function updateAppComponentHtml() {
  const content = fs.readFileSync(appComponentFile, 'utf8');
  
  const linkToAdd = `        @if (isComponentEnabled('${componentNameKebab}')) {
          <a mat-list-item class="sidebar-link" routerLink="/${componentNameKebab}" routerLinkActive="active-link"
            [class.disabled]="!isConnected" (click)="onNavItemClick($event)">
            <mat-icon class="card-icon">dashboard</mat-icon>
            ${componentDisplayName}
          </a>
        }`;
  
  // Find the closing </mat-nav-list> tag and insert before it
  const navListEndRegex = /(.*?)(\s+<\/mat-nav-list>.*)/s;
  const match = content.match(navListEndRegex);
  
  if (match) {
    const beforeNavListEnd = match[1];
    const navListEndTag = match[2];
    
    const updatedContent = beforeNavListEnd + '\n' + linkToAdd + navListEndTag;
    
    fs.writeFileSync(appComponentFile, updatedContent);
    console.log(`✅ Updated: app.component.html`);
  } else {
    console.error('❌ Could not find </mat-nav-list> tag in app.component.html');
  }
}

function updatePublicApi() {
  const publicApiFile = path.join(projectRoot, 'projects', 'sailpoint-components', 'src', 'public-api.ts');
  const content = fs.readFileSync(publicApiFile, 'utf8');
  
  const exportLine = `export * from './lib/${componentNameKebab}/${componentNameKebab}.component';`;
  
  if (!content.includes(exportLine)) {
    const updatedContent = content + '\n' + exportLine;
    fs.writeFileSync(publicApiFile, updatedContent);
    console.log(`✅ Updated: public-api.ts`);
  }
}