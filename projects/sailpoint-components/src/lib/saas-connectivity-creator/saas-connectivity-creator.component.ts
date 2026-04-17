import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
    AbstractControl,
    FormArray,
    FormBuilder,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import JSZip from 'jszip';

import { ConnectorCodeGenerator } from './saas-connectivity-creator.generator';
import {
    AccountAttribute,
    AccountCreateField,
    AuthType,
    CardSubMenuItem,
    ConfigItem,
    ConfigItemType,
    ConfigSection,
    DEFAULT_ACCOUNT_ATTRIBUTES,
    DEFAULT_ENTITLEMENT_ATTRIBUTES,
    GENERATOR_OPTIONS,
    OPTION_TYPES,
    WizardState,
} from './saas-connectivity-creator.models';

@Component({
    selector: 'app-saas-connectivity-creator',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatButtonModule,
        MatCardModule,
        MatCheckboxModule,
        MatChipsModule,
        MatDividerModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatRadioModule,
        MatSelectModule,
        MatExpansionModule,
        MatSlideToggleModule,
        MatStepperModule,
        MatTableModule,
        MatTabsModule,
        MatToolbarModule,
        MatTooltipModule,
    ],
    templateUrl: './saas-connectivity-creator.component.html',
    styleUrl: './saas-connectivity-creator.component.scss',
})
export class SaasConnectivityCreatorComponent {
    private fb = inject(FormBuilder);

    readonly generatorOptions = GENERATOR_OPTIONS;

    readonly configItemTypes: ConfigItemType[] = [
        'text', 'secret', 'url', 'number', 'textarea', 'secrettextarea',
        'select', 'checkbox', 'toggle', 'radio', 'list', 'keyValue', 'cardList',
    ];

    readonly optionTypes = OPTION_TYPES;

    readonly attributeTypes = ['string', 'boolean', 'long', 'int'];

    readonly accountAttributeColumns = ['name', 'type', 'description', 'multi', 'entitlement', 'managed', 'actions'];
    readonly entitlementAttributeColumns = ['name', 'type', 'description', 'actions'];
    readonly configItemColumns = ['key', 'label', 'type', 'required', 'actions'];

    // ─── Step 1 — Basic Info ─────────────────────────────────────────────────────

    step1 = this.fb.group({
        connectorName: ['', [
            (c: AbstractControl) => Validators.required(c),
            (c: AbstractControl) => Validators.pattern(/^[a-z0-9-]+$/)(c),
        ]],
        displayName: ['', (c: AbstractControl) => Validators.required(c)],
        description: [''],
        keyType: ['simple', (c: AbstractControl) => Validators.required(c)],
        supportsStatefulCommands: [false],
    });

    // ─── Step 2 — Authentication ─────────────────────────────────────────────────

    step2 = this.fb.group({
        authType: ['apiKey', (c: AbstractControl) => Validators.required(c)],
        keyLabel: ['API Key'],
        usernameLabel: ['Username'],
        passwordLabel: ['Password'],
        tokenLabel: ['Bearer Token'],
    });

    // ─── Step 3 — Operations ─────────────────────────────────────────────────────

    step3 = this.fb.group({
        accountList: [true],
        accountRead: [true],
        accountCreate: [false],
        accountUpdate: [false],
        accountDelete: [false],
        accountEnable: [false],
        accountDisable: [false],
        accountUnlock: [false],
        changePassword: [false],
        entitlementList: [false],
        entitlementRead: [false],
        sourceDataDiscover: [false],
        sourceDataRead: [false],
    });

    // ─── Step 4 — Account Schema ─────────────────────────────────────────────────

    accountAttributes: FormArray = this.fb.array(
        DEFAULT_ACCOUNT_ATTRIBUTES.map(a => this.buildAttributeRow(a))
    );

    step4 = this.fb.group({
        displayAttribute: ['displayName', (c: AbstractControl) => Validators.required(c)],
        identityAttribute: ['id', (c: AbstractControl) => Validators.required(c)],
        groupAttribute: [''],
    });

    entitlementAttributes: FormArray = this.fb.array(
        DEFAULT_ENTITLEMENT_ATTRIBUTES.map(a => this.buildAttributeRow(a))
    );

    entitlementSchemaGroup = this.fb.group({
        entitlementDisplayAttribute: ['name', (c: AbstractControl) => Validators.required(c)],
        entitlementIdentityAttribute: ['id', (c: AbstractControl) => Validators.required(c)],
    });

    accountCreateFields: FormArray = this.fb.array([]);

    // ─── Step 5 — Additional Config ──────────────────────────────────────────────

    additionalSections: FormArray = this.fb.array([]);

    step5 = this.fb.group({ additionalSections: this.additionalSections });

    // ─── Computed state ──────────────────────────────────────────────────────────

    // Spread copies so mat-table gets a new array reference on every change detection
    // cycle — without this, push/removeAt mutations are invisible to the table.
    get accountAttributeRows() { return [...this.accountAttributes.controls]; }
    get entitlementAttributeRows() { return [...this.entitlementAttributes.controls]; }
    get accountCreateFieldRows() { return [...this.accountCreateFields.controls]; }
    getSectionItemRows(sectionIndex: number) { return [...this.getSectionItems(sectionIndex).controls]; }

    get hasEntitlements(): boolean {
        return this.step3.value.entitlementList === true || this.step3.value.entitlementRead === true;
    }

    get hasAccountCreate(): boolean {
        return this.step3.value.accountCreate === true;
    }

    get currentAccountAttrNames(): string[] {
        return this.accountAttributes.controls
            .map(c => c.get('name')?.value as string | undefined)
            .filter((v): v is string => Boolean(v));
    }

    // ─── Step 4 helpers ──────────────────────────────────────────────────────────

    private buildAttributeRow(attr?: Partial<AccountAttribute>): FormGroup {
        return this.fb.group({
            name: [attr?.name ?? '', (c: AbstractControl) => Validators.required(c)],
            type: [attr?.type ?? 'string'],
            description: [attr?.description ?? ''],
            multi: [attr?.multi ?? false],
            entitlement: [attr?.entitlement ?? false],
            managed: [attr?.managed ?? false],
        });
    }

    addAccountAttribute(): void {
        this.accountAttributes.push(this.buildAttributeRow());
    }

    removeAccountAttribute(index: number): void {
        this.accountAttributes.removeAt(index);
    }

    addEntitlementAttribute(): void {
        this.entitlementAttributes.push(this.buildAttributeRow());
    }

    removeEntitlementAttribute(index: number): void {
        this.entitlementAttributes.removeAt(index);
    }

    private buildCreateFieldRow(field?: Partial<AccountCreateField>): FormGroup {
        return this.fb.group({
            key: [field?.key ?? '', (c: AbstractControl) => Validators.required(c)],
            label: [field?.label ?? ''],
            type: [field?.type ?? 'string'],
            required: [field?.required ?? false],
            initialValueType: [field?.initialValueType ?? 'identityAttribute'],
            initialValueRef: [field?.initialValueRef ?? ''],
        });
    }

    syncCreateFieldsFromSchema(): void {
        this.accountCreateFields.clear();
        for (const ctrl of this.accountAttributes.controls) {
            const name = ctrl.get('name')?.value;
            if (name) {
                this.accountCreateFields.push(this.buildCreateFieldRow({
                    key: name,
                    label: name,
                    type: ctrl.get('type')?.value,
                    required: false,
                    initialValueType: 'identityAttribute',
                    initialValueRef: name,
                }));
            }
        }
    }

    // ─── Step 5 helpers ──────────────────────────────────────────────────────────

    private buildSectionGroup(): FormGroup {
        return this.fb.group({
            sectionTitle: ['', (c: AbstractControl) => Validators.required(c)],
            sectionHelpMessage: [''],
            items: this.fb.array([]),
        });
    }

    private buildConfigItemGroup(): FormGroup {
        return this.fb.group({
            // ── shared ──────────────────────────────────────────────────────
            key: ['', (c: AbstractControl) => Validators.required(c)],
            label: [''],
            type: ['text'],
            required: [false],
            parentKey: [''],
            parentValue: [''],
            // ── list ────────────────────────────────────────────────────────
            helpKey: [''],
            // ── select / radio ───────────────────────────────────────────────
            options: this.fb.array([]),
            // ── keyValue ────────────────────────────────────────────────────
            kvKeyLabel:    ['Key'],
            kvKeyRequired: [true],
            kvKeyMaxlength: ['256'],
            kvValueLabel:    ['Value'],
            kvValueRequired: [true],
            kvValueMaxlength: ['4096'],
            // ── cardList ────────────────────────────────────────────────────
            titleKey:         [''],
            subtitleKey:      [''],
            indexKey:         [''],
            buttonLabel:      ['Add'],
            addButton:        [true],
            editButton:       [true],
            deleteButton:     [true],
            copyButton:       [false],
            dragNDropEnabled: [false],
            subMenus: this.fb.array([]),
        });
    }

    private buildOptionGroup(): FormGroup {
        return this.fb.group({
            label: ['', (c: AbstractControl) => Validators.required(c)],
            value: ['', (c: AbstractControl) => Validators.required(c)],
        });
    }

    private buildSubMenuGroup(): FormGroup {
        return this.fb.group({
            label: ['', (c: AbstractControl) => Validators.required(c)],
            items: this.fb.array([]),
        });
    }

    private buildSubMenuItemGroup(): FormGroup {
        return this.fb.group({
            key: ['', (c: AbstractControl) => Validators.required(c)],
            label: [''],
            type: ['text'],
            required: [false],
            helpKey: [''],
            options: this.fb.array([]),
        });
    }

    // ── Section ───────────────────────────────────────────────────────────────

    addSection(): void {
        this.additionalSections.push(this.buildSectionGroup());
    }

    removeSection(index: number): void {
        this.additionalSections.removeAt(index);
    }

    // ── Config items ──────────────────────────────────────────────────────────

    getSectionItems(si: number): FormArray {
        return this.additionalSections.at(si).get('items') as FormArray;
    }

    addConfigItem(si: number): void {
        this.getSectionItems(si).push(this.buildConfigItemGroup());
    }

    removeConfigItem(si: number, ii: number): void {
        this.getSectionItems(si).removeAt(ii);
    }

    // ── Options (select / radio) ───────────────────────────────────────────────

    getItemOptions(si: number, ii: number): FormArray {
        return this.getSectionItems(si).at(ii).get('options') as FormArray;
    }

    getItemOptionRows(si: number, ii: number) { return [...this.getItemOptions(si, ii).controls]; }

    addOption(si: number, ii: number): void {
        this.getItemOptions(si, ii).push(this.buildOptionGroup());
    }

    removeOption(si: number, ii: number, oi: number): void {
        this.getItemOptions(si, ii).removeAt(oi);
    }

    // ── cardList — subMenus ────────────────────────────────────────────────────

    getSubMenus(si: number, ii: number): FormArray {
        return this.getSectionItems(si).at(ii).get('subMenus') as FormArray;
    }

    getSubMenuRows(si: number, ii: number) { return [...this.getSubMenus(si, ii).controls]; }

    addSubMenu(si: number, ii: number): void {
        this.getSubMenus(si, ii).push(this.buildSubMenuGroup());
    }

    removeSubMenu(si: number, ii: number, smi: number): void {
        this.getSubMenus(si, ii).removeAt(smi);
    }

    // ── cardList — subMenu items ───────────────────────────────────────────────

    getSubMenuItems(si: number, ii: number, smi: number): FormArray {
        return this.getSubMenus(si, ii).at(smi).get('items') as FormArray;
    }

    getSubMenuItemRows(si: number, ii: number, smi: number) {
        return [...this.getSubMenuItems(si, ii, smi).controls];
    }

    addSubMenuItem(si: number, ii: number, smi: number): void {
        this.getSubMenuItems(si, ii, smi).push(this.buildSubMenuItemGroup());
    }

    removeSubMenuItem(si: number, ii: number, smi: number, smii: number): void {
        this.getSubMenuItems(si, ii, smi).removeAt(smii);
    }

    // ── cardList — subMenu item options ───────────────────────────────────────

    getSubMenuItemOptions(si: number, ii: number, smi: number, smii: number): FormArray {
        return this.getSubMenuItems(si, ii, smi).at(smii).get('options') as FormArray;
    }

    getSubMenuItemOptionRows(si: number, ii: number, smi: number, smii: number) {
        return [...this.getSubMenuItemOptions(si, ii, smi, smii).controls];
    }

    addSubMenuItemOption(si: number, ii: number, smi: number, smii: number): void {
        this.getSubMenuItemOptions(si, ii, smi, smii).push(this.buildOptionGroup());
    }

    removeSubMenuItemOption(si: number, ii: number, smi: number, smii: number, oi: number): void {
        this.getSubMenuItemOptions(si, ii, smi, smii).removeAt(oi);
    }

    // ─── Generated file previews ─────────────────────────────────────────────────

    get generatedSpec(): string {
        return ConnectorCodeGenerator.generateConnectorSpec(this.buildWizardState());
    }

    get generatedIndexTs(): string {
        return ConnectorCodeGenerator.generateIndexTs(this.buildWizardState());
    }

    get generatedClientTs(): string {
        return ConnectorCodeGenerator.generateClientTs(this.buildWizardState());
    }

    get generatedPackageJson(): string {
        return ConnectorCodeGenerator.generatePackageJson(this.buildWizardState());
    }

    get generatedTsConfig(): string {
        return ConnectorCodeGenerator.generateTsConfig();
    }

    get generatedGitIgnore(): string {
        return ConnectorCodeGenerator.generateGitIgnore();
    }

    // ─── Download ────────────────────────────────────────────────────────────────

    async downloadProject(): Promise<void> {
        const state = this.buildWizardState();
        const zip = new JSZip();
        const folder = zip.folder(state.connectorName)!;

        folder.file('connector-spec.json', ConnectorCodeGenerator.generateConnectorSpec(state));
        folder.file('package.json', ConnectorCodeGenerator.generatePackageJson(state));
        folder.file('tsconfig.json', ConnectorCodeGenerator.generateTsConfig());
        folder.file('.gitignore', ConnectorCodeGenerator.generateGitIgnore());

        const src = folder.folder('src')!;
        src.file('index.ts', ConnectorCodeGenerator.generateIndexTs(state));
        src.file(`${state.connectorName}-client.ts`, ConnectorCodeGenerator.generateClientTs(state));

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${state.connectorName}.zip`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    // ─── State builder ───────────────────────────────────────────────────────────

    private buildWizardState(): WizardState {
        const s1 = this.step1.value;
        const s2 = this.step2.value;
        const s3 = this.step3.value;
        const s4 = this.step4.value;

        const authConfig: Record<string, string> = {};
        const authType = (s2.authType ?? 'apiKey') as AuthType;
        if (authType === 'apiKey')      authConfig['keyLabel'] = s2.keyLabel ?? 'API Key';
        if (authType === 'basicAuth')   { authConfig['usernameLabel'] = s2.usernameLabel ?? 'Username'; authConfig['passwordLabel'] = s2.passwordLabel ?? 'Password'; }
        if (authType === 'bearerToken') authConfig['tokenLabel'] = s2.tokenLabel ?? 'Bearer Token';

        const accountAttributes: AccountAttribute[] = this.accountAttributes.controls.map(c => ({
            name: c.get('name')?.value ?? '',
            type: c.get('type')?.value ?? 'string',
            description: c.get('description')?.value ?? '',
            multi: c.get('multi')?.value ?? false,
            entitlement: c.get('entitlement')?.value ?? false,
            managed: c.get('managed')?.value ?? false,
        }));

        const entitlementAttributes: AccountAttribute[] = this.entitlementAttributes.controls.map(c => ({
            name: c.get('name')?.value ?? '',
            type: c.get('type')?.value ?? 'string',
            description: c.get('description')?.value ?? '',
            multi: false,
            entitlement: false,
            managed: false,
        }));

        const accountCreateFields: AccountCreateField[] = this.accountCreateFields.controls.map(c => ({
            key: c.get('key')?.value ?? '',
            label: c.get('label')?.value ?? '',
            type: c.get('type')?.value ?? 'string',
            required: c.get('required')?.value ?? false,
            initialValueType: c.get('initialValueType')?.value ?? 'identityAttribute',
            initialValueRef: c.get('initialValueRef')?.value ?? '',
        }));

        const additionalConfig: ConfigSection[] = this.additionalSections.controls.map(section => ({
            sectionTitle: section.get('sectionTitle')?.value ?? '',
            sectionHelpMessage: section.get('sectionHelpMessage')?.value ?? '',
            items: (section.get('items') as FormArray).controls.map(item => {
                const type: ConfigItemType = item.get('type')?.value ?? 'text';
                const base: ConfigItem = {
                    key: item.get('key')?.value ?? '',
                    label: item.get('label')?.value ?? '',
                    type,
                    required: item.get('required')?.value ?? false,
                    parentKey:  item.get('parentKey')?.value  || undefined,
                    parentValue: item.get('parentValue')?.value || undefined,
                };

                if (type === 'list') {
                    base.helpKey = item.get('helpKey')?.value || undefined;
                }

                if (type === 'select' || type === 'radio') {
                    const opts = item.get('options') as FormArray;
                    base.options = opts.controls.map(o => ({
                        label: o.get('label')?.value ?? '',
                        value: o.get('value')?.value ?? '',
                    }));
                }

                if (type === 'keyValue') {
                    base.keyValueKey = {
                        key: 'key',
                        label: item.get('kvKeyLabel')?.value ?? 'Key',
                        required: item.get('kvKeyRequired')?.value ?? true,
                        maxlength: item.get('kvKeyMaxlength')?.value ?? '256',
                    };
                    base.keyValueValue = {
                        key: 'value',
                        label: item.get('kvValueLabel')?.value ?? 'Value',
                        required: item.get('kvValueRequired')?.value ?? true,
                        maxlength: item.get('kvValueMaxlength')?.value ?? '4096',
                    };
                }

                if (type === 'cardList') {
                    base.titleKey         = item.get('titleKey')?.value || undefined;
                    base.subtitleKey      = item.get('subtitleKey')?.value || undefined;
                    base.indexKey         = item.get('indexKey')?.value || undefined;
                    base.buttonLabel      = item.get('buttonLabel')?.value || undefined;
                    base.addButton        = item.get('addButton')?.value;
                    base.editButton       = item.get('editButton')?.value;
                    base.deleteButton     = item.get('deleteButton')?.value;
                    base.copyButton       = item.get('copyButton')?.value;
                    base.dragNDropEnabled = item.get('dragNDropEnabled')?.value;

                    base.subMenus = (item.get('subMenus') as FormArray).controls.map(sm => ({
                        label: sm.get('label')?.value ?? '',
                        items: (sm.get('items') as FormArray).controls.map(smi => {
                            const smiType: ConfigItemType = smi.get('type')?.value ?? 'text';
                            const smiItem: CardSubMenuItem = {
                                key:      smi.get('key')?.value ?? '',
                                label:    smi.get('label')?.value ?? '',
                                type:     smiType,
                                required: smi.get('required')?.value ?? false,
                                helpKey:  smi.get('helpKey')?.value ?? '',
                                options:  [],
                            };
                            if (smiType === 'select' || smiType === 'radio') {
                                const smiOpts = smi.get('options') as FormArray;
                                smiItem.options = smiOpts.controls.map(o => ({
                                    label: o.get('label')?.value ?? '',
                                    value: o.get('value')?.value ?? '',
                                }));
                            }
                            return smiItem;
                        }),
                    }));
                }

                return base;
            }),
        }));

        return {
            connectorName: s1.connectorName ?? '',
            displayName: s1.displayName ?? '',
            description: s1.description ?? '',
            keyType: (s1.keyType ?? 'simple') as 'simple' | 'compound',
            supportsStatefulCommands: s1.supportsStatefulCommands ?? false,
            authType,
            authConfig,
            commands: {
                testConnection: true,
                accountList: s3.accountList ?? false,
                accountRead: s3.accountRead ?? false,
                accountCreate: s3.accountCreate ?? false,
                accountUpdate: s3.accountUpdate ?? false,
                accountDelete: s3.accountDelete ?? false,
                accountEnable: s3.accountEnable ?? false,
                accountDisable: s3.accountDisable ?? false,
                accountUnlock: s3.accountUnlock ?? false,
                changePassword: s3.changePassword ?? false,
                entitlementList: s3.entitlementList ?? false,
                entitlementRead: s3.entitlementRead ?? false,
                sourceDataDiscover: s3.sourceDataDiscover ?? false,
                sourceDataRead: s3.sourceDataRead ?? false,
            },
            accountAttributes,
            displayAttribute: s4.displayAttribute ?? '',
            identityAttribute: s4.identityAttribute ?? '',
            groupAttribute: s4.groupAttribute ?? '',
            entitlementAttributes,
            entitlementDisplayAttribute: this.entitlementSchemaGroup.value.entitlementDisplayAttribute ?? 'name',
            entitlementIdentityAttribute: this.entitlementSchemaGroup.value.entitlementIdentityAttribute ?? 'id',
            accountCreateFields,
            additionalConfig,
        };
    }
}
