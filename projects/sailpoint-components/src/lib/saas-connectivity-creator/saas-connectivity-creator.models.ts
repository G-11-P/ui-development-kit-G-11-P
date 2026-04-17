export type AuthType = 'apiKey' | 'oauth2' | 'basicAuth' | 'bearerToken' | 'custom';
export type KeyType = 'simple' | 'compound';
export type AttributeType = 'string' | 'boolean' | 'long' | 'int';
export type ConfigItemType =
    | 'text'
    | 'secret'
    | 'url'
    | 'number'
    | 'textarea'
    | 'secrettextarea'
    | 'select'
    | 'checkbox'
    | 'toggle'
    | 'radio'
    | 'list'
    | 'keyValue'
    | 'cardList';

export type InitialValueType = 'identityAttribute' | 'generator' | 'static';

export interface AccountAttribute {
    name: string;
    type: AttributeType;
    description: string;
    multi: boolean;
    entitlement: boolean;
    managed: boolean;
}

export interface ConfigOption {
    label: string;
    value: string;
}

// Sub-field definition used inside keyValue items
export interface KeyValueField {
    key: string;      // always 'key' or 'value' — fixed by convention
    label: string;
    required: boolean;
    maxlength: string;
}

// An item inside a cardList subMenu — supports nested options for radio/select
export interface CardSubMenuItem {
    key: string;
    label: string;
    type: ConfigItemType;
    required: boolean;
    helpKey: string;
    options: ConfigOption[];
}

export interface CardSubMenu {
    label: string;
    items: CardSubMenuItem[];
}

export interface ConfigItem {
    // ── shared fields ─────────────────────────────────────────────────────────
    key: string;
    label: string;
    type: ConfigItemType;
    required: boolean;
    parentKey?: string;
    parentValue?: string;

    // ── list ──────────────────────────────────────────────────────────────────
    helpKey?: string;

    // ── select / radio ────────────────────────────────────────────────────────
    options?: ConfigOption[];

    // ── keyValue ──────────────────────────────────────────────────────────────
    keyValueKey?: KeyValueField;
    keyValueValue?: KeyValueField;

    // ── cardList ──────────────────────────────────────────────────────────────
    titleKey?: string;
    subtitleKey?: string;
    indexKey?: string;
    buttonLabel?: string;
    addButton?: boolean;
    editButton?: boolean;
    deleteButton?: boolean;
    copyButton?: boolean;
    dragNDropEnabled?: boolean;
    subMenus?: CardSubMenu[];
}

export interface ConfigSection {
    sectionTitle: string;
    sectionHelpMessage?: string;
    items: ConfigItem[];
}

export interface CommandSelection {
    testConnection: boolean;
    accountList: boolean;
    accountRead: boolean;
    accountCreate: boolean;
    accountUpdate: boolean;
    accountDelete: boolean;
    accountEnable: boolean;
    accountDisable: boolean;
    accountUnlock: boolean;
    changePassword: boolean;
    entitlementList: boolean;
    entitlementRead: boolean;
    sourceDataDiscover: boolean;
    sourceDataRead: boolean;
}

export interface AccountCreateField {
    key: string;
    label: string;
    type: AttributeType;
    required: boolean;
    initialValueType: InitialValueType;
    initialValueRef: string;
}

export interface WizardState {
    // Step 1 — Basic Info
    connectorName: string;
    displayName: string;
    description: string;
    keyType: KeyType;
    supportsStatefulCommands: boolean;

    // Step 2 — Authentication
    authType: AuthType;
    authConfig: Record<string, string>;

    // Step 3 — Operations
    commands: CommandSelection;

    // Step 4 — Account Schema
    accountAttributes: AccountAttribute[];
    displayAttribute: string;
    identityAttribute: string;
    groupAttribute: string;
    entitlementAttributes: AccountAttribute[];
    entitlementDisplayAttribute: string;
    entitlementIdentityAttribute: string;
    accountCreateFields: AccountCreateField[];

    // Step 5 — Additional Config
    additionalConfig: ConfigSection[];
}

export const GENERATOR_OPTIONS: { value: string; label: string }[] = [
    { value: 'Create Password', label: 'Create Password' },
    { value: 'Create Unique Account ID', label: 'Create Unique Account ID' },
];

// Types that require an options array in the spec
export const OPTION_TYPES: ConfigItemType[] = ['select', 'radio'];

// Types that have no extra spec fields beyond key/label/type/required/parentKey/parentValue
export const SIMPLE_TYPES: ConfigItemType[] = [
    'text', 'secret', 'url', 'number', 'textarea', 'secrettextarea', 'checkbox', 'toggle',
];

export const DEFAULT_ACCOUNT_ATTRIBUTES: AccountAttribute[] = [
    { name: 'id', type: 'string', description: 'Unique identifier for the account', multi: false, entitlement: false, managed: false },
    { name: 'displayName', type: 'string', description: 'Display name of the account', multi: false, entitlement: false, managed: false },
    { name: 'email', type: 'string', description: 'Email address of the account', multi: false, entitlement: false, managed: false },
    { name: 'firstName', type: 'string', description: 'First name', multi: false, entitlement: false, managed: false },
    { name: 'lastName', type: 'string', description: 'Last name', multi: false, entitlement: false, managed: false },
    { name: 'enabled', type: 'boolean', description: 'Whether the account is enabled', multi: false, entitlement: false, managed: false },
];

export const DEFAULT_ENTITLEMENT_ATTRIBUTES: AccountAttribute[] = [
    { name: 'id', type: 'string', description: 'Unique identifier for the group', multi: false, entitlement: false, managed: false },
    { name: 'name', type: 'string', description: 'Display name of the group', multi: false, entitlement: false, managed: false },
];
