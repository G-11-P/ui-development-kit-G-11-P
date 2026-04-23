import {
    AccountAttribute,
    AuthType,
    ConfigItem,
    ConfigSection,
    WizardState,
} from './saas-connectivity-creator.models';
import {
    cmdAccountCreate,
    cmdAccountDelete,
    cmdAccountDisable,
    cmdAccountEnable,
    cmdAccountList,
    cmdAccountRead,
    cmdAccountUnlock,
    cmdAccountUpdate,
    cmdChangePassword,
    cmdEntitlementList,
    cmdEntitlementRead,
    cmdSourceDataDiscover,
    cmdSourceDataRead,
    cmdTestConnection,
} from './saas-connectivity-creator.command-templates';

export class ConnectorCodeGenerator {

    // ─── Connector Spec ──────────────────────────────────────────────────────────

    static generateConnectorSpec(state: WizardState): string {
        const commands = this.buildCommandsList(state);
        const sourceConfig = this.buildSourceConfig(state);
        const accountSchema = this.buildAccountSchema(state);

        const spec: Record<string, unknown> = {
            name: state.connectorName,
            keyType: state.keyType,
        };

        if (state.supportsStatefulCommands) {
            spec['supportsStatefulCommands'] = true;
        }

        spec['commands'] = commands;
        spec['sourceConfig'] = sourceConfig;
        spec['accountSchema'] = accountSchema;

        const hasEntitlements = state.commands.entitlementList || state.commands.entitlementRead;
        if (hasEntitlements && state.entitlementAttributes.length > 0) {
            spec['entitlementSchemas'] = this.buildEntitlementSchemas(state);
        }

        if (state.commands.accountCreate && state.accountCreateFields.length > 0) {
            spec['accountCreateTemplate'] = this.buildAccountCreateTemplate(state);
        }

        return JSON.stringify(spec, null, '\t');
    }

    private static buildCommandsList(state: WizardState): string[] {
        const commands: string[] = ['std:test-connection'];
        const { commands: c } = state;
        if (c.accountList)       commands.push('std:account:list');
        if (c.accountRead)       commands.push('std:account:read');
        if (c.accountCreate)     commands.push('std:account:create');
        if (c.accountUpdate)     commands.push('std:account:update');
        if (c.accountDelete)     commands.push('std:account:delete');
        if (c.accountEnable)     commands.push('std:account:enable');
        if (c.accountDisable)    commands.push('std:account:disable');
        if (c.accountUnlock)     commands.push('std:account:unlock');
        if (c.changePassword)    commands.push('std:change-password');
        if (c.entitlementList)   commands.push('std:entitlement:list');
        if (c.entitlementRead)   commands.push('std:entitlement:read');
        if (c.sourceDataDiscover) commands.push('std:source-data:discover');
        if (c.sourceDataRead)    commands.push('std:source-data:read');
        return commands;
    }

    private static buildSourceConfig(state: WizardState): unknown[] {
        const authItems = this.buildAuthItems(state.authType, state.authConfig);

        if (state.supportsStatefulCommands) {
            authItems.push({
                key: 'spConnEnableStatefulCommands',
                label: 'Enable Stateful Aggregation',
                required: true,
                type: 'checkbox',
            });
        }

        const sections: unknown[] = [
            {
                type: 'section',
                sectionTitle: 'Authentication',
                sectionHelpMessage: this.authHelpMessage(state.authType),
                items: authItems,
            },
        ];

        for (const section of state.additionalConfig) {
            sections.push({
                type: 'section',
                sectionTitle: section.sectionTitle,
                ...(section.sectionHelpMessage ? { sectionHelpMessage: section.sectionHelpMessage } : {}),
                items: section.items.map(item => this.buildConfigItem(item)),
            });
        }

        return [{ type: 'menu', label: 'Configuration', items: sections }];
    }

    private static buildAuthItems(authType: AuthType, authConfig: Record<string, string>): Record<string, unknown>[] {
        switch (authType) {
            case 'apiKey':
                return [
                    { key: 'apiKey', label: authConfig['keyLabel'] || 'API Key', required: true, type: 'secret' },
                ];
            case 'oauth2':
                return [
                    { key: 'clientId', label: 'Client ID', required: true, type: 'secret' },
                    { key: 'clientSecret', label: 'Client Secret', required: true, type: 'secret' },
                    { key: 'tokenUrl', label: 'Token URL', required: true, type: 'url' },
                    { key: 'scopes', label: 'Scopes', required: false, type: 'text' },
                ];
            case 'basicAuth':
                return [
                    { key: 'username', label: authConfig['usernameLabel'] || 'Username', required: true, type: 'text' },
                    { key: 'password', label: authConfig['passwordLabel'] || 'Password', required: true, type: 'secret' },
                ];
            case 'bearerToken':
                return [
                    { key: 'token', label: authConfig['tokenLabel'] || 'Bearer Token', required: true, type: 'secret' },
                ];
            case 'custom':
                return [];
        }
    }

    private static authHelpMessage(authType: AuthType): string {
        const messages: Record<AuthType, string> = {
            apiKey: 'Provide the API key used to authenticate with the source system.',
            oauth2: 'Provide OAuth 2.0 credentials to authenticate with the source system.',
            basicAuth: 'Provide the username and password to authenticate with the source system.',
            bearerToken: 'Provide the bearer token used to authenticate with the source system.',
            custom: 'Provide the credentials required to connect to the source system.',
        };
        return messages[authType];
    }

    private static buildConfigItem(item: ConfigItem): Record<string, unknown> {
        const out: Record<string, unknown> = {
            key: item.key,
            label: item.label,
            required: item.required,
            type: item.type,
        };

        // Conditional display — valid on any type
        if (item.parentKey) {
            out['parentKey'] = item.parentKey;
            out['parentValue'] = item.parentValue ?? '';
        }

        switch (item.type) {
            // ── select / radio ────────────────────────────────────────────────
            case 'select':
            case 'radio':
                out['options'] = (item.options ?? []).map(o => ({
                    label: o.label,
                    value: o.value,
                }));
                break;

            // ── list ──────────────────────────────────────────────────────────
            case 'list':
                if (item.helpKey) out['helpKey'] = item.helpKey;
                break;

            // ── keyValue ──────────────────────────────────────────────────────
            // Required shape:
            //   keyValueKey:   { key, label, type: 'text', required, maxlength }
            //   keyValueValue: { key, label, type: 'text', required, maxlength }
            case 'keyValue':
                out['keyValueKey'] = {
                    key: 'key',
                    label: item.keyValueKey?.label ?? 'Key',
                    type: 'text',
                    required: item.keyValueKey?.required ?? true,
                    maxlength: item.keyValueKey?.maxlength ?? '256',
                };
                out['keyValueValue'] = {
                    key: 'value',
                    label: item.keyValueValue?.label ?? 'Value',
                    type: 'text',
                    required: item.keyValueValue?.required ?? true,
                    maxlength: item.keyValueValue?.maxlength ?? '4096',
                };
                break;

            // ── cardList ──────────────────────────────────────────────────────
            // Required shape:
            //   titleKey, subtitleKey, subMenus[{ label, items[...] }]
            // Optional: indexKey, buttonLabel, addButton, editButton,
            //           deleteButton, copyButton, dragNDropEnabled
            case 'cardList':
                if (item.titleKey)    out['titleKey']    = item.titleKey;
                if (item.subtitleKey) out['subtitleKey'] = item.subtitleKey;
                if (item.indexKey)    out['indexKey']    = item.indexKey;
                if (item.buttonLabel) out['buttonLabel'] = item.buttonLabel;
                if (item.addButton    !== undefined) out['addButton']    = item.addButton;
                if (item.editButton   !== undefined) out['editButton']   = item.editButton;
                if (item.deleteButton !== undefined) out['deleteButton'] = item.deleteButton;
                if (item.copyButton   !== undefined) out['copyButton']   = item.copyButton;
                if (item.dragNDropEnabled !== undefined) out['dragNDropEnabled'] = item.dragNDropEnabled;

                out['subMenus'] = (item.subMenus ?? []).map(sm => ({
                    label: sm.label,
                    items: sm.items.map(smi => {
                        const smiOut: Record<string, unknown> = {
                            key: smi.key,
                            label: smi.label,
                            type: smi.type,
                            required: smi.required,
                        };
                        if (smi.helpKey) smiOut['helpKey'] = smi.helpKey;
                        if ((smi.type === 'select' || smi.type === 'radio') && smi.options.length) {
                            smiOut['options'] = smi.options.map(o => ({ label: o.label, value: o.value }));
                        }
                        return smiOut;
                    }),
                }));
                break;

            // ── simple types: text, secret, url, number, textarea,
            //                  secrettextarea, checkbox, toggle
            default:
                break;
        }

        return out;
    }

    private static buildAccountSchema(state: WizardState): unknown {
        return {
            displayAttribute: state.displayAttribute,
            identityAttribute: state.identityAttribute,
            groupAttribute: state.groupAttribute || undefined,
            attributes: state.accountAttributes.map(attr => {
                const a: Record<string, unknown> = {
                    name: attr.name,
                    type: attr.type,
                    description: attr.description,
                };
                if (attr.multi)        a['multi'] = true;
                if (attr.entitlement)  a['entitlement'] = true;
                if (attr.managed)      a['managed'] = true;
                return a;
            }),
        };
    }

    private static buildEntitlementSchemas(state: WizardState): unknown[] {
        return [
            {
                type: 'group',
                displayAttribute: state.entitlementDisplayAttribute,
                identityAttribute: state.entitlementIdentityAttribute,
                attributes: state.entitlementAttributes.map(attr => ({
                    name: attr.name,
                    type: attr.type,
                    description: attr.description,
                })),
            },
        ];
    }

    private static buildAccountCreateTemplate(state: WizardState): unknown {
        return {
            fields: state.accountCreateFields.map(field => {
                const f: Record<string, unknown> = {
                    key: field.key,
                    label: field.label,
                    type: field.type,
                    required: field.required,
                };
                if (field.initialValueType === 'identityAttribute') {
                    f['initialValue'] = { type: 'identityAttribute', attributes: { name: field.initialValueRef } };
                } else if (field.initialValueType === 'generator') {
                    f['initialValue'] = { type: 'generator', attributes: { name: field.initialValueRef } };
                } else if (field.initialValueType === 'static') {
                    f['initialValue'] = { type: 'static', attributes: { value: field.initialValueRef } };
                }
                return f;
            }),
        };
    }

    // ─── index.ts ────────────────────────────────────────────────────────────────

    static generateIndexTs(state: WizardState): string {
        const className = this.toClassName(state.connectorName);
        const clientFile = `./${state.connectorName}-client`;
        const imports = this.buildSdkImports(state);
        const handlers = this.buildHandlers(state);

        return `import {
${imports.map(i => `    ${i},`).join('\n')}
} from '@sailpoint/connector-sdk'
import { ${className}Client } from '${clientFile}'

// Connector must be exported as module property named connector
export const connector = async () => {

    // Get connector source config
    const config = await readConfig()

    // Use the vendor SDK, or implement own client as necessary, to initialize a client
    const myClient = new ${className}Client(config)

    return createConnector()
${handlers.map(h => `        ${h}`).join('\n')}
}
`;
    }

    private static buildSdkImports(state: WizardState): string[] {
        // logger and StdTestConnectionInput are always included
        const imports = [
            'Context',
            'createConnector',
            'logger',
            'readConfig',
            'Response',
            'StdTestConnectionInput',
            'StdTestConnectionOutput',
        ];
        const { commands: c } = state;

        if (c.accountList)        imports.push('StdAccountListInput', 'StdAccountListOutput');
        if (c.accountRead)        imports.push('StdAccountReadInput', 'StdAccountReadOutput');
        if (c.accountCreate)      imports.push('StdAccountCreateInput', 'StdAccountCreateOutput');
        if (c.accountUpdate)      imports.push('StdAccountUpdateInput', 'StdAccountUpdateOutput');
        if (c.accountDelete)      imports.push('StdAccountDeleteInput', 'StdAccountDeleteOutput');
        if (c.accountEnable)      imports.push('StdAccountEnableInput', 'StdAccountEnableOutput');
        if (c.accountDisable)     imports.push('StdAccountDisableInput', 'StdAccountDisableOutput');
        if (c.accountUnlock)      imports.push('StdAccountUnlockInput', 'StdAccountUnlockOutput');
        if (c.changePassword)     imports.push('StdChangePasswordInput', 'StdChangePasswordOutput');
        if (c.entitlementList)    imports.push('StdEntitlementListInput', 'StdEntitlementListOutput');
        if (c.entitlementRead)    imports.push('StdEntitlementReadInput', 'StdEntitlementReadOutput');
        if (c.sourceDataDiscover) imports.push('StdSourceDataDiscoverInput', 'StdSourceDataDiscoverOutput');
        if (c.sourceDataRead)     imports.push('StdSourceDataReadInput', 'StdSourceDataReadOutput');

        return imports.sort();
    }

    private static buildHandlers(state: WizardState): string[] {
        const { commands: c } = state;
        const idAttr = state.identityAttribute || 'id';
        const entIdAttr = state.entitlementIdentityAttribute || 'id';
        const handlers: string[] = [];

        handlers.push(`.stdTestConnection(async (context: Context, input: StdTestConnectionInput, res: Response<StdTestConnectionOutput>) => {
            logger.info('Running test connection')
            res.send(await myClient.testConnection())
        })`);

        if (c.accountList) {
            handlers.push(`.stdAccountList(async (context: Context, input: StdAccountListInput, res: Response<StdAccountListOutput>) => {
            const accounts = await myClient.getAccounts()
            for (const account of accounts) {
                res.send({
                    identity: account.${idAttr},
                    uuid: account.${idAttr},
                    attributes: account as any,
                })
            }
            logger.info(\`stdAccountList sent \${accounts.length} accounts\`)
        })`);
        }

        if (c.accountRead) {
            handlers.push(`.stdAccountRead(async (context: Context, input: StdAccountReadInput, res: Response<StdAccountReadOutput>) => {
            const account = await myClient.getAccount(input.identity)
            res.send({
                identity: account.${idAttr},
                uuid: account.${idAttr},
                attributes: account as any,
            })
            logger.info(\`stdAccountRead read account: \${input.identity}\`)
        })`);
        }

        if (c.accountCreate) {
            handlers.push(`.stdAccountCreate(async (context: Context, input: StdAccountCreateInput, res: Response<StdAccountCreateOutput>) => {
            const account = await myClient.createAccount(input)
            res.send({
                identity: account.${idAttr},
                uuid: account.${idAttr},
                attributes: account as any,
            })
        })`);
        }

        if (c.accountUpdate) {
            handlers.push(`.stdAccountUpdate(async (context: Context, input: StdAccountUpdateInput, res: Response<StdAccountUpdateOutput>) => {
            await myClient.updateAccount(input.identity, input.changes)
            res.send({})
        })`);
        }

        if (c.accountDelete) {
            handlers.push(`.stdAccountDelete(async (context: Context, input: StdAccountDeleteInput, res: Response<StdAccountDeleteOutput>) => {
            await myClient.deleteAccount(input.identity)
            res.send({})
        })`);
        }

        if (c.accountEnable) {
            handlers.push(`.stdAccountEnable(async (context: Context, input: StdAccountEnableInput, res: Response<StdAccountEnableOutput>) => {
            const account = await myClient.enableAccount(input.identity)
            res.send({
                identity: account.${idAttr},
                uuid: account.${idAttr},
                attributes: account as any,
            })
        })`);
        }

        if (c.accountDisable) {
            handlers.push(`.stdAccountDisable(async (context: Context, input: StdAccountDisableInput, res: Response<StdAccountDisableOutput>) => {
            const account = await myClient.disableAccount(input.identity)
            res.send({
                identity: account.${idAttr},
                uuid: account.${idAttr},
                attributes: account as any,
            })
        })`);
        }

        if (c.accountUnlock) {
            handlers.push(`.stdAccountUnlock(async (context: Context, input: StdAccountUnlockInput, res: Response<StdAccountUnlockOutput>) => {
            const account = await myClient.unlockAccount(input.identity)
            res.send({
                identity: account.${idAttr},
                uuid: account.${idAttr},
                attributes: account as any,
            })
        })`);
        }

        if (c.changePassword) {
            handlers.push(`.stdChangePassword(async (context: Context, input: StdChangePasswordInput, res: Response<StdChangePasswordOutput>) => {
            await myClient.changePassword(input.identity, input.password)
            res.send({})
        })`);
        }

        if (c.entitlementList) {
            handlers.push(`.stdEntitlementList(async (context: Context, input: StdEntitlementListInput, res: Response<StdEntitlementListOutput>) => {
            const groups = await myClient.getEntitlements()
            for (const group of groups) {
                res.send({
                    type: 'group',
                    identity: group.${entIdAttr},
                    attributes: group as any,
                })
            }
        })`);
        }

        if (c.entitlementRead) {
            handlers.push(`.stdEntitlementRead(async (context: Context, input: StdEntitlementReadInput, res: Response<StdEntitlementReadOutput>) => {
            const group = await myClient.getEntitlement(input.identity)
            res.send({
                type: 'group',
                identity: group.${entIdAttr},
                attributes: group as any,
            })
        })`);
        }

        if (c.sourceDataDiscover) {
            handlers.push(`.stdSourceDataDiscover(async (context: Context, input: StdSourceDataDiscoverInput, res: Response<StdSourceDataDiscoverOutput>) => {
            const data = await myClient.discoverSourceData()
            res.send(data as any)
        })`);
        }

        if (c.sourceDataRead) {
            handlers.push(`.stdSourceDataRead(async (context: Context, input: StdSourceDataReadInput, res: Response<StdSourceDataReadOutput>) => {
            const data = await myClient.readSourceData(input.sourceDataKey)
            res.send(data as any)
        })`);
        }

        return handlers;
    }

    // ─── Client ──────────────────────────────────────────────────────────────────

    static generateClientTs(state: WizardState): string {
        const className = this.toClassName(state.connectorName);
        const accountType = this.buildAccountInterface(state.accountAttributes);
        const entitlementType = this.buildEntitlementInterface(state.entitlementAttributes);
        const dummyAccount = this.buildDummyAccount(state.accountAttributes);
        const dummyEntitlement = this.buildDummyEntitlement(state.entitlementAttributes);
        const authSetup = this.buildClientAuthSetup(state);
        const methods = this.buildClientMethods(state, dummyAccount, dummyEntitlement);

        const hasEntitlements = state.commands.entitlementList || state.commands.entitlementRead;

        return `import { ConnectorError } from '@sailpoint/connector-sdk'

${accountType}

${hasEntitlements ? entitlementType + '\n\n' : ''}export class ${className}Client {
${authSetup}

${methods.join('\n\n')}
}
`;
    }

    private static buildAccountInterface(attrs: AccountAttribute[]): string {
        const fields = attrs.map(a => `    ${a.name}: ${a.type === 'boolean' ? 'boolean' : a.type === 'long' || a.type === 'int' ? 'number' : 'string'}${a.multi ? '[]' : ''};`);
        return `export interface Account {\n${fields.join('\n')}\n}`;
    }

    private static buildEntitlementInterface(attrs: AccountAttribute[]): string {
        if (attrs.length === 0) return '';
        const fields = attrs.map(a => `    ${a.name}: string;`);
        return `export interface Entitlement {\n${fields.join('\n')}\n}`;
    }

    private static buildDummyAccount(attrs: AccountAttribute[]): string {
        const fields = attrs.map(attr => {
            let value: string;
            if (attr.type === 'boolean') value = 'true';
            else if (attr.type === 'int' || attr.type === 'long') value = '0';
            else if (attr.name === 'id') value = "'user-001'";
            else if (attr.name === 'email') value = "'user@example.com'";
            else if (attr.name.toLowerCase().includes('name')) value = `'Sample ${this.toTitleCase(attr.name)}'`;
            else value = `'sample-${attr.name}'`;
            return `            ${attr.name}: ${value}${attr.multi ? ' as any[]' : ''}`;
        });
        return `{\n${fields.join(',\n')}\n        }`;
    }

    private static buildDummyEntitlement(attrs: AccountAttribute[]): string {
        if (attrs.length === 0) return '{}';
        const fields = attrs.map(attr => {
            const value = attr.name === 'id' ? "'group-001'" : `'Sample ${this.toTitleCase(attr.name)}'`;
            return `            ${attr.name}: ${value}`;
        });
        return `{\n${fields.join(',\n')}\n        }`;
    }

    private static buildClientAuthSetup(state: WizardState): string {
        switch (state.authType) {
            case 'apiKey':
                return `    private readonly apiKey: string

    constructor(config: any) {
        this.apiKey = config?.apiKey
        if (this.apiKey == null) {
            throw new ConnectorError('apiKey must be provided from config')
        }
    }`;
            case 'oauth2':
                return `    private readonly clientId: string
    private readonly clientSecret: string
    private readonly tokenUrl: string
    private accessToken: string | null = null

    constructor(config: any) {
        this.clientId = config?.clientId
        this.clientSecret = config?.clientSecret
        this.tokenUrl = config?.tokenUrl
        if (this.clientId == null || this.clientSecret == null) {
            throw new ConnectorError('clientId and clientSecret must be provided from config')
        }
    }

    private async getAccessToken(): Promise<string> {
        if (this.accessToken) return this.accessToken
        // TODO: implement OAuth 2.0 token exchange
        throw new ConnectorError('OAuth 2.0 token exchange not yet implemented')
    }`;
            case 'basicAuth':
                return `    private readonly username: string
    private readonly password: string

    constructor(config: any) {
        this.username = config?.username
        this.password = config?.password
        if (this.username == null || this.password == null) {
            throw new ConnectorError('username and password must be provided from config')
        }
    }`;
            case 'bearerToken':
                return `    private readonly token: string

    constructor(config: any) {
        this.token = config?.token
        if (this.token == null) {
            throw new ConnectorError('token must be provided from config')
        }
    }`;
            case 'custom':
                return `    constructor(config: any) {}`;
        }
    }

    private static buildClientMethods(state: WizardState, dummyAccount: string, dummyEntitlement: string): string[] {
        const { commands: c } = state;
        const methods: string[] = [];

        methods.push(`    async testConnection(): Promise<Record<string, unknown>> {
        // TODO: make a lightweight API call to verify credentials
        // throw new ConnectorError('Connection failed') if credentials are invalid
        return {}
    }`);

        if (c.accountList) {
            methods.push(`    async getAccounts(): Promise<Account[]> {
        // TODO: replace stub data with real API call
        return [
        ${dummyAccount}
        ];
    }`);
        }

        if (c.accountRead) {
            methods.push(`    async getAccount(key: string): Promise<Account> {
        // TODO: fetch a single account by key from the API
        return ${dummyAccount};
    }`);
        }

        if (c.accountCreate) {
            methods.push(`    async createAccount(input: Record<string, unknown>): Promise<Account> {
        // TODO: create the account via the API using input attributes
        return ${dummyAccount};
    }`);
        }

        if (c.accountUpdate) {
            methods.push(`    async updateAccount(key: string, changes: unknown[]): Promise<void> {
        // TODO: apply the attribute changes to the account via the API
    }`);
        }

        if (c.accountDelete) {
            methods.push(`    async deleteAccount(key: string): Promise<void> {
        // TODO: delete the account via the API
    }`);
        }

        if (c.accountEnable) {
            methods.push(`    async enableAccount(key: string): Promise<Account> {
        // TODO: enable the account via the API
        return ${dummyAccount};
    }`);
        }

        if (c.accountDisable) {
            methods.push(`    async disableAccount(key: string): Promise<Account> {
        // TODO: disable the account via the API
        return ${dummyAccount};
    }`);
        }

        if (c.accountUnlock) {
            methods.push(`    async unlockAccount(key: string): Promise<Account> {
        // TODO: unlock the account via the API
        return ${dummyAccount};
    }`);
        }

        if (c.changePassword) {
            methods.push(`    async changePassword(key: string, password: string): Promise<void> {
        // TODO: update the account password via the API
    }`);
        }

        if (c.entitlementList) {
            methods.push(`    async getEntitlements(): Promise<Entitlement[]> {
        // TODO: replace stub data with real API call
        return [
        ${dummyEntitlement}
        ];
    }`);
        }

        if (c.entitlementRead) {
            methods.push(`    async getEntitlement(key: string): Promise<Entitlement> {
        // TODO: fetch a single entitlement by key from the API
        return ${dummyEntitlement};
    }`);
        }

        if (c.sourceDataDiscover) {
            methods.push(`    async discoverSourceData(): Promise<unknown[]> {
        // TODO: return available source data keys
        return [];
    }`);
        }

        if (c.sourceDataRead) {
            methods.push(`    async readSourceData(key: string): Promise<unknown[]> {
        // TODO: return data for the given source data key
        return [];
    }`);
        }

        return methods;
    }

    // ─── package.json ────────────────────────────────────────────────────────────

    static generatePackageJson(state: WizardState): string {
        const pkg = {
            name: state.connectorName,
            version: '0.1.0',
            main: 'dist/index.js',
            scripts: {
                clean: 'shx rm -rf ./dist',
                prebuild: 'npm run clean',
                build: 'npx ncc build ./src/index.ts -o ./dist -m -C',
                dev: 'cross-env NODE_OPTIONS=--enable-source-maps spcx run dist/index.js',
                debug: 'spcx run dist/index.js',
                prettier: 'npx prettier --write .',
                test: 'jest --coverage',
                'prepack-zip': 'npm ci && npm run build',
                'pack-zip': 'spcx package',
            },
            private: true,
            dependencies: {
                '@sailpoint/connector-sdk': '^1.2.1',
            },
            devDependencies: {
                '@types/jest': '^27.0.1',
                '@vercel/ncc': '^0.38.1',
                'cross-env': '7.0.3',
                jest: '^27.0.6',
                prettier: '^2.3.2',
                shx: '^0.3.3',
                'ts-jest': '^27.0.5',
                typescript: '^4.9.5',
            },
            jest: {
                preset: 'ts-jest',
                testEnvironment: 'node',
                clearMocks: true,
                collectCoverage: true,
                coverageThreshold: {
                    global: {
                        statements: 60,
                        branches: 50,
                        functions: 40,
                        lines: 60,
                    },
                },
            },
            prettier: {
                printWidth: 120,
                trailingComma: 'es5',
                tabWidth: 4,
                semi: false,
                singleQuote: true,
            },
        };
        return JSON.stringify(pkg, null, 2);
    }

    // ─── tsconfig.json ───────────────────────────────────────────────────────────

    static generateTsConfig(): string {
        const config = {
            compilerOptions: {
                target: 'ES2020',
                module: 'commonjs',
                outDir: 'dist',
                rootDir: 'src',
                strict: true,
                moduleResolution: 'node',
                esModuleInterop: true,
                skipLibCheck: true,
                sourceMap: true,
                forceConsistentCasingInFileNames: true,
            },
            include: ['src/**/*'],
            exclude: ['node_modules', '**/*.spec.ts', '**/*.spec.js'],
        };
        return JSON.stringify(config, null, 2);
    }

    // ─── .gitignore ──────────────────────────────────────────────────────────────

    static generateGitIgnore(): string {
        return `# macOS General
.DS_Store
.AppleDouble
.LSOverride

# Visual Studio Code
.vscode/
.history/

# Intellij
.idea/
*.iml

# Dependency directories
node_modules/

# Compiled source
dist/
coverage/
`;
    }

    // ─── index.spec.ts ───────────────────────────────────────────────────────────

    static generateIndexSpec(state: WizardState): string {
        const authKey = this.getAuthConfigKey(state);
        return `import { connector } from './index'
import { Connector, RawResponse, ResponseType, StandardCommand, AssumeAwsRoleRequest, AssumeAwsRoleResponse } from '@sailpoint/connector-sdk'
import { PassThrough } from 'stream'

const mockConfig: any = {
    ${authKey}: 'xxx123'
}
process.env.CONNECTOR_CONFIG = Buffer.from(JSON.stringify(mockConfig)).toString('base64')

describe('connector unit tests', () => {

    it('connector SDK major version should be the same as Connector.SDK_VERSION', async () => {
        expect((await connector()).sdkVersion).toStrictEqual(Connector.SDK_VERSION)
    })

    it('should execute stdTestConnectionHandler', async () => {
        await (await connector())._exec(
            StandardCommand.StdTestConnection,
            {reloadConfig() {
                return Promise.resolve()
            },
            assumeAwsRole(assumeAwsRoleRequest: AssumeAwsRoleRequest): Promise<AssumeAwsRoleResponse> {
                return Promise.resolve(new AssumeAwsRoleResponse('accessKeyId', 'secretAccessKey', 'sessionToken', '123'))
            }
        },
            undefined,
            new PassThrough({ objectMode: true }).on('data', (chunk) => expect(chunk).toStrictEqual(new RawResponse({}, ResponseType.Output)))
        )
    })
})
`;
    }

    // ─── my-client.spec.ts ───────────────────────────────────────────────────────

    static generateClientSpec(state: WizardState): string {
        const className = this.toClassName(state.connectorName);
        const authKey = this.getAuthConfigKey(state);
        return `import { ConnectorError } from '@sailpoint/connector-sdk'
import { ${className}Client } from './${state.connectorName}-client'

const mockConfig: any = {
    ${authKey}: 'xxx123'
}

describe('connector client unit tests', () => {

    const myClient = new ${className}Client(mockConfig)

    it('connector client test connection', async () => {
        expect(await myClient.testConnection()).toStrictEqual({})
    })

    it('invalid connector client', async () => {
        try {
            new ${className}Client({})
        } catch (e) {
            expect(e instanceof ConnectorError).toBeTruthy()
        }
    })
})
`;
    }

    private static getAuthConfigKey(state: WizardState): string {
        switch (state.authType) {
            case 'apiKey':      return 'apiKey';
            case 'oauth2':      return 'clientId';
            case 'basicAuth':   return 'username';
            case 'bearerToken': return 'token';
            case 'custom':      return 'token';
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    private static toClassName(connectorName: string): string {
        return connectorName
            .split(/[-_\s]+/)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');
    }

    private static toTitleCase(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1).replace(/([A-Z])/g, ' $1');
    }

    // ─── Claude Code commands ────────────────────────────────────────────────────

    static generateClaudeCommands(state: WizardState): Record<string, string> {
        const cn = state.connectorName;
        const cls = this.toClassName(cn);
        return {
            'implement-test-connection.md':      cmdTestConnection(cn, cls),
            'implement-account-list.md':         cmdAccountList(cn, cls),
            'implement-account-read.md':         cmdAccountRead(cn, cls),
            'implement-account-create.md':       cmdAccountCreate(cn, cls),
            'implement-account-update.md':       cmdAccountUpdate(cn, cls),
            'implement-account-delete.md':       cmdAccountDelete(cn, cls),
            'implement-account-enable.md':       cmdAccountEnable(cn, cls),
            'implement-account-disable.md':      cmdAccountDisable(cn, cls),
            'implement-account-unlock.md':       cmdAccountUnlock(cn, cls),
            'implement-change-password.md':      cmdChangePassword(cn, cls),
            'implement-entitlement-list.md':     cmdEntitlementList(cn, cls),
            'implement-entitlement-read.md':     cmdEntitlementRead(cn, cls),
            'implement-source-data-discover.md': cmdSourceDataDiscover(cn, cls),
            'implement-source-data-read.md':     cmdSourceDataRead(cn, cls),
        };
    }

    // ─── Cursor rules ─────────────────────────────────────────────────────────────

    static generateCursorRules(state: WizardState): Record<string, string> {
        const commands = this.generateClaudeCommands(state);
        const descriptions: Record<string, string> = {
            'implement-test-connection':      'Implement std:test-connection — replace the testConnection() stub with a real API call',
            'implement-account-list':         'Implement std:account:list — replace the getAccounts() stub with a paginated API call',
            'implement-account-read':         'Implement std:account:read — replace the getAccount() stub with a real API call',
            'implement-account-create':       'Implement std:account:create — replace the createAccount() stub with a real API call',
            'implement-account-update':       'Implement std:account:update — replace the updateAccount() stub with real API calls',
            'implement-account-delete':       'Implement std:account:delete — replace the deleteAccount() stub with a real API call',
            'implement-account-enable':       'Implement std:account:enable — replace the enableAccount() stub with a real API call',
            'implement-account-disable':      'Implement std:account:disable — replace the disableAccount() stub with a real API call',
            'implement-account-unlock':       'Implement std:account:unlock — replace the unlockAccount() stub with a real API call',
            'implement-change-password':      'Implement std:change-password — replace the changePassword() stub with a real API call',
            'implement-entitlement-list':     'Implement std:entitlement:list — replace the getEntitlements() stub with a paginated API call',
            'implement-entitlement-read':     'Implement std:entitlement:read — replace the getEntitlement() stub with a real API call',
            'implement-source-data-discover': 'Implement std:source-data:discover — replace the discoverSourceData() stub',
            'implement-source-data-read':     'Implement std:source-data:read — replace the readSourceData() stub',
        };

        const result: Record<string, string> = {};
        for (const [mdFile, content] of Object.entries(commands)) {
            const key = mdFile.replace(/\.md$/, '');
            const desc = descriptions[key] ?? key;
            const mdcContent = `---\ndescription: ${desc}\nglobs: \nalwaysApply: false\n---\n\n${content}`;
            result[`${key}.mdc`] = mdcContent;
        }
        return result;
    }

    // ─── Section helpers for additional config preview ───────────────────────────

    static buildAdditionalConfigPreview(sections: ConfigSection[]): string {
        if (sections.length === 0) return '(none)';
        return sections.map(s =>
            `[${s.sectionTitle}]\n` +
            s.items.map(i => `  ${i.key} (${i.type})${i.required ? ' *required' : ''}`).join('\n')
        ).join('\n\n');
    }
}
