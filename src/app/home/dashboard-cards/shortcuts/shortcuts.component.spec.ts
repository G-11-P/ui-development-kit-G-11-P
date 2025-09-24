import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EnvironmentInfo } from '../../../services/connection.service';
import { BehaviorSubject } from 'rxjs';
import { ShortcutsComponent } from './shortcuts.component';
import { ConnectionService } from '../../../services/connection.service';

describe('ShortcutsComponent', () => {
  let component: ShortcutsComponent;
  let fixture: ComponentFixture<ShortcutsComponent>;
  let mockConnectionService: Partial<ConnectionService>;

  beforeEach(async () => {
    // Create mock ConnectionService
    mockConnectionService = {
      currentEnvironmentSubject$: new BehaviorSubject<EnvironmentInfo | undefined>({ 
        name: 'test-env', 
        apiUrl: 'https://test.api.identitynow.com', 
        baseUrl: 'https://test.identitynow.com',
        authtype: 'oauth' as const
      })
    };

    await TestBed.configureTestingModule({
      imports: [ShortcutsComponent],
      providers: [
        { provide: ConnectionService, useValue: mockConnectionService }
      ]
    })
      .compileComponents();

    fixture = TestBed.createComponent(ShortcutsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have 3 shortcut categories defined', () => {
    expect(component.shortcutCategories.length).toBe(3);
  });

  it('should have Tenant Management category with 8 shortcuts', () => {
    const tenantCategory = component.shortcutCategories.find(cat => cat.title === 'Tenant Management');
    expect(tenantCategory).toBeTruthy();
    expect(tenantCategory?.shortcuts.length).toBe(8);
  });

  it('should have Developer Resources category with 7 shortcuts', () => {
    const devCategory = component.shortcutCategories.find(cat => cat.title === 'Developer Resources');
    expect(devCategory).toBeTruthy();
    expect(devCategory?.shortcuts.length).toBe(7);
  });

  it('should have Support & Help category with 3 shortcuts', () => {
    const supportCategory = component.shortcutCategories.find(cat => cat.title === 'Support & Help');
    expect(supportCategory).toBeTruthy();
    expect(supportCategory?.shortcuts.length).toBe(3);
  });

  it('should call action when shortcut is clicked', () => {
    const shortcut = component.shortcutCategories[0].shortcuts[0];
    const spy = jest.spyOn(window, 'open').mockImplementation(() => null);

    component.onShortcutClick(shortcut);

    expect(spy).toHaveBeenCalledWith(
      shortcut.url.replace(':TENANTURL:', 'https://test.identitynow.com'), 
      '_blank'
    );
  });

  it('should replace tenant URL placeholder correctly', () => {
    expect(component.tenantUrl).toBe('https://test.identitynow.com');
  });
}); 