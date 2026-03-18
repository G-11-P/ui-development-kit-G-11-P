// velocity-editor-dialog.component.ts

import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

// CodeMirror 6 imports
import { completionKeymap } from '@codemirror/autocomplete';
import { indentWithTab } from '@codemirror/commands';
import { StreamLanguage, foldKeymap } from '@codemirror/language';
import { velocity } from '@codemirror/legacy-modes/mode/velocity';
import { searchKeymap } from '@codemirror/search';
import { EditorState, Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';
import { EditorView, basicSetup } from 'codemirror';
import { smoothy } from 'thememirror';

import { Subject, takeUntil } from 'rxjs';
import { ConfigService } from '../services/config.service';


export interface VelocityEditorData {
  code: string;
  title?: string;
  readonly?: boolean;
  theme?: 'light' | 'dark';
}

@Component({
  selector: 'app-velocity-editor-dialog',
  templateUrl: './velocity-editor-dialog.component.html',
  styleUrls: ['./velocity-editor-dialog.component.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule
]
})
export class VelocityEditorDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('editorContainer', { static: true }) editorContainer!: ElementRef<HTMLDivElement>;
  private destroy$ = new Subject<void>();
  isDark = false;
  editorForm: FormGroup;
  editorView!: EditorView;
  originalCode: string;
  hasChanges: boolean = false;
  editorStats: any = '{"lines":0,"length":0,"selection":0,"cursor":"1:1"}';
  currentTheme: 'light' | 'dark' = 'light';
  wordWrapEnabled: boolean = true;
  identities: any;

  constructor(
    private dialogRef: MatDialogRef<VelocityEditorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: VelocityEditorData,
    private fb: FormBuilder,
    private configService: ConfigService,
    private changeRef: ChangeDetectorRef
  ) {
    this.originalCode = data.code || '';
    this.currentTheme = data.theme || 'light';
    this.editorForm = this.fb.group({
      code: [this.originalCode, (control: AbstractControl<any, any>) => Validators.required(control)]
    });
  }

  ngOnInit(): void {
    // Set dialog configuration
    this.dialogRef.disableClose = true;
    this.dialogRef.backdropClick().subscribe(() => {
      this.onCancel();
    });

    this.configService.isDark$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isDark => {
        this.isDark = isDark;
        this.recreateEditor();
      });
  }
  
  renderIdentityStatusChart() {
    throw new Error('Method not implemented.');
  }

  ngAfterViewInit(): void {
    this.initializeCodeMirror();
  }

  ngOnDestroy(): void {
    if (this.editorView) {
      this.editorView.destroy();
    }

  }

  private initializeCodeMirror(): void {
    // Auto-format code if requested
    let initialCode = this.originalCode;
    initialCode = this.formatVelocityCode(this.originalCode);
    this.originalCode = initialCode; // Update original to formatted version
    
    
    const extensions = this.getExtensions();
    
    const state = EditorState.create({
      doc: initialCode,
      extensions
    });

    this.editorView = new EditorView({
      state,
      parent: this.editorContainer.nativeElement,
      dispatch: (tr) => {
        this.editorView.update([tr]);
        
        if (tr.docChanged) {
          const currentValue = this.editorView.state.doc.toString();
          this.editorForm.patchValue({ code: currentValue });
          this.hasChanges = currentValue !== this.originalCode;
          this.updateEditorStats();
        }
        
        if (tr.selection) {
          this.updateEditorStats();
        }
      }
    });

    // Initial stats
    this.updateEditorStats();

    // Focus the editor
    setTimeout(() => {
      this.editorView.focus();
    }, 100);
  }

  private getExtensions(): Extension[] {
    const extensions: Extension[] = [
      basicSetup,
      StreamLanguage.define(velocity),
      keymap.of([
        indentWithTab,
        ...searchKeymap,
        ...foldKeymap,
        ...completionKeymap,
        {
          key: 'Ctrl-s',
          run: () => {
            this.onSave();
            return true;
          }
        },
        {
          key: 'Escape',
          run: () => {
            this.onCancel();
            return true;
          }
        }
      ])
    ];

    // Add word wrapping conditionally
    if (this.wordWrapEnabled) {
      extensions.push(EditorView.lineWrapping);
    }

    // Add readonly mode if specified
    if (this.data.readonly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    // Add theme
    if (this.isDark === true) {
      extensions.push(oneDark);
    } else {
      extensions.push(smoothy);
    }

    return extensions;
  }

  private updateEditorStats(): void {
    if (!this.editorView) return;

    const state = this.editorView.state;
    const doc = state.doc;
    const selection = state.selection.main;
    
    this.editorStats = {
      lines: doc.lines,
      length: doc.length,
      selection: selection.empty ? 0 : selection.to - selection.from,
      cursor: `${doc.lineAt(selection.head).number}:${selection.head - doc.lineAt(selection.head).from + 1}`
    };
    
    this.changeRef.detectChanges();
  }

  toggleWordWrap(): void {
    this.wordWrapEnabled = !this.wordWrapEnabled;
    this.recreateEditor();
  }

  formatCode(): void {
    if (!this.editorView) return;

    const currentCode = this.editorView.state.doc.toString();
    
    // Basic Velocity code formatting
    const formattedCode = this.formatVelocityCode(currentCode);
    
    if (formattedCode !== currentCode) {
      this.editorView.dispatch({
        changes: {
          from: 0,
          to: this.editorView.state.doc.length,
          insert: formattedCode
        }
      });
    }
  }

  private formatVelocityCode(code: string): string {
    // First, handle single-line concatenated Velocity directives
    let formatted = this.splitConcatenatedDirectives(code);
    
    // Split into lines and process each one
    const lines = formatted.split('\n');
    let indentLevel = 0;
    const indentSize = 2;
    let inComment = false;

    const formattedLines = lines.map((line) => {
      const trimmed = line.trim();
      
      // Handle multi-line comments
      if (trimmed.startsWith('#*')) {
        inComment = true;
      }
      if (trimmed.endsWith('*#')) {
        inComment = false;
        return ' '.repeat(indentLevel * indentSize) + trimmed;
      }
      if (inComment) {
        return ' '.repeat(indentLevel * indentSize) + trimmed;
      }
      
      // Skip empty lines
      if (!trimmed) {
        return '';
      }
      
      // Handle block end directives - decrease indent before formatting
      if (this.isBlockEndDirective(trimmed)) {
        indentLevel = Math.max(0, indentLevel - 1);
      }
      
      // Handle else/elseif - same level as if
      if (this.isElseDirective(trimmed)) {
        const currentIndent = Math.max(0, indentLevel - 1);
        const formattedLine = ' '.repeat(currentIndent * indentSize) + this.formatVelocityLine(trimmed);
        return formattedLine;
      }
      
      // Apply current indentation
      const formattedLine = ' '.repeat(indentLevel * indentSize) + this.formatVelocityLine(trimmed);
      
      // Handle block start directives - increase indent after formatting
      if (this.isBlockStartDirective(trimmed)) {
        indentLevel++;
      }
      
      return formattedLine;
    });
    
    // Clean up extra blank lines
    let result = formattedLines.join('\n');
    
    // Remove multiple consecutive blank lines
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    // Add spacing around major blocks
    result = this.addBlockSpacing(result);
    
    return result;
  }

  private splitConcatenatedDirectives(code: string): string {
    // Handle single-line concatenated Velocity directives
    let formatted = code;
    
    // Split lines that have multiple directives concatenated
    const lines = formatted.split('\n');
    const expandedLines: string[] = [];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Skip if line is already properly formatted or is a comment
      if (!trimmed || trimmed.startsWith('##') || trimmed.startsWith('#*')) {
        expandedLines.push(line);
        return;
      }
      
      // Check if this line has concatenated directives
      if (this.hasConcatenatedDirectives(trimmed)) {
        const splitLine = this.splitVelocityDirectiveLine(trimmed);
        expandedLines.push(...splitLine);
      } else {
        expandedLines.push(line);
      }
    });
    
    return expandedLines.join('\n');
  }
  
  private hasConcatenatedDirectives(line: string): boolean {
    // Count directive occurrences (including #{else} format)
    const directivePattern = /#(if|elseif|else|end|foreach|while|macro|define|set|parse|include)\b|#{else}/g;
    const matches = line.match(directivePattern);
    return !!matches && matches.length > 1;
  }
  
  private splitVelocityDirectiveLine(line: string): string[] {
    const result: string[] = [];
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      // Look for directive starts
      if (char === '#') {
        const remainingLine = line.substring(i);
        
        // Check for #{else} first, then other directives
        let directiveMatch;
        if (remainingLine.startsWith('#{else}')) {
          directiveMatch = { 0: '#{else}', 1: 'else', length: 7 };
        } else {
          const match = remainingLine.match(/^#(if|elseif|else|end|foreach|while|macro|define|set|parse|include)\b/);
          if (match) {
            directiveMatch = { 0: match[0], 1: match[1], length: match[0].length };
          }
        }
        
        if (directiveMatch) {
          // Find the end of this directive
          let directiveEnd;
          
          if (directiveMatch[1] === 'else' && remainingLine.startsWith('#{else}')) {
            // Special handling for #{else}
            directiveEnd = i + 7; // Length of '#{else}'
            result.push('#{else}');
          } else if (directiveMatch[1] === 'end' || directiveMatch[1] === 'else') {
            // Simple directives without parameters
            directiveEnd = i + directiveMatch.length;
            result.push(line.substring(i, directiveEnd as number));
          } else {
            // Complex directives with parameters
            directiveEnd = this.findDirectiveEnd(line, i);
            const directive = line.substring(i, directiveEnd as number).trim();
            result.push(directive);
          }
          
          i = directiveEnd;
        } else {
          // Not a directive, treat as content
          const nextDirectivePos = this.findNextDirective(line, i + 1);
          const content = line.substring(i, nextDirectivePos).trim();
          if (content) {
            result.push(content);
          }
          i = nextDirectivePos;
        }
      } else {
        // Find content until next directive
        const nextDirectivePos = this.findNextDirective(line, i);
        const content = line.substring(i, nextDirectivePos).trim();
        if (content) {
          result.push(content);
        }
        i = nextDirectivePos;
      }
      
      // Safety check to prevent infinite loop
      if (i === 0) {
        i++;
      }
    }
    
    return result.length > 0 ? result : [line];
  }
  
  private findNextDirective(line: string, startPos: number): number {
    let inString = false;
    let stringChar = '';
    let parenCount = 0;
    
    for (let i = startPos; i < line.length; i++) {
      const char = line[i];
      const prevChar = line[i - 1];
      
      // Handle string literals (including escaped quotes)
      if (!inString && (char === '"' || char === "'")) {
        if (prevChar !== '\\') {
          inString = true;
          stringChar = char;
        }
      } else if (inString && char === stringChar) {
        if (prevChar !== '\\') {
          inString = false;
          stringChar = '';
        }
      }
      
      if (!inString) {
        // Handle parentheses
        if (char === '(') {
          parenCount++;
        } else if (char === ')') {
          parenCount--;
        }
        
        // Look for directive starts when not inside parentheses or strings
        if (char === '#' && parenCount === 0) {
          const remainingLine = line.substring(i);
          if (remainingLine.startsWith('#{else}') || 
              remainingLine.match(/^#(if|elseif|else|end|foreach|while|macro|define|set|parse|include)\b/)) {
            return i;
          }
        }
      }
    }
    
    return line.length;
  }
  
  private findDirectiveEnd(line: string, startPos: number): number {
    let pos = startPos;
    let parenCount = 0;
    let inString = false;
    let stringChar = '';
    
    // Skip the directive name
    while (pos < line.length && /[a-zA-Z#{}]/.test(line[pos])) {
      pos++;
    }
    
    // For directives without parameters (like #else, #end), return immediately
    if (pos >= line.length || line[pos] !== '(') {
      // Check for #{else} format
      if (line.substring(startPos).startsWith('#{else}')) {
        return startPos + 7;
      }
      // Look for the next directive or end of line
      const nextDirectivePos = line.indexOf('#', pos);
      return nextDirectivePos > 0 ? nextDirectivePos : line.length;
    }
    
    // Handle directives with parameters
    while (pos < line.length) {
      const char = line[pos];
      const prevChar = line[pos - 1];
      
      // Handle string literals (including escaped quotes)
      if (!inString && (char === '"' || char === "'")) {
        // Check if it's not escaped (handle \" and \')
        if (prevChar !== '\\') {
          inString = true;
          stringChar = char;
        }
      } else if (inString && char === stringChar) {
        // Check if it's not escaped
        if (prevChar !== '\\') {
          inString = false;
          stringChar = '';
        }
      }
      
      if (!inString) {
        if (char === '(') {
          parenCount++;
        } else if (char === ')') {
          parenCount--;
          if (parenCount === 0) {
            return pos + 1; // Include the closing parenthesis
          }
        }
      }
      
      pos++;
    }
    
    return pos;
  }
  
  private formatVelocityLine(line: string): string {
    let formatted = line;
    
    // Handle escaped quotes in strings - convert \" back to "
    formatted = formatted.replace(/\\"/g, '"');
    formatted = formatted.replace(/\\'/g, "'");
    
    // Add spaces around operators in #set statements
    if (formatted.startsWith('#set')) {
      formatted = formatted.replace(/\s*=\s*/g, ' = ');
      formatted = formatted.replace(/\s*\+\s*/g, ' + ');
      formatted = formatted.replace(/\s*-\s*/g, ' - ');
      formatted = formatted.replace(/\s*\*\s*/g, ' * ');
      formatted = formatted.replace(/\s*\/\s*/g, ' / ');
    }
    
    // Add spaces around comparison operators
    formatted = formatted.replace(/\s*==\s*/g, ' == ');
    formatted = formatted.replace(/\s*!=\s*/g, ' != ');
    formatted = formatted.replace(/\s*<=\s*/g, ' <= ');
    formatted = formatted.replace(/\s*>=\s*/g, ' >= ');
    formatted = formatted.replace(/\s*&&\s*/g, ' && ');
    formatted = formatted.replace(/\s*\|\|\s*/g, ' || ');
    
    // Format method calls with proper spacing
    formatted = formatted.replace(/\s*\(\s*/g, '(');
    formatted = formatted.replace(/\s*\)\s*/g, ')');
    formatted = formatted.replace(/\s*,\s*/g, ', ');
    
    // Format array/list literals
    formatted = formatted.replace(/\[\s*/g, '[');
    formatted = formatted.replace(/\s*\]/g, ']');
    
    // Format object literals
    formatted = formatted.replace(/\{\s*/g, '{');
    formatted = formatted.replace(/\s*\}/g, '}');
    
    // Clean up extra spaces
    formatted = formatted.replace(/\s+/g, ' ');
    
    return formatted;
  }
  
  private isBlockStartDirective(line: string): boolean {
    const blockStarts = [
      '#if', '#foreach', '#while', '#macro', '#define', 
      '#@', '#{', '#parse', '#include', '#evaluate'
    ];
    return blockStarts.some(directive => 
      line.startsWith(directive + '(') || 
      line.startsWith(directive + ' ') ||
      line === directive
    );
  }
  
  private isBlockEndDirective(line: string): boolean {
    return line.startsWith('#end');
  }
  
  private isElseDirective(line: string): boolean {
    return line.startsWith('#else') || line.startsWith('#{else}');
  }
  
  private addBlockSpacing(code: string): string {
    let result = code;
    
    // Add space before major block directives (but not after #end and not if already has content after)
    const majorBlocks = ['#if', '#foreach', '#while', '#macro', '#define'];
    majorBlocks.forEach(block => {
      // Only add spacing before blocks that don't already have proper spacing
      // and are not immediately after another directive
      const regex = new RegExp(`(\\n(?!\\s*$)(?!\\s*#)(?!\\n))(?=\\s*\\${block})`, 'g');
      result = result.replace(regex, '\n\n');
    });
    
    // Add space after #end directives (but only when not followed by another #end or end of string)
    result = result.replace(/(#end[^\n]*)\n(?!\s*$)(?!\s*#end)(?!\s*\n)/g, '$1\n\n');
    
    // Add space before and after macro definitions
    result = result.replace(/(\n)(\s*#macro)/g, '$1\n$2');
    result = result.replace(/(#end\s*##[^\n]*macro[^\n]*)\n/g, '$1\n\n');
    
    // Remove any double spacing that might have been created after directive blocks
    // but preserve intentional spacing elsewhere
    result = result.replace(/(\n\s*#\w+[^\n]*)\n\n(\s*#)/g, '$1\n$2');
    result = result.replace(/(\n\s*#\w+[^\n]*)\n\n(\s*\$)/g, '$1\n$2');
    
    return result;
  }

  private compressVelocityCode(code: string): string {
    // Split into lines and process each one
    const lines = code.split('\n');
    const compressedParts: string[] = [];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Skip empty lines
      if (!trimmed) {
        return;
      }
      
      // Skip comments (but preserve inline comments that might be important)
      if (trimmed.startsWith('##') && !trimmed.includes('#end')) {
        return;
      }
      
      compressedParts.push(trimmed);
    });
    
    // Join all parts together
    let compressed = compressedParts.join('');
    
    // Only do minimal cleanup - don't over-process
    compressed = this.minimalCleanupCompressed(compressed);
    
    return compressed;
  }
  
  private minimalCleanupCompressed(code: string): string {
    let cleaned = code;
    
    // Only clean up obvious extra spaces while preserving string content
    cleaned = this.preserveStringsWhileProcessing(cleaned, (content) => {
      // Only remove spaces around commas and parentheses - be conservative
      content = content.replace(/\s*,\s*/g, ',');
      content = content.replace(/\(\s+/g, '(');
      content = content.replace(/\s+\)/g, ')');
      
      // Clean up multiple spaces
      content = content.replace(/\s+/g, ' ');
      
      return content;
    });
    
    return cleaned;
  }
  
  private preserveStringsWhileProcessing(code: string, processor: (content: string) => string): string {
    const stringMarkers: Array<{start: number, end: number, content: string}> = [];
    let inString = false;
    let stringChar = '';
    let stringStart = 0;
    
    // Find all string literals
    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const prevChar = code[i - 1];
      
      if (!inString && (char === '"' || char === "'")) {
        if (prevChar !== '\\') {
          inString = true;
          stringChar = char;
          stringStart = i;
        }
      } else if (inString && char === stringChar) {
        if (prevChar !== '\\') {
          stringMarkers.push({
            start: stringStart,
            end: i + 1,
            content: code.substring(stringStart, i + 1)
          });
          inString = false;
          stringChar = '';
        }
      }
    }
    
    // Replace strings with placeholders
    let processableCode = code;
    const placeholders: string[] = [];
    
    stringMarkers.reverse().forEach((marker, index) => {
      const placeholder = `__STRING_PLACEHOLDER_${index}__`;
      placeholders.unshift(marker.content);
      processableCode = processableCode.substring(0, marker.start) + 
                       placeholder + 
                       processableCode.substring(marker.end);
    });
    
    // Process the code without strings
    const processedCode = processor(processableCode);
    
    // Restore strings
    let result = processedCode;
    placeholders.forEach((stringContent, index) => {
      const placeholder = `__STRING_PLACEHOLDER_${index}__`;
      result = result.replace(placeholder, stringContent);
    });
    
    return result;
  }

  private recreateEditor(): void {
    if (!this.editorView) return;

    const currentCode = this.editorView.state.doc.toString();
    const currentSelection = this.editorView.state.selection;
    
    this.editorView.destroy();
    
    const extensions = this.getExtensions();
    
    const state = EditorState.create({
      doc: currentCode,
      extensions,
      selection: currentSelection
    });

    this.editorView = new EditorView({
      state,
      parent: this.editorContainer.nativeElement,
      dispatch: (tr) => {
        this.editorView.update([tr]);
        
        if (tr.docChanged) {
          const currentValue = this.editorView.state.doc.toString();
          this.editorForm.patchValue({ code: currentValue });
          this.hasChanges = currentValue !== this.originalCode;
          this.updateEditorStats();
        }
        
        if (tr.selection) {
          this.updateEditorStats();
        }
      }
    });

    this.updateEditorStats();
  }

  onSave(): void {
    if (this.editorForm.valid && this.editorView) {
      const code = this.editorView.state.doc.toString();
      const compressedCode = this.compressVelocityCode(code);

      this.dialogRef.close({
        code: compressedCode,
        saved: true
      });
    }
  }

  onCancel(): void {
    if (this.hasChanges) {
      const confirmClose = window.confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmClose) {
        return;
      }
    }
    this.dialogRef.close({
      code: this.originalCode,
      saved: false
    });
  }
}