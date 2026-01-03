import { App, ButtonComponent, Modal, PluginSettingTab, Setting, SettingGroup, TFolder, normalizePath } from "obsidian";
import InstapaperPlugin from "./main";
import type { InstapaperAccessToken, InstapaperAccount } from "./api";

export interface InstapaperPluginSettings {
    token?: InstapaperAccessToken;
    account?: InstapaperAccount;
    syncFrequency: number;
    syncOnStart: boolean;
    notesFolder: string;
    notesCursor: number;
}

export const DEFAULT_SETTINGS: Partial<InstapaperPluginSettings> = {
    syncFrequency: 0,
    syncOnStart: true,
    notesFolder: 'Instapaper Notes',
    notesCursor: 0,
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
            this.addSyncSettings(containerEl);
            this.addNotesSettings(containerEl);
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
        const group = new SettingGroup(this.contentEl).setHeading('Instapaper account');

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
                    text.inputEl.required = true;
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
