import { App, ButtonComponent, Modal, PluginSettingTab, Setting, SettingGroup, TextAreaComponent, TextComponent, TFolder, normalizePath } from "obsidian";
import InstapaperPlugin from "./main";
import type { InstapaperAccessToken, InstapaperAccount } from "./api";

export interface FrontmatterField {
    enabled: boolean;
    propertyName: string;
}

export interface FrontmatterValueField extends FrontmatterField {
    value: string;
}

export interface FrontmatterSettings {
    url: FrontmatterField;
    title: FrontmatterField;
    date: FrontmatterField;
    pubdate: FrontmatterField;
    author: FrontmatterField;
    tags: FrontmatterField;
    source: FrontmatterValueField;
}

// The highlight template used before template customization was introduced.
// Used for settings migration only — do not change.
export const LEGACY_HIGHLIGHT_TEMPLATE = `> {{text}} [↗]({{link}}) {{blockId}}
{{#note}}

{{note}}
{{/note}}`;

const DEFAULT_HIGHLIGHT_TEMPLATE = `> {{text}} {{blockId}}
{{#note}}

{{note}}
{{/note}}`;

export interface InstapaperPluginSettings {
    token?: InstapaperAccessToken;
    account?: InstapaperAccount;
    syncFrequency: number;
    syncOnStart: boolean;
    notesFolder: string;
    notesCursor: number;
    frontmatter: FrontmatterSettings;
    highlightTemplate: string;
    appliedHighlightTemplate: string;
}

export const DEFAULT_SETTINGS = {
    syncFrequency: 0,
    syncOnStart: true,
    notesFolder: 'Instapaper Notes',
    notesCursor: 0,
    frontmatter: {
        url: { enabled: true, propertyName: 'url' },
        title: { enabled: false, propertyName: 'title' },
        date: { enabled: true, propertyName: 'date' },
        pubdate: { enabled: true, propertyName: 'pubdate' },
        author: { enabled: true, propertyName: 'author' },
        tags: { enabled: true, propertyName: 'tags' },
        source: { enabled: false, propertyName: 'source', value: 'instapaper' },
    },
    highlightTemplate: DEFAULT_HIGHLIGHT_TEMPLATE,
    appliedHighlightTemplate: DEFAULT_HIGHLIGHT_TEMPLATE,
} as const satisfies Partial<InstapaperPluginSettings>

export class InstapaperSettingTab extends PluginSettingTab {
    plugin: InstapaperPlugin;

    constructor(app: App, plugin: InstapaperPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        this.addAccountSettings(containerEl);

        if (this.plugin.settings.account) {
            this.addSyncSettings(containerEl);
            this.addNotesSettings(containerEl);
            this.addFrontmatterSettings(containerEl);
        }
    }

    private addAccountSettings(containerEl: HTMLElement) {
        const setting = new Setting(containerEl)
            .setName('Instapaper account');

        if (this.plugin.settings.account) {
            setting
                .setDesc(`Connected as: ${this.plugin.settings.account.username}`)
                .addButton((button) => {
                    button.setButtonText('Disconnect');
                    button.setTooltip('Disconnect your Instapaper account')
                    button.onClick(async () => {
                        await this.plugin.disconnectAccount();
                        this.plugin.notice('Disconnected Instapaper account');
                        this.display();
                    })
                });
        } else {
            setting
                .setDesc('Connect your Instapaper account')
                .addButton((button) => {
                    button.setButtonText('Connect');
                    button.setTooltip('Connect your Instapaper account')
                    button.setCta();
                    button.onClick(async () => {
                        new ConnectAccountModal(this.app, async (username: string, password: string) => {
                            try {
                                const account = await this.plugin.connectAccount(username, password);
                                this.plugin.notice(`Connected Instapaper account: ${account.username}`);
                            } catch (e) {
                                console.log('Failed to connect account:', e);
                                await this.plugin.disconnectAccount();
                                this.plugin.notice('Failed to connect Instapaper account');
                            }
                            this.display();
                        }).open();
                    })
                });
        }
    }

    private addSyncSettings(containerEl: HTMLElement) {
        const group = new SettingGroup(containerEl).setHeading('Sync');

        group.addSetting((setting) => {
            setting
                .setName('Sync frequency')
                .setDesc('The frequency at which Obsidian (when running) will automatically sync your data.')
                .addDropdown((dropdown) => {
                    dropdown.addOption("0", "Manual");
                    dropdown.addOption("60", "Hourly");
                    dropdown.addOption("720", "Every 12 hours")
                    dropdown.addOption("1440", "Every 24 hours")

                    dropdown.setValue(Number(this.plugin.settings.syncFrequency).toString());
                    dropdown.onChange(async (value) => {
                        await this.plugin.saveSettings({ syncFrequency: parseInt(value) });
                        await this.plugin.updateSyncInterval();
                    });
                });
        });

        group.addSetting((setting) => {
            setting
                .setName('Sync on start')
                .setDesc('Automatically sync when Obsidian starts or an account is connected.')
                .addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.syncOnStart);
                    toggle.onChange(async (value) => {
                        await this.plugin.saveSettings({ syncOnStart: value });
                    });
                });
        });
    }

    private addNotesSettings(containerEl: HTMLElement) {
        const group = new SettingGroup(containerEl).setHeading('Notes');

        group.addSetting((setting) => {
            setting
                .setName('Notes folder')
                .setDesc('The folder in which your notes and highlights will be synced.')
                .addText((text) => {
                    text.setValue(this.plugin.settings.notesFolder)
                    text.onChange(async (value) => {
                        const previousPath = this.plugin.settings.notesFolder;
                        const newPath = normalizePath(value);
                        await this.plugin.saveSettings({ notesFolder: newPath });

                        const previousFile = this.app.vault.getAbstractFileByPath(previousPath);
                        if (previousFile instanceof TFolder) {
                            await previousFile.vault.rename(previousFile, newPath);
                        }
                    })
                });
        });

        group.addSetting((setting) => {
            let textareaComponent: TextAreaComponent;

            setting.setName('Template');
            setting.descEl.createDiv({ cls: 'setting-item-description' }, (el) => {
                el.appendText('Available variables: ');
                el.createEl('code', { text: '{{text}}' });
                el.appendText(', ');
                el.createEl('code', { text: '{{link}}' });
                el.appendText(', ');
                el.createEl('code', { text: '{{blockId}}' });
                el.appendText(', ');
                el.createEl('code', { text: '{{note}}' });
                el.createEl('br');
                el.appendText('Conditional sections: ');
                el.createEl('code', { text: '{{#note}}...{{/note}}' });
                el.createEl('br');
                const resetLink = el.createEl('a', {
                    text: 'Reset to default',
                    href: '#'
                });
                resetLink.addEventListener('click', async (e) => {
                    e.preventDefault();
                    textareaComponent.setValue(DEFAULT_HIGHLIGHT_TEMPLATE);
                    await this.plugin.saveSettings({
                        highlightTemplate: DEFAULT_HIGHLIGHT_TEMPLATE
                    });
                });
                el.appendText(' · ');
                el.createEl('a', {
                    text: 'Mustache syntax guide',
                    href: 'https://mustache.github.io/mustache.5.html'
                });
            });
            setting.setClass('instapaper-highlight-template-setting');

            setting.addTextArea((textarea) => {
                textareaComponent = textarea;
                textarea.setValue(this.plugin.settings.highlightTemplate);
                textarea.inputEl.rows = 6;
                textarea.inputEl.addClass('instapaper-highlight-template');
                textarea.inputEl.required = true;
                textarea.onChange(async (value) => {
                    await this.plugin.saveSettings({
                        highlightTemplate: value
                    });
                });
            });
        });

        group.addSetting((setting) => {
            setting
                .setName('Update existing notes')
                .setDesc('Update existing notes to use the current template. Your local edits will be preserved.')
                .setClass('instapaper-update-action')
                .addButton((button) => {
                    button
                        .setButtonText('Update')
                        .setTooltip('Update highlights in existing notes')
                        .onClick(async () => {
                            try {
                                await this.plugin.runSync('settings',
                                    { resync: true, saveCursor: false },
                                    {
                                        createFiles: false,
                                        syncHighlights: false,
                                        syncProperties: false,
                                        updateHighlightTemplate: {
                                            from: this.plugin.settings.appliedHighlightTemplate,
                                            to: this.plugin.settings.highlightTemplate,
                                        },
                                    });
                                this.plugin.notice('Updated Instapaper notes');
                            } catch (e) {
                                this.plugin.log('Sync failed:', e);
                                this.plugin.notice('Failed to update highlights');
                            }
                        });
                });
        });
    }

    private addFrontmatterSettings(containerEl: HTMLElement) {
        const group = new SettingGroup(containerEl)
            .setHeading('Article properties')
            .addClass('instapaper-article-properties');

        group.addSetting((setting) => {
            setting.setDesc('Configure which article properties to add. Properties are only added when available.');
        });

        const addField = (
            name: string,
            description: string,
            fieldKey: keyof FrontmatterSettings,
        ) => {
            group.addSetting((setting) => {
                setting
                    .setName(name)
                    .setDesc(description);

                const config = this.plugin.settings.frontmatter[fieldKey];
                const placeholder = DEFAULT_SETTINGS.frontmatter?.[fieldKey]?.propertyName ?? '';

                let propertyNameText: TextComponent;
                setting.addText((text) => {
                    propertyNameText = text;
                    text.setPlaceholder(placeholder);
                    text.setValue(config.propertyName);
                    text.setDisabled(!config.enabled);
                    text.inputEl.required = config.enabled;
                    text.inputEl.minLength = 1;
                    text.inputEl.pattern = '^[a-zA-Z_][a-zA-Z0-9_\\-]*$';
                    text.inputEl.title = 'Property name must start with a letter or underscore, followed by letters, numbers, underscores, or hyphens';

                    text.onChange(async (value) => {
                        config.propertyName = value.trim();
                        await this.plugin.saveSettings({
                            frontmatter: this.plugin.settings.frontmatter
                        });
                    });
                });

                let valueText: TextComponent | undefined;
                if ('value' in this.plugin.settings.frontmatter[fieldKey]) {
                    setting.addText((text) => {
                        valueText = text;
                        const valueConfig = this.plugin.settings.frontmatter[fieldKey] as FrontmatterValueField;
                        text.setPlaceholder('Value');
                        text.setValue(valueConfig.value);
                        text.setDisabled(!config.enabled);
                        text.onChange(async (value) => {
                            valueConfig.value = value;
                            await this.plugin.saveSettings({
                                frontmatter: this.plugin.settings.frontmatter
                            });
                        });
                    });
                }

                setting.addToggle((toggle) => {
                    toggle.setValue(config.enabled);
                    toggle.onChange(async (value) => {
                        config.enabled = value;
                        propertyNameText.setDisabled(!value);
                        propertyNameText.inputEl.required = value;
                        valueText?.setDisabled(!value);
                        await this.plugin.saveSettings({
                            frontmatter: this.plugin.settings.frontmatter
                        });
                    });
                });
            });
        };

        addField("Title", "The article's title", "title");
        addField("Author", "The article's author", "author");
        addField("URL", "The article's URL", "url");
        addField("Publish date", "When the article was published", "pubdate");
        addField("Saved date", "When you saved the article to Instapaper", "date");
        addField("Tags", "Tags from Instapaper", "tags");
        addField("Source", 'A static value (e.g., "instapaper")', "source");

        group.addSetting((setting) => {
            const desc = 'Update existing notes to use these properties';
            const makeDesc = (withRemoval: boolean = false) => withRemoval
                ? createFragment((frag) => {
                    frag.appendText(`${desc}, `);
                    frag.createEl('strong', { text: 'removing disabled properties' });
                    frag.appendText('.');
                })
                : `${desc}.`;

            setting
                .setName('Update existing notes')
                .setDesc(makeDesc())
                .setClass('instapaper-update-action');

            let button: ButtonComponent;
            let removeDisabledProperties = false;

            setting.addToggle((toggle) => {
                toggle.setValue(removeDisabledProperties);
                toggle.onChange((value) => {
                    removeDisabledProperties = value;
                    setting.setDesc(makeDesc(value));
                });
                toggle.setTooltip('Remove disabled properties?');
            });

            setting.addButton((btn) => {
                button = btn;
                button
                    .setButtonText('Update')
                    .setTooltip('Update existing notes from Instapaper')
                    .onClick(async () => {
                        try {
                            await this.plugin.runSync('settings',
                                { resync: true, saveCursor: false },
                                {
                                    createFiles: false,
                                    syncHighlights: false,
                                    removeDisabledProperties,
                                });
                            this.plugin.notice('Updated Instapaper notes');
                        } catch (e) {
                            this.plugin.log('Sync failed:', e);
                            this.plugin.notice('Failed to sync with Instapaper');
                        }
                    });
            });
        });
    }
}

class ConnectAccountModal extends Modal {
    username: string
    password: string
    onConnect: (username: string, password: string) => Promise<void>;

    constructor(app: App, onConnect: (username: string, password: string) => Promise<void>) {
        super(app);
        this.onConnect = onConnect;
    }

    onOpen() {
        const group = new SettingGroup(this.contentEl)
            .setHeading('Instapaper account')
            .addClass('instapaper-connect-account');

        let usernameEl: HTMLInputElement;
        let passwordEl: HTMLInputElement;
        let connectButton: ButtonComponent;

        const updateConnectButton = () => {
            const valid = usernameEl.checkValidity() && passwordEl.checkValidity();
            connectButton.setDisabled(!valid);
        };

        group.addSetting((setting) => {
            setting
                .setName("Email")
                .addText((text) => {
                    text.inputEl.addEventListener('blur', () => {
                        text.inputEl.required = true;
                    });
                    text.onChange((value) => {
                        this.username = value;
                        updateConnectButton();
                    });
                    usernameEl = text.inputEl;
                });
        });

        group.addSetting((setting) => {
            setting
                .setName("Password")
                .addText((text) => {
                    text.inputEl.type = "password";
                    text.onChange((value) => {
                        this.password = value;
                        updateConnectButton();
                    });
                    passwordEl = text.inputEl;
                });
        });

        group.addSetting((setting) => {
            const descEl = setting.descEl;
            descEl.createSpan({ text: "If you don't have an account, you can " });
            descEl.createEl('a', {
                text: 'create one',
                href: 'https://www.instapaper.com/user/register',
            });
            descEl.createSpan({ text: ' on the Instapaper website.' });
        });

        const footer = this.modalEl.createDiv({ cls: 'modal-button-container' });

        new Setting(footer)
            .addButton((button) => {
                button.setCta();
                button.setButtonText("Connect");
                button.setDisabled(true);
                button.onClick(async () => {
                    button.setButtonText("Connecting ...");
                    button.setDisabled(true);
                    await this.onConnect(this.username, this.password);
                    this.close();
                });
                connectButton = button;
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
