import { App, ButtonComponent, Modal, PluginSettingTab, Setting, TFolder, TextComponent, normalizePath } from "obsidian";
import InstapaperPlugin from "./main";
import type { InstapaperAccessToken, InstapaperAccount } from "./api";

export interface InstapaperPluginSettings {
    token?: InstapaperAccessToken;
    account?: InstapaperAccount;
    notesFolder: string;
    notesCursor: number;
    notesFrequency: number;
    notesSyncOnStart: boolean;
}

export const DEFAULT_SETTINGS: InstapaperPluginSettings = {
    token: undefined,
    account: undefined,
    notesFolder: 'Instapaper Notes',
    notesCursor: 0,
    notesFrequency: 0,
    notesSyncOnStart: true,
}

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
            this.addNotesSettings(containerEl);
        }
    }

    private addAccountSettings(containerEl: HTMLElement): Setting {
        const setting = new Setting(containerEl)
            .setName('Instapaper account');

        if (this.plugin.settings.account) {
            return setting
                .setDesc(`Connected as: ${this.plugin.settings.account.username}`)
                .addButton((button) => {
                    button.setButtonText('Disconnect');
                    button.setTooltip('Disconnect your Instapaper account')
                    button.onClick(async () => {
                        this.plugin.disconnectAccount();
                        this.plugin.notice('Disconnected Instapaper account');
                        this.display();
                    })
                });
        }

        return setting
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
                            this.plugin.disconnectAccount();
                            this.plugin.notice('Failed to connect Instapaper account');
                        }
                        this.display();
                    }).open();
                })
            });
    }

    private addNotesSettings(containerEl: HTMLElement) {
        new Setting(containerEl).setName('Notes Sync').setHeading();

        new Setting(containerEl)
            .setName('Notes folder')
            .setDesc('Folder in which your notes and highlights will be synced')
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

        new Setting(containerEl)
            .setName('Sync frequency')
            .setDesc('The frequency at which Obsidian (when running) will automatically sync your notes')
            .addDropdown((dropdown) => {
                dropdown.addOption("0", "Manual");
                dropdown.addOption("60", "Hourly");
                dropdown.addOption("720", "Every 12 hours")
                dropdown.addOption("1440", "Every 24 hours")

                dropdown.setValue(Number(this.plugin.settings.notesFrequency).toString());
                dropdown.onChange(async (value) => {
                    await this.plugin.saveSettings({ notesFrequency: parseInt(value) });
                    await this.plugin.updateNotesSyncInterval();
                });
            });

        new Setting(containerEl)
            .setName('Sync on start')
            .setDesc('Automatically sync when Obsidian starts or an account is connected')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.notesSyncOnStart);
                toggle.onChange(async (value) => {
                    await this.plugin.saveSettings({ notesSyncOnStart: value });
                });
            });
    }
}

class ConnectAccountModal extends Modal {
    username: string
    password: string
    onConnect: (username: string, password: string) => void;

    constructor(app: App, onConnect: (username: string, password: string) => void) {
        super(app);
        this.onConnect = onConnect;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Instapaper account" });

        function updateConnectButton() {
            const valid = usernameEl.checkValidity() && passwordEl.checkValidity();
            connectButton.setDisabled(!valid);
        }

        const usernameEl = (new Setting(contentEl)
            .setName("Email or username")
            .addText((text) => {
                text.inputEl.required = true;
                text.onChange((value) => {
                    this.username = value;
                    updateConnectButton();
                })
            }).components[0] as TextComponent).inputEl;

        const passwordEl = (new Setting(contentEl)
            .setName("Password (if you have one)")
            .addText((text) => {
                text.inputEl.type = "password"
                text.onChange((value) => {
                    this.password = value;
                    updateConnectButton();
                })
            }).components[0] as TextComponent).inputEl;

        const connectButton = new Setting(contentEl)
            .addButton((button) => {
                button.setCta();
                button.setButtonText("Connect");
                button.setDisabled(true);
                button.onClick(() => {
                    this.close();
                    this.onConnect(this.username, this.password);
                })
            }).components[0] as ButtonComponent;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
